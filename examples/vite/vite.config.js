import { defineConfig } from "vite";

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: '@jsxrx/core',
    jsxFactory: '_jsx',
    jsxFragment: '_jsxs',
  }
})
