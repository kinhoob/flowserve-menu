import assert from "node:assert/strict";
import { platformActivationSQL } from "./build-platform-access.mjs";
export async function verifyPlatformManagement(client, { rid, other }) {
  await client.query("RESET ROLE");
  const owner = "11111111-1111-4111-8111-111111111111";
  const admin = "33333333-3333-4333-8333-333333333333";
  const partner = "44444444-4444-4444-8444-444444444444";
  const fail = async (sql, args = []) => assert.rejects(client.query(sql, args));
  assert.throws(() =>
    platformActivationSQL(["creator@example.invalid", "CREATOR@example.invalid"]),
  );
  assert.throws(() =>
    platformActivationSQL(["creator@example.invalid", "bad'); DROP TABLE profiles;--"]),
  );
  await client.query(
    "ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS email_confirmed_at timestamptz",
  );
  await client.query(
    "INSERT INTO auth.users(id,email) VALUES($1,'creator@example.invalid'),($2,'partner@example.invalid')",
    [admin, partner],
  );
  const activation = platformActivationSQL(["creator@example.invalid", "partner@example.invalid"]);
  await fail(activation);
  assert.equal((await client.query("SELECT count(*) AS n FROM platform_admins")).rows[0].n, "0");
  await client.query("UPDATE auth.users SET email_confirmed_at=now() WHERE id=ANY($1::uuid[])", [
    [admin, partner],
  ]);
  await client.query(platformActivationSQL(["creator@example.invalid"]));
  assert.equal((await client.query("SELECT count(*) AS n FROM platform_admins")).rows[0].n, "1");
  assert.equal(
    (await client.query("SELECT count(*) AS n FROM platform_admins WHERE user_id=$1", [partner]))
      .rows[0].n,
    "0",
  );
  await client.query(activation);
  await client.query(activation);
  assert.equal((await client.query("SELECT count(*) AS n FROM platform_admins")).rows[0].n, "2");
  await client.query(
    "UPDATE profiles SET plan_type='trial',trial_ends_at=now()-interval '1 day' WHERE id=$1",
    [owner],
  );
  await client.query("SET ROLE anon");
  await fail("SELECT is_platform_admin()");
  await fail("SELECT platform_list_restaurants()");
  await fail("SELECT effective_entitlement($1)", [owner]);
  await client.query("RESET ROLE");
  async function asUser(id) {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await client.query("SET ROLE authenticated");
  }
  await asUser(owner);
  assert.equal((await client.query("SELECT is_platform_admin() AS yes")).rows[0].yes, false);
  await fail("SELECT platform_list_restaurants()");
  await fail("SELECT platform_restaurant_detail($1)", [other]);
  await fail("INSERT INTO platform_admins(user_id) VALUES($1)", [owner]);
  await fail("SELECT * FROM platform_entitlements");
  await fail("UPDATE profiles SET plan_type='enterprise' WHERE id=$1", [owner]);
  await fail(
    "SELECT platform_change_entitlement($1,'set_plan','pro',NULL,'Tentativa indevida',0)",
    [rid],
  );
  await asUser(admin);
  assert.equal((await client.query("SELECT is_platform_admin() AS yes")).rows[0].yes, true);
  const listing = (
    await client.query(
      "SELECT platform_list_restaurants('audit@example.invalid','expired',0) AS value",
    )
  ).rows[0].value;
  assert.equal(listing.items.length, 1);
  assert.equal(listing.items[0].id, rid);
  assert.equal(listing.stats.restaurants, 4);
  assert.equal(
    (await client.query("SELECT platform_list_restaurants('%','all',0) AS value")).rows[0].value
      .total,
    0,
  );
  await fail("SELECT platform_list_restaurants('','bad',0)");
  await fail("SELECT platform_list_restaurants('','all',-1)");
  const change = async (
    action,
    plan,
    days,
    version,
    reason = "Implantação assistida do restaurante",
  ) =>
    (
      await client.query("SELECT platform_change_entitlement($1,$2,$3,$4,$5,$6) AS value", [
        rid,
        action,
        plan,
        days,
        reason,
        version,
      ])
    ).rows[0].value;
  const initial = (await client.query("SELECT platform_restaurant_detail($1) AS value", [rid]))
    .rows[0].value;
  assert.equal(initial.owner.email, "audit@example.invalid");
  assert.ok(initial.counts.products > 0);
  assert.ok(initial.orders.total > 0);
  const extended = await change("extend_trial", null, 7, 0);
  assert.equal(extended.plan_source, "manual");
  assert.equal(extended.version, 1);
  assert.ok(new Date(extended.trial_ends_at).getTime() > Date.now() + 6.99 * 86400000);
  await assert.rejects(change("extend_trial", null, 7, 0)); // A repeated request cannot add the days again.
  await assert.rejects(change("set_plan", "invalid", null, 1));
  await assert.rejects(change("extend_trial", null, 366, 1));
  await assert.rejects(change("set_plan", "pro", null, 1, "x"));
  await asUser(partner);
  const further = await change("extend_trial", null, 14, 1);
  assert.equal(new Date(further.trial_ends_at) - new Date(extended.trial_ends_at), 14 * 86400000);
  await asUser(admin);
  await assert.rejects(change("set_plan", "pro", null, 1));
  const granted = await change("set_plan", "pro", null, 2);
  assert.equal(granted.version, 3);
  await asUser(owner);
  assert.equal(
    (await client.query("SELECT get_my_entitlement() AS value")).rows[0].value.plan_type,
    "pro",
  );
  await client.query("RESET ROLE");
  await client.query("SET ROLE service_role");
  await client.query("SELECT apply_billing_event('evt_platform_test',50000,'live',$1::jsonb)", [
    JSON.stringify({
      user_id: owner,
      stripe_subscription_id: "sub_platform_test",
      stripe_customer_id: "cus_platform",
      price_id: "essential_monthly",
      product_id: "prod_platform",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      cancel_at_period_end: false,
      plan_type: "essential",
    }),
  ]);
  await client.query("RESET ROLE");
  assert.equal(
    (await client.query("SELECT plan_type FROM profiles WHERE id=$1", [owner])).rows[0].plan_type,
    "essential",
  );
  await client.query("SET ROLE anon");
  const slug = (await client.query("SELECT slug FROM restaurants WHERE id=$1", [rid])).rows[0].slug;
  assert.equal(
    (await client.query("SELECT get_restaurant_plan($1) AS plan", [slug])).rows[0].plan,
    "pro",
  );
  await asUser(admin);
  const restored = await change("restore_billing", null, null, 3);
  assert.equal(restored.plan_type, "essential");
  assert.equal(restored.plan_source, "billing");
  assert.equal(restored.version, 4);
  await assert.rejects(change("extend_trial", null, 7, 4));
  const newTrial = await change("set_plan", "trial", 10, 4);
  assert.equal(newTrial.plan_type, "trial");
  assert.equal(newTrial.version, 5);
  const after = (await client.query("SELECT platform_restaurant_detail($1) AS value", [rid]))
    .rows[0].value;
  assert.equal(after.audit.length, 5);
  assert.ok(after.audit.some((a) => a.actor_email === "partner@example.invalid"));
  assert.equal(after.subscriptions[0].environment, "live");
  await fail("UPDATE platform_audit_log SET reason='esconder alteração'");
  await fail("DELETE FROM platform_audit_log");
  await fail("UPDATE platform_admins SET active=false");
  await client.query("RESET ROLE");
  await client.query("UPDATE platform_admins SET active=false WHERE user_id=$1", [admin]);
  await asUser(admin);
  assert.equal((await client.query("SELECT is_platform_admin() AS yes")).rows[0].yes, false);
  await fail("SELECT platform_list_restaurants()");
  await fail("SELECT platform_restaurant_detail($1)", [rid]);
  await asUser(partner);
  assert.equal((await client.query("SELECT is_platform_admin() AS yes")).rows[0].yes, true);
  await asUser(owner);
  assert.equal(
    (await client.query("SELECT get_my_entitlement() AS value")).rows[0].value.plan_source,
    "manual",
  );
  await fail("SELECT * FROM platform_audit_log");
  await client.query("RESET ROLE");
  console.log(
    "PASS: two verified administrators, customer/anon isolation, plan/trial changes, expired and remaining trial days, concurrency/retry protection, immutable audit, webhook override isolation and access revocation",
  );
}
