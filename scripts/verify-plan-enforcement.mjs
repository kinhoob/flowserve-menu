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
  console.log(
    "PASS: legacy staged upgrade, staff role and effective plan, RLS catalog operations, authorized historical reports and export access",
  );
}
