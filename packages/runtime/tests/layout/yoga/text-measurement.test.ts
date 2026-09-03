import Yoga from "yoga-layout";
import { expect, test } from "vite-plus/test";
import { getTextMeasureCellWidth } from "../../../src/layout/yoga.ts";

test.each([
  {
    name: "undefined width keeps the natural width",
    availableWidth: Number.NaN,
    widthMode: Yoga.MEASURE_MODE_UNDEFINED,
    expected: 6,
  },
  {
    name: "an AtMost zero allocation stays zero",
    availableWidth: 0,
    widthMode: Yoga.MEASURE_MODE_AT_MOST,
    expected: 0,
  },
  {
    name: "an Exactly zero allocation stays zero",
    availableWidth: 0,
    widthMode: Yoga.MEASURE_MODE_EXACTLY,
    expected: 0,
  },
  {
    name: "a positive sub-cell allocation gets one terminal cell",
    availableWidth: 0.5,
    widthMode: Yoga.MEASURE_MODE_AT_MOST,
    expected: 1,
  },
  {
    name: "a fractional AtMost allocation uses only its complete terminal cells",
    availableWidth: 4.25,
    widthMode: Yoga.MEASURE_MODE_AT_MOST,
    expected: 4,
  },
  {
    name: "a fractional Exactly allocation uses only its complete terminal cells",
    availableWidth: 4.25,
    widthMode: Yoga.MEASURE_MODE_EXACTLY,
    expected: 4,
  },
])("$name", ({ availableWidth, widthMode, expected }) => {
  expect(getTextMeasureCellWidth(6, availableWidth, widthMode)).toBe(expected);
});
