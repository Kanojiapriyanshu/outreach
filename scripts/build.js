// A shell one-liner ("prisma migrate deploy || echo ... && next build") is fragile across
// platforms: npm runs package.json scripts through cmd.exe on Windows, where parentheses in an
// echoed message are batch grouping metacharacters, not literal text — it silently broke the
// chain and skipped `next build` entirely on Windows without ever failing the build. Plain Node
// avoids the whole cmd.exe/sh quoting mismatch and behaves identically on Windows and Vercel/Linux.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- plain CJS script run directly by `node`, not part of the app bundle
const { execSync } = require("child_process");

try {
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} catch {
  // See prisma.config.ts: this Neon project's connections proxy through PgBouncer either way, so
  // migrate deploy's advisory lock can time out (P1002) independent of anything fixable here.
  // Migrations are always applied by hand (db push + a hand-written migration file +
  // `migrate resolve --applied`) before every push, so this step is a redundant confirmation,
  // not the actual mechanism — it shouldn't be able to block a deploy on its own.
  console.warn("migrate deploy failed or timed out - continuing; migrations are already applied by hand before every push");
}

execSync("npx next build", { stdio: "inherit" });
