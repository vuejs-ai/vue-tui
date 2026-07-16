import { computed, type ComputedRef, type Slots } from "vue";
import stringWidth from "string-width";
import type { ColumnConfig, ScalarDict } from "../table-props.ts";
import type { Column } from "../table-types.ts";
import { extractVNodeText, getDataKeys } from "../table-utils.ts";

export interface UseTableColumnsProps {
  columns?: ColumnConfig[];
  data: ScalarDict[];
  padding: number;
}

export interface UseTableColumnsReturn {
  resolvedColumns: ComputedRef<ColumnConfig[]>;
  tableColumns: ComputedRef<Column[]>;
}

export function useTableColumns(props: UseTableColumnsProps, slots: Slots): UseTableColumnsReturn {
  const resolvedColumns = computed(() => props.columns ?? getDataKeys(props.data));

  const tableColumns = computed<Column[]>(() => {
    const hasHeaderSlot = !!slots.header;
    const hasDefaultSlot = !!slots.default;

    return resolvedColumns.value.map((config, columnIndex) => {
      // === Auto-calculated widths from raw header / data text ===
      const headerText = config.headerFormatter ? config.headerFormatter(config) : config.label;
      const autoHeaderWidth = stringWidth(headerText);
      const autoDataWidths = props.data.map((row) => {
        const value = row[config.key];
        return value === undefined || value === null ? 0 : stringWidth(String(value));
      });

      // === Slot-based widths (measured from slot VNode output) ===
      const slotWidths: number[] = [];

      if (hasHeaderSlot) {
        // Call the header slot with raw (unpadded) text so the measurement
        // reflects what the slot actually renders. Passing width=0 is safe
        // because the slot is measuring, not constraining.
        const vnodes = slots.header!({
          text: headerText,
          column: config,
          columnIndex,
          width: 0,
        });
        slotWidths.push(stringWidth(extractVNodeText(vnodes)));
      }

      if (hasDefaultSlot) {
        for (let rowIndex = 0; rowIndex < props.data.length; rowIndex++) {
          const row = props.data[rowIndex];
          const value = row[config.key];
          const stringValue = value === undefined || value === null ? "" : String(value);
          const vnodes = slots.default!({
            text: stringValue,
            value,
            column: config,
            columnIndex,
            width: 0,
            row,
            rowIndex,
          });
          slotWidths.push(stringWidth(extractVNodeText(vnodes)));
        }
      }

      const maxContentWidth = Math.max(autoHeaderWidth, ...autoDataWidths, ...slotWidths);

      return {
        config,
        key: config.key,
        width: maxContentWidth + props.padding * 2,
        align: config.align ?? "left",
      };
    });
  });

  return { resolvedColumns, tableColumns };
}
