import { describe, expect, test } from "vite-plus/test";
import { realClock } from "../../runtime/src/io/clock.ts";

describe("realClock", () => {
  test("now() returns monotonic non-decreasing milliseconds", () => {
    const a = realClock.now();
    const b = realClock.now();
    expect(typeof a).toBe("number");
    expect(b).toBeGreaterThanOrEqual(a);
  });

  test("setTimeout fires the callback after the delay", async () => {
    const fired = await new Promise<boolean>((resolve) => {
      realClock.setTimeout(() => resolve(true), 5);
    });
    expect(fired).toBe(true);
  });

  test("clearTimeout cancels a pending timer", async () => {
    let fired = false;
    const handle = realClock.setTimeout(() => {
      fired = true;
    }, 5);
    realClock.clearTimeout(handle);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fired).toBe(false);
  });
});
