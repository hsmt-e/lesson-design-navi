import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { sessionCookieClearOptions } from "./cookie.js";
import {
  SESSION_COOKIE_NAME,
  validateSession,
  type SessionStore,
} from "./session.js";
import type { UserStore } from "./user-store.js";

// リクエストに付ける、ログイン中のユーザー。パスワードのハッシュは入れない(ログや応答に混ざらないように)
export type AuthUser = { id: string; email: string };

declare module "fastify" {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}

// 401 の本文は1種類(Cookie なし・不正・期限切れ・ユーザー消失のどれでも同じ)
export const UNAUTHENTICATED = { error: "unauthenticated" } as const;

export type RequireAuthDeps = {
  userStore: UserStore;
  sessionStore: SessionStore;
};

// 本文を読む前(onRequest)に、Cookie からセッションを引いて、ログインを確かめる。
// DB の失敗は握りつぶさず、例外のまま投げる(500 になる)。401 は「ログインしていない」ときだけ。
export function createRequireAuth(
  deps: RequireAuthDeps,
  config: { isProduction: boolean },
) {
  return async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (!token) return reply.code(401).send(UNAUTHENTICATED);

    const session = await validateSession(deps.sessionStore, token);
    const user = session ? await deps.userStore.findById(session.userId) : null;
    if (!user) {
      // 無効・期限切れの Cookie は、ブラウザから消す
      reply.clearCookie(
        SESSION_COOKIE_NAME,
        sessionCookieClearOptions(config.isProduction),
      );
      return reply.code(401).send(UNAUTHENTICATED);
    }

    request.user = { id: user.id, email: user.email };
  };
}

export type RequireAuth = ReturnType<typeof createRequireAuth>;

// 認証が要るルートを、1つのグループにまとめる。フックを、グループに1回だけ付ける
// (ルートごとに付けると、付け忘れが起きるため)
export async function registerProtectedRoutes(
  app: FastifyInstance,
  requireAuth: RequireAuth,
  register: (scope: FastifyInstance) => void | Promise<void>,
): Promise<void> {
  await app.register(async (scope) => {
    scope.addHook("onRequest", requireAuth);
    await register(scope);
  });
}
