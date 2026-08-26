/**
 * Process-wide ownership of the in-process vue-tui Vite dev session.
 *
 * At most one session may own the terminal and the process-global Runtime state
 * at a time. The subtlety is that "at a time" cannot be read as "a claim must
 * find the slot empty": Vite restarts by creating the NEW server before closing
 * the old one — `restartServer` is `_createServer({ listen: false })` →
 * `server.close()` → `listen()`, and `configureServer` hooks run inside that
 * first step. So on every `vite.config.ts` edit the incoming session claims while
 * the outgoing one still holds.
 *
 * An overlap is therefore a handover: wait for the outgoing session to let go. A
 * genuine second concurrent server never does, and still fails.
 */

interface ActiveSession {
  readonly id: string;
  readonly released: Promise<void>;
  releaseNow(): void;
}

/**
 * Long enough for an app teardown plus terminal restoration, short enough that a
 * real conflict is reported rather than hanging the server indefinitely.
 */
const HANDOVER_TIMEOUT_MS = 5_000;

const CONFLICT_MESSAGE =
  "[vue-tui] only one Vite dev session may be active per process; close the current server before starting another";

interface PendingClaim {
  cancelled: boolean;
}

interface DevSessionState {
  active: ActiveSession | undefined;
  claims: Promise<unknown>;
  pendingClaims: Map<string, Set<PendingClaim>>;
}

// Process-wide rather than module-wide. Vite can load the plugin through more
// than one module graph (externalized packages, transformed source, or distinct
// installed copies); all of them still compete for the same terminal.
const DEV_SESSION_STATE_KEY = "__vue_tui_vite_dev_session__";

function devSessionState(): DevSessionState {
  const target = globalThis as typeof globalThis & {
    [DEV_SESSION_STATE_KEY]?: DevSessionState;
  };
  return (target[DEV_SESSION_STATE_KEY] ??= {
    active: undefined,
    claims: Promise.resolve(),
    pendingClaims: new Map(),
  });
}

export class VueTuiDevSessionClaimCancelledError extends Error {
  override readonly name = "VueTuiDevSessionClaimCancelledError";

  constructor() {
    super("[vue-tui] the Vite dev session closed before it acquired the terminal");
  }
}

export function claimDevSession(
  sessionId: string,
  handoverTimeoutMs = HANDOVER_TIMEOUT_MS,
): Promise<void> {
  const state = devSessionState();
  const request: PendingClaim = { cancelled: false };
  const requests = state.pendingClaims.get(sessionId) ?? new Set<PendingClaim>();
  requests.add(request);
  state.pendingClaims.set(sessionId, requests);

  // Claims run one at a time, in the order they arrived. Waiting is asynchronous:
  // without this queue, every waiter could wake on the same release and install
  // itself before another observed the new owner.
  const claim = state.claims.then(() => takeOwnership(sessionId, request, handoverTimeoutMs));
  // The queue must survive a rejected claim, and a rejection nothing is attached
  // to yet is an unhandled rejection, so the chain keeps its own settled copy.
  state.claims = claim.then(
    () => undefined,
    () => undefined,
  );
  return claim.finally(() => {
    requests.delete(request);
    if (requests.size === 0) state.pendingClaims.delete(sessionId);
  });
}

async function takeOwnership(
  sessionId: string,
  request: PendingClaim,
  handoverTimeoutMs: number,
): Promise<void> {
  const state = devSessionState();
  const holder = state.active;
  let handedOver = true;
  if (holder !== undefined && holder.id !== sessionId) {
    let timer: NodeJS.Timeout | undefined;
    handedOver = await Promise.race([
      holder.released.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), handoverTimeoutMs);
        // Never hold the process open just to police a handover.
        timer.unref?.();
      }),
    ]);
    if (timer !== undefined) clearTimeout(timer);
  }

  // After the wait, not before it: a server can be torn down at any point while
  // its claim is queued, and the interesting moment is the one where the handover
  // has just succeeded and this is about to install a session that no longer runs.
  if (request.cancelled) {
    throw new VueTuiDevSessionClaimCancelledError();
  }
  if (!handedOver) {
    throw new Error(CONFLICT_MESSAGE);
  }

  if (state.active?.id === sessionId) return;
  let releaseNow!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseNow = resolve;
  });
  state.active = { id: sessionId, released, releaseNow };
}

export function releaseDevSession(sessionId: string): void {
  const state = devSessionState();
  for (const request of state.pendingClaims.get(sessionId) ?? []) {
    request.cancelled = true;
  }
  if (state.active?.id !== sessionId) return;
  state.active.releaseNow();
  state.active = undefined;
}

export function getActiveDevSessionId(): string | undefined {
  return devSessionState().active?.id;
}
