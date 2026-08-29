import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * In dev, the running server may have cached @prisma/client BEFORE `prisma generate`
 * added newer models (e.g. `User`). We detect that by inspecting the cached singleton:
 * if it's missing `user`, we discard the singleton so a fresh PrismaClient is built
 * from the current generated client.
 *
 * Note: this only catches a stale *singleton instance*. If the underlying
 * @prisma/client module itself is stale (because the dev server was started
 * before `prisma generate`), the dev server must be restarted — touching
 * `next.config.ts` is enough to trigger that.
 */
if (
  process.env.NODE_ENV !== 'production' &&
  globalForPrisma.prisma &&
  !(globalForPrisma.prisma as unknown as { user?: unknown }).user
) {
  globalForPrisma.prisma = undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Production: errors only — per-query logging is noisy and can leak
    // data into serverless logs (audit finding).
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
