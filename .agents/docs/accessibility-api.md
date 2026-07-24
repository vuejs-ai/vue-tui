# Accessibility status and removed screen-reader experiment

> **Status:** `@vue-tui/runtime` currently provides no screen-reader presentation and no ARIA-shaped component API. The earlier experiment is removed rather than retained privately. This record preserves the useful design evidence without describing a supported or hidden path.

## Current boundary

Runtime has one visual rendering model across Inline, Fullscreen, stream, and string hosts. It does not expose or recognize:

- a `presentation` mount option;
- `ariaLabel`, `ariaHidden`, `ariaRole`, or `ariaState` on `Box` or `Text`;
- public `AriaRole`, `AriaState`, or `RenderPresentation` types;
- `INK_SCREEN_READER` as an environment selector;
- a transcript renderer, internal screen-reader string helper, or testing-only presentation control.

The closed component and option surfaces reject these removed inputs instead of silently accepting inert accessibility claims. Ordinary rendered text may still be read by terminal assistive technology, but Runtime does not claim that visual text is a semantic screen-reader API.

## Why partial ARIA support is not enough

vue-tui has no DOM and no browser accessibility tree. A meaningful accessibility feature would need Runtime to interpret component semantics, maintain a coherent accessible representation, choose how that representation is delivered on each terminal host, and define update, focus, lifecycle, error, and testing behavior. Merely accepting ARIA-shaped props would make user code look accessible while no platform consumes those values.

The removed experiment coupled all of those concerns through renderer, mount, environment, component-validation, string-rendering, Static, resize, lifecycle, and test-host branches. Keeping the machinery private would still preserve an unsupported second rendering model and make future Runtime work account for a capability the package does not promise. Yunfei therefore chose to remove and not support it in the current minimum foundation.

This is not a permanent decision that terminal accessibility is unimportant. It is a refusal to advertise a partial contract. A future proposal can be additive if it starts from concrete user tasks and supplies a complete model that Runtime alone must own.

## What would justify revisiting it

A future accessibility proposal should establish at least:

1. the real assistive-technology journey and terminal behavior it serves;
2. the minimum semantic vocabulary rather than copying browser ARIA mechanically;
3. Inline, Fullscreen, stream, string, non-TTY, resize, suspend/resume, and error semantics;
4. how higher-level components add semantics using only supported public Runtime APIs;
5. run evidence with the intended terminal and screen-reader tools, plus a deterministic public test path;
6. an additive migration that does not reintroduce parser, renderer-node, or lifecycle implementation details as public API.

## Historical evidence from the removed experiment

Version `0.1.0` advertised a linear transcript and an 18-value `AriaRole` union; the published changelog remains the historical release record. PR #265 then experimented with `presentation: "screen-reader"`, `INK_SCREEN_READER`, camelCase Vue props, a host-tree linearizer, a source-private string helper, Fullscreen-to-Inline fallback, and deterministic-host selection. Those paths are now removed from the current branch.

The experiment still established two reusable design facts:

- A no-DOM renderer cannot rely on browser attribute fallthrough; any future semantic values must be interpreted by the renderer or by another explicitly owned accessibility engine.
- Vue and Volar type-check declared camelCase props, while kebab `aria-*` is treated as a broadly allowed global attribute in templates and can bypass component-prop checking. A future design must not assume that accepting arbitrary kebab attributes gives a checked semantic contract.

The previous vouch covered keeping the linearizer internal while the feature existed. Because the helper and the feature are now removed entirely, that old stamp was removed rather than transferred to this different decision. No new vouch has been added.
