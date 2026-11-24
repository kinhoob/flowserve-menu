import { betaUpgradeSQL } from "./build-beta-upgrade.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
export async function verifyBetaHardening(client, { rid, other, product, option }) {
  await client.query("RESET ROLE");
  const sql = fs.readFileSync(
    new URL("../supabase/migrations/20261123000100_beta_operation_hardening.sql", import.meta.url),
    "utf8",
  );
  await client.query(sql);
  await client.query(sql);
  const owner = (await client.query("SELECT owner_id FROM restaurants WHERE id=$1", [rid])).rows[0]
    .owner_id;
  await client.query(
    "UPDATE restaurants SET kitchen_open=true,bar_open=true,operating_hours=NULL,require_table_code=false WHERE id=$1",
    [rid],
  );
  const tid = (
    await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Beta','BETA1') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  const payload = JSON.stringify([
    { menu_item_id: product, quantity: 1, modifier_option_ids: [option] },
  ]);
  const submit = async (token = crypto.randomUUID(), code = null) =>
    (
      await client.query(
        "SELECT submit_public_order($1,'Mesa Beta','Teste','21912345678','BRL',$2::jsonb,$3,$4) AS r",
        [rid, payload, token, code],
      )
    ).rows[0].r;
  await client.query("SELECT set_config('request.jwt.claim.sub','',false)");
  await client.query("SET ROLE anon");
  await assert.rejects(
    client.query(
      "SELECT place_order($1,'Mesa Beta','Teste','21912345678','BRL',$2::jsonb,$3,NULL)",
      [rid, payload, crypto.randomUUID()],
    ),
  );
  await assert.rejects(client.query("SELECT public_request_budget($1,$2,'order')", [rid, tid]));
  await assert.rejects(client.query("SELECT * FROM public_action_budgets"));
  await assert.rejects(client.query("SELECT * FROM internal_order_requests"));
  const token = crypto.randomUUID();
  const first = await submit(token);
  assert.equal(first.ok, true);
  assert.equal((await submit(token)).order_id, first.order_id);
  await assert.rejects(
    client.query("SELECT transition_order($1,'pending','preparing')", [first.order_id]),
  );
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await client.query("SET ROLE authenticated");
  await client.query("SELECT transition_order($1,'pending','preparing')", [first.order_id]);
  await assert.rejects(
    client.query("SELECT transition_order($1,'pending','accepted')", [first.order_id]),
  );
  await assert.rejects(
    client.query("UPDATE orders SET status='accepted' WHERE id=$1", [first.order_id]),
  );
  await assert.rejects(client.query("SELECT release_table($1,'Mesa Beta')", [rid]));
  await client.query("SELECT transition_order($1,'preparing','ready')", [first.order_id]);
  await client.query("SELECT transition_order($1,'ready','served',NULL,'Garçom')", [
    first.order_id,
  ]);
  await client.query("SELECT hide_completed_orders($1)", [rid]);
  const row = (
    await client.query("SELECT archived,kitchen_hidden,status FROM orders WHERE id=$1", [
      first.order_id,
    ])
  ).rows[0];
  assert.equal(row.archived, false);
  assert.equal(row.kitchen_hidden, true);
  assert.equal(row.status, "served");
  await client.query("SELECT release_table($1,'Mesa Beta')", [rid]);
  assert.equal(
    (await client.query("SELECT archived FROM orders WHERE id=$1", [first.order_id])).rows[0]
      .archived,
    true,
  );
  await assert.rejects(client.query("SELECT hide_completed_orders($1)", [other]));
  const code = (await client.query("SELECT table_order_code($1,NULL,true) AS c", [tid])).rows[0].c;
  const cancelled = (
    await client.query("SELECT owner_place_order($1,$2,$3::jsonb,'Garçom') AS id", [
      rid,
      tid,
      payload,
    ])
  ).rows[0].id;
  await client.query("SELECT transition_order($1,'pending','cancelled',NULL,NULL,'Sem estoque')", [
    cancelled,
  ]);
  assert.equal(
    (await client.query("SELECT table_order_code($1) AS c", [tid])).rows[0].c.code,
    code.code,
  );
  await client.query("SELECT release_table($1,'Mesa Beta')", [rid]);
  assert.equal((await client.query("SELECT table_order_code($1) AS c", [tid])).rows[0].c, null);
  await client.query("RESET ROLE");
  await client.query("DELETE FROM public_action_budgets WHERE restaurant_id=$1", [rid]);
  await client.query("UPDATE restaurants SET require_table_code=true WHERE id=$1", [rid]);
  await client.query("SELECT set_config('request.jwt.claim.sub','',false)");
  await client.query("SET ROLE anon");
  // Pin the budget clock inside this local transaction so wall-clock minute changes cannot reset the counters mid-fixture.
  await client.query("RESET ROLE");
  const {
    rows: [{ definition }],
  } = await client.query(
    "SELECT pg_get_functiondef('public.public_request_budget(uuid,uuid,text)'::regprocedure) AS definition",
  );
  assert.ok(definition.includes("clock_timestamp()"));
  await client.query("BEGIN");
  try {
    await client.query(definition.replace("clock_timestamp()", "transaction_timestamp()"));
    await client.query("SET ROLE anon");
    for (let i = 0; i < 5; i++) assert.equal((await submit(crypto.randomUUID(), "9999")).ok, false);
    const denied = await submit();
    assert.equal(denied.code, "RATE_LIMIT");
    await client.query("RESET ROLE");
    assert.equal(
      (
        await client.query(
          "SELECT failures FROM public_action_budgets WHERE restaurant_id=$1 AND table_id=$2 AND action='order'",
          [rid, tid],
        )
      ).rows[0].failures,
      5,
    );
    await client.query("UPDATE restaurants SET require_table_code=false WHERE id=$1", [rid]);
    await client.query("DELETE FROM public_action_budgets WHERE restaurant_id=$1", [rid]);
    await client.query("SET ROLE anon");
    for (let i = 0; i < 6; i++) {
      const result = (
        await client.query(
          "SELECT submit_public_call($1,'Mesa Beta','Teste',NULL,'call',NULL) AS r",
          [rid],
        )
      ).rows[0].r;
      assert.equal(result.ok, i === 0);
    }
    const call = (
      await client.query(
        "SELECT submit_public_call($1,'Mesa Beta','Teste',NULL,'call',NULL) AS r",
        [rid],
      )
    ).rows[0].r;
    assert.equal(call.code, "RATE_LIMIT");
    await client.query("RESET ROLE");
  } finally {
    await client.query("ROLLBACK");
  }
  await client.query("RESET ROLE");
  await client.query("UPDATE restaurants SET require_table_code=false WHERE id=$1", [rid]);
  await client.query("DELETE FROM public_action_budgets WHERE restaurant_id=$1", [rid]);
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await client.query("SET ROLE authenticated");
  const internalToken = crypto.randomUUID();
  const args = [tid, internalToken, payload];
  const internal = (await client.query("SELECT submit_internal_order($1,$2,$3::jsonb) AS id", args))
    .rows[0].id;
  assert.equal(
    (await client.query("SELECT submit_internal_order($1,$2,$3::jsonb) AS id", args)).rows[0].id,
    internal,
  );
  await client.query("RESET ROLE");
  const closed = {
    kitchen: Array.from({ length: 7 }, () => ({ enabled: false, open: "18:00", close: "23:00" })),
    bar: Array.from({ length: 7 }, () => ({ enabled: false, open: "18:00", close: "23:00" })),
  };
  await client.query("UPDATE restaurants SET operating_hours=$2 WHERE id=$1", [
    rid,
    JSON.stringify(closed),
  ]);
  await client.query("DELETE FROM public_action_budgets WHERE restaurant_id=$1", [rid]);
  await client.query("SET ROLE anon");
  assert.equal((await submit()).ok, false);
  await client.query("RESET ROLE");
  await client.query(betaUpgradeSQL());
  await client.query(sql); // Safe repeated deployment must preserve completed orders and counters.
  assert.equal(
    (await client.query("SELECT archived FROM orders WHERE id=$1", [first.order_id])).rows[0]
      .archived,
    true,
  );
  console.log(
    "PASS: kitchen hiding preserves occupancy, compare-and-set rejects stale updates, public failures persist budgets, retry deduplication, spam limits, closing hours and owner isolation",
  );
}
