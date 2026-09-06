module.exports = {
  apps: [
    {
      name: "fidem-worker",
      // Invoke tsx's actual JS CLI entry via node directly — the node_modules/.bin/tsx shim is a
      // POSIX shell script, which PM2 on Windows executes with node instead of a real shell,
      // producing a "missing ) after argument list" syntax error.
      script: "node_modules/tsx/dist/cli.mjs",
      args: "scripts/worker.ts",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 5000,
      watch: false,
    },
  ],
};
