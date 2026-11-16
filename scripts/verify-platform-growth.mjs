import assert from "node:assert/strict";
import fs from "node:fs";
export async function verifyPlatformGrowth(client) {
  await client.query("RESET ROLE");
  // Separate the existing security fixtures from the registration cohort under test.
  await client.query("UPDATE profiles SET created_at=now()-interval '100 days'");
  await client.query("UPDATE restaurants SET created_at=now()-interval '100 days'");
  async function asUser(id) {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
    await client.query("SET ROLE authenticated");
  }
  await asUser("44444444-4444-4444-8444-444444444444");
  const baseline = (await client.query("SELECT platform_growth_overview(30) AS value")).rows[0]
    .value;
  assert.equal(baseline.cohort.accounts, 0);
  assert.equal(baseline.totals.new_restaurants, 0);
  await client.query("RESET ROLE");
  async function customer(suffix, age) {
    const user = (
      await client.query(
        "INSERT INTO auth.users(id,email) VALUES(gen_random_uuid(),$1) RETURNING id",
        [`growth-${suffix}@example.invalid`],
      )
    ).rows[0].id;
    await client.query(
      "UPDATE profiles SET created_at=now()-make_interval(days=>$2::integer),plan_type='trial',trial_ends_at=now()+interval '7 days' WHERE id=$1",
      [user, age],
    );
    const restaurant = (
      await client.query(
        "UPDATE restaurants SET name=$2,created_at=now()-make_interval(days=>$3::integer) WHERE owner_id=$1 RETURNING id",
        [user, `Growth ${suffix}`, age],
      )
    ).rows[0].id;
    return { user, restaurant };
  }
  const trial = await customer("Trial", 3),
    paid = await customer("Active", 2),
    manual = await customer("Manual", 1),
    sandbox = await customer("Sandbox", 2),
    inactive = await customer("Inactive", 40),
    cancelled = await customer("Cancelled", 1),
    expired = await customer("Expired", 12),
    blocked = await customer("Blocked", 4);
  await client.query("UPDATE profiles SET trial_ends_at=now()+interval '2 days' WHERE id=$1", [
    trial.user,
  ]);
  await client.query("UPDATE profiles SET trial_ends_at=now()-interval '1 day' WHERE id=$1", [
    expired.user,
  ]);
  await client.query("UPDATE profiles SET trial_ends_at=to_timestamp(0) WHERE id=$1", [
    blocked.user,
  ]);
  await client.query("UPDATE profiles SET plan_type='pro' WHERE id=ANY($1::uuid[])", [
    [paid.user, sandbox.user, inactive.user],
  ]);
  await client.query(
    "INSERT INTO platform_entitlements(user_id,plan_type,trial_ends_at,enabled) VALUES($1,'pro',now()+interval '7 days',true)",
    [manual.user],
  );
  async function subscription(user, suffix, environment, status) {
    await client.query(
      "INSERT INTO subscriptions(user_id,stripe_subscription_id,stripe_customer_id,status,environment,plan_type) VALUES($1,$2,$3,$4,$5,'pro')",
      [user, `sub_growth_${suffix}`, `cus_growth_${suffix}`, status, environment],
    );
  }
  await subscription(paid.user, "paid", "live", "active");
  await subscription(sandbox.user, "sandbox", "sandbox", "active");
  await subscription(sandbox.user, "trialing", "live", "trialing");
  await subscription(blocked.user, "blocked", "live", "past_due");
  const hours = {
    kitchen: Array.from({ length: 7 }, () => ({ enabled: true, open: "18:00", close: "23:00" })),
    bar: Array.from({ length: 7 }, () => ({ enabled: true, open: "18:00", close: "01:00" })),
  };
  await client.query("UPDATE restaurants SET operating_hours=$2 WHERE id=$1", [
    paid.restaurant,
    JSON.stringify(hours),
  ]);
  const cat = (
    await client.query(
      "INSERT INTO categories(restaurant_id,name) VALUES($1,'Growth cardápio') RETURNING id",
      [paid.restaurant],
    )
  ).rows[0].id;
  await client.query(
    "INSERT INTO menu_items(restaurant_id,category_id,name,price) VALUES($1,$2,'Growth prato',15)",
    [paid.restaurant, cat],
  );
  await client.query(
    "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Growth','GROWTH-ONE')",
    [paid.restaurant],
  );
  await client.query("INSERT INTO orders(restaurant_id,status,subtotal) VALUES($1,'pending',15)", [
    paid.restaurant,
  ]);
  await client.query(
    "INSERT INTO orders(restaurant_id,status,subtotal,created_at) VALUES($1,'served',15,now()-interval '11 days')",
    [inactive.restaurant],
  );
  await client.query(
    "INSERT INTO orders(restaurant_id,status,subtotal) VALUES($1,'cancelled',15)",
    [cancelled.restaurant],
  );
  await client.query(
    "INSERT INTO orders(restaurant_id,status,subtotal,created_at) VALUES($1,'pending',15,now()+interval '5 days')",
    [cancelled.restaurant],
  );
  const branch = (
    await client.query(
      "INSERT INTO restaurants(owner_id,name,slug,created_at) VALUES($1,'Growth Branch','growth-branch',now()-interval '1 day') RETURNING id",
      [paid.user],
    )
  ).rows[0].id;
  await asUser("44444444-4444-4444-8444-444444444444");
  const overview = (await client.query("SELECT platform_growth_overview(30) AS value")).rows[0]
    .value;
  assert.equal(overview.totals.restaurants, baseline.totals.restaurants + 9);
  assert.equal(overview.totals.new_restaurants, 8);
  assert.equal(overview.totals.previous_new, 1);
  assert.equal(overview.registrations.length, 30);
  assert.equal(
    overview.registrations.reduce((sum, d) => sum + d.count, 0),
    8,
  );
  assert.deepEqual(overview.cohort, { accounts: 7, converted: 1, manual_only: 1 }); // two restaurants of one subscriber count as one account
  assert.equal(overview.totals.active_7d, baseline.totals.active_7d + 1);
  assert.equal(overview.totals.active_30d, baseline.totals.active_30d + 2);
  assert.equal(overview.totals.ready, baseline.totals.ready + 1);
  assert.equal(overview.onboarding.menu, baseline.onboarding.menu + 1);
  assert.equal(overview.onboarding.tables, baseline.onboarding.tables + 1);
  assert.equal(overview.onboarding.hours, baseline.onboarding.hours + 1);
  assert.equal(overview.onboarding.first_order, baseline.onboarding.first_order + 2);
  assert.equal(overview.attention.filter((h) => h.id === trial.restaurant).length, 1);
  const trialHealth = overview.attention.find((h) => h.id === trial.restaurant);
  assert.equal(trialHealth.trial_ending, true);
  assert.equal(trialHealth.setup_attention, true);
  async function list(status, search = "", page = 0) {
    return (
      await client.query("SELECT platform_list_restaurants($1,$2,$3) AS value", [
        search,
        status,
        page,
      ])
    ).rows[0].value;
  }
  assert.ok((await list("ending")).items.some((h) => h.id === trial.restaurant));
  assert.ok((await list("expired")).items.some((h) => h.id === expired.restaurant));
  assert.ok(!(await list("expired")).items.some((h) => h.id === blocked.restaurant));
  assert.equal((await list("subscribed", "Growth")).total, 2); // two restaurants, one subscribed account
  assert.equal((await list("manual_plan", "Growth")).total, 1);
  assert.equal((await list("active7", "Growth")).total, 1);
  assert.equal((await list("active", "Growth")).total, 2);
  assert.equal((await list("new30", "Growth")).total, 8);
  assert.equal((await list("new7", "Growth")).total, 7);
  assert.equal((await list("inactive", "Growth")).items[0].id, inactive.restaurant);
  const complete = (
    await client.query("SELECT platform_restaurant_detail($1) AS value", [paid.restaurant])
  ).rows[0].value;
  assert.equal(complete.health.completed_steps, 4);
  assert.equal(complete.health.subscription_active, true);
  await client.query("RESET ROLE");
  await client.query(
    "UPDATE subscriptions SET plan_type=NULL WHERE user_id=$1 AND environment='live' AND status='active'",
    [paid.user],
  );
  await asUser("44444444-4444-4444-8444-444444444444");
  assert.equal(
    (await client.query("SELECT platform_growth_overview(30) AS value")).rows[0].value.cohort
      .converted,
    1,
  );
  const cancelledHealth = (
    await client.query("SELECT platform_restaurant_detail($1) AS value", [cancelled.restaurant])
  ).rows[0].value.health;
  assert.equal(cancelledHealth.first_order_ready, false);
  assert.equal(cancelledHealth.last_order_at, null);
  await assert.rejects(client.query("SELECT * FROM platform_restaurant_health"));
  await assert.rejects(client.query("SELECT platform_growth_overview(365)"));
  const seven = (await client.query("SELECT platform_growth_overview(7) AS value")).rows[0].value;
  assert.equal(seven.registrations.length, 7);
  assert.equal(seven.totals.new_restaurants, 7);
  await client.query("RESET ROLE");
  const comparisonEnd = new Date(overview.previous_end);
  await client.query(
    "INSERT INTO restaurants(owner_id,name,slug,created_at) VALUES($1,'Growth Before comparison','growth-before-comparison',$2),($1,'Growth After comparison','growth-after-comparison',$3)",
    [
      paid.user,
      new Date(comparisonEnd.getTime() - 3600000),
      new Date(comparisonEnd.getTime() + 3600000),
    ],
  );
  await asUser("44444444-4444-4444-8444-444444444444");
  assert.equal(
    (await client.query("SELECT platform_growth_overview(30) AS value")).rows[0].value.totals
      .previous_new,
    overview.totals.previous_new + 1,
  );
  await asUser(trial.user);
  await client.query("CREATE TEMP TABLE platform_admins(user_id uuid,active boolean)");
  await client.query("INSERT INTO pg_temp.platform_admins VALUES($1,true)", [trial.user]);
  assert.equal(
    (await client.query("SELECT is_platform_admin() AS allowed")).rows[0].allowed,
    false,
  );
  await assert.rejects(client.query("SELECT platform_growth_overview(30)"));
  await assert.rejects(client.query("SELECT * FROM platform_restaurant_health"));
  await assert.rejects(client.query("SELECT platform_restaurant_detail($1)", [paid.restaurant]));
  await client.query("DROP TABLE pg_temp.platform_admins");
  await client.query("RESET ROLE");
  await client.query("SET ROLE anon");
  await assert.rejects(client.query("SELECT platform_growth_overview(30)"));
  await assert.rejects(client.query("SELECT * FROM platform_restaurant_health"));
  await client.query("RESET ROLE");
  for (let n = 0; n < 27; n++) await customer(`Pagination ${String(n).padStart(2, "0")}`, 3);
  await asUser("44444444-4444-4444-8444-444444444444");
  const many = (await client.query("SELECT platform_growth_overview(30) AS value")).rows[0].value;
  assert.ok(many.totals.attention > 20);
  assert.equal(many.attention.length, 20);
  assert.equal(new Set(many.attention.map((h) => h.id)).size, 20);
  const first = await list("setup", "Growth Pagination", 0),
    second = await list("setup", "Growth Pagination", 1);
  assert.equal(first.total, 27);
  assert.equal(first.items.length, 25);
  assert.equal(second.items.length, 2);
  assert.equal(new Set([...first.items, ...second.items].map((h) => h.id)).size, 27);
  await client.query("RESET ROLE");
  await client.query(
    fs.readFileSync(
      new URL("../supabase/migrations/20261116000800_platform_growth.sql", import.meta.url),
      "utf8",
    ),
  );
  await asUser("44444444-4444-4444-8444-444444444444");
  assert.ok(
    (await client.query("SELECT platform_restaurant_detail($1) AS value", [branch])).rows[0].value
      .health,
  );
  await client.query("RESET ROLE");
  console.log(
    "PASS: platform growth/cohorts, live vs sandbox/manual conversion, unique accounts, onboarding, future/cancelled activity exclusion, deadline alerts, pagination and private admin access",
  );
}
