# TODOs

Concrete follow-up work that Yunfei explicitly asked the project not to forget. This file does not decide public API direction and is not a source of speculative work. Complete or remove an item when its implementation and focused evidence land.

## Public API documentation

- [ ] Add an attached TSDoc block to the public `vueTui()` export and audit all first-party package entries against [the public API documentation rule](./public-api-docs.md). This is documentation work only; it does not change the plugin API.

## Component type verification

- [ ] Add real Vue-template declaration fixtures for `Newline`, `Spacer`, `Spinner`, and `ScrollBox` so every `@vue-tui/components` public type shape is exercised in both templates and TSX, as required by the [component public type contract](./components-api-design.md#public-type-contract).
