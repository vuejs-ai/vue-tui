import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { INHERITED_ENVIRONMENT } from "./child.ts";
import { createEventChannel, EventChannelPrematureCloseError } from "./events.ts";
import { EVENT_ADDRESS_ENV, EVENT_STREAM_END } from "./protocol.ts";

const require = createRequire(import.meta.url);
const runtimeTestingUrl = pathToFileURL(require.resolve("@vue-tui/runtime/internal/testing")).href;
const launcherUrl = new URL("./launcher.ts", import.meta.url).href;

interface ProbeResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly output: string;
}

function probeEnvironment(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = { ...extra };
  for (const key of INHERITED_ENVIRONMENT) {
    const value = process.env[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  return env;
}

function launchProbe(code: string, env: Record<string, string>): Promise<ProbeResult> {
  const child = spawn(
    process.execPath,
    [`--import=${launcherUrl}`, "--input-type=module", "--eval", code],
    {
      cwd: process.cwd(),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  return new Promise<ProbeResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`launcher probe did not exit:\n${output}`));
    }, 5_000);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal, output });
    });
  });
}

test("installs the event sink before the entry and spans app generations until process end", async () => {
  const channel = await createEventChannel();
  const result = launchProbe(
    `
      const { emitTestEvent } = await import(${JSON.stringify(runtimeTestingUrl)});
      emitTestEvent("launcher:probe");
      emitTestEvent("app:exit", { code: 0 });
      emitTestEvent("launcher:after-app-exit");
    `,
    probeEnvironment({ [EVENT_ADDRESS_ENV]: channel.address }),
  );
  try {
    await Promise.race([
      channel.expectEvent("launcher:probe"),
      result.then(({ exitCode, output }) => {
        throw new Error(`launcher probe exited early with ${String(exitCode)}:\n${output}`);
      }),
    ]);
    await channel.expectEvent("app:exit");
    await channel.expectEvent("launcher:after-app-exit");
    await channel.expectEvent(EVENT_STREAM_END);
    await expect(channel.expectEvent("after-stream")).rejects.toThrow(/completed/i);
    await expect(result).resolves.toMatchObject({ exitCode: 0, signal: null });
    expect(channel.events.map(({ ev }) => ev)).toEqual([
      "launcher:probe",
      "app:exit",
      "launcher:after-app-exit",
      EVENT_STREAM_END,
    ]);
    expect(channel.failure).toBeUndefined();
  } finally {
    await channel.close();
  }
});

test("reports an explicit non-zero process exit after an app generation ended", async () => {
  const channel = await createEventChannel();
  const result = launchProbe(
    `
      const { emitTestEvent } = await import(${JSON.stringify(runtimeTestingUrl)});
      emitTestEvent("app:exit", { code: 0 });
      emitTestEvent("app:mounted", { generation: 2 });
      await new Promise((resolve) => setTimeout(resolve, 20));
      process.exit(17);
    `,
    probeEnvironment({ [EVENT_ADDRESS_ENV]: channel.address }),
  );
  try {
    await channel.expectEvent("app:mounted");
    await expect(result).resolves.toMatchObject({ exitCode: 17, signal: null });
    await expect(channel.expectEvent("after-crash")).rejects.toThrow(
      /before the final harness:event-stream-end/i,
    );
    expect(channel.failure).toBeInstanceOf(EventChannelPrematureCloseError);
  } finally {
    await channel.close();
  }
});

test("fails before the entry when the event address is missing", async () => {
  const result = await launchProbe(`throw new Error("entry should not run")`, probeEnvironment());
  expect(result.exitCode).not.toBe(0);
  expect(result.output).toMatch(/VUE_TUI_TEST_EVENTS.*missing/i);
  expect(result.output).not.toContain("entry should not run");
});
