export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  termsVersion: string | null;
};

export type CreateUserResult =
  { ok: true; user: UserRecord } | { ok: false; reason: "duplicate" };

// DB の出し入れの窓口。失敗(DB 障害など)は握りつぶさず、例外のまま投げる。
// null や duplicate は「見つからない」「重複」のときだけ。
export interface UserStore {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  create(input: {
    email: string;
    passwordHash: string;
    termsAcceptedAt: Date;
    termsVersion: string;
  }): Promise<CreateUserResult>;

  /** 同意を記録する。userId は、ログイン中のユーザーのものを渡す(リクエストの本文から取らない)。更新できたか(行があったか)を返す。 */
  recordTermsAgreement(
    userId: string,
    termsVersion: string,
    at: Date,
  ): Promise<boolean>;
}
