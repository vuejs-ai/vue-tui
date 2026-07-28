import process from "node:process";
import path from "node:path";
import url from "node:url";
import { startPtySession } from "../../harness/pty-session.ts";

const fixturesDir = url.fileURLToPath(new URL("../fixtures", import.meta.url));

interface TermOptions {
  readonly name?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly columns?: number;
  readonly rows?: number;
}

const term = (fixture: string, args: string[] = [], options: TermOptions = {}) => {
  const rowsArgument = args.length > 0 ? Number(args[0]) : Number.NaN;
  const rows =
    options.rows ?? (Number.isFinite(rowsArgument) && rowsArgument > 0 ? rowsArgument : 24);
  return startPtySession({
    command: [process.execPath, "--import=tsx", path.join(fixturesDir, `${fixture}.tsx`), ...args],
    cwd: fixturesDir,
    env: options.env,
    columns: options.columns ?? 100,
    rows,
    terminalName: options.name,
    readyToken: "__READY__",
  });
};

export default term;
