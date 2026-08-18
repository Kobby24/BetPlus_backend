import { spawn } from "node:child_process";

process.env.ADMIN_ONLY = "true";

const child = spawn("npx", ["next", "dev", "-p", "3001"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => process.exit(code ?? 0));
