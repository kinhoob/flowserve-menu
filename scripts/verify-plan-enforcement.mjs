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
  await client.query("BEGIN");
  try {
    for (const version of [
      "20261124150718_plan_enforcement_audit.sql",
      "20261124152106_guard_staff_operations.sql",
      "20261125033939_enforce_active_plan_access.sql",
    ])
      await client.query(
        fs.readFileSync(new URL("../supabase/migrations/" + version, import.meta.url), "utf8"),
      );
    assert.equal(
      (
        await client.query(
          "SELECT count(*)::int AS n FROM pg_policies WHERE policyname='entitled_operation'",
        )
      ).rows[0].n,
      7,
    );
  } finally {
    await client.query("ROLLBACK");
  }
  await client.query(consolidated);
  await client.query(consolidated);

  const migrationsInTransaction = consolidated
    .replace(/^BEGIN;\n/m, "")
    .replace(/\nCOMMIT;\n$/, "\n");
  for (const [change, error] of [
    [
      "ALTER POLICY entitled_operation ON public.orders USING (true)",
      /Políticas de acesso ativo divergentes/,
    ],
    [
      "ALTER POLICY entitled_operation ON public.order_items WITH CHECK (true)",
      /Políticas de acesso ativo divergentes/,
    ],
    [
      "ALTER POLICY active_venue_insert ON public.restaurants WITH CHECK (true)",
      /Políticas de acesso ativo divergentes/,
    ],
    [
      "ALTER POLICY active_menu_media_update ON storage.objects USING (true)",
      /Políticas de acesso ativo divergentes/,
    ],
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
  await assert.rejects(analytics(), { code: "42501" });
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
  await assert.rejects(close(initial, staffToken), { code: "42501" });
  await close(initial);
  await client.query("RESET ROLE");
  await client.query(
    "INSERT INTO staff_members(restaurant_id,name,pin,role) VALUES($1,'Perfil misto de teste','3267','both')",
    [venue.id],
  );
  const mixedToken = (await client.query("SELECT token FROM staff_login($1,'3267')", [venue.slug]))
    .rows[0].token;
  const actors = [
    { role: "owner", token: null },
    { role: "kitchen", token },
    { role: "waiter", token: staffToken },
    { role: "both", token: mixedToken },
  ];
  const actions = [
    ["pending", "accepted", "kitchen"],
    ["accepted", "preparing", "kitchen"],
    ["preparing", "ready", "kitchen"],
    ["ready", "served", "waiter"],
    ["pending", "cancelled", "waiter"],
  ];
  for (const tier of ["essential", "pro"]) {
    await plan(tier);
    for (const actor of actors) {
      for (const [from, to, action] of actions) {
        await client.query("RESET ROLE");
        const {
          rows: [order],
        } = await client.query(
          "INSERT INTO orders(restaurant_id,table_id,table_label,status,subtotal,currency,tracking_token_hash) VALUES($1,$2,$3,$4,10,'BRL',$5) RETURNING id",
          [venue.id, table.id, "Mesa Essential", from, crypto.randomUUID()],
        );
        if (actor.role === "owner") await asOwner();
        else {
          await client.query("SELECT set_config('request.jwt.claim.sub','',false)");
          await client.query("SET ROLE anon");
        }
        const change = client.query("SELECT transition_order($1,$2,$3,$4)", [
          order.id,
          from,
          to,
          actor.token,
        ]);
        const allowed =
          actor.role === "owner" ||
          (action === "kitchen" && ["kitchen", "both"].includes(actor.role)) ||
          (action === "waiter" && tier === "pro" && ["waiter", "both"].includes(actor.role));
        const caseLabel = [tier, actor.role, from, to].join(" / ");
        if (allowed) await assert.doesNotReject(change, caseLabel);
        else await assert.rejects(change, { code: "42501" }, caseLabel);
        await client.query("RESET ROLE");
        const {
          rows: [persisted],
        } = await client.query("SELECT status FROM orders WHERE id=$1", [order.id]);
        assert.equal(persisted.status, allowed ? to : from, caseLabel);
      }
    }
  }
  await client.query("UPDATE orders SET archived=true WHERE table_id=$1", [table.id]);
  await plan("essential");
  await asOwner();
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
  await assert.rejects(close(active, staffToken), { code: "42501" });
  await assert.rejects(close(active), { code: "42501" });
  await assert.rejects(client.query("SELECT staff_list_orders($1)", [token]), { code: "42501" });
  await assert.rejects(client.query("SELECT get_table_events($1,NULL)", [table.id]), {
    code: "42501",
  });
  await assert.rejects(client.query("SELECT hide_completed_orders($1)", [venue.id]), {
    code: "42501",
  });
  await assert.rejects(
    client.query("SELECT recover_internal_order($1,$2,NULL)", [table.id, crypto.randomUUID()]),
    { code: "42501" },
  );
  assert.equal(
    (await client.query("SELECT id FROM venue_tables WHERE id=$1", [table.id])).rowCount,
    0,
  );
  assert.equal(
    (await client.query("SELECT id FROM table_services WHERE id=$1", [active])).rowCount,
    0,
  );
  assert.equal(
    (await client.query("UPDATE restaurants SET name='Bloqueado' WHERE id=$1", [venue.id]))
      .rowCount,
    0,
  );
  await client.query("RESET ROLE");
  await client.query(
    "INSERT INTO platform_entitlements(user_id,plan_type,trial_ends_at) VALUES($1,'essential',now())",
    [owner],
  );
  await asOwner();
  assert.equal(
    (await client.query("SELECT id FROM table_services WHERE id=$1 AND ended_at IS NULL", [active]))
      .rowCount,
    1,
  );
  await close(active);
  await client.query("RESET ROLE");
  await client.query("DELETE FROM platform_entitlements WHERE user_id=$1", [owner]);
  await plan("basic");
  await asOwner();
  await ensureNoStaffWrites();
  assert.equal(
    (await client.query("SELECT id FROM venue_tables WHERE id=$1", [table.id])).rowCount,
    0,
  );
  await assert.rejects(
    client.query("UPDATE restaurants SET kitchen_open=NOT kitchen_open WHERE id=$1", [venue.id]),
    { code: "42501" },
  );
  assert.equal(
    (await client.query("UPDATE restaurants SET name='Cardápio Basic' WHERE id=$1", [venue.id]))
      .rowCount,
    1,
  );
  await plan("unrecognized");
  await asOwner();
  await ensureNoStaffWrites();
  await plan("essential");
  await asOwner(outsider);
  await ensureNoStaffWrites();
  await client.query("RESET ROLE");
  await client.query(
    "INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,environment,status) VALUES($1,'sub_pending_plan_guard','cus_fixture','live','unpaid')",
    [owner],
  );
  await client.query("SET ROLE service_role");
  const reserve = (environment) =>
    client.query(
      "SELECT reserve_billing_checkout($1,$2,'price_fixture','cus_fixture','https://flux.example')",
      [owner, environment],
    );
  await assert.rejects(reserve("live"), { code: "22023" });
  await reserve("sandbox");
  await client.query("RESET ROLE");
  await client.query(
    "UPDATE subscriptions SET status='canceled' WHERE stripe_subscription_id='sub_pending_plan_guard'",
  );
  await client.query("SET ROLE service_role");
  await reserve("live");
  await client.query("RESET ROLE");
  console.log(
    "PASS: owner and role/action transitions on Essential and Pro, active policy predicate drift rejected",
  );
  console.log(
    "PASS: legacy staged upgrade, staff role and effective plan, RLS catalog operations, active entitlement for historical reports",
  );
}
