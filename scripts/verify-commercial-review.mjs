import assert from "node:assert/strict";
import fs from "node:fs";

export async function verifyCommercialReview(pg, client) {
  await client.query("RESET ROLE");
  await client.query(
    fs.readFileSync(
      new URL("../supabase/migrations/20261124065754_commercial_beta_review.sql", import.meta.url),
      "utf8",
    ),
  );
  const owner = crypto.randomUUID();
  const other = crypto.randomUUID();
  await client.query(
    "INSERT INTO auth.users(id,email) VALUES ($1,'review@example.invalid'),($2,'other-review@example.invalid')",
    [owner, other],
  );
  const {
    rows: [venue],
  } = await client.query("SELECT id FROM restaurants WHERE owner_id=$1", [owner]);
  await client.query("UPDATE profiles SET plan_type='pro' WHERE id=$1", [owner]);
  const {
    rows: [first, second],
  } = await client.query(
    "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES ($1,'Mesa Revisão','REV1'),($1,'Mesa Separada','REV2') RETURNING id",
    [venue.id],
  );
  const asOwner = async (id) => {
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await client.query("SET ROLE authenticated");
  };
  await asOwner(owner);
  const open = async (table) =>
    (await client.query("SELECT start_table_service($1) AS id", [table])).rows[0].id;
  const firstService = await open(first.id);
  const secondService = await open(second.id);
  await client.query("RESET ROLE");
  await client.query("UPDATE venue_tables SET operational=false WHERE id=$1", [first.id]);
  await client.query("UPDATE venue_tables SET label='Mesa Mesa Revisão' WHERE id=$1", [second.id]);
  await asOwner(owner);
  const close = (table, service) =>
    client.query("SELECT release_table_service($1,$2,$3)", [venue.id, table, service]);
  await assert.rejects(client.query("SELECT release_table($1,'Mesa Revisão')", [venue.id]), /amb/);
  await assert.rejects(close(first.id, secondService), { code: "40001" });
  await asOwner(other);
  await assert.rejects(close(second.id, secondService), /Acesso negado/);
  await asOwner(owner);
  await close(second.id, secondService);
  const {
    rows: [intact],
  } = await client.query("SELECT active_service_id FROM venue_tables WHERE id=$1", [first.id]);
  assert.equal(intact.active_service_id, firstService);
  const newService = await open(second.id);
  await assert.rejects(close(second.id, secondService), { code: "40001" });
  await close(second.id, newService);
  await close(first.id, firstService);
  await assert.rejects(
    client.query(
      "SELECT reserve_billing_checkout($1,'sandbox','price_x','cus_x','http://localhost')",
      [owner],
    ),
    { code: "42501" },
  );
  await assert.rejects(client.query("SELECT begin_billing_reconciliation('sandbox','sub_x')"), {
    code: "42501",
  });
  await client.query("RESET ROLE");

  const secondConnection = pg.getPgClient();
  await secondConnection.connect();
  const reserve = async (conn, env, price) =>
    (
      await conn.query(
        "SELECT reserve_billing_checkout($1,$2,$3,'cus_fixture','https://flux.example') AS slot",
        [owner, env, price],
      )
    ).rows[0].slot;
  try {
    const [a, b] = await Promise.all([
      reserve(client, "sandbox", "price_a"),
      reserve(secondConnection, "sandbox", "price_b"),
    ]);
    assert.deepEqual(a, b);
    const live = await reserve(client, "live", "price_l");
    assert.notEqual(live.attempt_id, a.attempt_id);
    await client.query(
      "UPDATE billing_checkout_attempts SET expires_at=0 WHERE user_id=$1 AND environment='sandbox'",
      [owner],
    );
    assert.notEqual((await reserve(client, "sandbox", "price_b")).attempt_id, a.attempt_id);
  } finally {
    await secondConnection.end();
  }

  const begin = async (env, id) =>
    (await client.query("SELECT begin_billing_reconciliation($1,$2) AS generation", [env, id]))
      .rows[0].generation;
  const event = (env, id, eventId, status, generation) =>
    client.query("SELECT apply_billing_event($1,123,$2,$3)", [
      eventId,
      env,
      {
        user_id: owner,
        stripe_subscription_id: id,
        stripe_customer_id: "cus_fixture",
        price_id: "pro_monthly",
        product_id: "prod_fixture",
        status,
        plan_type: "pro",
        cancel_at_period_end: false,
        reconciliation_generation: generation,
      },
    ]);
  const live = "sub_review_live";
  await event("live", live, "evt_initial", "active", await begin("live", live));
  const slow = await begin("live", live);
  const canceled = await begin("live", live);
  await event("live", live, "evt_cancel", "canceled", canceled);
  await event("live", live, "evt_delayed", "active", slow);
  await event("live", live, "evt_cancel", "active", await begin("live", live));
  assert.equal(
    (await client.query("SELECT status FROM subscriptions WHERE stripe_subscription_id=$1", [live]))
      .rows[0].status,
    "canceled",
  );
  const sandbox = "sub_review_sandbox";
  await event("sandbox", sandbox, "evt_invoice", "active", await begin("sandbox", sandbox));
  await event(
    "sandbox",
    sandbox,
    "evt_sandbox_cancel",
    "canceled",
    await begin("sandbox", sandbox),
  );
  assert.equal(
    (
      await client.query("SELECT status FROM subscriptions WHERE stripe_subscription_id=$1", [
        sandbox,
      ])
    ).rows[0].status,
    "canceled",
  );
  assert.equal(
    (await client.query("SELECT plan_type FROM profiles WHERE id=$1", [owner])).rows[0].plan_type,
    "trial",
  );
  console.log(
    "PASS: safe close by table/service, checkout reservation race, fenced live reconciliation and sandbox cancellation",
  );
}
