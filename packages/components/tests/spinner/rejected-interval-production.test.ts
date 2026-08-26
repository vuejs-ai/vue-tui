import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

// Vue reports and continues past a watcher-getter throw only in a production build,
// so the interval a rejected prop would hand to setInterval is observable only there.
test("a rejected interval never reaches setInterval in a production build", async () => {
  const fixture = fileURLToPath(
    new URL("./fixtures/rejected-interval-production.mjs", import.meta.url),
  );
  const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
  delete env.NO_COLOR;
  delete env.NODE_DISABLE_COLORS;
  delete env.FORCE_COLOR;
  delete env.NODE_NO_WARNINGS;

  const child = spawn(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL("../..", import.meta.url)),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exit = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolve(code));
  });

  expect({ code: exit, stderr: stderr.includes("AssertionError") ? stderr : "" }).toEqual({
    code: 0,
    stderr: "",
  });
});
