import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma's generator writes to a custom path (app/generated/prisma) instead of the default
  // node_modules/.prisma/client. Next.js's serverless bundler traces static imports to decide
  // what to ship per route, but the query engine binary (.so.node) is loaded dynamically by
  // Prisma's runtime — not a normal `import` — so the tracer never sees it and leaves it out of
  // the deployed function, producing "could not locate the Query Engine" at runtime on Vercel.
  // Forcing it into every route's bundle here fixes that.
  outputFileTracingIncludes: {
    "/**/*": ["./app/generated/prisma/**/*"],
  },
};

export default nextConfig;
