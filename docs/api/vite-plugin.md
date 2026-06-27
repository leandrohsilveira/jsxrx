# `@jsxrx/vite-plugin` API Reference

## `jsxRX()`

**Purpose**: A Vite plugin factory that configures JSX for JsxRx and applies build-time optimizations.

**Signature**: `jsxRX(): Plugin`

**Returns**: A Vite plugin object with the following hooks:

1. **`config()`** — Sets `esbuild.jsx: "automatic"` and `esbuild.jsxImportSource: "@jsxrx/core"`. This ensures esbuild (used by Vite for dev serving and pre-bundling) transpiles JSX to calls to `@jsxrx/core/jsx-runtime`.

2. **`configResolved(resolvedConfig)`** — Tracks the resolved Vite configuration (build mode, etc.).

3. **`transform(code, id)`** — During production builds, transforms `.jsx` and `.tsx` files using the `@jsxrx/compiler`'s `transform()` function. This injects location-based IDs into `jsx()`/`jsxs()` calls for optimized VDOM diffing. Uses `escodegen` to regenerate the JavaScript code from the transformed AST.

**Usage**:
```js
import { defineConfig } from "vite"
import { jsxRX } from "@jsxrx/vite-plugin"

export default defineConfig({
  plugins: [jsxRX()],
})
```

**How it works**:
- **Dev mode**: The `config()` hook sets esbuild's JSX mode to automatic, so `.jsx`/`.tsx` files are transpiled with `jsx()`/`jsxs()` calls from `@jsxrx/core/jsx-runtime`
- **Production build**: The `transform()` hook additionally applies the `@jsxrx/compiler` AST transform, injecting deterministic IDs based on source location for faster reconciliation
- The plugin works alongside other Vite plugins (Tailwind CSS, mock servers, etc.)

**Installation**:
```bash
npm i -D @jsxrx/vite-plugin
```

Reference source: `plugins/vite/src/plugin.js`.
