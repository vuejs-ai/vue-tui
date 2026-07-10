import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { VisualTerminalSession } from "./session.ts";

export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const basicTemplateDir = path.join(repoRoot, "examples", "basic-template");
export const basicTemplateBundle = path.join(basicTemplateDir, "dist", "main.mjs");

export interface BasicTemplateSession {
  session: VisualTerminalSession;
  mode: "persistent-posix-shell" | "direct-process";
}

export async function startBasicTemplateSession(
  artifactDir: string,
): Promise<BasicTemplateSession> {
  if (process.platform === "win32") {
    return {
      session: await VisualTerminalSession.create({
        file: process.execPath,
        args: [basicTemplateBundle],
        cwd: basicTemplateDir,
        artifactDir,
      }),
      mode: "direct-process",
    };
  }

  const session = await VisualTerminalSession.create({
    file: "/bin/sh",
    cwd: basicTemplateDir,
    artifactDir,
    env: { ENV: "" },
  });
  const command = [
    "__vt_before=$(stty -g)",
    "printf '\\033[2J\\033[3J\\033[H'",
    `node ${shellQuote(basicTemplateBundle)}`,
    "__vt_code=$?",
    "__vt_after=$(stty -g)",
    'printf \'\\n__VT_APP_EXIT__:%s\\n__VT_STTY_BEFORE__:%s\\n__VT_STTY_AFTER__:%s\\n\' "$__vt_code" "$__vt_before" "$__vt_after"',
  ].join("; ");
  session.sendSystem(`${command}\r`, "launch-basic-template-with-restoration-markers");
  return { session, mode: "persistent-posix-shell" };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function readPosixRestoration(session: VisualTerminalSession): {
  appExitCode: number;
  termiosBefore: string;
  termiosAfter: string;
  termiosRestored: boolean;
} {
  const transcript = readFileSync(session.transcriptPath, "utf8");
  const appExit = lastCapture(transcript, /__VT_APP_EXIT__:(\d+)/g);
  const termiosBefore = lastCapture(transcript, /__VT_STTY_BEFORE__:([^\r\n]+)/g);
  const termiosAfter = lastCapture(transcript, /__VT_STTY_AFTER__:([^\r\n]+)/g);
  if (!appExit || !termiosBefore || !termiosAfter) {
    throw new Error("missing application exit or termios restoration markers in PTY transcript");
  }
  const appExitCode = Number(appExit);
  return {
    appExitCode,
    termiosBefore,
    termiosAfter,
    termiosRestored: termiosBefore === termiosAfter,
  };
}

function lastCapture(input: string, pattern: RegExp): string | undefined {
  return Array.from(input.matchAll(pattern)).at(-1)?.[1];
}
