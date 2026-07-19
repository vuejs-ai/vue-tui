/**
 * Terminal rows and columns are represented as unsigned 16-bit values by the
 * platform window-size contract. The same range keeps integer cell inputs
 * exactly representable by Yoga's float32 values and prevents dimensionless
 * flex weights from overflowing that representation.
 *
 * This is deliberately private: it defines Runtime's current safe input and
 * allocation envelope, not a capability applications should branch on.
 */
export const MAX_LAYOUT_VALUE = 65_535;

/**
 * Painting stores at least one array slot per terminal cell (and another when
 * selection provenance is requested). Bound the combined surface separately
 * from each individually valid layout value so a valid width and height cannot
 * accidentally request an unbounded grid allocation.
 */
export const MAX_PAINT_SURFACE_CELLS = 1_048_576;

export function assertPaintSurfaceSize(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_LAYOUT_VALUE ||
    height > MAX_LAYOUT_VALUE
  ) {
    throw new RangeError(
      `Paint surface dimensions must be integers between 1 and ${MAX_LAYOUT_VALUE}; received ${width}x${height}.`,
    );
  }

  // Division avoids overflowing the multiplication if internal callers ever
  // pass values outside the currently accepted dimension range.
  if (width > Math.floor(MAX_PAINT_SURFACE_CELLS / height)) {
    throw new RangeError(
      `Paint surface ${width}x${height} exceeds the ${MAX_PAINT_SURFACE_CELLS}-cell resource limit.`,
    );
  }
}
