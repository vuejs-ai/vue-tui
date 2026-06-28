import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { vueTui } from "../../../src/index.ts";
export default defineConfig({ plugins: [vueTui(), vue()] });
