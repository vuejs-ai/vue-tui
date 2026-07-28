import assert from "node:assert/strict";
import { queryObjects } from "node:v8";
import { defineComponent, h } from "vue";
import { Box, createApp, Text, type TuiApp } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "../test-streams.ts";

const targetKinds = [
  "tui-app",
  "root-proxy",
  "vue-root-instance",
  "vue-app-context",
  "stdin",
  "stdout",
  "stderr",
] as const;

type TargetKind = (typeof targetKinds)[number];

interface ReachabilityCohort {
  readonly Witness: new () => object;
  readonly references: ReadonlyMap<string, WeakRef<object>>;
}

const witnessesByTarget = new WeakMap<object, object>();

function objectTarget(value: unknown, kind: string): object {
  assert.equal(typeof value, "object", `${kind} must be observable`);
  assert.notEqual(value, null, `${kind} must be observable`);
  return value as object;
}

function sealTargets(targets: Readonly<Record<string, object>>): ReachabilityCohort {
  class LifetimeWitness {}
  const references = new Map<string, WeakRef<object>>();

  for (const [kind, target] of Object.entries(targets)) {
    const witness = new LifetimeWitness();
    witnessesByTarget.set(target, witness);
    references.set(kind, new WeakRef(witness));
  }

  return { Witness: LifetimeWitness, references };
}

async function audit(cohort: ReachabilityCohort): Promise<readonly string[]> {
  // WeakRef keeps a target alive for the current job. Cross a turn before
  // queryObjects performs its full GC, then dereference each witness once.
  await new Promise<void>((resolve) => setImmediate(resolve));
  const count = queryObjects(cohort.Witness, { format: "count" });
  const surviving = [...cohort.references]
    .filter(([, reference]) => reference.deref() !== undefined)
    .map(([kind]) => kind);

  assert.equal(count, surviving.length, "queryObjects and WeakRef must agree");
  return surviving;
}

async function assertPositiveControl(): Promise<void> {
  const retainedKey = Symbol("vue-tui-retention-positive-control");
  let target: object | undefined = {};
  const cohort = sealTargets({ retained: target });
  Object.defineProperty(globalThis, retainedKey, {
    configurable: true,
    value: target,
  });
  target = undefined;

  assert.deepEqual(await audit(cohort), ["retained"]);
  assert.equal(Reflect.deleteProperty(globalThis, retainedKey), true);
  assert.deepEqual(await audit(cohort), []);
}

async function mountAndRelease(mode: "inline" | "fullscreen"): Promise<ReachabilityCohort> {
  const App = defineComponent(() => () => h(Box, null, () => h(Text, null, () => mode)));
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  const rootProxy = app.mount({ mode, color: false, stdin, stdout, stderr });
  await app.waitUntilRenderFlush();

  const privateApp = app as TuiApp & {
    readonly _instance?: unknown;
    readonly _context?: unknown;
  };
  const targets = {
    "tui-app": app,
    "root-proxy": rootProxy,
    "vue-root-instance": objectTarget(privateApp._instance, "vue-root-instance"),
    "vue-app-context": objectTarget(privateApp._context, "vue-app-context"),
    stdin,
    stdout,
    stderr,
  } satisfies Record<TargetKind, object>;
  const cohort = sealTargets(targets);

  app.unmount();
  await app.waitUntilExit();
  stdin.destroy();
  stdout.destroy();
  stderr.destroy();
  return cohort;
}

await assertPositiveControl();
for (const mode of ["inline", "fullscreen"] as const) {
  const cohort = await mountAndRelease(mode);
  assert.deepEqual(await audit(cohort), [], `${mode} retained Runtime lifetime targets`);
}
