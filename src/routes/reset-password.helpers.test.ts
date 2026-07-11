import { describe, it, expect } from "vitest";
import {
  RESEND_COOLDOWN_SECONDS,
  classifyHashError,
  classifyResendError,
  classifyUpdateUserError,
  isValidEmail,
  parseHashParams,
  tickCooldown,
  validateNewPassword,
} from "./reset-password.helpers";

describe("parseHashParams", () => {
  it("strips leading # and parses key=value pairs", () => {
    const p = parseHashParams("#error_code=otp_expired&error=access_denied");
    expect(p.get("error_code")).toBe("otp_expired");
    expect(p.get("error")).toBe("access_denied");
  });

  it("handles empty hash", () => {
    expect(parseHashParams("").toString()).toBe("");
    expect(parseHashParams("#").toString()).toBe("");
  });
});

describe("classifyHashError — valid link", () => {
  it("returns null when the hash carries no error signals", () => {
    // A "healthy" recovery redirect only carries tokens, no error keys.
    const params = new URLSearchParams(
      "access_token=abc&refresh_token=def&type=recovery",
    );
    expect(classifyHashError(params)).toBeNull();
  });

  it("returns null for a completely empty hash (still validating)", () => {
    expect(classifyHashError(new URLSearchParams(""))).toBeNull();
  });
});

describe("classifyHashError — expired link", () => {
  it("detects Supabase otp_expired code", () => {
    const params = new URLSearchParams(
      "error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
    );
    const res = classifyHashError(params);
    expect(res).not.toBeNull();
    expect(res!.status).toBe("expired");
    expect(res!.message).toMatch(/expirou/i);
  });

  it("detects expired via error_description even without otp_expired code", () => {
    const params = new URLSearchParams(
      "error_description=Token+has+expired",
    );
    const res = classifyHashError(params);
    expect(res!.status).toBe("expired");
  });
});

describe("classifyHashError — invalid link", () => {
  it("marks a generic error as invalid and decodes the description", () => {
    const params = new URLSearchParams(
      "error=access_denied&error_description=Invalid+recovery+token",
    );
    const res = classifyHashError(params);
    expect(res!.status).toBe("invalid");
    expect(res!.message).toBe("Invalid recovery token");
  });

  it("falls back to a friendly message when no description is present", () => {
    const params = new URLSearchParams("error=access_denied");
    const res = classifyHashError(params);
    expect(res!.status).toBe("invalid");
    expect(res!.message).toMatch(/inválido/i);
  });

  it("treats an error_code alone (no error key) as invalid", () => {
    const params = new URLSearchParams("error_code=unauthorized_client");
    const res = classifyHashError(params);
    expect(res!.status).toBe("invalid");
  });
});

describe("validateNewPassword", () => {
  it("rejects passwords under 6 chars", () => {
    expect(validateNewPassword("abc", "abc").ok).toBe(false);
  });

  it("rejects mismatched confirmation", () => {
    const r = validateNewPassword("abcdef", "abcdeg");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/coincidem/i);
  });

  it("accepts a valid pair", () => {
    expect(validateNewPassword("abcdef", "abcdef").ok).toBe(true);
  });
});

describe("classifyUpdateUserError", () => {
  it("downgrades expired sessions to the expired status with a banner", () => {
    const r = classifyUpdateUserError("Auth session missing");
    expect(r.status).toBe("expired");
    expect(r.banner).toBeDefined();
  });

  it("recognises JWT expiration", () => {
    expect(classifyUpdateUserError("JWT expired").status).toBe("expired");
  });

  it("flags 'same password' errors distinctly", () => {
    const r = classifyUpdateUserError(
      "New password should be different from the old password",
    );
    expect(r.status).toBeUndefined();
    expect(r.toast).toMatch(/diferente/i);
  });

  it("falls back to a generic message otherwise", () => {
    const r = classifyUpdateUserError("Something went wrong");
    expect(r.status).toBeUndefined();
    expect(r.toast).toMatch(/não foi possível/i);
  });
});

describe("classifyResendError (cooldown protection)", () => {
  it("engages cooldown on rate-limit-style errors", () => {
    const r = classifyResendError("Email rate limit exceeded");
    expect(r.engageCooldown).toBe(true);
  });

  it("engages cooldown on 'too many requests'", () => {
    expect(classifyResendError("Too many requests").engageCooldown).toBe(true);
  });

  it("does not engage cooldown on unrelated network failures", () => {
    expect(classifyResendError("Network error").engageCooldown).toBe(false);
  });
});

describe("isValidEmail", () => {
  it.each([
    ["ok@example.com", true],
    ["user.name+tag@example.co.uk", true],
    ["", false],
    ["no-at-sign", false],
    ["missing@tld", false],
    ["spaces in@email.com", false],
  it.each<[string, boolean]>([
    ["ok@example.com", true],
    ["user.name+tag@example.co.uk", true],
    ["", false],
    ["no-at-sign", false],
    ["missing@tld", false],
    ["spaces in@email.com", false],
  ])("%s → %s", (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });

describe("tickCooldown", () => {
  it("decrements normally", () => {
    expect(tickCooldown(30)).toBe(29);
  });

  it("clamps at 0 when reaching 1", () => {
    expect(tickCooldown(1)).toBe(0);
    expect(tickCooldown(0)).toBe(0);
  });

  it("drains a full cooldown to 0 in exactly RESEND_COOLDOWN_SECONDS ticks", () => {
    let v = RESEND_COOLDOWN_SECONDS;
    for (let i = 0; i < RESEND_COOLDOWN_SECONDS; i++) v = tickCooldown(v);
    expect(v).toBe(0);
  });
});
