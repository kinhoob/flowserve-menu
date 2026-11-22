import fs from "node:fs";
import assert from "node:assert/strict";
export async function verifyServiceRecovery(client, { rid, other, product, option }) {
  await client.query("RESET ROLE");
  await client.query(
    fs.readFileSync(
      new URL("../supabase/migrations/20261123000101_table_service_recovery.sql", import.meta.url),
      "utf8",
    ),
  );
  const owner = (await client.query("SELECT owner_id FROM restaurants WHERE id=$1", [rid])).rows[0]
    .owner_id;
  await client.query(
    "UPDATE restaurants SET operating_hours=NULL,kitchen_open=true,bar_open=true,require_table_code=false WHERE id=$1",
    [rid],
  );
  await client.query("UPDATE profiles SET plan_type='pro' WHERE id=$1", [owner]);
  const tid = (
    await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Sessão','SESS1') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await client.query("SET ROLE authenticated");
  const first = (await client.query("SELECT start_table_service($1) AS id", [tid])).rows[0].id;
  assert.equal(
    (await client.query("SELECT start_table_service($1) AS id", [tid])).rows[0].id,
    first,
  );
  assert.equal(
    (await client.query("SELECT service_state FROM venue_tables WHERE id=$1", [tid])).rows[0]
      .service_state,
    "active",
  );
  const payload = JSON.stringify([
    { menu_item_id: product, quantity: 1, modifier_option_ids: [option] },
  ]);
  const request = crypto.randomUUID();
  const oid = (
    await client.query("SELECT submit_internal_order($1,$2,$3::jsonb) AS id", [
      tid,
      request,
      payload,
    ])
  ).rows[0].id;
  assert.equal(
    (await client.query("SELECT recover_internal_order($1,$2) AS id", [tid, request])).rows[0].id,
    oid,
  );
  await client.query(
    "SELECT transition_order($1,'pending','cancelled',NULL,NULL,'Cliente desistiu')",
    [oid],
  );
  assert.equal(
    (await client.query("SELECT active_service_id FROM venue_tables WHERE id=$1", [tid])).rows[0]
      .active_service_id,
    first,
  );
  await assert.rejects(client.query("DELETE FROM operation_events WHERE table_id=$1", [tid]));
  const events = (await client.query("SELECT get_table_events($1) AS events", [tid])).rows[0]
    .events;
  assert.ok(events.some((e) => e.event === "order_status" && e.details.status === "cancelled"));
  await client.query("SELECT release_table($1,'Mesa Sessão')", [rid]);
  assert.equal(
    (await client.query("SELECT active_service_id FROM venue_tables WHERE id=$1", [tid])).rows[0]
      .active_service_id,
    null,
  );
  const second = (await client.query("SELECT start_table_service($1) AS id", [tid])).rows[0].id;
  assert.notEqual(second, first);
  await assert.rejects(client.query("DELETE FROM venue_tables WHERE id=$1", [tid]));
  const oid2 = (
    await client.query("SELECT submit_internal_order($1,$2,$3::jsonb) AS id", [
      tid,
      crypto.randomUUID(),
      payload,
    ])
  ).rows[0].id;
  // Trial expiry blocks new orders/sessions but existing orders can still be delivered and closed.
  await client.query("RESET ROLE");
  await client.query("DELETE FROM platform_entitlements WHERE user_id=$1", [owner]);
  await client.query(
    "UPDATE profiles SET plan_type='trial',trial_ends_at=now()-interval '1 day' WHERE id=$1",
    [owner],
  );
  const slug = (await client.query("SELECT slug FROM restaurants WHERE id=$1", [rid])).rows[0].slug;
  assert.equal(
    (await client.query("SELECT get_restaurant_plan($1) AS plan", [slug])).rows[0].plan,
    "basic",
  );
  await client.query("SET ROLE authenticated");
  await assert.rejects(
    client.query("SELECT submit_internal_order($1,$2,$3::jsonb)", [
      tid,
      crypto.randomUUID(),
      payload,
    ]),
  );
  const free = (
    await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Expirada','EXPI1') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  await assert.rejects(client.query("SELECT start_table_service($1)", [free]));
  await client.query("SELECT transition_order($1,'pending','preparing')", [oid2]);
  await client.query("SELECT transition_order($1,'preparing','ready')", [oid2]);
  await client.query("SELECT transition_order($1,'ready','served',NULL,'Equipe')", [oid2]);
  await client.query("SELECT release_table($1,'Mesa Sessão')", [rid]);
  await client.query("RESET ROLE");
  await client.query("UPDATE profiles SET plan_type='pro' WHERE id=$1", [owner]);
  await client.query("SELECT set_config('request.jwt.claim.sub','',false)");
  await client.query("SET ROLE anon");
  const tracking = crypto.randomUUID();
  const publicOrder = (
    await client.query(
      "SELECT submit_public_order($1,'Mesa Sessão','Visitante','21912345678','BRL',$2::jsonb,$3,NULL) AS r",
      [rid, payload, tracking],
    )
  ).rows[0].r;
  assert.equal(publicOrder.ok, true);
  assert.equal(
    (await client.query("SELECT recover_public_order($1,$2) AS r", [rid, tracking])).rows[0].r
      .order_id,
    publicOrder.order_id,
  );
  assert.equal(
    (await client.query("SELECT recover_public_order($1,$2) AS r", [other, tracking])).rows[0].r,
    null,
  );
  await assert.rejects(client.query("SELECT get_table_events($1)", [tid]));
  await assert.rejects(client.query("SELECT recover_internal_order($1,$2)", [tid, request]));
  assert.equal(
    (await client.query("SELECT recover_public_order($1,$2) AS r", [other, crypto.randomUUID()]))
      .rows[0].r,
    null,
  );
  await client.query("RESET ROLE");
  console.log(
    "PASS: explicit service occupancy without orders, cancellation preserves service, session separation, immutable audit, authenticated recovery and trial wind-down",
  );
}
