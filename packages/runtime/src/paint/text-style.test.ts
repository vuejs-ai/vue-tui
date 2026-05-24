import chalk from "chalk";
import { expect, test } from "vite-plus/test";
import { applyChalk } from "./text-style.ts";

test("named color applies chalk method", () => {
  const prev = chalk.level;
  chalk.level = 1;
  try {
    expect(applyChalk("x", { color: "red" })).toBe(chalk.red("x"));
  } finally {
    chalk.level = prev;
  }
});

test("hex color applies chalk.hex", () => {
  const prev = chalk.level;
  chalk.level = 1;
  try {
    expect(applyChalk("x", { color: "#ff0000" })).toBe(chalk.hex("#ff0000")("x"));
  } finally {
    chalk.level = prev;
  }
});

test("rgb tuple applies chalk.rgb", () => {
  const prev = chalk.level;
  chalk.level = 1;
  try {
    expect(applyChalk("x", { color: [255, 0, 0] })).toBe(chalk.rgb(255, 0, 0)("x"));
  } finally {
    chalk.level = prev;
  }
});

test("unknown color name falls back to no color", () => {
  const prev = chalk.level;
  chalk.level = 1;
  try {
    expect(applyChalk("x", { color: "not-a-real-color" })).toBe("x");
  } finally {
    chalk.level = prev;
  }
});

test("multiple modifiers chain", () => {
  const prev = chalk.level;
  chalk.level = 1;
  try {
    expect(applyChalk("x", { bold: true, underline: true })).toBe(chalk.bold.underline("x"));
  } finally {
    chalk.level = prev;
  }
});
