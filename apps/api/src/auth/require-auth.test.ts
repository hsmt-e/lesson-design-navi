import type { OutgoingHttpHeaders } from "node:http";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFakeSessionStore,
  createFakeUserStore,
} from "../testing/fakes.js";
import { createRequireAuth, registerProtectedRoutes } from "./require-auth.js";
import { applySecurity } from "./security.js";
import {
  SESSION_TTL_MS,
  createSession,
  hashSessionToken,
  type SessionStore,
} from "./session.js";
import type { UserStore } from "./user-store.js";

const ORIGIN = "https://example.com";

const opened: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((a) => a.close()));
});

type Options = {
  userStore?: UserStore;
  sessionStore?: SessionStore;
  isProduction?: boolean;
};

// 認証が要るルート(/private)と、要らないルート(/public)を持つ、小さなアプリ。
// 本物の buildApp と同じ順序で組み立てる(Cookie と Origin チェック → request.user → 保護ルート)
async function makeApp(options: Options = {}) {
  const users = createFakeUserStore();
  const sessions = createFakeSessionStore();
  const isProduction = options.isProduction ?? false;
  const app = Fastify();
  await applySecurity(app, { appOrigin: ORIGIN, isProduction });
  app.decorateRequest("user", null);
  const requireAuth = createRequireAuth(
    {
      userStore: options.userStore ?? users.store,
      sessionStore: options.sessionStore ?? sessions.store,
    },
    { isProduction },
  );
  await registerProtectedRoutes(app, requireAuth, (scope) => {
    scope.get("/private", (request) => ({ user: request.user }));
    scope.post("/private", () => ({ ok: true }));
  });
  app.get("/public", () => ({ ok: true }));
  await app.ready();
  opened.push(app);
  return { app, users, sessions };
}

async function seedLogin(
  users: ReturnType<typeof createFakeUserStore>,
  sessions: ReturnType<typeof createFakeSessionStore>,
  now: Date = new Date(),
) {
  const created = await users.store.create({
    email: "a@example.com",
    passwordHash: "secret-hash",
  });
  if (!created.ok) throw new Error("seed failed");
  const { token } = await createSession(sessions.store, created.user.id, now);
  return { user: created.user, token };
}

const withCookie = (token: string) => ({ cookie: `session=${token}` });

function setCookieLines(headers: OutgoingHttpHeaders): string[] {
  const raw = headers["set-cookie"];
  if (Array.isArray(raw)) return raw;
  return typeof raw === "string" ? [raw] : [];
}

function clearsSessionCookie(headers: OutgoingHttpHeaders): boolean {
  return setCookieLines(headers).some(
    (l) => l.startsWith("session=;") && l.includes("1970"),
  );
}

describe("requireAuth", () => {
  it("有効なセッションなら通り、request.user には id と email だけが入る", async () => {
    const { app, users, sessions } = await makeApp();
    const { user, token } = await seedLogin(users, sessions);
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      user: { id: user.id, email: "a@example.com" },
    });
    expect(res.body).not.toContain("secret-hash");
    expect(res.body).not.toContain("passwordHash");
  });

  it("Cookie が無ければ 401(Cookie は消さない)", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/private" });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
    expect(setCookieLines(res.headers)).toEqual([]);
  });

  it("DB に無いトークンは 401 で、Cookie を消す", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie("a".repeat(43)),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
    expect(clearsSessionCookie(res.headers)).toBe(true);
  });

  it("期限切れは 401 で、DB の行も Cookie も消える", async () => {
    const { app, users, sessions } = await makeApp();
    const longAgo = new Date(Date.now() - SESSION_TTL_MS - 60_000);
    const { token } = await seedLogin(users, sessions, longAgo);
    expect(sessions.records.has(hashSessionToken(token))).toBe(true);

    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie(token),
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "unauthenticated" });
    expect(sessions.records.size).toBe(0);
    expect(clearsSessionCookie(res.headers)).toBe(true);
  });

  it("ユーザーが消えていたら 401", async () => {
    const { app, users, sessions } = await makeApp();
    const { token } = await seedLogin(users, sessions);
    users.users.clear();
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie(token),
    });
    expect(res.statusCode).toBe(401);
  });

  it("形式が違う Cookie は、DB を引かずに 401 で、Cookie を消す", async () => {
    let finds = 0;
    const sessions = createFakeSessionStore();
    const counting: SessionStore = {
      ...sessions.store,
      find: (id) => {
        finds += 1;
        return sessions.store.find(id);
      },
    };
    const { app } = await makeApp({ sessionStore: counting });
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie("short"),
    });
    expect(res.statusCode).toBe(401);
    expect(finds).toBe(0);
    expect(clearsSessionCookie(res.headers)).toBe(true);
  });

  it("本番では、Cookie を消す指定にも Secure が付く", async () => {
    const { app } = await makeApp({ isProduction: true });
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie("a".repeat(43)),
    });
    const line =
      setCookieLines(res.headers).find((l) => l.startsWith("session=;")) ?? "";
    expect(line).toContain("Secure");
  });

  it("401 は、本文を読む前に返す(壊れた JSON でも 400 ではなく 401)", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/private",
      headers: { "content-type": "application/json", origin: ORIGIN },
      payload: "{bad",
    });
    expect(res.statusCode).toBe(401);
  });

  it("ログイン済みなら、壊れた JSON は 400(フックは通る)", async () => {
    const { app, users, sessions } = await makeApp();
    const { token } = await seedLogin(users, sessions);
    const res = await app.inject({
      method: "POST",
      url: "/private",
      headers: {
        "content-type": "application/json",
        origin: ORIGIN,
        ...withCookie(token),
      },
      payload: "{bad",
    });
    expect(res.statusCode).toBe(400);
  });

  it("認証が要らないルートには、影響しない", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "GET", url: "/public" });
    expect(res.statusCode).toBe(200);
  });

  it("セッションの検索が失敗したら、握りつぶさず 500(401 にしない)", async () => {
    const failing: SessionStore = {
      create: () => Promise.resolve(),
      find: () => Promise.reject(new Error("db down")),
      remove: () => Promise.resolve(),
    };
    const { app } = await makeApp({ sessionStore: failing });
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie("a".repeat(43)),
    });
    expect(res.statusCode).toBe(500);
  });

  it("ユーザーの検索が失敗したら、握りつぶさず 500", async () => {
    const users = createFakeUserStore();
    const sessions = createFakeSessionStore();
    const { token } = await seedLogin(users, sessions);
    const failing: UserStore = {
      ...users.store,
      findById: () => Promise.reject(new Error("db down")),
    };
    const { app } = await makeApp({
      userStore: failing,
      sessionStore: sessions.store,
    });
    const res = await app.inject({
      method: "GET",
      url: "/private",
      headers: withCookie(token),
    });
    expect(res.statusCode).toBe(500);
  });
});

describe("Origin チェックと requireAuth の順序(Origin チェックが先)", () => {
  it("未ログインで Origin が無い POST は、401 ではなく 403(Cookie も消さない)", async () => {
    const { app } = await makeApp();
    const res = await app.inject({ method: "POST", url: "/private" });
    expect(res.statusCode).toBe(403);
    expect(setCookieLines(res.headers)).toEqual([]);
  });

  it("未ログインで、許可した Origin の POST は 401", async () => {
    const { app } = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/private",
      headers: { origin: ORIGIN },
    });
    expect(res.statusCode).toBe(401);
  });

  it("ログイン済みでも、別サイトの Origin の POST は 403", async () => {
    const { app, users, sessions } = await makeApp();
    const { token } = await seedLogin(users, sessions);
    const res = await app.inject({
      method: "POST",
      url: "/private",
      headers: { origin: "https://evil.example", ...withCookie(token) },
    });
    expect(res.statusCode).toBe(403);
  });
});
