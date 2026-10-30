import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_SUPABASE_URL;
const anonKey = process.env.TEST_SUPABASE_PUBLISHABLE_KEY;

const slug = process.env.TEST_STAFF_SLUG ?? "";
const pin = process.env.TEST_STAFF_PIN ?? "";
const badPin = "invalid";

const shouldRun =
  process.env.RUN_INTEGRATION_TESTS === "1" && !!url && !!anonKey && !!slug && !!pin;
const d = shouldRun ? describe : describe.skip;

const anon = createClient(url ?? "https://test.invalid", anonKey ?? "test-key", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    storage: undefined,
  },
});

let validToken: string | null = null;

const STAFF_RPCS = [
  "staff_list_orders",
  "staff_list_tables",
  "staff_list_calls",
  "staff_list_members",
] as const;

async function callWithToken(fn: string, token: string) {
  return anon.rpc(fn, { p_token: token });
}

d("staff PIN authorization on staff_* RPCs", () => {
  beforeAll(async () => {
    const { data, error } = await anon.rpc("staff_login", {
      p_slug: slug,
      p_pin: pin,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    expect(row?.token).toBeTruthy();
    validToken = row.token as string;
  });

  it("staff_login rejects wrong PIN", async () => {
    const { data, error } = await anon.rpc("staff_login", {
      p_slug: slug,
      p_pin: badPin,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("staff_login rejects unknown restaurant slug", async () => {
    const { data, error } = await anon.rpc("staff_login", {
      p_slug: "does-not-exist-xyz",
      p_pin: pin,
    });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  for (const fn of STAFF_RPCS) {
    it(`${fn} rejects an invalid token`, async () => {
      const { data, error } = await callWithToken(fn, "not-a-real-token");
      expect(data).toBeNull();
      expect(error).toBeTruthy();
      expect(/sess[aã]o inv[aá]lida/i.test(error!.message)).toBe(true);
    });

    it(`${fn} rejects an empty token`, async () => {
      const { data, error } = await callWithToken(fn, "");
      expect(data).toBeNull();
      expect(error).toBeTruthy();
    });

    it(`${fn} succeeds with a valid staff token`, async () => {
      const { data, error } = await callWithToken(fn, validToken!);
      expect(error).toBeNull();
      // All list_* RPCs return a JSON array
      expect(Array.isArray(data)).toBe(true);
    });
  }

  it("staff_update_order_status rejects invalid token", async () => {
    const { error } = await anon.rpc("staff_update_order_status", {
      p_token: "bogus",
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_status: "served",
      p_staff_name: null,
    });
    expect(error).toBeTruthy();
    expect(/sess[aã]o inv[aá]lida/i.test(error!.message)).toBe(true);
  });

  it("staff_archive_orders rejects invalid token", async () => {
    const { error } = await anon.rpc("staff_archive_orders", {
      p_token: "bogus",
      p_order_ids: ["00000000-0000-0000-0000-000000000000"],
    });
    expect(error).toBeTruthy();
    expect(/sess[aã]o inv[aá]lida/i.test(error!.message)).toBe(true);
  });

  it("staff_resolve_call rejects invalid token", async () => {
    const { error } = await anon.rpc("staff_resolve_call", {
      p_token: "bogus",
      p_call_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).toBeTruthy();
    expect(/sess[aã]o inv[aá]lida/i.test(error!.message)).toBe(true);
  });

  it("staff_update_order_status passes the auth check with a valid token", async () => {
    const { error } = await anon.rpc("staff_update_order_status", {
      p_token: validToken!,
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_status: "served",
      p_staff_name: "Vitest",
    });
    // Valid token → does NOT raise "Sessão inválida". Any other DB error
    // (e.g. enum cast) is unrelated to authorization.
    if (error) {
      expect(/sess[aã]o inv[aá]lida/i.test(error.message)).toBe(false);
    }
  });

  it("staff_logout invalidates the token", async () => {
    // Mint a throwaway token so we don't kill the shared validToken.
    const { data: loginData } = await anon.rpc("staff_login", {
      p_slug: slug,
      p_pin: pin,
    });
    const row = Array.isArray(loginData) ? loginData[0] : loginData;
    const throwaway = row.token as string;

    const { error: logoutErr } = await anon.rpc("staff_logout", {
      p_token: throwaway,
    });
    expect(logoutErr).toBeNull();

    const { data, error } = await callWithToken("staff_list_orders", throwaway);
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(/sess[aã]o inv[aá]lida/i.test(error!.message)).toBe(true);
  });
});

afterAll(async () => {
  if (!shouldRun || !validToken) return;
  await anon.rpc("staff_logout", { p_token: validToken });
});
