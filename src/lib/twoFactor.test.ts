import { describe, expect, it } from "vitest";
import { cleanCode, isSixDigitCode, TWO_FACTOR_PATH, twoFactorRedirect } from "./twoFactor";

describe("twoFactorRedirect", () => {
  it("sends password-only sessions to the two-factor page", () => {
    expect(twoFactorRedirect("/projects", "aal1")).toBe(TWO_FACTOR_PATH);
    expect(twoFactorRedirect("/api/meetings", "aal1")).toBe(TWO_FACTOR_PATH);
    expect(twoFactorRedirect("/clients/abc", null)).toBe(TWO_FACTOR_PATH);
  });

  it("lets password-only sessions stay on the two-factor page", () => {
    expect(twoFactorRedirect(TWO_FACTOR_PATH, "aal1")).toBeNull();
  });

  it("lets verified sessions into the dashboard", () => {
    expect(twoFactorRedirect("/projects", "aal2")).toBeNull();
    expect(twoFactorRedirect("/settings/security", "aal2")).toBeNull();
  });

  it("moves verified sessions off the two-factor page", () => {
    expect(twoFactorRedirect(TWO_FACTOR_PATH, "aal2")).toBe("/projects");
  });
});

describe("codes", () => {
  it("accepts six digits with or without a space", () => {
    expect(isSixDigitCode("123456")).toBe(true);
    expect(isSixDigitCode("123 456")).toBe(true);
    expect(cleanCode(" 123 456 ")).toBe("123456");
  });

  it("rejects anything else", () => {
    expect(isSixDigitCode("12345")).toBe(false);
    expect(isSixDigitCode("1234567")).toBe(false);
    expect(isSixDigitCode("12345a")).toBe(false);
  });
});
