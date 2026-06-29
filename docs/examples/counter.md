# Counter App

This is a fully runnable JsxRx counter application. It demonstrates the
core reactive primitives — `state()`, embedding observables in JSX, derived
values with `pipe(map(...))`, and conditional rendering driven by streams.

---

## File Structure

```text
counter-app/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    └── App.tsx
```

---

## package.json

```json
{
  "name": "jsxrx-counter",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@jsxrx/core": "^1.0.0",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@jsxrx/vite-plugin": "^1.0.0",
    "typescript": "^5.0.0",
    "vite": "^7.0.0"
  }
}
```

---

## vite.config.ts

```ts
import { defineConfig } from "vite"
import { jsxRX } from "@jsxrx/vite-plugin"

export default defineConfig({
  plugins: [jsxRX()],
})
```

> Note: `vite.config.js` works equally well if you're not using TypeScript.

The `jsxRX()` Vite plugin configures esbuild to use the automatic JSX
transform with `@jsxrx/core` as the import source, and runs the
`@jsxrx/compiler` during production builds to inject stable element keys.

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@jsxrx/core",
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true
  },
  "include": ["src"]
}
```

`"jsx": "react-jsx"` combined with `"jsxImportSource": "@jsxrx/core"` tells
TypeScript to compile JSX into calls to `jsx()` and `jsxs()` from
`@jsxrx/core/jsx-runtime`.

---

## index.html

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JsxRx Counter</title>
  </head>
  <body>
    <div root></div>
    <script src="./src/main.tsx" type="module"></script>
  </body>
</html>
```

---

## src/main.tsx

```jsx
import { createRoot } from "@jsxrx/core/dom"
import App from "./App.tsx"

createRoot(document.querySelector("[root]")).mount(<App />)
```

`createRoot` attaches a DOM renderer to the `[root]` element. Calling
`.mount(<App />)` subscribes to the component's reactive tree and renders
it into the DOM.

---

## src/App.tsx

```jsx
import { state } from "@jsxrx/core"
import { map } from "rxjs"

export function App() {
  const count$ = state(0)

  function increase(): void {
    count$.set(count$.value + 1)
  }

  function decrease(): void {
    count$.set(count$.value - 1)
  }

  function reset(): void {
    count$.set(0)
  }

  return (
    <div style={{ textAlign: "center", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h1>JsxRx Counter</h1>
      <p style={{ fontSize: "3rem", fontWeight: "bold" }}>
        The count is: {count$}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
        <button type="button" onClick={decrease}>
          - Decrease
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <button type="button" onClick={increase}>
          + Increase
        </button>
      </div>

      {/* Conditional rendering based on count */}
      <p style={{ marginTop: "1rem" }}>
        {count$.pipe(
          map(count => {
            if (count > 0) return <span style={{ color: "green" }}>Positive</span>
            if (count < 0) return <span style={{ color: "red" }}>Negative</span>
            return <span style={{ color: "gray" }}>Zero</span>
          })
        )}
      </p>

      {/* Derived value */}
      <p>
        Double: {count$.pipe(map(c => c * 2))}
      </p>
    </div>
  )
}
```

---

## How It Works

### 1. `state()` — Reactive State Cell

```jsx
const count$ = state(0)
```

`state(initialValue)` creates a reactive cell backed by a `BehaviorSubject`.
It returns an `IState<T>` — an object that is both `Observable<T>` and
provides synchronous read/write access:

- **`.value`** — reads the current value synchronously. Unlike React's stale
  closures, `.value` always returns the latest snapshot.
- **`.set(value)`** — pushes a new value through the subject, emitting to all
  subscribers.

### 2. Observables in JSX

```jsx
<p>The count is: {count$}</p>
```

When you embed an observable in JSX with `{count$}`, JsxRx subscribes to it
and updates the DOM text node on every emission. No re-render of the
component — only the specific text node is patched.

### 3. Conditional Rendering with `pipe(map(...))`

```jsx
{
  count$.pipe(
    map(count => {
      if (count > 0) return <span style={{ color: "green" }}>Positive</span>
      if (count < 0) return <span style={{ color: "red" }}>Negative</span>
      return <span style={{ color: "gray" }}>Zero</span>
    }),
  )
}
```

The `pipe(map(...))` re-evaluates on every emission. Each time the count
changes, the condition is checked and the matching JSX element replaces the
previous one in the DOM. This is the reactive equivalent of a ternary
expression in React — except **only the affected DOM subtree is swapped**,
not a full re-render.

### 4. Derived Values

```jsx
<p>Double: {count$.pipe(map(c => c * 2))}</p>
```

Derived state is just `source$.pipe(map(...))`. The
`ObservableDelegate.pipe()` method automatically appends
`shareReplay({ refCount: true, bufferSize: 1 })`, so the derivation is
shared and cached — effectively the same as `useMemo` in React, without an
explicit dependency array.

### 5. No Re-renders

The `App` function runs **once**. Event handlers and variable bindings are
created a single time and never change. When `count$.set()` is called, only
the DOM nodes that reference `count$` are updated — the function body does
not re-execute, no virtual DOM is diffed, and no child components are
reconciled unnecessarily.

### 6. Running the App

```bash
cd counter-app
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`) to
see the counter in action.

---

## Key Takeaways

| Concept            | React                          | JsxRx                                         |
| ------------------ | ------------------------------ | --------------------------------------------- |
| State creation     | `useState(0)` → `[value, set]` | `state(0)` → `{ value, set }` (is Observable) |
| Derived state      | `useMemo(() => ..., [deps])`   | `source$.pipe(map(...))`                      |
| Conditional render | Ternary inside JSX             | `source$.pipe(map(...))` returns JSX elements |
| Component re-runs  | Every state change             | Once — only subscribed DOM nodes update       |
| Dependency arrays  | Manual (stale closure risk)    | Automatic (RxJS tracks the graph)             |

---

## Try It Yourself

Clone the structure above and extend it:

1. **Add a step size input** — Create a second `state()` for the step
   value (e.g., `const step$ = state(1)`), bind it to an `<input>`, and
   use `step$.value` inside `increase()` / `decrease()`.

2. **Add a history log** — Use `count$.pipe(map(...))` to display a
   running log of every value the counter has been through (hint: pair
   `state()` with `scan` from RxJS).

3. **Toggle visibility** — Create a `visible$` state cell and use
   `visible$.pipe(map(v => v ? <Counter /> : null))` to show or hide
   the counter.

Each exercise reinforces the same pattern: create a `state()`, compose it
with `pipe(map(...))`, and embed the result in JSX.
