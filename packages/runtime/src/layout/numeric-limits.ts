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
