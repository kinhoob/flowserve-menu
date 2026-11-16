import assert from "node:assert/strict";
import fs from "node:fs";
import { betaUpgradeSQL } from "./build-beta-upgrade.mjs";
export async function verifyServiceOperations(client, { rid, other, product, option, staffToken }) {
  await client.query("RESET ROLE");
  const owner = "11111111-1111-4111-8111-111111111111";
  const hours = {
    kitchen: Array.from({ length: 7 }, () => ({ enabled: true, open: "18:00", close: "23:00" })),
    bar: Array.from({ length: 7 }, () => ({ enabled: true, open: "18:00", close: "01:00" })),
  };
  const fail = async (sql, args = []) => assert.rejects(client.query(sql, args));
  await client.query(
    "UPDATE restaurants SET timezone='America/Sao_Paulo',operating_hours=$2,require_table_code=true,kitchen_open=true,bar_open=true WHERE id=$1",
    [rid, JSON.stringify(hours)],
  );
  const isOpen = async (dept, at) =>
    (await client.query("SELECT service_is_open($1,$2,$3) AS open", [rid, dept, at])).rows[0].open;
  assert.equal(await isOpen("kitchen", "2026-11-14T01:59:00Z"), true); // Friday 22:59
  assert.equal(await isOpen("kitchen", "2026-11-14T02:00:00Z"), false);
  assert.equal(await isOpen("bar", "2026-11-14T03:59:59Z"), true); // Saturday 00:59:59 from Friday
  assert.equal(await isOpen("bar", "2026-11-14T04:00:00Z"), false);
  assert.equal(await isOpen("bar", "2026-11-14T20:59:59Z"), false);
  assert.equal(await isOpen("bar", "2026-11-14T21:00:00Z"), true);
  hours.bar[4].enabled = false;
  await client.query("UPDATE restaurants SET operating_hours=$2 WHERE id=$1", [
    rid,
    JSON.stringify(hours),
  ]);
  assert.equal(await isOpen("bar", "2026-11-14T03:30:00Z"), false);
  hours.bar[4].enabled = true;
  await fail("UPDATE restaurants SET operating_hours='{}' WHERE id=$1", [rid]);
  await fail("UPDATE restaurants SET timezone='Invalid/Zone' WHERE id=$1", [rid]);
  await client.query("UPDATE restaurants SET operating_hours=NULL WHERE id=$1", [rid]);
  const tid = (
    await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Segurança','SECURE') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await client.query("SET ROLE authenticated");
  const getCode = async (rotate = false) =>
    (await client.query("SELECT table_order_code($1,NULL,$2) AS c", [tid, rotate])).rows[0].c;
  const first = await getCode();
  assert.match(first.code, /^[a-f0-9]{12}$/);
  assert.equal((await getCode()).code, first.code);
  await fail("SELECT * FROM table_order_codes");
  await client.query("RESET ROLE");
  await client.query("SET ROLE anon");
  await client.query("SELECT set_config('request.jwt.claim.sub','',false)");
  await fail("SELECT table_order_code($1)", [tid]);
  await fail("SELECT * FROM table_order_codes");
  const staffCode = (
    await client.query("SELECT table_order_code($1,$2,false) AS c", [tid, staffToken])
  ).rows[0].c;
  assert.equal(staffCode.code, first.code);
  const payload = JSON.stringify([
    { menu_item_id: product, quantity: 1, modifier_option_ids: [option] },
  ]);
  const place = async (code, token = crypto.randomUUID()) =>
    (
      await client.query(
        "SELECT place_order($1,'Mesa Segurança','Visitante','21912345678','BRL',$2::jsonb,$3,$4) AS id",
        [rid, payload, token, code],
      )
    ).rows[0].id;
  await fail(
    "SELECT place_order($1,'Mesa Segurança','Visitante','21912345678','BRL',$2::jsonb,$3)",
    [rid, payload, crypto.randomUUID()],
  );
  await assert.rejects(place("wrong"));
  const token = crypto.randomUUID();
  const order = await place(first.code, token);
  assert.ok(order);
  await client.query("RESET ROLE");
  await client.query("UPDATE restaurants SET kitchen_open=false WHERE id=$1", [rid]);
  await client.query("SET ROLE anon");
  assert.equal(await place("wrong", token), order); // idempotent retry after closing
  await assert.rejects(place(first.code)); // server rejects fresh orders despite a valid code
  await client.query("RESET ROLE");
  await client.query("UPDATE restaurants SET kitchen_open=true,bar_open=false WHERE id=$1", [rid]);
  const drinks = (
    await client.query(
      "INSERT INTO categories(restaurant_id,name,kind) VALUES($1,'Bar Teste','drink') RETURNING id",
      [rid],
    )
  ).rows[0].id;
  const beer = (
    await client.query(
      "INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Bebida Teste',12) RETURNING id",
      [rid, drinks],
    )
  ).rows[0].id;
  await fail("SELECT validated_order_items($1,$2)", [
    rid,
    JSON.stringify([{ menu_item_id: beer, quantity: 1 }]),
  ]);
  await client.query("UPDATE restaurants SET bar_open=true WHERE id=$1", [rid]);
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await client.query("SET ROLE authenticated");
  const second = await getCode(true);
  assert.notEqual(second.code, first.code);
  await client.query("RESET ROLE");
  await client.query("SET ROLE anon");
  await assert.rejects(place(first.code));
  await fail("SELECT place_order($1,'Mesa 1','Visitante','21912345678','BRL',$2::jsonb,$3,$4)", [
    rid,
    payload,
    crypto.randomUUID(),
    second.code,
  ]);
  await fail("INSERT INTO waiter_calls(restaurant_id,table_label) VALUES($1,'Mesa Segurança')", [
    rid,
  ]);
  await fail("SELECT public_waiter_call($1,'Mesa Segurança','Visitante',NULL,'call','wrong')", [
    rid,
  ]);
  await client.query("SELECT public_waiter_call($1,'Mesa Segurança','Visitante',NULL,'call',$2)", [
    rid,
    second.code,
  ]);
  await client.query("RESET ROLE");
  await client.query("UPDATE orders SET archived=true WHERE table_id=$1", [tid]);
  await client.query("SET ROLE anon");
  await assert.rejects(place(second.code));
  await client.query("RESET ROLE");
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  const expiring = await getCode();
  await client.query(
    "UPDATE table_order_codes SET expires_at=now()-interval '1 second' WHERE table_id=$1",
    [tid],
  );
  await client.query("SET ROLE anon");
  await assert.rejects(place(expiring.code));
  await client.query("RESET ROLE");
  await client.query(
    "UPDATE restaurants SET operating_hours=$2,hours_enabled_at=now()-interval '10 days' WHERE id=$1",
    [rid, JSON.stringify(hours)],
  );
  // The trigger sets activation on schedule edits; explicitly backdate only this test fixture.
  await client.query(
    "UPDATE restaurants SET hours_enabled_at=now()-interval '10 days' WHERE id=$1",
    [rid],
  );
  await client.query("SELECT generate_closing_notifications($1)", [rid]);
  const before = (
    await client.query(
      "SELECT count(*) AS n FROM restaurant_notifications WHERE restaurant_id=$1",
      [rid],
    )
  ).rows[0].n;
  assert.ok(Number(before) > 0);
  await client.query("SELECT generate_closing_notifications($1)", [rid]);
  assert.equal(
    (
      await client.query(
        "SELECT count(*) AS n FROM restaurant_notifications WHERE restaurant_id=$1",
        [rid],
      )
    ).rows[0].n,
    before,
  );
  const notice = (
    await client.query(
      "SELECT * FROM restaurant_notifications WHERE restaurant_id=$1 ORDER BY period_end DESC LIMIT 1",
      [rid],
    )
  ).rows[0];
  assert.equal((new Date(notice.period_end) - new Date(notice.period_start)) / 3600000, 24);
  const insertOrder = async (status, subtotal) =>
    (
      await client.query(
        "INSERT INTO orders(restaurant_id,table_id,table_label,status,subtotal,created_at) VALUES($1,$2,'Mesa Segurança',$3,$4,$5) RETURNING id",
        [rid, tid, status, subtotal, new Date(new Date(notice.period_start).getTime() + 3600000)],
      )
    ).rows[0].id;
  await insertOrder("served", 100);
  await insertOrder("pending", 50);
  await insertOrder("cancelled", 200);
  // An order at the closing instant belongs to the next period, never both.
  await client.query(
    "INSERT INTO orders(restaurant_id,table_id,table_label,status,subtotal,created_at) VALUES($1,$2,'Mesa Segurança','served',999,$3)",
    [rid, tid, notice.period_end],
  );
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [owner]);
  await client.query("SET ROLE authenticated");
  const summary = (await client.query("SELECT closing_summary($1) AS s", [notice.id])).rows[0].s;
  assert.equal(summary.revenue, 100);
  assert.equal(summary.delivered, 1);
  assert.equal(summary.pending, 1);
  assert.equal(summary.cancelled, 1);
  assert.ok(
    (await client.query("SELECT read_at FROM restaurant_notifications WHERE id=$1", [notice.id]))
      .rows[0].read_at,
  );
  await client.query(
    "SELECT set_config('request.jwt.claim.sub','99999999-9999-4999-8999-999999999999',false)",
  );
  await fail("SELECT closing_summary($1)", [notice.id]);
  await fail("SELECT table_order_code($1)", [tid]);
  assert.equal(
    (await client.query("SELECT * FROM restaurant_notifications WHERE restaurant_id=$1", [rid]))
      .rows.length,
    0,
  );
  await client.query("RESET ROLE");
  await client.query("SET ROLE anon");
  await fail("SELECT generate_closing_notifications()");
  await fail("SELECT list_closing_notifications()");
  await client.query("RESET ROLE");
  // This upgrade is safe to reapply without deleting operational data.
  await client.query(
    fs.readFileSync(
      new URL(
        "../supabase/migrations/20261116000500_service_hours_notifications.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(
    (
      await client.query(
        "SELECT count(*) AS n FROM restaurant_notifications WHERE restaurant_id=$1",
        [rid],
      )
    ).rows[0].n,
    before,
  );
  console.log(
    "PASS: weekly/overnight hours, exact closing, manual overrides, private rotating table codes, legacy bypass blocked, public calls, checkout revocation, closing summary and tenant isolation",
  );
  await client.query(betaUpgradeSQL());
  await client.query(betaUpgradeSQL());
  await client.query("DROP FUNCTION public.resolve_restaurant_slug(text)");
  await client.query(betaUpgradeSQL());
  assert.ok(
    (
      await client.query(
        "SELECT resolve_restaurant_slug(slug) AS slug FROM restaurants WHERE id=$1",
        [rid],
      )
    ).rows[0].slug,
  );
  console.log("PASS: combined upgrade reapplication preserves data and pending-link guards");
}
