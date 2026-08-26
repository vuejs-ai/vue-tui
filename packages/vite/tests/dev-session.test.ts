import { expect, test } from "vite-plus/test";
import { claimDevSession, getActiveDevSessionId, releaseDevSession } from "../src/dev-session.ts";

const CONFLICT = /only one Vite dev session may be active/;

// Every test leaves the module-global slot empty for the next one.
function reset(...ids: string[]): void {
  for (const id of ids) releaseDevSession(id);
}

type DevSessionModule = typeof import("../src/dev-session.ts");

function importDevSessionCopy(name: string): Promise<DevSessionModule> {
  const source = new URL("../src/dev-session.ts", import.meta.url);
  source.searchParams.set("copy", name);
  return import(source.href) as Promise<DevSessionModule>;
}

test("independently loaded module copies share one process owner", async () => {
  const [first, second] = await Promise.all([
    importDevSessionCopy("first"),
    importDevSessionCopy("second"),
  ]);

  try {
    await first.claimDevSession("copy-a");
    await expect(second.claimDevSession("copy-b", 20)).rejects.toThrow(CONFLICT);
    expect(first.getActiveDevSessionId()).toBe("copy-a");
    expect(second.getActiveDevSessionId()).toBe("copy-a");
  } finally {
    first.releaseDevSession("copy-a");
    second.releaseDevSession("copy-b");
  }
});

test("a session can be claimed, released, and claimed again in sequence", async () => {
  await claimDevSession("first");
  expect(getActiveDevSessionId()).toBe("first");
  releaseDevSession("first");
  expect(getActiveDevSessionId()).toBeUndefined();

  await claimDevSession("second");
  expect(getActiveDevSessionId()).toBe("second");
  reset("second");
});

test("re-claiming the session already held is a no-op rather than a conflict", async () => {
  await claimDevSession("same");
  await expect(claimDevSession("same")).resolves.toBeUndefined();
  expect(getActiveDevSessionId()).toBe("same");
  reset("same");
});

// The restart shape: Vite creates the new server before closing the old one, so
// the incoming claim overlaps the outgoing holder and must wait rather than fail.
test("an overlapping claim waits for the previous owner and then takes over", async () => {
  await claimDevSession("outgoing");

  let handedOver = false;
  const incoming = claimDevSession("incoming").then(() => {
    handedOver = true;
  });

  await Promise.resolve();
  expect(handedOver, "must not take over while the previous session still holds").toBe(false);
  expect(getActiveDevSessionId()).toBe("outgoing");

  releaseDevSession("outgoing");
  await incoming;
  expect(handedOver).toBe(true);
  expect(getActiveDevSessionId()).toBe("incoming");
  reset("incoming");
});

// The conflict this guard exists for: a genuine second server, whose predecessor
// is not going away. It still fails — just after waiting long enough to be sure.
test("a claim against an owner that never releases fails with the conflict", async () => {
  await claimDevSession("holds-forever");

  await expect(claimDevSession("second-server", 20)).rejects.toThrow(CONFLICT);
  expect(getActiveDevSessionId()).toBe("holds-forever");
  reset("holds-forever");
});

test("releasing a session that is not the owner leaves the owner alone", async () => {
  await claimDevSession("owner");
  releaseDevSession("someone-else");
  expect(getActiveDevSessionId()).toBe("owner");
  reset("owner");
});

// Two servers waiting on the same outgoing owner must not both become the owner:
// each wakes on the release and finds the slot empty, so without the claim queue
// the last write wins while the first goes on believing it owns the terminal.
test("only one of two waiting claims becomes the owner", async () => {
  await claimDevSession("outgoing-contended");

  const waiting = Promise.allSettled([
    claimDevSession("waiter-a", 30),
    claimDevSession("waiter-b", 30),
  ]);
  releaseDevSession("outgoing-contended");
  const [a, b] = await waiting;

  expect([a!.status, b!.status]).toEqual(["fulfilled", "rejected"]);
  expect(getActiveDevSessionId()).toBe("waiter-a");
  reset("waiter-a", "waiter-b");
});

// The window that leaves the slot stuck: a server closed while its claim is still
// waiting. Releasing matches only the ACTIVE session, so that close found nothing
// to release, and the claim then installed a session whose server is gone —
// holding the terminal against every later claim.
test("a session torn down while its claim waits never takes the slot", async () => {
  await claimDevSession("outgoing-abandoned");
  const abandoned = claimDevSession("gave-up", 200);
  await Promise.resolve();

  releaseDevSession("gave-up");
  releaseDevSession("outgoing-abandoned");
  await expect(abandoned).rejects.toMatchObject({
    name: "VueTuiDevSessionClaimCancelledError",
  });

  expect(getActiveDevSessionId()).toBeUndefined();
  await claimDevSession("next-after-abandoned");
  expect(getActiveDevSessionId()).toBe("next-after-abandoned");
  reset("next-after-abandoned");
});
