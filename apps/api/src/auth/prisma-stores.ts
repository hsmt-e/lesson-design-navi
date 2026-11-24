import type { PrismaClient } from "../../generated/prisma/client.js";
import type { SessionStore } from "./session.js";
import type { UserStore } from "./user-store.js";

const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  termsVersion: true,
} as const;

// PostgreSQL の unique 違反(Prisma のエラーコード P2002)かどうか
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function createPrismaStores(prisma: PrismaClient): {
  userStore: UserStore;
  sessionStore: SessionStore;
} {
  const userStore: UserStore = {
    findByEmail: (email) =>
      prisma.user.findUnique({ where: { email }, select: userSelect }),
    async recordTermsAgreement(
      userId: string,
      termsVersion: string,
      at: Date,
    ): Promise<boolean> {
      // 渡された userId の行だけを変える。更新できた(行があった)かを返す
      const result = await prisma.user.updateMany({
        where: { id: userId },
        data: { termsAcceptedAt: at, termsVersion },
      });
      return result.count > 0;
    },

    findById: (id) =>
      prisma.user.findUnique({ where: { id }, select: userSelect }),
    async create(input) {
      try {
        const user = await prisma.user.create({
          data: input,
          select: userSelect,
        });
        return { ok: true, user };
      } catch (error) {
        if (isUniqueViolation(error)) return { ok: false, reason: "duplicate" };
        throw error;
      }
    },
  };

  const sessionStore: SessionStore = {
    async create(record) {
      await prisma.session.create({ data: record });
    },
    find: (id) => prisma.session.findUnique({ where: { id } }),
    async remove(id) {
      await prisma.session.deleteMany({ where: { id } });
    },
  };

  return { userStore, sessionStore };
}
