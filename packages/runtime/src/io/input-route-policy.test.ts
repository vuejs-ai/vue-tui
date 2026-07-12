import { describe, expect, test } from "vite-plus/test";
import {
  captureInternalInputRoutePlan,
  dispatchInternalInput,
  type InternalInputDefaultDecision,
  type InternalNormalizedInputSource,
  type InternalInputRouteDecision,
  type InternalInputRouteRecipient,
} from "./input-route-policy.ts";
import { normalizeInputEvent, type NormalizedInputFact } from "./normalized-input.ts";

const continueRoute = (): InternalInputRouteDecision => ({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});

const continueDefault = (): InternalInputDefaultDecision => ({
  performed: false,
  continue: true,
  blockExternal: false,
});

const normalize = (event: string | { readonly paste: string }): NormalizedInputFact => {
  const fact = normalizeInputEvent(event);
  if (!fact) throw new Error(`expected an application fact for ${JSON.stringify(event)}`);
  return fact;
};

const isKey = (fact: NormalizedInputFact, name: string): boolean =>
  fact.kind === "key" && fact.key.name === name && fact.key.phase !== "release";

const isCtrlKey = (fact: NormalizedInputFact, name: string): boolean =>
  fact.kind === "key" &&
  fact.key.name === name &&
  fact.key.modifiers.ctrl &&
  fact.key.phase !== "release";

describe("internal input route policy experiment", () => {
  test("keeps action, semantic continuation, defaults, and external permission independent", () => {
    const external: string[] = [];
    const defaultCalls: string[] = [];
    const fact = normalize("x");
    const seenFacts: NormalizedInputFact[] = [];
    const plan = captureInternalInputRoutePlan({
      applicationGlobal: [
        {
          id: "global",
          handle(received) {
            seenFacts.push(received);
            return {
              performed: true,
              continue: true,
              preventDefault: true,
              blockExternal: false,
            };
          },
        },
      ],
      activeBoundary: {
        id: "boundary",
        handle(received) {
          seenFacts.push(received);
          return continueRoute();
        },
      },
      ownerDefaults: [
        {
          id: "owner-default",
          handle() {
            defaultCalls.push("owner-default");
            return continueDefault();
          },
        },
      ],
      external: {
        id: "external",
        receive(source) {
          expect(source.fact).toBe(fact);
          expect(source.fidelity).toBe("normalized-utf8-sequence");
          external.push(source.sequence);
        },
      },
    });

    const result = dispatchInternalInput(fact, plan);

    expect(seenFacts).toEqual([fact, fact]);
    expect(defaultCalls).toEqual([]);
    expect(external).toEqual(["x"]);
    expect(result).toMatchObject({
      performed: true,
      semanticContinued: true,
      defaultPrevented: true,
      externalBlocked: false,
      externalForwarded: true,
    });
    expect(result.trace).toEqual([
      "application-global:global",
      "active-boundary:boundary",
      "external:external",
    ]);
    expect(result.suppressedDefaults).toEqual(["owner-default:owner-default"]);
  });

  test("does not let external permission bypass a stopped semantic path", () => {
    const external: string[] = [];
    const result = dispatchInternalInput(
      normalize("x"),
      captureInternalInputRoutePlan({
        activeBoundary: {
          id: "boundary",
          handle: () => ({
            performed: false,
            continue: false,
            preventDefault: false,
            blockExternal: false,
          }),
        },
        external: { id: "external", receive: (source) => external.push(source.sequence) },
      }),
    );

    expect(result.semanticContinued).toBe(false);
    expect(result.externalBlocked).toBe(false);
    expect(result.externalCandidate).toBe(true);
    expect(result.externalForwarded).toBe(false);
    expect(external).toEqual([]);
  });

  test("blocks external without stopping later semantic recipients or defaults", () => {
    const calls: string[] = [];
    const result = dispatchInternalInput(
      normalize("x"),
      captureInternalInputRoutePlan({
        activeBoundary: {
          id: "boundary",
          handle() {
            calls.push("boundary");
            return {
              performed: false,
              continue: true,
              preventDefault: false,
              blockExternal: true,
            };
          },
        },
        focusedOwner: {
          id: "owner",
          handle() {
            calls.push("owner");
            return continueRoute();
          },
        },
        ownerDefaults: [
          {
            id: "default",
            handle() {
              calls.push("default");
              return continueDefault();
            },
          },
        ],
        external: {
          id: "external",
          receive() {
            calls.push("external");
          },
        },
      }),
    );

    expect(calls).toEqual(["boundary", "owner", "default"]);
    expect(result.semanticContinued).toBe(true);
    expect(result.defaultPrevented).toBe(false);
    expect(result.externalBlocked).toBe(true);
    expect(result.externalForwarded).toBe(false);
  });

  test("fails closed when an application recipient throws", () => {
    const calls: string[] = [];
    const plan = captureInternalInputRoutePlan({
      applicationGlobal: [
        {
          id: "throwing",
          handle() {
            calls.push("throwing");
            throw new Error("route failed");
          },
        },
      ],
      activeBoundary: {
        id: "later",
        handle() {
          calls.push("later");
          return continueRoute();
        },
      },
      ownerDefaults: [
        {
          id: "default",
          handle() {
            calls.push("default");
            return continueDefault();
          },
        },
      ],
      external: {
        id: "external",
        receive() {
          calls.push("external");
        },
      },
    });

    expect(() => dispatchInternalInput(normalize("x"), plan)).toThrow("route failed");
    expect(calls).toEqual(["throwing"]);
  });

  test("runs delayed defaults after semantic stop unless a recipient prevents them", () => {
    const fact = normalize("x");
    const plan = captureInternalInputRoutePlan({
      activeBoundary: {
        id: "boundary",
        handle: () => ({
          performed: true,
          continue: false,
          preventDefault: false,
          blockExternal: false,
        }),
      },
      ownerDefaults: [
        {
          id: "owner-default",
          handle: () => ({ performed: true, continue: false, blockExternal: true }),
        },
      ],
      applicationDefaults: [{ id: "app-default", handle: () => continueDefault() }],
      external: { id: "external", receive: () => {} },
    });

    const result = dispatchInternalInput(fact, plan);

    expect(result.trace).toEqual(["active-boundary:boundary", "owner-default:owner-default"]);
    expect(result.performed).toBe(true);
    expect(result.semanticContinued).toBe(false);
    expect(result.defaultPrevented).toBe(false);
    expect(result.defaultContinued).toBe(false);
    expect(result.externalBlocked).toBe(true);
    expect(result.externalForwarded).toBe(false);
  });

  test("queues re-entrant input after the current plan while capturing the next plan", () => {
    const calls: string[] = [];
    const eventTraces: Array<readonly string[]> = [];
    const pending: Array<{
      readonly fact: NormalizedInputFact;
      readonly plan: ReturnType<typeof captureInternalInputRoutePlan>;
    }> = [];
    let processing = false;
    let active: "first" | "second" = "first";
    const first: InternalInputRouteRecipient = {
      id: "first",
      handle() {
        calls.push("first");
        active = "second";
        enqueue(normalize("y"));
        return continueRoute();
      },
    };
    const second: InternalInputRouteRecipient = {
      id: "second",
      handle() {
        calls.push("second");
        return continueRoute();
      },
    };
    const ancestor: InternalInputRouteRecipient = {
      id: "ancestor",
      handle() {
        calls.push("ancestor");
        return continueRoute();
      },
    };
    const capture = () =>
      captureInternalInputRoutePlan({
        activeBoundary: active === "first" ? first : second,
        logicalAncestors: [ancestor],
      });

    function enqueue(fact: NormalizedInputFact) {
      pending.push({ fact, plan: capture() });
      if (processing) return;
      processing = true;
      try {
        while (pending.length > 0) {
          const next = pending.shift()!;
          eventTraces.push(dispatchInternalInput(next.fact, next.plan).trace);
        }
      } finally {
        processing = false;
      }
    }

    enqueue(normalize("x"));

    expect(eventTraces).toEqual([
      ["active-boundary:first", "logical-ancestor:ancestor"],
      ["active-boundary:second", "logical-ancestor:ancestor"],
    ]);
    expect(calls).toEqual(["first", "ancestor", "second", "ancestor"]);
  });
});

type CodingAgentPhase = "composing" | "approving-1" | "approving-2" | "streaming" | "exited";

describe.each(["inline", "fullscreen"] as const)("coding-agent routing journey (%s)", (_mode) => {
  test("routes editing, paste, approval replacement, interrupt, and idle exit", () => {
    let phase: CodingAgentPhase = "composing";
    let draft = "";
    let submitted = "";
    let pendingCommand = "";
    let queuedTokens = ["All ", "done"];
    let assistantText = "";
    let interruptCount = 0;
    let exitCount = 0;
    const approvals: string[] = [];
    const external: string[] = [];
    const recipientFacts: NormalizedInputFact[] = [];

    const recipient = (
      id: string,
      handle: (fact: NormalizedInputFact) => InternalInputRouteDecision,
    ): InternalInputRouteRecipient => ({
      id,
      handle(fact) {
        recipientFacts.push(fact);
        return handle(fact);
      },
    });

    const global = recipient("global", (fact) => {
      if (phase === "streaming" && isCtrlKey(fact, "c")) {
        interruptCount++;
        queuedTokens = [];
        phase = "composing";
        return {
          performed: true,
          continue: false,
          preventDefault: true,
          blockExternal: true,
        };
      }
      return continueRoute();
    });
    const composerBoundary = recipient("composer-boundary", () => continueRoute());
    const runBoundary = recipient("run-boundary", () => continueRoute());
    const approvalBoundary = recipient("approval-boundary", (fact) => ({
      performed: false,
      continue: true,
      preventDefault: isKey(fact, "escape"),
      blockExternal: true,
    }));
    const editor = recipient("editor", (fact) => {
      if (!isKey(fact, "return")) return continueRoute();
      submitted = draft;
      draft = "";
      pendingCommand = "cat package.json";
      phase = "approving-1";
      return {
        performed: true,
        continue: false,
        preventDefault: true,
        blockExternal: true,
      };
    });
    const approval1 = recipient("approval-1", (fact) => {
      if (!isKey(fact, "escape")) return continueRoute();
      approvals.push("call-1:rejected");
      pendingCommand = "vp test";
      phase = "approving-2";
      return {
        performed: true,
        continue: false,
        preventDefault: true,
        blockExternal: true,
      };
    });
    const approval2 = recipient("approval-2", (fact) => {
      if (!isKey(fact, "return")) return continueRoute();
      approvals.push("call-2:accepted:tests passed");
      pendingCommand = "";
      phase = "streaming";
      return {
        performed: true,
        continue: false,
        preventDefault: true,
        blockExternal: true,
      };
    });
    const conversation = recipient("conversation", () => continueRoute());
    const composerDefault = {
      id: "composer-edit",
      handle(fact: NormalizedInputFact): InternalInputDefaultDecision {
        if (fact.kind === "text") draft += fact.text;
        else if (fact.kind === "paste") draft += fact.text;
        else if (isKey(fact, "backspace") || isKey(fact, "delete")) {
          draft = draft.slice(0, -1);
        } else return continueDefault();
        return { performed: true, continue: false, blockExternal: true };
      },
    };
    const approvalDefault = {
      id: "approval-default",
      handle: () => continueDefault(),
    };
    const appDefault = {
      id: "app-exit",
      handle(fact: NormalizedInputFact): InternalInputDefaultDecision {
        if (!isCtrlKey(fact, "c")) return continueDefault();
        exitCount++;
        phase = "exited";
        return { performed: true, continue: false, blockExternal: true };
      },
    };
    const externalOwner = {
      id: "external-spy",
      receive(source: { readonly sequence: string }) {
        external.push(source.sequence);
      },
    };

    const capture = () => {
      if (phase === "approving-1" || phase === "approving-2") {
        return captureInternalInputRoutePlan({
          applicationGlobal: [global],
          activeBoundary: approvalBoundary,
          focusedOwner: phase === "approving-1" ? approval1 : approval2,
          logicalAncestors: [conversation],
          ownerDefaults: [approvalDefault],
          applicationDefaults: [appDefault],
          // A modal selects a closed candidate plan. The background
          // composer and external owner are not fallback recipients.
        });
      }
      return captureInternalInputRoutePlan({
        applicationGlobal: [global],
        activeBoundary: phase === "streaming" ? runBoundary : composerBoundary,
        ...(phase === "composing" ? { focusedOwner: editor } : {}),
        logicalAncestors: [conversation],
        ...(phase === "composing" ? { ownerDefaults: [composerDefault] } : {}),
        applicationDefaults: [appDefault],
        external: externalOwner,
      });
    };

    const route = (fact: NormalizedInputFact) => dispatchInternalInput(fact, capture());
    const advanceModel = () => {
      const token = queuedTokens.shift();
      if (token) assistantText += token;
    };

    const firstText = normalize("修复 teh");
    const firstTextResult = route(firstText);
    expect(firstTextResult.trace).toEqual([
      "application-global:global",
      "active-boundary:composer-boundary",
      "focused-owner:editor",
      "logical-ancestor:conversation",
      "owner-default:composer-edit",
    ]);
    expect(recipientFacts.splice(0)).toEqual([firstText, firstText, firstText, firstText]);
    expect(draft).toBe("修复 teh");

    route(normalize("\x7f"));
    expect(draft).toBe("修复 te");
    route(normalize("sts"));
    expect(draft).toBe("修复 tests");

    const pasted = "\nsrc/a.ts\n\x03\x1b[A";
    const pasteFact = normalize({ paste: pasted });
    recipientFacts.length = 0;
    const pasteResult = route(pasteFact);
    expect(pasteFact).toEqual({
      kind: "paste",
      sequence: `\x1b[200~${pasted}\x1b[201~`,
      text: pasted,
    });
    expect(pasteResult.trace).toEqual([
      "application-global:global",
      "active-boundary:composer-boundary",
      "focused-owner:editor",
      "logical-ancestor:conversation",
      "owner-default:composer-edit",
    ]);
    expect(recipientFacts.splice(0)).toEqual([pasteFact, pasteFact, pasteFact, pasteFact]);
    expect(pasteResult.performed).toBe(true);
    expect(pasteResult.externalForwarded).toBe(false);
    expect(draft).toBe(`修复 tests${pasted}`);
    expect(interruptCount).toBe(0);
    expect(exitCount).toBe(0);

    const submit = route(normalize("\r"));
    expect(submit.trace).toEqual([
      "application-global:global",
      "active-boundary:composer-boundary",
      "focused-owner:editor",
    ]);
    expect(submit.suppressedDefaults).toEqual([
      "owner-default:composer-edit",
      "application-default:app-exit",
    ]);
    expect(phase).toBe("approving-1");
    expect(submitted).toBe(`修复 tests${pasted}`);
    expect(pendingCommand).toBe("cat package.json");
    expect(approvals).toEqual([]);

    const unknownModal = route(normalize("x"));
    expect(unknownModal.trace).toEqual([
      "application-global:global",
      "active-boundary:approval-boundary",
      "focused-owner:approval-1",
      "logical-ancestor:conversation",
      "owner-default:approval-default",
      "application-default:app-exit",
    ]);
    expect(unknownModal.externalCandidate).toBe(false);
    expect(draft).toBe("");
    expect(phase).toBe("approving-1");
    expect(pendingCommand).toBe("cat package.json");
    expect(approvals).toEqual([]);

    const reject = route(normalize("\x1b"));
    expect(reject.trace).toEqual([
      "application-global:global",
      "active-boundary:approval-boundary",
      "focused-owner:approval-1",
    ]);
    expect(reject.defaultPrevented).toBe(true);
    expect(phase).toBe("approving-2");
    expect(pendingCommand).toBe("vp test");
    expect(approvals).toEqual(["call-1:rejected"]);

    const accept = route(normalize("\r"));
    expect(accept.trace).toEqual([
      "application-global:global",
      "active-boundary:approval-boundary",
      "focused-owner:approval-2",
    ]);
    expect(phase).toBe("streaming");
    expect(approvals).toEqual(["call-1:rejected", "call-2:accepted:tests passed"]);
    advanceModel();
    expect(assistantText).toBe("All ");

    const interrupt = route(normalize("\x03"));
    expect(interrupt.trace).toEqual(["application-global:global"]);
    expect(interrupt.defaultPrevented).toBe(true);
    expect(phase).toBe("composing");
    expect(interruptCount).toBe(1);
    expect(exitCount).toBe(0);
    expect(queuedTokens).toEqual([]);
    advanceModel();
    expect(assistantText).toBe("All ");

    route(normalize("next"));
    expect(draft).toBe("next");

    const idleExit = route(normalize("\x03"));
    expect(idleExit.trace).toEqual([
      "application-global:global",
      "active-boundary:composer-boundary",
      "focused-owner:editor",
      "logical-ancestor:conversation",
      "owner-default:composer-edit",
      "application-default:app-exit",
    ]);
    expect(phase).toBe("exited");
    expect(exitCount).toBe(1);
    expect(external).toEqual([]);
  });
});

describe.each(["inline", "fullscreen"] as const)(
  "terminal-workbench routing journey (%s)",
  (_mode) => {
    test("isolates a modal and forwards only normalized UTF-8 input explicitly left to the pane", () => {
      let modalOpen = false;
      let outerFocusMoves = 0;
      let appExits = 0;
      const externalSources: InternalNormalizedInputSource[] = [];
      const global: InternalInputRouteRecipient = {
        id: "global",
        handle(fact) {
          if (!isCtrlKey(fact, "w")) return continueRoute();
          modalOpen = true;
          return {
            performed: true,
            continue: false,
            preventDefault: true,
            blockExternal: true,
          };
        },
      };
      const paneBoundary: InternalInputRouteRecipient = {
        id: "pane-a",
        handle: () => continueRoute(),
      };
      const terminalControl: InternalInputRouteRecipient = {
        id: "terminal-control",
        handle(fact) {
          return {
            performed: false,
            continue: true,
            preventDefault: isKey(fact, "tab") || isCtrlKey(fact, "c"),
            blockExternal: false,
          };
        },
      };
      const paneAncestor: InternalInputRouteRecipient = {
        id: "pane-ancestor",
        handle: () => continueRoute(),
      };
      const confirmBoundary: InternalInputRouteRecipient = {
        id: "confirm-boundary",
        handle: () => continueRoute(),
      };
      const confirmControl: InternalInputRouteRecipient = {
        id: "confirm-control",
        handle(fact) {
          if (!isKey(fact, "escape")) return continueRoute();
          modalOpen = false;
          return {
            performed: true,
            continue: false,
            preventDefault: true,
            blockExternal: true,
          };
        },
      };
      const confirmAncestor: InternalInputRouteRecipient = {
        id: "confirm-ancestor",
        handle: () => continueRoute(),
      };
      const outerFocusDefault = {
        id: "outer-focus",
        handle(fact: NormalizedInputFact): InternalInputDefaultDecision {
          if (!isKey(fact, "tab")) return continueDefault();
          outerFocusMoves++;
          return { performed: true, continue: false, blockExternal: true };
        },
      };
      const appExitDefault = {
        id: "app-exit",
        handle(fact: NormalizedInputFact): InternalInputDefaultDecision {
          if (!isCtrlKey(fact, "c")) return continueDefault();
          appExits++;
          return { performed: true, continue: false, blockExternal: true };
        },
      };
      const capture = () => {
        if (modalOpen) {
          return captureInternalInputRoutePlan({
            applicationGlobal: [global],
            activeBoundary: confirmBoundary,
            focusedOwner: confirmControl,
            logicalAncestors: [confirmAncestor],
            applicationDefaults: [appExitDefault],
          });
        }
        return captureInternalInputRoutePlan({
          applicationGlobal: [global],
          activeBoundary: paneBoundary,
          focusedOwner: terminalControl,
          logicalAncestors: [paneAncestor],
          ownerDefaults: [outerFocusDefault],
          applicationDefaults: [appExitDefault],
          external: {
            id: "pty-a",
            receive(source) {
              expect(source.fidelity).toBe("normalized-utf8-sequence");
              externalSources.push(source);
            },
          },
        });
      };
      const route = (event: string | { readonly paste: string }) => {
        const fact = normalize(event);
        return { fact, result: dispatchInternalInput(fact, capture()) };
      };

      const { result: open } = route("\x17");
      expect(open.trace).toEqual(["application-global:global"]);
      expect(modalOpen).toBe(true);

      const { result: unknownModal } = route("\x1b[15~");
      expect(unknownModal.trace).toEqual([
        "application-global:global",
        "active-boundary:confirm-boundary",
        "focused-owner:confirm-control",
        "logical-ancestor:confirm-ancestor",
        "application-default:app-exit",
      ]);
      expect(unknownModal.externalCandidate).toBe(false);
      expect(unknownModal.performed).toBe(false);
      expect(unknownModal.semanticContinued).toBe(true);
      expect(modalOpen).toBe(true);

      const { result: close } = route("\x1b");
      expect(close.trace).toEqual([
        "application-global:global",
        "active-boundary:confirm-boundary",
        "focused-owner:confirm-control",
      ]);
      expect(close.defaultPrevented).toBe(true);
      expect(modalOpen).toBe(false);

      const { result: plain } = route("a");
      expect(plain.trace).toEqual([
        "application-global:global",
        "active-boundary:pane-a",
        "focused-owner:terminal-control",
        "logical-ancestor:pane-ancestor",
        "owner-default:outer-focus",
        "application-default:app-exit",
        "external:pty-a",
      ]);
      expect(plain.suppressedDefaults).toEqual([]);
      expect(plain.externalForwarded).toBe(true);

      for (const event of ["\t", "\x03"]) {
        const { result } = route(event);
        expect(result.trace).toEqual([
          "application-global:global",
          "active-boundary:pane-a",
          "focused-owner:terminal-control",
          "logical-ancestor:pane-ancestor",
          "external:pty-a",
        ]);
        expect(result.suppressedDefaults).toEqual([
          "owner-default:outer-focus",
          "application-default:app-exit",
        ]);
        expect(result.semanticContinued).toBe(true);
        expect(result.defaultPrevented).toBe(true);
        expect(result.externalForwarded).toBe(true);
      }

      const pasteText = "line one\nline two";
      const paste = route({ paste: pasteText });
      expect(externalSources.at(-1)!.fact).toBe(paste.fact);
      const uninterpreted = route("\x1b[?25h");
      expect(externalSources.at(-1)!.fact).toBe(uninterpreted.fact);
      for (const { result } of [paste, uninterpreted]) {
        expect(result.trace).toEqual([
          "application-global:global",
          "active-boundary:pane-a",
          "focused-owner:terminal-control",
          "logical-ancestor:pane-ancestor",
          "owner-default:outer-focus",
          "application-default:app-exit",
          "external:pty-a",
        ]);
        expect(result.externalForwarded).toBe(true);
      }
      expect(paste.fact).toEqual({
        kind: "paste",
        sequence: `\x1b[200~${pasteText}\x1b[201~`,
        text: pasteText,
      });
      expect(uninterpreted.fact).toEqual({ kind: "uninterpreted", sequence: "\x1b[?25h" });

      expect(externalSources.map(({ sequence }) => sequence)).toEqual([
        "a",
        "\t",
        "\x03",
        `\x1b[200~${pasteText}\x1b[201~`,
        "\x1b[?25h",
      ]);
      expect(
        Buffer.concat(externalSources.slice(0, 3).map(({ sequence }) => Buffer.from(sequence))),
      ).toEqual(Buffer.from([0x61, 0x09, 0x03]));
      expect(outerFocusMoves).toBe(0);
      expect(appExits).toBe(0);
    });
  },
);
