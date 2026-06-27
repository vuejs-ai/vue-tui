import { defineConfig } from "vite";
import { vueTui } from "../../../src/index.ts";
export default defineConfig({ plugins: [vueTui()] });
