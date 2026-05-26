import process from "node:process";
import { spawn } from "node:child_process";
import path from "node:path";
import url from "node:url";

const fixturesDir = url.fileURLToPath(new URL("../fixtures", import.meta.url));

type RunProps = { env?: Record<string, string>; columns?: number };

export const run = async (fixture: string, props?: RunProps): Promise<string> => {
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    CI: "false",
    NODE_NO_WARNINGS: "1",
    FORCE_COLOR: "3",
    ...props?.env,
  };

  if (props?.columns !== undefined) {
    env["COLUMNS"] = String(props.columns);
  }

  return new Promise<string>((resolve, reject) => {
    const forceTty = url.fileURLToPath(new URL("./force-tty.cjs", import.meta.url));
    const child = spawn("node", ["--require", forceTty, "--import=tsx", path.join(fixturesDir, `${fixture}.tsx`)], {
      cwd: fixturesDir,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let output = "";
    child.stdout!.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.stderr!.on("data", (data: Buffer) => {
      const text = data.toString();
      // Filter Vue slot warnings from fixtures using tsx jsx transform
      if (!text.includes("[Vue warn]: Non-function value encountered for default slot")) {
        output += text;
      }
    });
    child.on("exit", (exitCode) => {
      if (exitCode === 0) {
        resolve(output);
        return;
      }
      reject(new Error(`Process exited with non-zero code: ${exitCode}\n${output}`));
    });
    child.on("error", (err) => {
      reject(err);
    });
  });
};
