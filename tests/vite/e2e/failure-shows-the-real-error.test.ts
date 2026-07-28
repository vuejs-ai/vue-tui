import { expect, test } from "vite-plus/test";
import { type ViteChild } from "./harness/child.ts";
import { createScratchFixture, type ScratchFixture } from "./harness/scratch.ts";
import {
  errorPanel,
  eventPhase,
  latestCount,
  settleViteWatchChange,
  withViteChild,
} from "./harness/e2e.ts";

type ErrorPhase = "compile" | "evaluate";

interface RecoveryRow {
  readonly name: string;
  readonly phase: ErrorPhase;
  readonly oldLabel: string;
  readonly recoveredLabel: string;
  readonly diagnostic: string;
  readonly path: string;
  readonly failed: string;
  readonly recovered: string;
}

async function expectFailureAndRecovery(
  child: ViteChild,
  scratch: ScratchFixture,
  row: RecoveryRow,
): Promise<void> {
  const beforeFailure = await child.expectScreen(
    (screen) => screen.includes(row.oldLabel) && latestCount(screen) !== undefined,
  );
  const countBeforeFailure = latestCount(beforeFailure)!;
  const failureAfter = child.events.length;
  const outputAfter = child.output().length;

  scratch.write(row.path, row.failed);
  await expect(
    child.expectEvent("hmr:error", {
      after: failureAfter,
      predicate: (event) => eventPhase(event) === row.phase,
    }),
    row.name,
  ).resolves.toMatchObject({ data: { phase: row.phase } });
  // The app's own last frame, not the whole screen: Vite prints the same
  // diagnostic in a coordinated log line above it, which would satisfy a
  // screen-wide match even with the overlay showing something generic.
  await expect(
    child.expectFrame(
      (frame) =>
        errorPanel(frame)?.includes(row.diagnostic) === true &&
        frame.includes(row.oldLabel) &&
        (latestCount(frame) ?? -1) > countBeforeFailure,
      { after: failureAfter },
    ),
    row.name,
  ).resolves.toContain(row.oldLabel);
  await settleViteWatchChange(child);

  const failedWindow = child.events.slice(failureAfter);
  const failedEvents = failedWindow.map(({ ev }) => ev);
  // One failure, one report — what a developer sees, not just that something was
  // reported. An SFC syntax error produces exactly two error payloads inside
  // Vite: one for the client environment and one for the SSR environment whose
  // hotUpdate the preflight rejects. They are collapsed at the single point both
  // pass through (`bridge-hmr.ts`). The message carries the event window because
  // the two failure modes read differently there: two `hmr:error` inside one
  // `hmr:update-received` is a delivery duplicate, while two updates would mean
  // the watcher fired twice.
  expect(
    failedEvents.filter((event) => event === "hmr:error"),
    `${row.name} — events after the edit: ${JSON.stringify(failedWindow)}`,
  ).toHaveLength(1);
  expect(failedEvents, row.name).not.toContain("hmr:update-applied");
  expect(failedEvents, row.name).not.toContain("app:setup-ran");
  expect(failedEvents, row.name).not.toContain("app:unmounted");
  expect(failedEvents, row.name).not.toContain("app:exit");
  expect(child.output().slice(outputAfter), row.name).not.toMatch(/Cannot destructure/i);

  const recoveryAfter = child.events.length;
  scratch.write(row.path, row.recovered);
  await child.expectEvent("hmr:update-applied", { after: recoveryAfter });
  const afterApplied = child.events.length;
  await expect(
    child.expectScreen((screen) => screen.includes(row.recoveredLabel), {
      after: afterApplied,
    }),
    row.name,
  ).resolves.toContain(row.recoveredLabel);
  const recoveredEvents = child.events.slice(failureAfter).map(({ ev }) => ev);
  expect(recoveredEvents, row.name).not.toContain("app:unmounted");
  expect(recoveredEvents, row.name).not.toContain("app:exit");
}

test("the production SFC path forwards and recovers compile and evaluation failures in sequence", async () => {
  const scratch = createScratchFixture("basic");
  let current = scratch.read("src/app.vue");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");

    const syntaxRecovered = current.replace("LABEL-A", "SFC-SYNTAX-RECOVERED");
    await expectFailureAndRecovery(child, scratch, {
      name: "SFC syntax",
      phase: "compile",
      oldLabel: "LABEL-A",
      recoveredLabel: "SFC-SYNTAX-RECOVERED",
      diagnostic: "Unexpected token",
      path: "src/app.vue",
      failed: current.replace(
        "const count = shallowRef(0);",
        "const errorForwardingSfcSyntax = ;\nconst count = shallowRef(0);",
      ),
      recovered: syntaxRecovered,
    });
    current = syntaxRecovered;

    const evaluationRecovered = current.replace("SFC-SYNTAX-RECOVERED", "SFC-EVALUATE-RECOVERED");
    await expectFailureAndRecovery(child, scratch, {
      name: "SFC module top-level throw",
      phase: "evaluate",
      oldLabel: "SFC-SYNTAX-RECOVERED",
      recoveredLabel: "SFC-EVALUATE-RECOVERED",
      diagnostic: "SFC-MODULE-EVALUATE-FAILURE",
      path: "src/app.vue",
      failed: current.replace(
        "</script>\n<template>",
        `</script>
<script lang="ts">
throw new Error("SFC-MODULE-EVALUATE-FAILURE");
export default { name: "ErrorForwardingEvaluationFixture" };
</script>
<template>`,
      ),
      recovered: evaluationRecovered,
    });
    current = evaluationRecovered;

    const templateRecovered = current.replace("SFC-EVALUATE-RECOVERED", "SFC-TEMPLATE-RECOVERED");
    await expectFailureAndRecovery(child, scratch, {
      name: "SFC template-only expression",
      phase: "compile",
      oldLabel: "SFC-EVALUATE-RECOVERED",
      recoveredLabel: "SFC-TEMPLATE-RECOVERED",
      diagnostic: "Error parsing JavaScript expression",
      path: "src/app.vue",
      failed: current.replace("{{ count }}", "{{ count. }}"),
      recovered: templateRecovered,
    });
  });
});

test("the production JSX path forwards and recovers compile and lowercase-fetch evaluation failures", async () => {
  const scratch = createScratchFixture("jsx");
  let current = scratch.read("src/app.tsx");
  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");

    const syntaxRecovered = current.replace("JSX-LABEL", "JSX-SYNTAX-RECOVERED");
    await expectFailureAndRecovery(child, scratch, {
      name: "JSX syntax",
      phase: "compile",
      oldLabel: "JSX-LABEL",
      recoveredLabel: "JSX-SYNTAX-RECOVERED",
      diagnostic: "Unexpected token",
      path: "src/app.tsx",
      failed: current.replace(
        "export default defineComponent",
        "const errorForwardingJsxSyntax = ;\nexport default defineComponent",
      ),
      recovered: syntaxRecovered,
    });
    current = syntaxRecovered;

    const evaluationRecovered = current.replace("JSX-SYNTAX-RECOVERED", "JSX-EVALUATE-RECOVERED");
    await expectFailureAndRecovery(child, scratch, {
      name: "JSX module top-level lowercase fetch throw",
      phase: "evaluate",
      oldLabel: "JSX-SYNTAX-RECOVERED",
      recoveredLabel: "JSX-EVALUATE-RECOVERED",
      diagnostic: "JSX lowercase fetch evaluation failure",
      path: "src/app.tsx",
      failed: current.replace(
        "export default defineComponent",
        'throw new Error("JSX lowercase fetch evaluation failure");\nexport default defineComponent',
      ),
      recovered: evaluationRecovered,
    });
  });
});

test("an external SFC template failure keeps the app live and recovers through the production path", async () => {
  const scratch = createScratchFixture("basic");
  const originalApp = scratch.read("src/app.vue");
  const template = originalApp.match(/<template>\n([\s\S]*?)\n<\/template>/)?.[1];
  if (template === undefined) {
    scratch.cleanup();
    throw new Error("Could not extract the basic fixture template");
  }
  scratch.write(
    "src/app.vue",
    originalApp.replace(
      /<template>[\s\S]*?<\/template>/,
      '<template src="./app-template.html"></template>',
    ),
  );
  scratch.write("src/app-template.html", template);

  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await child.expectEvent("app:setup-ran");
    await expectFailureAndRecovery(child, scratch, {
      name: "external SFC template expression",
      phase: "compile",
      oldLabel: "LABEL-A",
      recoveredLabel: "SFC-EXTERNAL-TEMPLATE-RECOVERED",
      diagnostic: "Error parsing JavaScript expression",
      path: "src/app-template.html",
      failed: template.replace("{{ count }}", "{{ count. }}"),
      recovered: template.replace("LABEL-A", "SFC-EXTERNAL-TEMPLATE-RECOVERED"),
    });
  });
});

// Vite's `warnFailedUpdate` drops the original error when it is an Error whose
// message contains "fetch" (`module-runner.js`: `!err.message.includes("fetch")
// && this.logger.error(err)`), because it assumes such a message came from its
// own module fetch. A developer's error can say "fetch" for ordinary reasons.
const FETCH_DIAGNOSTIC = "ORIGINAL fetch transform explosion";

const FETCH_FAILURE_CONFIG = `import { defineConfig, type Plugin } from "vite";
import vue from "unplugin-vue/vite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { vueTui } from "@vue-tui/vite";

const trigger = resolve(process.cwd(), "explode.txt");
const explodeOnTemplate: Plugin = {
  name: "test:explode-on-template",
  enforce: "post",
  transform(_code, id) {
    if (!id.includes("app-template.html")) return;
    let armed = false;
    try {
      armed = readFileSync(trigger, "utf8").trim() === "armed";
    } catch {
      armed = false;
    }
    if (armed) throw new Error(${JSON.stringify(FETCH_DIAGNOSTIC)});
  },
};

export default defineConfig({ plugins: [vue(), explodeOnTemplate, vueTui()] });
`;

test("a compile failure whose message mentions fetch still shows the developer's error", async () => {
  const scratch = createScratchFixture("basic");
  const originalApp = scratch.read("src/app.vue");
  const template = originalApp.match(/<template>\n([\s\S]*?)\n<\/template>/)?.[1];
  if (template === undefined) {
    scratch.cleanup();
    throw new Error("Could not extract the basic fixture template");
  }
  // An external template is the authoring shape whose changed file is `.html`,
  // which the preflight originally skipped.
  scratch.write(
    "src/app.vue",
    originalApp.replace(
      /<template>[\s\S]*?<\/template>/,
      '<template src="./app-template.html"></template>',
    ),
  );
  scratch.write("src/app-template.html", template);
  scratch.write("explode.txt", "idle\n");
  scratch.write("vite.config.ts", FETCH_FAILURE_CONFIG);

  await withViteChild(scratch, async (child) => {
    await child.expectEvent("app:mounted");
    await expect(child.expectScreen((screen) => screen.includes("LABEL-A"))).resolves.toContain(
      "LABEL-A",
    );

    const failureAfter = child.events.length;
    scratch.write("explode.txt", "armed\n");
    scratch.write("src/app-template.html", template.replace("LABEL-A", "LABEL-EDITED"));

    await child.expectEvent("hmr:error", { after: failureAfter });
    const failed = await child.expectFrame((frame) => errorPanel(frame) !== undefined, {
      after: failureAfter,
    });
    expect(errorPanel(failed), "the overlay must name the developer's own error").toContain(
      FETCH_DIAGNOSTIC,
    );
    expect(errorPanel(failed)).not.toMatch(/Cannot destructure/i);
  });
});
