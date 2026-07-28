import { expect, test } from "vite-plus/test";
import { createScratchFixture } from "./harness/scratch.ts";
import { withViteChild } from "./harness/e2e.ts";

test(
  "a target rerenders in place before a script edit reloads its component",
  { timeout: 30_000 },
  async () => {
    const scratch = createScratchFixture("overlay");
    const originalTarget = scratch.read("src/target.vue");
    const originalTemplate =
      '<Box ref="targetBox" :width="7" :height="2">\n  <Text>TARGET-A</Text>\n</Box>';
    scratch.write("src/target-template.html", originalTemplate);
    scratch.write(
      "src/target.vue",
      originalTarget.replace(
        '<template>\n  <Box ref="targetBox" :width="7" :height="2">\n    <Text>TARGET-A</Text>\n  </Box>\n</template>',
        '<template src="./target-template.html" />',
      ),
    );
    await withViteChild(scratch, async (child) => {
      await child.expectEvent("app:mounted");
      await child.expectEvent("target:setup-ran", { timeoutMs: 5_000 });
      await child.expectEvent("target:mounted");
      await expect(child.expectScreen((screen) => screen.includes("box=7x2"))).resolves.toContain(
        "box=7x2",
      );

      const rerenderAfter = child.events.length;
      scratch.write("src/target-template.html", originalTemplate.replace("TARGET-A", "HOT-B"));
      await child.expectEvent("hmr:update-received", {
        after: rerenderAfter,
        timeoutMs: 5_000,
      });
      await child.expectEvent("hmr:update-applied", { after: rerenderAfter });
      const rerenderApplied = child.events.length;
      await expect(
        child.expectScreen((screen) => screen.includes("HOT-B"), {
          after: rerenderApplied,
        }),
      ).resolves.toContain("HOT-B");
      await child.quiesce(100, {
        ignore: (event) => event.ev === "paint:committed",
      });
      expect(child.events.slice(rerenderAfter).map(({ ev }) => ev)).not.toContain(
        "target:setup-ran",
      );
      expect(child.events.slice(rerenderAfter).map(({ ev }) => ev)).not.toContain(
        "target:unmounted",
      );

      const hotTarget = scratch.read("src/target.vue");
      const reloadAfter = child.events.length;
      scratch.write(
        "src/target.vue",
        hotTarget
          .replace("</script>", 'const reloadMarker = "RELOAD";\n</script>')
          .replace(
            '<template src="./target-template.html" />',
            "<template>\n  <Text>TARGET-C-{{ reloadMarker }}</Text>\n</template>",
          ),
      );
      await child.expectEvent("hmr:update-received", { after: reloadAfter });
      const unmounted = await child.expectEvent("target:unmounted", { after: reloadAfter });
      const setup = await child.expectEvent("target:setup-ran", { after: reloadAfter });
      const mounted = await child.expectEvent("target:mounted", { after: reloadAfter });
      await child.expectEvent("hmr:update-applied", { after: reloadAfter });
      const reloadApplied = child.events.length;
      await expect(
        child.expectScreen((screen) => screen.includes("TARGET-C-RELOAD"), {
          after: reloadApplied,
        }),
      ).resolves.toContain("TARGET-C-RELOAD");
      expect(setup.seq).toBeLessThan(mounted.seq);
      expect(unmounted.seq).toBeLessThan(mounted.seq);
    });
  },
);
