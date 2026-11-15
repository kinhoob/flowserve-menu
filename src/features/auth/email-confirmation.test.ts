import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerWithEmail, resendConfirmation, safeAuthDestination } from "./email-confirmation";
const { signUp, resend } = vi.hoisted(() => ({ signUp: vi.fn(), resend: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { signUp, resend } } }));
beforeEach(() => vi.resetAllMocks());
const input = {
  email: " owner@example.invalid ",
  password: "test-password",
  displayName: " Owner ",
  origin: "http://localhost:5187",
  redirect: "/settings?plan=pro",
};
describe("email link confirmation", () => {
  it("requests confirmation with the configured app destination and normalized email", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    expect(await registerWithEmail(input)).toEqual({ confirmationRequired: true });
    expect(signUp).toHaveBeenCalledWith({
      email: "owner@example.invalid",
      password: "test-password",
      options: {
        emailRedirectTo: "http://localhost:5187/dashboard",
        data: { display_name: "Owner" },
      },
    });
  });
  it("does not ask an already authenticated signup to confirm again", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "test" } }, error: null });
    expect(await registerWithEmail(input)).toEqual({ confirmationRequired: false });
  });
  it("propagates failed delivery instead of showing success", async () => {
    signUp.mockResolvedValue({
      data: { session: null },
      error: new Error("Email address not authorized"),
    });
    await expect(registerWithEmail(input)).rejects.toThrow("Email address not authorized");
  });
  it("resends the signup link with the same return URL", async () => {
    resend.mockResolvedValue({ error: null });
    await resendConfirmation(input);
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "owner@example.invalid",
      options: { emailRedirectTo: "http://localhost:5187/dashboard" },
    });
  });
  it("propagates resend limits", async () => {
    resend.mockResolvedValue({ error: new Error("rate limit") });
    await expect(resendConfirmation(input)).rejects.toThrow("rate limit");
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/auth?mode=signup",
    "/foo/../auth",
    "javascript:alert(1)",
    undefined,
  ])("keeps unsafe or looping destinations inside the app: %s", (path) => {
    expect(safeAuthDestination(path)).toBe("/dashboard");
  });
  it("preserves internal destinations for plan selection", () => {
    expect(safeAuthDestination("/settings?plan=pro#billing")).toBe("/settings?plan=pro#billing");
  });
});
