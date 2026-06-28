# Getting Started

## Introduction

JsxRx is a **component-driven UI library** powered by RxJS observables for
reactivity. You write components using JSX, compose them together, and describe
your UI declaratively. Every piece of state and every property stream is a
first-class Observable, making reactive data flows natural, composable, and
explicit.

If you already know JSX and have worked with observables (or have wanted to),
JsxRx gives you a lightweight framework where reactivity isn't hidden behind
magic — it's right there in your components.

---

## Installation

Create a new project directory and install the core packages:

```bash
mkdir my-jsxrx-app
cd my-jsxrx-app
npm init -y
npm install @jsxrx/core rxjs
npm install -D @jsxrx/vite-plugin vite typescript
```

> **Note:** `rxjs` is a peer dependency of `@jsxrx/core`. Both `rxjs` and
> `vite` must be installed alongside the JsxRx packages.

---

## Project Setup

Create a minimal Vite project with these four files:

### `vite.config.js`

```js
import { defineConfig } from "vite"
import { jsxRX } from "@jsxrx/vite-plugin"

export default defineConfig({
  plugins: [jsxRX()],
})
```

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JsxRx App</title>
  </head>
  <body>
    <div root></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@jsxrx/core",
    "module": "NodeNext",
    "moduleResolution": "nodenext",
    "strict": true,
    "target": "ES2022"
  },
  "include": ["src"]
}
```

### `src/main.tsx`

```tsx
import { state } from "@jsxrx/core"
import { createRoot } from "@jsxrx/core/dom"

function App() {
  const count$ = state(0)

  return (
    <div>
      <p>Count: {count$}</p>
      <button type="button" onClick={() => count$.set(count$.value + 1)}>
        Increment
      </button>
    </div>
  )
}

createRoot(document.querySelector("[root]")).mount(<App />)
```

Start the dev server:

```bash
npx vite dev
```

Open the URL shown in the terminal and you should see your counter running.

---

## How It Works

Here is what happens step-by-step when you build a JsxRx app:

1. **TypeScript JSX configuration** — The `tsconfig.json` sets
   `"jsx": "react-jsx"` and `"jsxImportSource": "@jsxrx/core"`. This tells
   TypeScript to compile JSX into calls to `jsx()` and `jsxs()` imported from
   `@jsxrx/core/jsx-runtime`.

2. **Vite plugin** — The `jsxRX()` plugin in `vite.config.js` configures
   esbuild to use the **automatic** JSX transform with `@jsxrx/core` as the
   import source during development.

3. **Rendering** — `createRoot(element)` creates a DOM renderer. Calling
   `.mount(<App />)` subscribes to your component's reactive tree and renders
   it into the DOM.

4. **Observable-driven updates** — Whenever an observable value (like `count$`)
   changes, only the affected DOM nodes are updated — no full re-renders, no
   virtual DOM tree diffing on every tick.

The result is a development experience that feels familiar (JSX, components,
Vite) with a runtime that is small, reactive by nature, and efficient in
production.

---

**Next**: [Components & State](./02-components-and-state.md)
