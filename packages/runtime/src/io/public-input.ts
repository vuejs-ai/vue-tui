import type { InternalInputRouteDecision } from "./input-route-policy.ts";
import type { NormalizedInputFact } from "./normalized-input.ts";

export interface TuiInputModifiers {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
  readonly meta: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
}

export type TuiInputPhase = "press" | "repeat" | "release";

export interface TuiInputSource {
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}

export type TuiInputEvent =
  | (TuiInputSource & {
      readonly kind: "key";
      readonly key: {
        readonly protocol: "legacy" | "kitty";
        readonly name: string | null;
        readonly code: string | null;
        readonly primaryCodepoint: number | null;
        readonly shiftedCodepoint: number | null;
        readonly baseLayoutCodepoint: number | null;
        readonly functionalCode: number | null;
        readonly modifiers: TuiInputModifiers;
        readonly phase: TuiInputPhase | null;
        readonly printable: boolean;
        readonly reportedText: string | null;
      };
    })
  | (TuiInputSource & {
      readonly kind: "text";
      readonly text: string;
      readonly protocol: "plain" | "kitty";
      readonly phase: TuiInputPhase | null;
      readonly primaryCodepoint: number | null;
      readonly textOrigin: "reported" | null;
    })
  | (TuiInputSource & {
      readonly kind: "paste";
      readonly text: string;
    })
  | (TuiInputSource & {
      readonly kind: "uninterpreted";
    });

export interface InputRouteDecision {
  readonly action: "none" | "performed";
  readonly routing: "continue" | "stop";
  readonly defaultAction: "allow" | "prevent";
  readonly external: "allow" | "block";
}

export type InputHandlerResult = "continue" | "consume" | InputRouteDecision;
export type InputHandler = (event: TuiInputEvent) => InputHandlerResult;

const publicInputCache = new WeakMap<NormalizedInputFact, TuiInputEvent | null>();

const publicModifiers = (
  modifiers: Extract<NormalizedInputFact, { readonly kind: "key" }>["key"]["modifiers"],
): TuiInputModifiers =>
  Object.freeze({
    shift: modifiers.shift,
    alt: modifiers.alt,
    ctrl: modifiers.ctrl,
    super: modifiers.super,
    hyper: modifiers.hyper,
    meta: modifiers.meta,
    capsLock: modifiers.capsLock,
    numLock: modifiers.numLock,
  });

/** Project one internal fact to the public F3 union. Pointer facts remain private until F6. */
export function projectPublicInputEvent(fact: NormalizedInputFact): TuiInputEvent | null {
  if (publicInputCache.has(fact)) return publicInputCache.get(fact)!;

  const source = {
    sequence: fact.sequence,
    fidelity: "normalized-utf8-sequence" as const,
  };
  let event: TuiInputEvent | null;
  switch (fact.kind) {
    case "key":
      event = Object.freeze({
        ...source,
        kind: "key",
        key: Object.freeze({
          protocol: fact.key.protocol,
          name: fact.key.name ?? null,
          code: fact.key.code ?? null,
          primaryCodepoint: fact.key.primaryCodepoint ?? null,
          shiftedCodepoint: fact.key.shiftedCodepoint ?? null,
          baseLayoutCodepoint: fact.key.baseLayoutCodepoint ?? null,
          functionalCode: fact.key.functionalCode ?? null,
          modifiers: publicModifiers(fact.key.modifiers),
          phase: fact.key.phase ?? null,
          printable: fact.key.printable,
          reportedText: fact.key.text?.value ?? null,
        }),
      });
      break;
    case "text":
      event = Object.freeze({
        ...source,
        kind: "text",
        text: fact.text,
        protocol: fact.protocol,
        phase: fact.phase ?? null,
        primaryCodepoint: fact.primaryCodepoint ?? null,
        textOrigin: fact.textOrigin ?? null,
      });
      break;
    case "paste":
      event = Object.freeze({ ...source, kind: "paste", text: fact.text });
      break;
    case "uninterpreted":
      event = Object.freeze({ ...source, kind: "uninterpreted" });
      break;
    case "pointer":
      event = null;
      break;
  }

  publicInputCache.set(fact, event);
  return event;
}

const continuedDecision: InternalInputRouteDecision = Object.freeze({
  performed: false,
  continue: true,
  preventDefault: false,
  blockExternal: false,
});
const consumedDecision: InternalInputRouteDecision = Object.freeze({
  performed: true,
  continue: false,
  preventDefault: true,
  blockExternal: true,
});

const invalidResult = (): TypeError =>
  new TypeError(
    'useInput() handlers must synchronously return "continue", "consume", or a complete InputRouteDecision.',
  );

/** Validate and translate one public handler result into the private monotonic decision model. */
export function normalizeInputHandlerResult(result: unknown): InternalInputRouteDecision {
  if (result === "continue") return continuedDecision;
  if (result === "consume") return consumedDecision;
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    throw invalidResult();
  }

  const value = result as Record<PropertyKey, unknown>;
  const action = value.action;
  const routing = value.routing;
  const defaultAction = value.defaultAction;
  const external = value.external;
  if (
    (action !== "none" && action !== "performed") ||
    (routing !== "continue" && routing !== "stop") ||
    (defaultAction !== "allow" && defaultAction !== "prevent") ||
    (external !== "allow" && external !== "block")
  ) {
    throw invalidResult();
  }

  return Object.freeze({
    performed: action === "performed",
    continue: routing === "continue",
    preventDefault: defaultAction === "prevent",
    blockExternal: external === "block",
  });
}
