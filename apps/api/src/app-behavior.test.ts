import type { HTTPMethods } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp, type AppOptions } from "./app.js";
import { createPasswordService } from "./auth/password-service.js";
import type { AuthLimits } from "./auth/routes.js";
import {
  createFakeSessionStore,
  createFakeUserStore,
} from "./testing/fakes.js";

const ORIGIN = "https://example.com";

const passwords = await createPasswordService({
  hash: (p) => Promise.resolve(`h:${p}`),
  verify: () => Promise.resolve(false),
});

const opened: { close: () => Promise<unknown> }[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((a) => a.close()));
});

async function makeApp(options: AppOptions = {}) {
  const app = await buildApp(
    { appOrigin: ORIGIN, isProduction: false },
    {
      userStore: createFakeUserStore().store,
      sessionStore: createFakeSessionStore().store,
      passwords,
    },
    options,
  );
  await app.ready();
  opened.push(app);
  return app;
}

const loose = { max: 1000, timeWindow: 60_000 };
const loginLimit2: AuthLimits = {
  login: { max: 2, timeWindow: 60_000 },
  register: loose,
  globalLogin: loose,
  globalRegister: loose,
};

describe("4xx の本文は、汎用(入力の一部を返さない)", () => {
  it("壊れた JSON は、400 と汎用の本文で、入力の一部が含まれない", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json", origin: ORIGIN },
      payload: '{"password":"leak-me-12345',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "bad_request" });
    expect(res.body).not.toContain("leak-me-12345");
  });

  it("対応していない Content-Type は、415 と汎用の本文", async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/xml", origin: ORIGIN },
      payload: "<a/>",
    });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toEqual({ error: "unsupported_media_type" });
  });
});

describe("trustProxy の台数(境界)", () => {
  async function loginStatuses(trustProxy: number) {
    const app = await makeApp({ trustProxy, limits: loginLimit2 });
    const statuses: number[] = [];
    // 手前のプロキシが追記した IP は、末尾の 5.5.5.5。その前の 9.9.9.x は、送信者が自称した値
    for (const spoofed of ["9.9.9.1", "9.9.9.2", "9.9.9.3"]) {
      const res = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
          email: "nobody@example.com",
          password: "wrong-horse-battery",
        },
        headers: { origin: ORIGIN, "x-forwarded-for": `${spoofed}, 5.5.5.5` },
      });
      statuses.push(res.statusCode);
    }
    return statuses;
  }

  it("1台なら、末尾(プロキシが追記した IP)だけを信用し、自称の IP は無視する", async () => {
    expect(await loginStatuses(1)).toEqual([401, 401, 429]);
  });

  it("2台なら、その1つ前の IP まで信用するので、別の相手として数える", async () => {
    expect(await loginStatuses(2)).toEqual([401, 401, 401]);
  });
});

describe("認証が要るルートの付け忘れを検出する", () => {
  // 認証なしで使えるルートの許可リスト。ここに無いルートは、すべて認証が要る
  const PUBLIC_ROUTES = new Set([
    "GET /health",
    "POST /auth/register",
    "POST /auth/login",
    "POST /auth/logout",
  ]);

  it("公開ルート以外は、未ログインなら 401", async () => {
    const routes: { method: HTTPMethods; url: string }[] = [];
    const app = await makeApp({
      onRoute: (route) => {
        for (const method of [route.method].flat())
          routes.push({ method, url: route.url });
      },
    });

    const guarded = routes.filter(
      (r) =>
        r.method !== "HEAD" &&
        r.method !== "OPTIONS" &&
        !PUBLIC_ROUTES.has(`${r.method} ${r.url}`),
    );
    // 空振りしていないこと(/auth/me が見つかっている)
    expect(guarded.map((r) => `${r.method} ${r.url}`)).toContain(
      "GET /auth/me",
    );

    for (const r of guarded) {
      const res = await app.inject({
        method: r.method,
        url: r.url.replace(/:[^/]+/g, "x"),
        headers: { origin: ORIGIN },
      });
      expect(res.statusCode, `${r.method} ${r.url}`).toBe(401);
    }
  });
});
