import { z } from "zod";

/** 利用条件の版。利用条件の文面を変えたら、同じ PR で、この値を上げる(上げると、ログイン後に再同意を求める)。 */
export const TERMS_VERSION = "2026-11-21";

/** 現在の版に同意済みか。版が空(同意の記録がない)か、古いときは、再同意が要る。 */
export function needsTermsAgreement(
  termsVersion: string | null | undefined,
): boolean {
  return termsVersion !== TERMS_VERSION;
}

/**
 * 同意の入力の部品。登録と、再同意の両方で使う。
 * 形だけを検査する。版が現在のものかは、API が TERMS_VERSION と比べて、別のコード(terms_version_mismatch)で返す。
 */
export const termsConsentShape = {
  termsAccepted: z.literal(true),
  termsVersion: z.string().min(1).max(50),
};

export const termsAgreementSchema = z.object(termsConsentShape);
export type TermsAgreementInput = z.infer<typeof termsAgreementSchema>;
