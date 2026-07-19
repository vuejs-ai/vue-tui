import { watch } from "vue";
import { describe, expect, test } from "vite-plus/test";
import type { AppContext } from "../context.ts";
import { createBox, createRoot, createStatic, type TuiBox } from "../host/nodes.ts";
import { runtimeResourceTracker } from "../resource-tracker.ts";
import { createInternalBoxPresenceService } from "./box-presence-service.ts";

function fixture() {
  const root = createRoot({} as AppContext);
  const append = (box: TuiBox): TuiBox => {
    box.parent = root;
    root.children.push(box);
    return box;
  };
  return { root, append };
}

describe("private accepted Box-presence service", () => {
  test("publishes one coherent accepted map and ignores discarded candidates", () => {
    const { root, append } = fixture();
    const first = append(createBox());
    const second = append(createBox());
    const service = createInternalBoxPresenceService(root);
    const firstBinding = service.createBinding();
    const secondBinding = service.createBinding();
    firstBinding.attach(first);
    secondBinding.attach(second);

    service.beginFrame().commit();
    expect(firstBinding.presence.value).toBe(true);
    expect(secondBinding.presence.value).toBe(true);

    const observations: Array<readonly [boolean, boolean]> = [];
    const stop = watch(
      firstBinding.presence,
      (value) => observations.push([value, secondBinding.presence.value]),
      { flush: "sync" },
    );
    first.style.display = "none";
    second.style.display = "none";
    service.beginFrame().discard();
    expect(firstBinding.presence.value).toBe(true);
    expect(secondBinding.presence.value).toBe(true);

    service.beginFrame().commit();
    expect(observations).toEqual([[false, false]]);
    stop();
    firstBinding.dispose();
    secondBinding.dispose();
    service.dispose();
  });

  test("treats Static ancestry as absent without consulting visual geometry", () => {
    const { root } = fixture();
    const stat = createStatic();
    stat.parent = root;
    root.children.push(stat);
    const box = createBox();
    box.parent = stat;
    stat.children.push(box);
    // Geometry-related props do not participate in logical presence.
    box.props["width"] = 0;
    box.props["height"] = 0;
    box.props["overflow"] = "hidden";

    const service = createInternalBoxPresenceService(root);
    const binding = service.createBinding();
    binding.attach(box);
    service.beginFrame().commit();
    expect(binding.presence.value).toBe(false);
    binding.dispose();
    service.dispose();
  });

  test("retargets true to true without a false interval and rejects a stale frame", () => {
    const { root, append } = fixture();
    const first = append(createBox());
    const second = append(createBox());
    const service = createInternalBoxPresenceService(root);
    const binding = service.createBinding();
    const detachFirst = binding.attach(first);
    service.beginFrame().commit();
    expect(binding.presence.value).toBe(true);

    detachFirst();
    const detachSecond = binding.attach(second);
    expect(binding.presence.value).toBe(true);
    service.beginFrame().commit();
    expect(binding.presence.value).toBe(true);

    const stale = service.beginFrame();
    detachSecond();
    stale.commit();
    expect(binding.presence.value).toBe(true);
    service.beginFrame().commit();
    expect(binding.presence.value).toBe(false);
    binding.dispose();
    service.dispose();
  });

  test("retires an accepted binding only after acceptance and tears down synchronously", () => {
    const before = runtimeResourceTracker.snapshot().boxPresenceBindings;
    const { root, append } = fixture();
    const service = createInternalBoxPresenceService(root);
    const retained = service.createBinding();
    retained.attach(append(createBox()));
    service.beginFrame().commit();
    expect(retained.presence.value).toBe(true);
    expect(runtimeResourceTracker.snapshot().boxPresenceBindings).toBe(before + 1);

    retained.dispose();
    expect(retained.presence.value).toBe(true);
    expect(runtimeResourceTracker.snapshot().boxPresenceBindings).toBe(before + 1);
    service.beginFrame().commit();
    expect(retained.presence.value).toBe(false);
    expect(runtimeResourceTracker.snapshot().boxPresenceBindings).toBe(before);

    const live = service.createBinding();
    live.attach(append(createBox()));
    service.beginFrame().commit();
    expect(live.presence.value).toBe(true);
    service.dispose();
    expect(live.presence.value).toBe(false);
    expect(runtimeResourceTracker.snapshot().boxPresenceBindings).toBe(before);
  });
});
