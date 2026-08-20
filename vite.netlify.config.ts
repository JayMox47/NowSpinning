import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "netlify",
  publicDir: "../public",
  plugins: [react()],
  resolve: {
    alias: {
      "next/image": resolve(process.cwd(), "netlify/next-image.tsx"),
    },
  },
  build: {
    outDir: "../netlify-dist",
    emptyOutDir: true,
  },
});
