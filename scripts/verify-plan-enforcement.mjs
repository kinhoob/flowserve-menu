import assert from "node:assert/strict";
import fs from "node:fs";
import { commercialPlanUpgradeSQL } from "./build-commercial-plan-upgrade.mjs";

const file = new URL("../supabase/fluxqr-planos-beta.sql", import.meta.url);

export async function verifyLegacyPlanUpgrade(client) {
  await client.query("RESET ROLE");
  const consolidated = fs.readFileSync(file, "utf8");
  assert.equal(consolidated, commercialPlanUpgradeSQL());
  await client.query("BEGIN");
  try {
    await client.query(consolidated.replace(/^BEGIN;\n/m, "").replace(/\nCOMMIT;\n$/, "\n"));
    const result = await client.query(
      "SELECT to_regprocedure('public.get_staff_entitlement(text)') AS fn",
    );
    assert.notEqual(result.rows[0].fn, null);
  } finally {
    await client.query("ROLLBACK");
  }
}

export async function verifyPlanEnforcement(client) {
  await client.query("RESET ROLE");
  const consolidated = fs.readFileSync(file, "utf8");
  await client.query(consolidated);
  await client.query(consolidated);

  const migrationsInTransaction = consolidated
    .replace(/^BEGIN;\n/m, "")
    .replace(/\nCOMMIT;\n$/, "\n");
  for (const [change, error] of [
    ["GRANT EXECUTE ON FUNCTION public.require_waiter_plan(uuid) TO anon", /grants divergentes/],
    [
      "CREATE OR REPLACE FUNCTION public.require_waiter_plan(p_restaurant_id uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$",
      /Corpo ou grants divergentes/,
    ],
    [
      "ALTER TABLE public.waiter_calls DISABLE TRIGGER commercial_guard_call",
      /Gatilhos comerciais/,
    ],
  ]) {
    await client.query("BEGIN");
    try {
      await client.query(change);
      await assert.rejects(client.query(migrationsInTransaction), error);
    } finally {
      await client.query("ROLLBACK");
    }
  }
  const owner = crypto.randomUUID(),
    outsider = crypto.randomUUID();
  await client.query(
    "INSERT INTO auth.users(id,email) VALUES ($1,'owner-plan@example.invalid'),($2,'outside-plan@example.invalid')",
    [owner, outsider],
  );
  const {
    rows: [venue],
  } = await client.query("SELECT id,slug FROM restaurants WHERE owner_id=$1", [owner]);
  await client.query(
    "INSERT INTO staff_members(restaurant_id,name,pin,role) VALUES($1,'Cozinha de teste','6823','kitchen')",
    [venue.id],
  );
  const token = (await client.query("SELECT token FROM staff_login($1,'6823')", [venue.slug]))
    .rows[0].token;
  const plan = async (name, days = 1) => {
    await client.query("RESET ROLE");
    await client.query(
      "UPDATE profiles SET plan_type=$2,trial_ends_at=now()+make_interval(days=>$3) WHERE id=$1",
      [owner, name, days],
    );
  };
  const asOwner = async (uid = owner) => {
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [uid]);
    await client.query("SET ROLE authenticated");
  };
  const analytics = () =>
    client.query("SELECT * FROM get_restaurant_analytics($1,now()-interval '1 day',now(),0)", [
      venue.id,
    ]);
  const staff = async () =>
    (await client.query("SELECT get_staff_entitlement($1) AS access", [token])).rows[0].access;
  const catalog = () =>
    client.query("INSERT INTO categories(restaurant_id,name) VALUES($1,'Local')", [venue.id]);
  for (const name of ["basic", "essential", "pro", "trial", "enterprise"]) {
    await plan(name);
    await asOwner();
    await catalog();
    if (name === "basic" || name === "essential")
      await assert.rejects(analytics(), { code: "42501" });
    else await analytics();
    if (name === "basic")
      await assert.rejects(client.query("SELECT staff_list_orders($1)", [token]), {
        code: "42501",
      });
    else await client.query("SELECT staff_list_orders($1)", [token]);
    await assert.rejects(client.query("SELECT staff_list_tables($1)", [token]), { code: "42501" });
    const access = await staff();
    assert.equal(access.plan, name);
    assert.equal(access.role, "kitchen");
  }
  await plan("trial", -1);
  await asOwner();
  await analytics();
  assert.equal((await staff()).plan, "basic");
  await assert.rejects(catalog(), { code: "42501" });
  await assert.rejects(client.query("SELECT get_staff_entitlement('fake')"), { code: "42501" });
  await assert.rejects(
    client.query("SELECT owner_place_order($1,$2,'[]','test')", [venue.id, crypto.randomUUID()]),
    { code: "42501" },
  );
  await asOwner(outsider);
  await assert.rejects(analytics(), { code: "42501" });
  await client.query("RESET ROLE");
  await client.query("SET ROLE anon");
  await assert.rejects(analytics(), { code: "42501" });
  await client.query("RESET ROLE");

  await client.query("RESET ROLE");
  const {
    rows: [waiter],
  } = await client.query(
    "INSERT INTO staff_members(restaurant_id,name,pin,role) VALUES($1,'Garçom de teste','1653','waiter') RETURNING id",
    [venue.id],
  );
  const staffToken = (await client.query("SELECT token FROM staff_login($1,'1653')", [venue.slug]))
    .rows[0].token;
  await plan("essential");
  await asOwner();
  const addTable = (suffix) =>
    client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,$2,$3) RETURNING id",
      [venue.id, "Mesa " + suffix, "SHORT" + suffix],
    );
  const {
    rows: [table],
  } = await addTable("Essential");
  const {
    rows: [free],
  } = await addTable("Livre");
  const start = (token = null) =>
    client.query("SELECT start_table_service($1,$2) AS id", [table.id, token]);
  const code = (token = null, rotate = true) =>
    client.query("SELECT table_order_code($1,$2,$3) AS data", [table.id, token, rotate]);
  await assert.rejects(start(staffToken), { code: "42501" });
  await assert.rejects(code(staffToken), { code: "42501" });
  const initial = (await start()).rows[0].id;
  assert.match((await code()).rows[0].data.code, /^\d{4}$/);
  await assert.rejects(code(staffToken, false), { code: "42501" });
  const close = (id, token = null) =>
    client.query("SELECT release_table_service($1,$2,$3,$4)", [venue.id, table.id, id, token]);
  await close(initial, staffToken);
  const ensureNoStaffWrites = async () => {
    await assert.rejects(
      client.query(
        "INSERT INTO staff_members(restaurant_id,name,pin,role) VALUES($1,'Sem acesso','7283','waiter')",
        [venue.id],
      ),
      { code: "42501" },
    );
    assert.equal(
      (await client.query("UPDATE staff_members SET name='Sem acesso' WHERE id=$1", [waiter.id]))
        .rowCount,
      0,
    );
    assert.equal(
      (await client.query("DELETE FROM staff_members WHERE id=$1", [waiter.id])).rowCount,
      0,
    );
  };
  assert.equal(
    (await client.query("UPDATE staff_members SET name='Permitido' WHERE id=$1", [waiter.id]))
      .rowCount,
    1,
  );
  await plan("pro");
  await asOwner();
  const active = (await start(staffToken)).rows[0].id;
  assert.match((await code(staffToken)).rows[0].data.code, /^\d{4}$/);
  await plan("trial", -1);
  await asOwner();
  await ensureNoStaffWrites();
  assert.equal((await client.query("DELETE FROM venue_tables WHERE id=$1", [free.id])).rowCount, 0);
  await assert.rejects(start(staffToken), { code: "42501" });
  await close(active, staffToken);
  await plan("basic");
  await asOwner();
  await ensureNoStaffWrites();
  await plan("unrecognized");
  await asOwner();
  await ensureNoStaffWrites();
  await plan("essential");
  await asOwner(outsider);
  await ensureNoStaffWrites();
  await client.query("RESET ROLE");
  console.log(
    "PASS: Pro waiter RPCs, Essential owner access, expired safe closure, staff and table writes gated by RLS, upgrade contract rejects partial repairs",
  );
  console.log(
    "PASS: legacy staged upgrade, staff role and effective plan, RLS catalog operations, authorized historical reports and export access",
  );
}
