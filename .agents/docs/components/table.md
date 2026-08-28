# Table

`Table` is the non-interactive tabular data display in `@vue-tui/components`.

## Why it is first-party

The contributor had already converted a table component for Vue and reported a concrete terminal-correctness failure: Chinese headers did not align with their cells. The maintainer accepted that as a legitimate use and opened #224 for the contribution ([issue #221 context](https://github.com/vuejs-ai/vue-tui/issues/221#issuecomment-4824549966)). This is real consumer evidence for a recurring display need, not catalog parity with another framework. The generic non-interactive formatter belongs in `@vue-tui/components`; application data models and interactive sorting, selection, filtering, or navigation policy do not.

## Public API

The component accepts `data`, `columns`, and `padding`; each column may choose a Runtime `Text` wrap mode, physical-line alignment, string formatting, and structured header or cell text styles. A non-empty grid renders as real Runtime column-direction `Box` cells containing stretched `Text`, so Yoga supplies a responsive fractional allocation and keeps borders aligned as logical rows grow. Runtime converts that allocation once to its conservative whole-cell Text budget, then `textAlign` aligns every wrapped or hard-newline line against that budget. It has no sorting, selection, explicit column sizing, table-wide color props, header slot, cell slot, or border slot.

The narrow surface is deliberate. Table owns the text and the shared column geometry; arbitrary rendered slot content has no synchronous intrinsic-measurement contract that could keep every row on the same column boundaries.

## Structured text styling

Per-cell and per-header text styling extends the column model without opening a Vue slot or allowing arbitrary rendered content to participate in table geometry. `format(value, row)` remains a text formatter that returns only `string`; it does not return VNodes, ANSI-marked strings, or a union of text and presentation objects. A column instead has `cellStyle`, accepting either a fixed `TableTextStyle` or a callback whose `value` retains the key-specific type, plus a fixed `headerStyle` for that column.

`TableTextStyle` is `Readonly<Omit<TextProps, "textAlign" | "wrap">>`, covering foreground and background color, dim, bold, italic, underline, strikethrough, and inverse without exposing layout or arbitrary children. Table applies these structured values through nested public Runtime `<Text>` spans, so the render session remains the sole owner of color capability and ANSI generation. A background style covers the formatted text only; cell padding and borders remain structural Table output and are not styled by `TableTextStyle`.

Table does not re-export Chalk, add a general string-color helper, or expose general header or cell slots. A general slot cannot enforce that callers preserve measured text and shared column geometry; re-exported or helper-generated ANSI would keep ordinary data and presentation markup in the same `string` channel. Labels and formatter output instead remain plain text. An actual ESC or other terminal-control byte is not a styling API and is rejected; callers that need to display one encode it visibly as `\\u001b`, `\\x1b`, or `␛`.

## Row and column types

`Table` infers one row type from `data`. `TableColumn<Row>` is a distributive mapped union over the row's string keys, so heterogeneous row unions retain every possible key; a formatter receives `undefined` when its key is absent from one union member. Each column key must exist and its optional `format(value, row)` callback otherwise receives the value type for that key. `columns` uses `NoInfer<Row>` so a misspelled key cannot widen the row inferred from `data`.

Extracted column arrays use TypeScript's `satisfies readonly TableColumn<Row>[]`; there is no identity helper. Both TSX and Vue-template fixtures verify accepted usage and rejected keys.

## Rendering contract

- Omitted columns are derived from the union of enumerable string keys in first-seen order.
- Explicit columns define order and may set `label`, `align`, `wrap`, `format`, `headerStyle`, and `cellStyle`; alignment applies to every physical line produced by hard breaks or wrapping, while styles apply only to text.
- Natural column width is the maximum terminal display width of every physical header and formatted-cell line, plus `padding` on each side. `string-width` handles wide Unicode characters.
- `padding` defaults to `1` and must be a non-negative safe integer.
- `null` and `undefined` are blank. Strings, numbers, bigints, booleans, and symbols render directly. Objects and functions require `format` rather than silently rendering JavaScript's default object string.
- CRLF, CR, LF, and Unicode line separators are normalized to hard LF breaks. Other C0/C1 terminal controls are rejected; structured component props, not control bytes in strings, own presentation.
- Cells default to Runtime's `wrap` behavior. A column may instead choose `hard`, `truncate`, `truncate-middle`, or `truncate-start`. Yoga shrinks naturally wider columns proportionally when the grid exceeds its parent, and a logical row grows to the tallest resulting cell while shared borders remain aligned. A fractional allocation uses only its complete-cell budget during that single layout pass; if Yoga later rounds the column outward, one extra cell can remain unused rather than triggering feedback layout or changing the measured row height.
- A natural grid wider than 65,535 terminal columns is rejected before creating layout nodes. If the parent is narrower than the structural minimum required by borders, configured padding, and one content cell per column, normal overflow clipping is the final fallback because a complete grid cannot fit.
- Rows are separated by Unicode box-drawing lines. Empty data with explicit columns renders the header; empty data without columns renders no host node or layout space.
- Table has no slot contract. Unsupported child content is not interpreted as table data or geometry.

## Package boundary

The component imports only the public Runtime `Box`, `Text`, `BoxProps`, and `TextProps` surface plus `string-width`; it does not depend on Runtime internals or read terminal globals. Its public constructor hides Vue's generated patch-specific SFC type, matching the other components package exports. Component behavior tests live under `packages/components/tests/table/`; implementation files remain under `src/table/`.
