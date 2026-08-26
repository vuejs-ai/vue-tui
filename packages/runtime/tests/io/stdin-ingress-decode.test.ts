import { PassThrough } from "node:stream";
import { expect, test } from "vite-plus/test";
import { getSharedStdinIngress } from "../../src/io/stdin-ingress.ts";
import type { NormalizedInputFact } from "../../src/io/normalized-input.ts";

function makeStdin(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      return this;
    },
    setEncoding() {
      return stream;
    },
    ref() {},
    unref() {},
  });
  return stream;
}

function collect(): {
  readonly stdin: NodeJS.ReadStream;
  readonly facts: NormalizedInputFact[];
  write(data: Uint8Array | string): Promise<void>;
  dispose(): void;
} {
  const stdin = makeStdin();
  const ingress = getSharedStdinIngress(stdin);
  const facts: NormalizedInputFact[] = [];
  const subscription = ingress.subscribe(
    () => undefined,
    (fact) => facts.push(fact),
  );
  subscription.setActive(true);
  return {
    stdin,
    facts,
    write: (data) => ingress.writeForTest(data),
    dispose: () => subscription.dispose(),
  };
}

function pasted(facts: readonly NormalizedInputFact[]): string {
  return facts
    .filter(
      (fact): fact is Extract<NormalizedInputFact, { kind: "paste" }> => fact.kind === "paste",
    )
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
