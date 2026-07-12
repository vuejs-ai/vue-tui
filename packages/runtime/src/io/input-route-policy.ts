import type { NormalizedInputFact } from "./normalized-input.ts";

/**
 * Private F3 routing-policy experiment.
 *
 * These names and return shapes are deliberately not exported from the runtime
 * package. The experiment keeps four observable decisions separate before a
 * public authoring API is selected: action, semantic continuation, delayed
 * defaults, and delivery to an explicit external owner.
 */

export interface InternalInputRouteDecision {
  /** Whether this recipient performed an application-visible semantic action. */
  readonly performed: boolean;
  /** Whether the next recipient in the same semantic phase may run. */
  readonly continue: boolean;
  /** Whether every delayed default for this event must be skipped. */
  readonly preventDefault: boolean;
  /** Whether an explicit external owner must not receive this event. */
  readonly blockExternal: boolean;
}

export interface InternalInputDefaultDecision {
  /** Whether this delayed default performed an application-visible action. */
  readonly performed: boolean;
  /** Whether the next delayed default may run. */
  readonly continue: boolean;
  /** Whether an explicit external owner must not receive this event. */
  readonly blockExternal: boolean;
}

export interface InternalInputRouteRecipient {
  readonly id: string;
  readonly handle: (fact: NormalizedInputFact) => InternalInputRouteDecision;
}

export interface InternalInputDefaultRecipient {
  readonly id: string;
  readonly handle: (fact: NormalizedInputFact) => InternalInputDefaultDecision;
}

export interface InternalNormalizedInputSource {
  readonly fact: NormalizedInputFact;
  readonly sequence: string;
  /**
   * The sequence is the normalized Unicode string retained by F3.2. When the
   * source was canonical UTF-8 or ASCII, re-encoding recovers it; invalid source
   * bytes that the streaming decoder already replaced are not recoverable. It
   * is not generally a child-PTY encoding: a terminal adapter must encode known
   * keys and paste against the child terminal's own negotiated protocol state.
   */
  readonly fidelity: "normalized-utf8-sequence";
}

export interface InternalInputExternalRecipient {
  readonly id: string;
  readonly receive: (source: InternalNormalizedInputSource) => void;
}

export interface InternalInputRouteCandidate {
  readonly applicationGlobal?: readonly InternalInputRouteRecipient[];
  /** The already-selected active region or modal for this framed fact. */
  readonly activeBoundary?: InternalInputRouteRecipient;
  /** Supplied by a later focus foundation; this experiment does not select it. */
  readonly focusedOwner?: InternalInputRouteRecipient;
  /**
   * Ordered from the focused owner's nearest logical ancestor outwards. The
   * provider must stop at the selected active boundary; the dispatcher cannot
   * infer or repair an invalid cross-boundary path.
   */
  readonly logicalAncestors?: readonly InternalInputRouteRecipient[];
  readonly ownerDefaults?: readonly InternalInputDefaultRecipient[];
  readonly applicationDefaults?: readonly InternalInputDefaultRecipient[];
  /** Absent when the selected boundary is closed, such as an active modal. */
  readonly external?: InternalInputExternalRecipient;
}

type SemanticLayer =
  | "application-global"
  | "active-boundary"
  | "focused-owner"
  | "logical-ancestor";
type DefaultLayer = "owner-default" | "application-default";

interface CapturedSemanticRecipient {
  readonly layer: SemanticLayer;
  readonly recipient: InternalInputRouteRecipient;
}

interface CapturedDefaultRecipient {
  readonly layer: DefaultLayer;
  readonly recipient: InternalInputDefaultRecipient;
}

export interface InternalInputRoutePlan {
  readonly semantic: readonly CapturedSemanticRecipient[];
  readonly defaults: readonly CapturedDefaultRecipient[];
  readonly external: InternalInputExternalRecipient | undefined;
}

export interface InternalInputRouteResult {
  readonly performed: boolean;
  readonly semanticContinued: boolean;
  readonly defaultPrevented: boolean;
  readonly defaultContinued: boolean;
  readonly externalCandidate: boolean;
  readonly externalBlocked: boolean;
  readonly externalForwarded: boolean;
  readonly trace: readonly string[];
  readonly suppressedDefaults: readonly string[];
}

const semanticEntry = (
  layer: SemanticLayer,
  recipient: InternalInputRouteRecipient,
): CapturedSemanticRecipient => Object.freeze({ layer, recipient });

const defaultEntry = (
  layer: DefaultLayer,
  recipient: InternalInputDefaultRecipient,
): CapturedDefaultRecipient => Object.freeze({ layer, recipient });

/**
 * Freeze boundary selection and recipient order before any callback runs. The
 * selected recipient identities stay fixed, while a recipient adapter may read
 * its latest handler ref. Live integration still has to supply F3.3-style
 * activation leases; this pure policy model does not manufacture them.
 */
export function captureInternalInputRoutePlan(
  candidate: InternalInputRouteCandidate,
): InternalInputRoutePlan {
  const semantic: CapturedSemanticRecipient[] = [];
  for (const recipient of candidate.applicationGlobal ?? []) {
    semantic.push(semanticEntry("application-global", recipient));
  }
  if (candidate.activeBoundary) {
    semantic.push(semanticEntry("active-boundary", candidate.activeBoundary));
  }
  if (candidate.focusedOwner) {
    semantic.push(semanticEntry("focused-owner", candidate.focusedOwner));
  }
  for (const recipient of candidate.logicalAncestors ?? []) {
    semantic.push(semanticEntry("logical-ancestor", recipient));
  }

  const defaults: CapturedDefaultRecipient[] = [];
  for (const recipient of candidate.ownerDefaults ?? []) {
    defaults.push(defaultEntry("owner-default", recipient));
  }
  for (const recipient of candidate.applicationDefaults ?? []) {
    defaults.push(defaultEntry("application-default", recipient));
  }

  return Object.freeze({
    semantic: Object.freeze(semantic),
    defaults: Object.freeze(defaults),
    external: candidate.external,
  });
}

/** Dispatch one already-normalized fact through one immutable candidate plan. */
export function dispatchInternalInput(
  fact: NormalizedInputFact,
  plan: InternalInputRoutePlan,
): InternalInputRouteResult {
  const trace: string[] = [];
  let performed = false;
  let semanticContinued = true;
  let defaultPrevented = false;
  let defaultContinued = true;
  let externalBlocked = false;

  for (const { layer, recipient } of plan.semantic) {
    if (!semanticContinued) break;
    const decision = recipient.handle(fact);
    trace.push(`${layer}:${recipient.id}`);
    performed ||= decision.performed;
    semanticContinued = decision.continue;
    defaultPrevented ||= decision.preventDefault;
    externalBlocked ||= decision.blockExternal;
  }

  const suppressedDefaults = defaultPrevented
    ? plan.defaults.map(({ layer, recipient }) => `${layer}:${recipient.id}`)
    : [];
  if (defaultPrevented) {
    defaultContinued = false;
  } else {
    for (const { layer, recipient } of plan.defaults) {
      if (!defaultContinued) break;
      const decision = recipient.handle(fact);
      trace.push(`${layer}:${recipient.id}`);
      performed ||= decision.performed;
      defaultContinued = decision.continue;
      externalBlocked ||= decision.blockExternal;
    }
  }

  const externalCandidate = plan.external !== undefined;
  // External delivery is fallthrough, not a side channel around semantic
  // routing. Its permission is independent, but it is considered only after
  // the selected semantic path naturally reaches its end.
  const externalForwarded = externalCandidate && semanticContinued && !externalBlocked;
  if (externalForwarded) {
    const source: InternalNormalizedInputSource = Object.freeze({
      fact,
      sequence: fact.sequence,
      fidelity: "normalized-utf8-sequence",
    });
    plan.external!.receive(source);
    trace.push(`external:${plan.external!.id}`);
  }

  return Object.freeze({
    performed,
    semanticContinued,
    defaultPrevented,
    defaultContinued,
    externalCandidate,
    externalBlocked,
    externalForwarded,
    trace: Object.freeze(trace),
    suppressedDefaults: Object.freeze(suppressedDefaults),
  });
}
