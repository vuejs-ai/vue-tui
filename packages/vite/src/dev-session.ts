/**
 * Process-wide ownership of the in-process vue-tui Vite dev session.
 * At most one session may be active; sequential sessions work after release.
 */
let activeSessionId: string | undefined;

export function claimDevSession(sessionId: string): void {
  if (activeSessionId !== undefined && activeSessionId !== sessionId) {
    throw new Error(
      "[vue-tui] only one Vite dev session may be active per process; close the current server before starting another",
    );
  }
  activeSessionId = sessionId;
}

export function releaseDevSession(sessionId: string): void {
  if (activeSessionId === sessionId) {
    activeSessionId = undefined;
  }
}

export function getActiveDevSessionId(): string | undefined {
  return activeSessionId;
}
