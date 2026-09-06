import type { SessionMember } from "../session/session.ts";

interface DevSessionBuild {
  readonly session: SessionMember;
  readonly settleExit: () => void;
  readonly waitUntilExit: () => Promise<void>;
}

/**
 * The development lifetime around one replaceable Runtime Session.
 *
 * Vite re-executes the application entry after a full reload. `replace()`
 * releases the old Session; that new entry then calls `build()` on this same
 * process-wide DevSession to attach the replacement. Development replacement
 * lives in DevSession.
 */
export class DevSession {
  #current: DevSessionBuild | null = null;

  build(build: DevSessionBuild): void {
    if (this.#current !== null) {
      throw new Error(
        "[vue-tui] only one mounted app may use the active Vite dev session at a time",
      );
    }
    this.#current = build;
  }

  /** Release the old session now; Vite will evaluate the entry that builds its replacement. */
  replace(): void {
    const current = this.#current;
    if (!current) return;
    this.#current = null;
    current.session.dispose({ sync: true, abandonExit: true });
  }

  /** End the current development lifetime and settle its ordinary application exit. */
  close(): void | Promise<void> {
    const current = this.#current;
    if (!current) return;
    this.#current = null;
    try {
      current.session.dispose();
    } finally {
      current.settleExit();
    }
    return current.waitUntilExit();
  }

  /** Forget a Session that disposed itself through the ordinary Runtime path. */
  release(session: SessionMember): boolean {
    if (this.#current?.session !== session) return false;
    this.#current = null;
    return true;
  }
}
