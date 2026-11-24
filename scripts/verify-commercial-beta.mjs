import fs from "node:fs";
import assert from "node:assert/strict";

export async function verifyCommercialBeta(pg, client) {
  await client.query("RESET ROLE");
  await client.query(
    fs.readFileSync(
      new URL(
        "../supabase/migrations/20261124063416_commercial_beta_entitlements.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  const owner = crypto.randomUUID();
  const outsider = crypto.randomUUID();
  await client.query(
    "INSERT INTO auth.users(id,email) VALUES ($1,'commercial@example.invalid'),($2,'outsider@example.invalid')",
    [owner, outsider],
  );
  const {
    rows: [venue],
  } = await client.query("SELECT id,slug FROM restaurants WHERE owner_id=$1", [owner]);
  await client.query(
    "UPDATE restaurants SET operating_hours=NULL,kitchen_open=true,bar_open=true,require_table_code=false WHERE id=$1",
    [venue.id],
  );
  const {
    rows: [category],
  } = await client.query(
    "INSERT INTO categories(restaurant_id,name) VALUES($1,'Categoria de teste') RETURNING id",
    [venue.id],
  );
  const {
    rows: [dish],
  } = await client.query(
    "INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Produto fictício',12) RETURNING id",
    [venue.id, category.id],
  );
  const setPlan = (plan) =>
    client.query("UPDATE profiles SET plan_type=$2 WHERE id=$1", [owner, plan]);
  const setOwner = async (connection, id = owner) => {
    await connection.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await connection.query("SET ROLE authenticated");
  };
  const add = (connection, suffix) =>
    connection.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES ($1,$2,$3) RETURNING id,label",
      [venue.id, "Mesa Beta " + suffix, "BETA" + suffix],
    );
  const tableStatus = async (label) =>
    (await client.query("SELECT restaurant_table_is_operational($1,$2) AS ok", [venue.id, label]))
      .rows[0].ok;
  await setPlan("basic");
  await setOwner(client);
  await assert.rejects(add(client, 0), /Essential/);
  await assert.rejects(
    client.query("SELECT select_operational_tables($1,'{}')", [venue.id]),
    /Essential/,
  );
  await client.query("RESET ROLE");

  await setPlan("essential");
  const firstNine = (
    await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) SELECT $1,'Mesa Beta '||i,'BETA'||i FROM generate_series(1,9) i RETURNING id,label",
      [venue.id],
    )
  ).rows;
  const second = pg.getPgClient();
  await second.connect();
  try {
    await setOwner(client);
    await setOwner(second);
    const race = await Promise.allSettled([add(client, 10), add(second, 11)]);
    assert.equal(race.filter((result) => result.status === "fulfilled").length, 1);
    assert.match(race.find((result) => result.status === "rejected").reason.message, /10 QR Codes/);
  } finally {
    await second.end();
  }
  await assert.rejects(add(client, 12), /10 QR Codes/);
  await assert.rejects(
    client.query("UPDATE venue_tables SET operational=false WHERE id=$1", [firstNine[0].id]),
    /permission denied/,
  );
  await setOwner(client, outsider);
  await assert.rejects(
    client.query("SELECT select_operational_tables($1,$2)", [venue.id, [firstNine[0].id]]),
    /Acesso negado/,
  );
  await client.query("RESET ROLE");

  await setPlan("pro");
  const extra = (await add(client, 13)).rows[0];
  await assert.rejects(
    client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Mesa Beta 13','UNIQUE')",
      [venue.id],
    ),
    /Já existe/,
  );
  await setOwner(client);
  await client.query("SELECT start_table_service($1)", [extra.id]);
  const payload = JSON.stringify([{ menu_item_id: dish.id, quantity: 1 }]);
  const request = crypto.randomUUID();
  const submitInternal = () =>
    client.query("SELECT submit_internal_order($1,$2,$3::jsonb) AS id", [
      extra.id,
      request,
      payload,
    ]);
  const order = (await submitInternal()).rows[0].id;
  await client.query("RESET ROLE");

  await setPlan("essential");
  assert.equal(await tableStatus(extra.label), false);
  await setOwner(client);
  assert.equal((await submitInternal()).rows[0].id, order);
  await client.query("SELECT select_operational_tables($1,$2)", [
    venue.id,
    firstNine.map((table) => table.id),
  ]);
  assert.equal(await tableStatus(firstNine[0].label), true);
  assert.equal(await tableStatus(extra.label), false);
  await assert.rejects(
    client.query("SELECT start_table_service($1)", [extra.id]),
    /fora da operação/,
  );
  await assert.rejects(
    client.query("SELECT submit_internal_order($1,$2,$3::jsonb)", [
      firstNine[0].id,
      crypto.randomUUID(),
      payload,
    ]),
    /Pro/,
  );

  const beforeBatch = (
    await client.query("SELECT count(*) AS n FROM venue_tables WHERE restaurant_id=$1", [venue.id])
  ).rows[0].n;
  await assert.rejects(
    client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES ($1,'Mesa Beta 14','BETA14'),($1,'Mesa Beta 15','BETA15')",
      [venue.id],
    ),
    /10 QR Codes/,
  );
  assert.equal(
    (
      await client.query("SELECT count(*) AS n FROM venue_tables WHERE restaurant_id=$1", [
        venue.id,
      ])
    ).rows[0].n,
    beforeBatch,
  );
  await client.query("RESET ROLE");

  await client.query("SET ROLE anon");
  const place = async (label, token) =>
    (
      await client.query(
        "SELECT submit_public_order($1,$2,'Pessoa fictícia','11912345678','BRL',$3::jsonb,$4,NULL) AS result",
        [venue.id, label, payload, token],
      )
    ).rows[0].result;
  assert.equal((await place(extra.label, crypto.randomUUID())).ok, false);
  const publicToken = crypto.randomUUID();
  const publicOrder = await place(firstNine[0].label, publicToken);
  assert.equal(publicOrder.ok, true);
  const call = (
    await client.query(
      "SELECT submit_public_call($1,$2,'Pessoa fictícia','','call',NULL) AS result",
      [venue.id, firstNine[0].label],
    )
  ).rows[0].result;
  assert.equal(call.ok, false);
  await client.query("RESET ROLE");

  await client.query(
    "UPDATE profiles SET plan_type='trial',trial_ends_at=now()-interval '1 second' WHERE id=$1",
    [owner],
  );
  await client.query("SET ROLE anon");
  assert.equal((await place(firstNine[0].label, publicToken)).order_id, publicOrder.order_id);
  assert.equal((await place(firstNine[0].label, crypto.randomUUID())).ok, false);
  await client.query("RESET ROLE");
  await setOwner(client);
  assert.equal(
    (await client.query("SELECT get_my_entitlement() AS data")).rows[0].data.service_wind_down,
    true,
  );
  await client.query("SELECT transition_order($1,'pending','cancelled',NULL,NULL,'Teste local')", [
    order,
  ]);
  await client.query("SELECT release_table($1,$2)", [venue.id, extra.label]);
  await client.query("SELECT transition_order($1,'pending','accepted')", [publicOrder.order_id]);
  await client.query("SELECT transition_order($1,'accepted','preparing')", [publicOrder.order_id]);
  await client.query("SELECT transition_order($1,'preparing','ready')", [publicOrder.order_id]);
  await client.query("SELECT transition_order($1,'ready','served')", [publicOrder.order_id]);
  await client.query("SELECT release_table($1,$2)", [venue.id, firstNine[0].label]);
  assert.equal(
    (await client.query("SELECT get_my_entitlement() AS data")).rows[0].data.service_wind_down,
    false,
  );
  await client.query("RESET ROLE");
  assert.equal(
    (
      await client.query("SELECT count(*) AS n FROM venue_tables WHERE restaurant_id=$1", [
        venue.id,
      ])
    ).rows[0].n,
    beforeBatch,
  );

  const billing = async (eventId, created, observed, status, plan, environment = "live") =>
    client.query("SELECT apply_billing_event($1,$2,$3,$4)", [
      eventId,
      created,
      environment,
      {
        user_id: owner,
        stripe_subscription_id: "sub_commercial_" + environment,
        stripe_customer_id: "cus_commercial",
        price_id: plan + "_monthly",
        product_id: "prod_commercial",
        status,
        plan_type: plan,
        cancel_at_period_end: false,
        snapshot_requested_at: observed,
      },
    ]);
  const currentPlan = async () =>
    (await client.query("SELECT get_restaurant_plan($1) AS plan", [venue.slug])).rows[0].plan;
  await billing("comm_created", 300, 20, "active", "pro");
  assert.equal(await currentPlan(), "pro");
  await billing("comm_stale", 300, 10, "past_due", "pro");
  await billing("comm_created", 300, 30, "past_due", "pro");
  assert.equal(await currentPlan(), "pro");
  await billing("comm_failed", 299, 40, "past_due", "pro");
  assert.equal(await currentPlan(), "basic");
  await billing("comm_renewed", 301, 50, "active", "pro");
  assert.equal(await currentPlan(), "pro");
  await billing("comm_downgrade", 302, 60, "active", "essential");
  await billing("comm_sandbox", 303, 70, "active", "pro", "sandbox");
  assert.equal(await currentPlan(), "essential");
  await billing("comm_canceled", 304, 80, "canceled", "essential");
  assert.equal(await currentPlan(), "basic");
  await client.query("INSERT INTO platform_admins(user_id) VALUES($1)", [outsider]);
  await setOwner(client, outsider);
  assert.equal((await client.query("SELECT is_platform_owner() AS owner")).rows[0].owner, false);
  const changePlan = () =>
    client.query(
      "SELECT platform_change_entitlement($1,'set_plan','pro',NULL,'Autorização fictícia',0)",
      [venue.id],
    );
  await assert.rejects(changePlan(), /propriet/);
  await client.query("RESET ROLE");
  await client.query("UPDATE platform_admins SET owns_platform=true WHERE user_id=$1", [outsider]);
  await setOwner(client, outsider);
  assert.equal((await client.query("SELECT is_platform_owner() AS owner")).rows[0].owner, true);
  await changePlan();
  await client.query("RESET ROLE");
  assert.equal(await currentPlan(), "pro");
  assert.equal(
    (
      await client.query("SELECT count(*) AS n FROM platform_audit_log WHERE target_user_id=$1", [
        owner,
      ])
    ).rows[0].n,
    "1",
  );
  console.log(
    "PASS: commercial plan gates, concurrent and batch QR quotas, tenant scope, downgrade history, expired trial wind-down, billing snapshots and sandbox isolation",
  );
}
