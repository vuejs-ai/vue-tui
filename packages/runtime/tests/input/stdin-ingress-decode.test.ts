import { expect, test } from "vite-plus/test";
import { getSharedInputIngress } from "../../src/input/shared-input-ingress.ts";
import type { InputEvent } from "../../src/input/normalized-input.ts";
import { createTestTerminalBackend } from "../terminal/fixtures/test-terminal-backend.ts";

function collect(): {
  readonly facts: InputEvent[];
  write(data: Uint8Array | string): Promise<void>;
  dispose(): void;
} {
  const terminal = createTestTerminalBackend();
  const ingress = getSharedInputIngress(terminal);
  const facts: InputEvent[] = [];
  const subscription = ingress.subscribe(
    () => undefined,
    (fact) => facts.push(fact),
  );
  subscription.setActive(true);
  return {
    facts,
    write: (data) => ingress.writeForTest(data, (chunk) => terminal.emitData(chunk)),
    dispose: () => subscription.dispose(),
  };
}

function pasted(facts: readonly InputEvent[]): string {
  return facts
    .filter((fact): fact is Extract<InputEvent, { kind: "paste" }> => fact.kind === "paste")
    .map((fact) => fact.text)
    .join("");
}

test("decodes a paste far larger than one buffer without losing or reordering it", async () => {
  const session = collect();
  const payload = "a".repeat(200_000);

  try {
    await session.write(Buffer.from(`\x1b[200~${payload}\x1b[201~`, "utf8"));
    expect(pasted(session.facts)).toBe(payload);
  } finally {
    session.dispose();
  }
});

test("decodes long ASCII runs interleaved with multi-byte characters", async () => {
  const session = collect();
  // The decoder takes a fast path for a run of ASCII and a slower one per
  // multi-byte scalar; the boundaries between them have to line up exactly.
  const payload = `${"x".repeat(5_000)}\u79c1${"y".repeat(5_000)}\u{1f642}${"z".repeat(5_000)}`;

  try {
    await session.write(Buffer.from(`\x1b[200~${payload}\x1b[201~`, "utf8"));
    expect(pasted(session.facts)).toBe(payload);
  } finally {
    session.dispose();
  }
});
