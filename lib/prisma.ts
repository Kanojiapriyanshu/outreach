import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// A driver adapter runs queries through the plain "pg" JS driver instead of Prisma's native
// query-engine binary — the binary has to match the exact OS/OpenSSL variant it runs on, which
// silently breaks the moment a build machine and its serverless runtime disagree (as they do on
// Vercel: "could not locate the Query Engine for runtime rhel-openssl-3.0.x"). The adapter has
// no such binary to lose track of.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
