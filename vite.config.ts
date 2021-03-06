import { defineConfig } from "vite";
import reactRefresh from "@vitejs/plugin-react-refresh";
import { resolve } from "path";
import eslint from "@rollup/plugin-eslint";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    {
      ...eslint({
        include: "**/*.+(js|jsx|ts|tsx)",
      }),
      enforce: "pre",
      apply: "serve",
    },
    reactRefresh(),
  ],
  server: {
    port: 7789,
    strictPort: true,
  },
  build: {
    target: "es2015",
    rollupOptions: {
      input: {
        main: resolve(__dirname, "main-window.html"),
        browser: resolve(__dirname, "browser-window.html"),
      },
    },
    outDir: resolve(__dirname, "dist/electron"),
  },
  resolve: {
    alias: [
      { find: /^renderer/, replacement: resolve(__dirname, "src/renderer") },
      { find: /^types/, replacement: resolve(__dirname, "src/types") },
      { find: /^~/, replacement: "" },
    ],
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
});
