export { default as ScrollBox } from "./scroll-box/scroll-box.vue";
export type { ScrollBoxProps, ScrollBoxExpose } from "./scroll-box/scroll-box-props.ts";
export { default as Spinner } from "./spinner/spinner.vue";
export type { SpinnerProps } from "./spinner/spinner-props.ts";
import TableSfc from "./table/table.vue";
import type { TableDefaultSlotProps, TableHeaderSlotProps } from "./table/table-props.ts";
import type { ScalarDict, TableProps } from "./table/table-props.ts";

// Table exposes typed scoped slots: the default slot receives `{ text, value,
// column, columnIndex, width, row, rowIndex }` with `row` / `value` / `column`
// inferred from `data: T[]`. `as unknown as` REPLACES the SFC's type rather than
// intersecting it: a `.vue` with a scoped `<slot>` emits an extra
// `__VLS_WithSlots` construct signature that bakes NON-generic slot types which
// would block `T` inference. A clean generic construct signature is all
// JSX/template resolution needs — same pattern as `Static` in @vue-tui/runtime.
export const Table = TableSfc as unknown as {
  new <T = ScalarDict>(): {
    $props: TableProps<T>;
    $slots: {
      default?: (props: TableDefaultSlotProps<T>) => unknown;
      header?: (props: TableHeaderSlotProps<T>) => unknown;
    };
  };
};
export type { TableProps };

export { defineTableColumns } from "./table/table-props.ts";
