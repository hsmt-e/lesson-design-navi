import { describe, expect, it } from "vitest";
import { registerSchema } from "./auth.js";
import {
  TERMS_VERSION,
  needsTermsAgreement,
  termsAgreementSchema,
} from "./terms.js";

const email = "a@example.com";
const password = "a".repeat(12);

describe("needsTermsAgreement", () => {
  it("版が空(同意の記録が無い)なら、再同意が要る", () => {
    expect(needsTermsAgreement(null)).toBe(true);
    expect(needsTermsAgreement(undefined)).toBe(true);
  });

  it("古い版なら、再同意が要る", () => {
    expect(needsTermsAgreement("1999-01-01")).toBe(true);
  });

  it("現在の版なら、再同意は要らない", () => {
    expect(needsTermsAgreement(TERMS_VERSION)).toBe(false);
  });
});

describe("termsAgreementSchema", () => {
  const ok = { termsAccepted: true, termsVersion: TERMS_VERSION };

  it("同意が true で、版が文字列なら通る", () => {
    expect(termsAgreementSchema.safeParse(ok).success).toBe(true);
  });

  it("同意が false、無い、文字列の true は不可", () => {
    expect(
      termsAgreementSchema.safeParse({ ...ok, termsAccepted: false }).success,
    ).toBe(false);
    expect(
      termsAgreementSchema.safeParse({ termsVersion: TERMS_VERSION }).success,
    ).toBe(false);
    expect(
      termsAgreementSchema.safeParse({ ...ok, termsAccepted: "true" }).success,
    ).toBe(false);
  });

  it("版は、形だけを見る(無い・空・51文字以上は不可。古い版かどうかは API が判定する)", () => {
    expect(
      termsAgreementSchema.safeParse({ termsAccepted: true }).success,
    ).toBe(false);
    expect(
      termsAgreementSchema.safeParse({ ...ok, termsVersion: "" }).success,
    ).toBe(false);
    expect(
      termsAgreementSchema.safeParse({ ...ok, termsVersion: "a".repeat(51) })
        .success,
    ).toBe(false);
    expect(
      termsAgreementSchema.safeParse({ ...ok, termsVersion: "1999-01-01" })
        .success,
    ).toBe(true);
  });
});

describe("registerSchema と同意", () => {
  const ok = {
    email,
    password,
    termsAccepted: true,
    termsVersion: TERMS_VERSION,
  };

  it("同意の項目がそろっていれば、通る", () => {
    expect(registerSchema.safeParse(ok).success).toBe(true);
  });

  it("同意の項目が無いと、不可", () => {
    expect(registerSchema.safeParse({ email, password }).success).toBe(false);
  });

  it("同意が false だと、不可", () => {
    expect(
      registerSchema.safeParse({ ...ok, termsAccepted: false }).success,
    ).toBe(false);
  });
});
