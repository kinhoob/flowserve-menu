import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { z } from "zod";
import { commercialPlanUpgradeSQL } from "./build-commercial-plan-upgrade.mjs";
import { legacyPlanCheckSQL, legacyPlanUpgradeSQL } from "./build-legacy-plan-upgrade.mjs";
import { LEGACY_PLAN_FILE, LEGACY_PLAN_MARKER } from "./legacy-plan-slices.mjs";

function embedded(sql) {
  return sql.replace(/^BEGIN(?: READ ONLY)?;\n/m, "").replace(/\nCOMMIT;\n$/, "\n");
}

function legacyWebhook(client) {
  const source = execFileSync("git", ["show", "8c04778:src/lib/billing-webhook.ts"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  const script = stripTypeScriptTypes(
    source.replace(/^import .+;\r?\n/gm, "").replace("export async function", "async function"),
  );
  let event;
  const handler = new Function(
    "createClient",
    "verifyWebhook",
    "z",
    "process",
    script + "\nreturn processBillingWebhook;",
  )(
    () => ({
      async rpc(name, args) {
        assert.equal(name, "apply_billing_event");
        assert.equal(args.p_subscription.reconciliation_generation, undefined);
        assert.equal(args.p_subscription.snapshot_requested_at, undefined);
        try {
          await client.query("SELECT apply_billing_event($1,$2,$3,$4)", [
            args.p_event_id,
            args.p_created,
            args.p_environment,
            args.p_subscription,
          ]);
          return { error: null };
        } catch (error) {
          return { error };
        }
      },
    }),
    async () => event,
    z,
    { env: {} },
  );
  return (data, environment) => {
    event = data;
    return handler(new Request("http://127.0.0.1/fixture"), environment);
  };
}

export async function verifyLegacyPlanBridge(client) {
  await client.query("RESET ROLE");
  const upgrade = fs.readFileSync(
    new URL("../supabase/compat/" + LEGACY_PLAN_FILE, import.meta.url),
    "utf8",
  );
  const check = fs.readFileSync(
    new URL("../supabase/compat/fluxqr-planos-legado-verificacao.sql", import.meta.url),
    "utf8",
  );
  assert.equal(upgrade, legacyPlanUpgradeSQL());
  assert.equal(check, legacyPlanCheckSQL());
  await client.query(check); // The unchanged preflight also runs in a read-only transaction.
  await client.query("BEGIN");
  try {
    await client.query(
      "CREATE SCHEMA supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY)",
    );
    const owner = crypto.randomUUID();
    await client.query("INSERT INTO auth.users(id,email) VALUES ($1,'bridge@example.invalid')", [
      owner,
    ]);
    const {
      rows: [venue],
    } = await client.query("SELECT id FROM restaurants WHERE owner_id=$1", [owner]);
    await client.query(
      "UPDATE restaurants SET require_table_code=false,operating_hours=NULL,kitchen_open=true,bar_open=true WHERE id=$1",
      [venue.id],
    );
    await client.query("UPDATE profiles SET plan_type='pro' WHERE id=$1", [owner]);
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [owner]);
    const result = async (query, args) => (await client.query(query, args)).rows[0];
    const root = () => client.query("RESET ROLE");
    const role = (name) => client.query("SET ROLE " + name);
    const setPlan = async (plan) => {
      await root();
      await client.query("UPDATE profiles SET plan_type=$2 WHERE id=$1", [owner, plan]);
    };
    const denied = async (operation, error) => {
      await client.query("SAVEPOINT expected_denial");
      try {
        await assert.rejects(operation(), error);
      } finally {
        await client.query("ROLLBACK TO expected_denial");
        await client.query("RELEASE expected_denial");
      }
    };

    const fingerprint = () =>
      result(
        "SELECT md5(pg_get_functiondef(oid)) AS definition, proacl::text AS acl, proowner FROM pg_proc WHERE oid='public.apply_billing_event(text,bigint,text,jsonb)'::regprocedure",
      );
    const before = await fingerprint();
    await role("authenticated");
    // The 8c04778 client sends this column set for both single and bulk inserts.
    const { rows: tables } = await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) SELECT $1,'Mesa Ponte '||i,'PONTE'||i FROM generate_series(1,11) i RETURNING id,label",
      [venue.id],
    );
    await client.query(
      "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Mesa Ponte 10','PONTE_DUP')",
      [venue.id],
    );
    const open = async (table) =>
      (await result("SELECT start_table_service($1,NULL) AS service", [table.id])).service;
    const service = await open(tables[10]);
    const ambiguousService = await open(tables[9]);
    await root();
    await client.query(embedded(upgrade));
    await client.query(embedded(upgrade));
    await client.query(embedded(check));
    assert.deepEqual(await fingerprint(), before);
    assert.equal(
      (await result("SELECT count(*)::int AS count FROM supabase_migrations.schema_migrations"))
        .count,
      0,
    );

    const webhook = legacyWebhook(client);
    const payload = (id, sequence, type, sub, plan) => ({
      id,
      created: sequence,
      type,
      data: {
        object: {
          id: sub,
          customer: "cus_fixture",
          metadata: { userId: owner },
          status: "active",
          items: { data: [{ price: { lookup_key: plan + "_monthly", product: "prod_fixture" } }] },
        },
      },
    });
    await role("service_role");
    await webhook(
      payload(
        "evt_bridge_sandbox",
        1,
        "customer.subscription.updated",
        "sub_bridge_sandbox",
        "basic",
      ),
      "sandbox",
    );
    await webhook(
      payload(
        "evt_bridge_live",
        3,
        "customer.subscription.updated",
        "sub_bridge_live",
        "essential",
      ),
      "live",
    );
    await webhook(
      payload("evt_bridge_stale", 2, "customer.subscription.updated", "sub_bridge_live", "pro"),
      "live",
    );
    await root();
    assert.equal(
      (await result("SELECT plan_type FROM profiles WHERE id=$1", [owner])).plan_type,
      "essential",
    );

    await role("authenticated");
    await denied(() => open(tables[0]), /fora da opera/);
    await denied(
      () => client.query("SELECT release_table($1,$2,NULL,0,0)", [venue.id, tables[9].label]),
      /amb/,
    );
    assert.equal(
      (
        await result("SELECT active_service_id AS service FROM venue_tables WHERE id=$1", [
          tables[9].id,
        ])
      ).service,
      ambiguousService,
    );
    await client.query("SELECT select_operational_tables($1,$2)", [
      venue.id,
      tables.slice(0, 9).map(({ id }) => id),
    ]);
    await denied(
      () =>
        client.query(
          "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES ($1,'Ponte 12','PONTE12'),($1,'Ponte 13','PONTE13')",
          [venue.id],
        ),
      /10 QR Codes/,
    );
    assert.equal(
      (
        await result("SELECT count(*)::int AS count FROM venue_tables WHERE restaurant_id=$1", [
          venue.id,
        ])
      ).count,
      12,
    );
    assert.equal(
      (
        await result("SELECT active_service_id AS service FROM venue_tables WHERE id=$1", [
          tables[10].id,
        ])
      ).service,
      service,
    );
    // The old browser closes by label. The previously opened service is still present.
    await client.query("SELECT release_table($1,$2,NULL,0,0)", [venue.id, tables[10].label]);
    assert.equal(
      (
        await result("SELECT active_service_id AS service FROM venue_tables WHERE id=$1", [
          tables[10].id,
        ])
      ).service,
      null,
    );
    await denied(
      () =>
        client.query(
          "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Mesa Mesa Ponte 11','PONTE_OTHER')",
          [venue.id],
        ),
      /pausadas/,
    );
    const essentialService = await open(tables[0]);
    assert.ok(essentialService);
    await setPlan("basic");
    await role("authenticated");
    await denied(
      () =>
        client.query(
          "INSERT INTO venue_tables(restaurant_id,label,short_code) VALUES($1,'Ponte 12','PONTE12')",
          [venue.id],
        ),
      /Essential/,
    );
    await denied(() => open(tables[1]), /fora da opera/);
    await root();
    await role("service_role");
    await webhook(
      payload(
        "evt_bridge_delete",
        4,
        "customer.subscription.deleted",
        "sub_bridge_live",
        "essential",
      ),
      "live",
    );
    await root();
    assert.equal(
      (
        await result(
          "SELECT status FROM subscriptions WHERE stripe_subscription_id='sub_bridge_live'",
        )
      ).status,
      "canceled",
    );
    await role("authenticated");
    await client.query("SELECT release_table($1,$2,NULL,0,0)", [venue.id, tables[0].label]);
    await root();

    await client.query(embedded(commercialPlanUpgradeSQL()));
    await client.query(embedded(commercialPlanUpgradeSQL()));
    assert.equal(
      (await result("SELECT to_regprocedure($1) AS marker", [LEGACY_PLAN_MARKER])).marker,
      null,
    );
    assert.equal(
      (
        await result(
          "SELECT count(*)::int AS count FROM venue_tables WHERE restaurant_id=$1 AND operational",
          [venue.id],
        )
      ).count,
      9,
    );
    assert.equal(
      (
        await result(
          "SELECT status FROM subscriptions WHERE stripe_subscription_id='sub_bridge_live'",
        )
      ).status,
      "canceled",
    );
    assert.equal(
      (await result("SELECT state FROM table_services WHERE id=$1", [service])).state,
      "closed",
    );
  } finally {
    await client.query("ROLLBACK");
  }
  console.log(
    "PASS: legacy app webhook and RPC contracts, empty migration history, plan-only upgrade/reapply, existing services, and full upgrade preserving selections",
  );
}
