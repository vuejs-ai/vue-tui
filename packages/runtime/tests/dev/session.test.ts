import { expect, test, vi } from "vite-plus/test";
import { DevSession } from "../../src/dev/session.ts";

test("DevSession disposes a whole Session before building its full-reload replacement", async () => {
  const devSession = new DevSession();
  const oldSession = { dispose: vi.fn() };
  const oldExit = vi.fn();
  devSession.build({
    session: oldSession,
    settleExit: oldExit,
    waitUntilExit: async () => {},
  });

  devSession.replace();

  expect(oldSession.dispose).toHaveBeenCalledExactlyOnceWith({
    sync: true,
    abandonExit: true,
  });
  expect(oldExit).not.toHaveBeenCalled();

  const replacement = { dispose: vi.fn() };
  const replacementExit = vi.fn();
  devSession.build({
    session: replacement,
    settleExit: replacementExit,
    waitUntilExit: async () => {},
  });
  await devSession.close();

  expect(replacement.dispose).toHaveBeenCalledOnce();
  expect(replacementExit).toHaveBeenCalledOnce();
});

test("DevSession releases an ordinarily disposed Session before another builds", () => {
  const devSession = new DevSession();
  const first = { dispose() {} };
  devSession.build({
    session: first,
    settleExit() {},
    waitUntilExit: async () => {},
  });

  expect(devSession.release(first)).toBe(true);
  expect(devSession.release(first)).toBe(false);
  expect(() =>
    devSession.build({
      session: { dispose() {} },
      settleExit() {},
      waitUntilExit: async () => {},
    }),
  ).not.toThrow();
});
