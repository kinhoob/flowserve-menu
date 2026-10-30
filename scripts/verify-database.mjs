import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
const root = path.resolve(import.meta.dirname, "..");
const pg = new EmbeddedPostgres({
  databaseDir: path.resolve(import.meta.dirname, "../.db-tests/data-" + Date.now()),
  user: "postgres",
  password: crypto.randomUUID(),
  port: 55439,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let client;
try {
  await pg.initialise();
  await pg.start();
  client = pg.getPgClient();
  await client.connect();
  await client.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS 'SELECT nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean);
    CREATE TABLE storage.objects(id uuid,name text,bucket_id text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql AS 'SELECT string_to_array($1,''/'')';
    CREATE PUBLICATION supabase_realtime;
    CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO anon,authenticated,service_role;
  `);
  for (const file of fs
    .readdirSync(root + "/supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await client.query(fs.readFileSync(root + "/supabase/migrations/" + file, "utf8"));
    } catch (e) {
      throw new Error("Migration " + file + ": " + e.message);
    }
  }
  console.log("PASS: all migrations replay successfully");
  await client.query(
    `INSERT INTO auth.users(id,email) VALUES('11111111-1111-4111-8111-111111111111','audit@example.invalid');`,
  );
  const rid = (await client.query("SELECT id FROM restaurants LIMIT 1")).rows[0].id;
  const tid = (
    await client.query(
      `INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa 1','ABCDE') RETURNING id`,
      [rid],
    )
  ).rows[0].id;
  const cat = (
    await client.query(
      `INSERT INTO categories(restaurant_id,name) VALUES($1,'Entradas') RETURNING id`,
      [rid],
    )
  ).rows[0].id;
  const product = (
    await client.query(
      `INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Batata',15.99) RETURNING id`,
      [rid, cat],
    )
  ).rows[0].id;
  const group = (
    await client.query(
      `INSERT INTO modifier_groups(menu_item_id,restaurant_id,name,is_required,min_select,max_select) VALUES($1,$2,'Molho',true,1,1) RETURNING id`,
      [product, rid],
    )
  ).rows[0].id;
  const option = (
    await client.query(
      `INSERT INTO modifier_options(group_id,name,price_delta) VALUES($1,'Extra',3) RETURNING id`,
      [group],
    )
  ).rows[0].id;
  const items = JSON.stringify([
    {
      menu_item_id: product,
      quantity: 2,
      price_snapshot: 0.01,
      name_snapshot: "forged",
      modifier_option_ids: [option],
    },
  ]);
  async function place(token, payload = items) {
    return (
      await client.query(
        `SELECT public.place_order($1,'Mesa 1','Audit Customer','11912345678','USD',$2::jsonb,$3) AS id`,
        [rid, payload, token],
      )
    ).rows[0].id;
  }
  async function fails(sql, params = []) {
    await assert.rejects(client.query(sql, params));
  }
  await client.query("SET ROLE anon");
  await fails("SELECT * FROM orders");
  await fails("INSERT INTO orders(restaurant_id) VALUES($1)", [rid]);
  const token = "22222222-2222-4222-8222-222222222222";
  const order = await place(token);
  assert.equal(await place(token), order);
  assert.equal(
    (await client.query("SELECT get_order_status($1,$2) AS status", [order, token])).rows[0].status,
    "pending",
  );
  assert.equal(
    (await client.query(`SELECT get_order_status($1,'wrong') AS status`, [order])).rows[0].status,
    null,
  );
  await fails(
    `SELECT place_order($1,'Mesa 1','Audit','11912345678','BRL',$2::jsonb,'33333333-3333-4333-8333-333333333333')`,
    [rid, JSON.stringify([{ menu_item_id: product, quantity: 1 }])],
  );
  await client.query("RESET ROLE");
  const row = (await client.query("SELECT * FROM orders WHERE id=$1", [order])).rows[0];
  assert.equal(Number(row.subtotal), 37.98);
  assert.equal(row.currency, "BRL");
  assert.equal((await client.query("SELECT count(*) FROM orders")).rows[0].count, "1");
  console.log(
    "PASS: server pricing, required modifiers, private status, idempotency, anon lockdown",
  );
  await client.query(
    "INSERT INTO auth.users(id,email) VALUES('99999999-9999-4999-8999-999999999999','other@example.invalid')",
  );
  const other = (
    await client.query(
      "SELECT id FROM restaurants WHERE owner_id='99999999-9999-4999-8999-999999999999'",
    )
  ).rows[0].id;
  const otherCat = (
    await client.query(
      "INSERT INTO categories(restaurant_id,name) VALUES($1,'Other') RETURNING id",
      [other],
    )
  ).rows[0].id;
  const otherItem = (
    await client.query(
      "INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Foreign',1) RETURNING id",
      [other, otherCat],
    )
  ).rows[0].id;
  await client.query("SET ROLE anon");
  await assert.rejects(
    place(crypto.randomUUID(), JSON.stringify([{ menu_item_id: otherItem, quantity: 1 }])),
  );
  await assert.rejects(
    place(
      crypto.randomUUID(),
      JSON.stringify([{ menu_item_id: product, quantity: 0, modifier_option_ids: [option] }]),
    ),
  );
  await assert.rejects(
    place(
      crypto.randomUUID(),
      JSON.stringify([
        { menu_item_id: product, quantity: 1, modifier_option_ids: [option, option] },
      ]),
    ),
  );
  await client.query("RESET ROLE");
  await client.query("UPDATE menu_items SET is_available=false WHERE id=$1", [product]);
  await client.query("SET ROLE anon");
  await assert.rejects(place(crypto.randomUUID()));
  await client.query("RESET ROLE");
  await client.query("UPDATE menu_items SET is_available=true WHERE id=$1", [product]);
  await client.query("UPDATE restaurants SET kitchen_open=false WHERE id=$1", [rid]);
  await client.query("SET ROLE anon");
  await assert.rejects(place(crypto.randomUUID()));
  await client.query("RESET ROLE");
  await client.query("UPDATE restaurants SET kitchen_open=true WHERE id=$1", [rid]);
  await client.query(
    "SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)",
  );
  await client.query("SET ROLE authenticated");
  const owned = (
    await client.query("SELECT owner_place_order($1,$2,$3,'Owner') AS id", [rid, tid, items])
  ).rows[0].id;
  assert.ok(owned);
  await assert.rejects(
    client.query("SELECT owner_place_order($1,$2,$3,'Owner')", [other, tid, items]),
  );
  await client.query("RESET ROLE");
  console.log(
    "PASS: cross-tenant products, quantities, duplicate options, sold-out items, closed kitchen, owner order scope",
  );
  const staff = (
    await client.query(
      `INSERT INTO staff_members(restaurant_id,name,pin,role) VALUES($1,'Waiter','7891','waiter') RETURNING id,pin,pin_hash`,
      [rid],
    )
  ).rows[0];
  assert.equal(staff.pin, null);
  assert.ok(staff.pin_hash.startsWith("$2"));
  const slug = (await client.query("SELECT slug FROM restaurants WHERE id=$1", [rid])).rows[0].slug;
  await client.query("SET ROLE anon");
  const login = (await client.query("SELECT * FROM staff_login($1,$2)", [slug, "7891"])).rows[0];
  assert.ok(login.token);
  const staffOrder = (
    await client.query("SELECT staff_place_order($1,$2,$3) AS id", [login.token, tid, items])
  ).rows[0].id;
  assert.ok(staffOrder);
  await fails("SELECT staff_update_order_status($1,$2,$3)", [login.token, order, "preparing"]);
  await client.query("RESET ROLE");
  await client.query("UPDATE staff_members SET active=false WHERE id=$1", [staff.id]);
  assert.equal(
    (await client.query("SELECT * FROM staff_session_info($1)", [login.token])).rows.length,
    0,
  );
  await client.query("SET ROLE anon");
  for (let i = 0; i < 31; i++)
    await client.query("SELECT * FROM staff_login($1,$2)", [slug, "0000"]);
  await client.query("RESET ROLE");
  assert.ok(
    (await client.query("SELECT attempts FROM staff_login_attempts")).rows[0].attempts >= 31,
  );
  console.log(
    "PASS: PIN hashing, role restrictions, session revocation, persistent attempt counter",
  );
  const sub = {
    user_id: "11111111-1111-4111-8111-111111111111",
    stripe_subscription_id: "sub_audit",
    stripe_customer_id: "cus_audit",
    price_id: "pro_monthly",
    status: "active",
    plan_type: "pro",
    cancel_at_period_end: false,
  };
  await client.query("SET ROLE service_role");
  await client.query(`SELECT apply_billing_event('evt_a',100,'live',$1)`, [sub]);
  await client.query(`SELECT apply_billing_event('evt_a',100,'live',$1)`, [sub]);
  await client.query(`SELECT apply_billing_event('evt_old',90,'live',$1)`, [
    { ...sub, status: "canceled" },
  ]);
  await client.query(`SELECT apply_billing_event('evt_test',110,'sandbox',$1)`, [
    { ...sub, stripe_subscription_id: "sub_test", status: "canceled" },
  ]);
  await client.query("RESET ROLE");
  assert.equal(
    (
      await client.query(
        "SELECT plan_type FROM profiles WHERE id='11111111-1111-4111-8111-111111111111'",
      )
    ).rows[0].plan_type,
    "pro",
  );
  await client.query("SET ROLE authenticated");
  await fails(`UPDATE profiles SET plan_type='enterprise'`);
  console.log(
    "PASS: webhook deduplication, event ordering, sandbox isolation, plan escalation blocked",
  );
} finally {
  if (client) await client.end();
  await pg.stop();
}
