import { expect, test } from "vite-plus/test";
import { Text } from "@vue-tui/runtime";
import { render } from "../src/index.ts";

test("unmount preserves the restored screen until explicit disposal", async () => {
  const result = await render(() => <Text>fullscreen</Text>, {
    host: { mode: "fullscreen" },
  });

  result.unmount();
  expect((await result.screen()).activeBuffer).toBe("normal");

  result.dispose();
  expect(() => result.dispose()).not.toThrow();
  expect(() => result.unmount()).not.toThrow();
  expect(result.lastFrame()).toBe("fullscreen");
});

test("host operations fail clearly after disposal without changing dimensions", async () => {
  const result = await render(() => <Text>disposed</Text>, { columns: 40, rows: 10 });
  result.dispose();

  await expect(result.screen()).rejects.toThrow("Test host has been disposed.");
  await expect(result.stdin.write("x")).rejects.toThrow("Test host has been disposed.");
  await expect(result.mouse.down({ x: 0, y: 0 })).rejects.toThrow("Test host has been disposed.");
  await expect(result.mouse.move({ x: 0, y: 0 })).rejects.toThrow("Test host has been disposed.");
  await expect(result.mouse.up({ x: 0, y: 0 })).rejects.toThrow("Test host has been disposed.");
  await expect(result.mouse.wheel({ x: 0, y: 0 }, "down")).rejects.toThrow(
    "Test host has been disposed.",
  );
  await expect(result.terminal.resize(80, 24)).rejects.toThrow("Test host has been disposed.");
  await expect(result.terminal.suspend()).rejects.toThrow("Test host has been disposed.");
  await expect(result.terminal.resume()).rejects.toThrow("Test host has been disposed.");
  await expect(result.waitUntilRenderFlush()).rejects.toThrow("Test host has been disposed.");
  await expect(result.waitUntilExit()).rejects.toThrow("Test host has been disposed.");
  expect(result.terminal.columns).toBe(40);
  expect(result.terminal.rows).toBe(10);
  expect(result.mouse.reporting.current).toBe("none");
  expect(result.mouse.reporting.history).toEqual([]);
});

test("disposal wins races with screen and resize before either touches disposed xterm state", async () => {
  const result = await render(() => <Text>race</Text>, { columns: 40, rows: 10 });
  const screen = result.screen();
  const resize = result.terminal.resize(80, 24);

  result.dispose();

  await expect(screen).rejects.toThrow("Test host has been disposed.");
  await expect(resize).rejects.toThrow("Test host has been disposed.");
  expect(result.terminal.columns).toBe(40);
  expect(result.terminal.rows).toBe(10);
});
