import Fastify, { type RouteOptions } from "fastify";
import { createRequireAuth } from "./auth/require-auth.js";
import {
  DEFAULT_AUTH_LIMITS,
  registerAuthRoutes,
  type AuthDeps,
  type AuthLimits,
} from "./auth/routes.js";
import { applySecurity, type SecurityConfig } from "./auth/security.js";

// ログに出さない値(Cookie の値は、セッションのトークンそのもの)。標準のログはヘッダーを出さないが、設定変更に備える
export const LOG_REDACT_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
];

export type AppOptions = {
  trustProxy?: number | false; // 手前にあるプロキシの台数(false は、信用しない)
  limits?: AuthLimits;
  logStream?: { write(message: string): void }; // テスト用: ログの出力先
  onRoute?: (route: RouteOptions) => void; // テスト用: 登録されたルートを記録する
};

// Fastify の型定義は、trustProxy に台数(数字)を許さない。同じ意味の関数にして渡す。
// hop は、接続してきた相手を 0 として、手前から数えた順番。台数までを信用する
function toTrustProxy(hops: number | false) {
  if (hops === false) return false;
  return (_address: string, hop: number) => hop < hops;
}

function errorStatusCode(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
  ) {
    return error.statusCode;
  }
  return 500;
}

// 回数制限(@fastify/rate-limit)が投げる、自分たちで決めた本文かどうか
function isRateLimitedError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    error.error === "rate_limited"
  );
}

const CLIENT_ERROR_NAMES: Record<number, string> = {
  400: "bad_request",
  413: "payload_too_large",
  415: "unsupported_media_type",
};

function loggerOptions(options: AppOptions) {
  if (options.logStream) {
    return {
      level: "info",
      stream: options.logStream,
      redact: LOG_REDACT_PATHS,
    };
  }
  if (process.env.NODE_ENV === "test") return false as const;
  return { redact: LOG_REDACT_PATHS };
}

export async function buildApp(
  config: SecurityConfig,
  deps: AuthDeps,
  options: AppOptions = {},
) {
  const app = Fastify({
    logger: loggerOptions(options),
    trustProxy: toTrustProxy(options.trustProxy ?? false),
  });

  // ルートを登録するより前に付ける(テスト用)
  if (options.onRoute) app.addHook("onRoute", options.onRoute);

  app.setErrorHandler((error, request, reply) => {
    const statusCode = errorStatusCode(error);
    // 5xx は、内部の事情(DB のエラー文など)を返さず、汎用の本文にする。詳細はログに残す
    if (statusCode >= 500) {
      request.log.error(error);
      return reply
        .code(statusCode)
        .send({ error: statusCode === 503 ? "server_busy" : "internal_error" });
    }
    // 自分たちで決めた本文(回数制限)は、そのまま返す
    if (isRateLimitedError(error)) return reply.code(statusCode).send(error);
    // Fastify 自身の 4xx(壊れた JSON など)は、エラー文に入力の一部が入ることがあるので、汎用の本文にする
    return reply
      .code(statusCode)
      .send({ error: CLIENT_ERROR_NAMES[statusCode] ?? "bad_request" });
  });

  // ルートを登録するより前に呼ぶ(フックは、あとから登録したルートにだけ効く)
  await applySecurity(app, config);

  // request.user を使えるようにする(初期値は null。requireAuth を通ると、ログイン中のユーザーが入る)
  app.decorateRequest("user", null);
  const requireAuth = createRequireAuth(deps, {
    isProduction: config.isProduction,
  });

  app.get("/health", async () => {
    return { ok: true };
  });

  await registerAuthRoutes(app, deps, {
    isProduction: config.isProduction,
    limits: options.limits ?? DEFAULT_AUTH_LIMITS,
    requireAuth,
  });

  return app;
}
