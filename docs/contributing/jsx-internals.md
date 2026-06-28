# JSX Internals

This document covers the internal JSX pipeline of JsxRx — from transpilation through runtime functions to VDOM node types. It is intended for developers who want to contribute to JsxRx or understand its internals. Reading this is not necessary for using JsxRx in applications.

For the user-facing guide, see the [Getting Started guide](../guide/01-getting-started.md) which covers the JSX configuration from a user perspective.

---

JsxRx embraces JSX as its primary templating language. Unlike React, which uses JSX to build a general-purpose virtual DOM, JsxRx treats JSX as a **compile-to-VDOM** mechanism designed specifically for reactive, RxJS-driven applications. This guide explores every layer of the JSX pipeline — from the TypeScript configuration that activates it, through the runtime functions that interpret it, to the VDOM nodes and compiler optimizations that make it efficient.

---

## 1. JSX Transpilation Pipeline

JSX is not natively understood by JavaScript engines. It must be transpiled into plain function calls before it can run. JsxRx uses the **automatic JSX runtime** introduced with React 17+, which avoids the need to explicitly import `h` or `createElement` in every file.

### Configuration

To enable JSX with JsxRx, set the following compiler options in your `tsconfig.json` or `jsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "@jsxrx/core"
  }
}
```

- **`"jsx": "react-jsx"`** — Tells TypeScript to use the automatic JSX runtime transform. Under this mode, TypeScript automatically imports `jsx` and `jsxs` functions from the module specified by `jsxImportSource` rather than requiring a manual import of `React.createElement` or similar.

- **`"jsxImportSource": "@jsxrx/core"`** — Tells TypeScript to import the JSX runtime functions from `@jsxrx/core/jsx-runtime`. When TypeScript encounters JSX syntax in a file, it will generate imports like:

  ```js
  import { jsx, jsxs } from "@jsxrx/core/jsx-runtime"
  ```

> **Note:** The automatic runtime also works with Babel or SWC using the equivalent configuration.

### Compilation Examples

Consider this simple JSX element:

```jsx
<div className="foo">Hello</div>
```

With the automatic runtime, this compiles to:

```js
jsx("div", { className: "foo" }, "Hello")
```

The **first argument** (`"div"`) is the HTML tag name (or component function). The **second argument** is the props object. The **third argument** onward are the children, passed as rest arguments.

Now consider an element with multiple children:

```jsx
<div className="foo">
  <span>A</span>
  <span>B</span>
  <span>C</span>
</div>
```

When there are two or more children, the compiler uses `jsxs` instead of `jsx`:

```js
jsxs("div", { className: "foo" }, [
  jsx("span", {}, "A"),
  jsx("span", {}, "B"),
  jsx("span", {}, "C"),
])
```

The distinction between `jsx` and `jsxs` exists purely as a micro-optimization hint — `jsxs` knows that the children are already in array form and can skip one wrapping step.

### Component Compilation

Components compile identically to HTML elements, but with the component function as the first argument:

```jsx
<MyComponent title="Hello" />
```

compiles to:

```js
jsx(MyComponent, { title: "Hello" })
```

---

## 2. JSX Runtime Functions

The JSX runtime is the actual implementation that the compiler output calls. JsxRx provides three runtime functions, located in `packages/core/src/jsx-runtime.js` and `packages/core/src/jsx-dev-runtime.js`.

### `jsx(type, props, key?)`

```js
import { jsx } from "@jsxrx/core/jsx-runtime"
```

- **`type`** — Can be a string (an HTML tag name like `"div"`, `"span"`, `"button"`), a component function, or `Fragment`.
- **`props`** — The props object (may be `null`). If no props are passed, it defaults to `{}`.
- **`key`** — An optional key string or number used for VDOM reconciliation.

When `type` is a string, `jsx` delegates to `_jsx` from the VDOM renderer, which creates a `RenderElementNode`. When `type` is a function (a component), it creates a `RenderComponentNode`.

The implementation in `packages/core/src/jsx-runtime.js` is deliberately lean:

```js
export function jsx(id, input, { children, ...props } = {}, key) {
  return jsxs(id, input, children ? { children, ...props } : props, key)
}
```

It simply normalizes the arguments and delegates to `jsxs`. A single child is left as a raw value; multiple children are handled by `jsxs`.

### `jsxs(type, props, key?)`

```js
import { jsxs } from "@jsxrx/core/jsx-runtime"
```

- **`type`** — Same as `jsx`: a string tag, component function, or `Fragment`.
- **`props`** — The props object. When there are multiple children, the compiler places the children array inside `props.children`.
- **`key`** — An optional key.

This is the main workhorse function. It handles three cases:

| `type` | Action |
|---|---|
| `Suspense` | Creates a `RenderSuspenseNode` via `_suspense()` |
| `Fragment` | Creates a `RenderFragmentNode` via `_fragment()` |
| Everything else | Delegates to `_jsx()` which produces either a `RenderElementNode` (for string tags) or a `RenderComponentNode` (for functions) |

```js
export function jsxs(id, input, { children, ...props } = {}, key) {
  if (input === Suspense)
    return _suspense(`suspense:${id}`, props, children, key)
  if (input === Fragment) return _fragment(`fragment:${id}`, children, key)
  return _jsx(id, input, props, children, key)
}
```

You can see the source at `packages/core/src/jsx-runtime.js`.

### `jsxDEV(type, props, key?, isStatic?, source?, self?)`

```js
import { jsxDEV } from "@jsxrx/core/jsx-dev-runtime"
```

This function is only used in development mode (i.e., when TypeScript's `"jsx"` is set to `"react-jsxdev"`). It provides additional debug information to make error messages and dev tools more useful.

**Parameters unique to dev mode:**

- **`isStatic`** — A boolean hint indicating whether the subtree is expected to be static. Not used internally by JsxRx, but available for tooling.
- **`source`** — An object with `fileName`, `lineNumber`, and `columnNumber` indicating exactly where in the source file the JSX element was written.
- **`self`** — Reserved for future use (passed through by the compiler).

**Key behavior — stable ID generation:**

`jsxDEV` generates a unique VDOM node ID based on the source location rather than relying on the compiler-injected hash. The `genId` helper creates IDs in the format `lineNumber:columnNumber:name`:

```js
function genId(name, { lineNumber, columnNumber }) {
  return `${lineNumber}:${columnNumber}:${name}`
}
```

For example, a `<div>` on line 15, column 8 would get the ID `15:8:div`. This ensures deterministic, human-readable IDs in development without needing the compiler transform.

**Error wrapping:**

`jsxDEV` also wraps the rendering logic in a `try/catch` block that logs detailed error information (including the source location and the tag name) before re-throwing, making debugging significantly easier:

```js
try {
  // ... rendering logic
} catch (error) {
  const cause = error instanceof Error && error.cause
  console.error(`Error encountered while rendering ${tag}`, { error, cause, source })
  throw error
}
```

You can see the source at `packages/core/src/jsx-dev-runtime.js`.

---

## 3. Fragment

A **Fragment** allows you to group multiple children without adding an extra wrapper element to the DOM. The syntax `<>...</>` in JSX compiles to `jsx(Fragment, {})`.

### Implementation

`Fragment` is a component that always returns `null`:

```js
// packages/core/src/fragment.js
export const Fragment = () => {
  return null
}
```

When `jsxs` encounters `Fragment` as the `type`, it calls `_fragment()` instead of `_jsx()`:

```js
// Inside jsxs:
if (input === Fragment) return _fragment(`fragment:${id}`, children, key)
```

The `_fragment` function creates a `RenderFragmentNode`:

```js
// packages/core/src/vdom/render.js
export function _fragment(id, children, key) {
  return new RenderFragmentNode(id, asArray(children) ?? [], key)
}
```

`RenderFragmentNode` has no tag, no props, and no corresponding DOM element. It only carries children and is transparent during rendering — the children are placed directly into the parent element without an intermediate wrapper.

### Usage

Fragments are useful when a component must return multiple top-level elements:

```jsx
function Row() {
  return (
    <>
      <td>Cell 1</td>
      <td>Cell 2</td>
    </>
  )
}
```

This compiles to:

```js
jsxs(Fragment, {}, [
  jsx("td", {}, "Cell 1"),
  jsx("td", {}, "Cell 2"),
])
```

The `RenderFragmentNode` produced here will be resolved at render time by inserting both `<td>` elements as direct children of the parent element, with no fragment wrapper in the DOM.

---

## 4. VDOM Node Types

When JSX is transpiled and the runtime functions execute, they produce **render nodes** — the internal VDOM representation that the JsxRx diffing engine works with. Each node type is a class with a `type` discriminator and a `compareTo` method used for reconciliation.

All classes are defined in `packages/core/src/vdom/render.js`.

### `RenderElementNode(id, tag, props, children, key)`

Created when the JSX tag is a string (an intrinsic HTML element like `<div>`, `<p>`, `<button>`).

```js
class RenderElementNode {
  constructor(id, tag, props, children, key) {
    this.id = id
    this.tag = tag
    this.key = key
    this.props = props ?? {}
    this.children = asArray(children) ?? []
  }
  type = VDOMType.ELEMENT
}
```

- **`id`** — A unique identifier for the node, used for reconciliation.
- **`tag`** — The HTML tag name (e.g., `"div"`, `"span"`).
- **`props`** — The element's attributes/ properties (e.g., `className`, `style`, event handlers).
- **`children`** — An array of child `ElementNode` values.
- **`key`** — Optional reconciliation key.

The `compareTo` method checks equality on `id`, `type`, `props` (via shallow comparison), and recursively compares children.

### `RenderComponentNode(id, component, props, key)`

Created when the JSX tag is a function (a component).

```js
class RenderComponentNode {
  constructor(id, component, props, key) {
    this.id = id
    this.component = component
    this.key = key
    this.props = props ?? {}
    this.name = component.displayName ?? component.name
  }
  type = VDOMType.COMPONENT
}
```

- **`component`** — The component function reference. During rendering, this function is called with an `Input` object and a component instance context.
- **`name`** — Derived from `component.displayName` or `component.name` for debugging purposes.

Unlike element nodes, component nodes do not carry children directly — children are folded into the props object (`props.children`) and resolved when the component function executes.

### `RenderFragmentNode(id, children, key)`

Created for `<>...</>` fragments. It has no `tag` or `props` — only children.

```js
class RenderFragmentNode {
  constructor(id, children, key) {
    this.id = id
    this.key = key
    this.children = asArray(children) ?? []
  }
  type = VDOMType.FRAGMENT
}
```

During rendering, the fragment's children are placed directly into the fragment's parent element — no wrapper is created.

### `RenderSuspenseNode(id, { fallback, tolerance, suspended }, children, key)`

Created for `<Suspense>` boundaries. Suspense allows parts of the UI to show a fallback while waiting for asynchronous data.

```js
class RenderSuspenseNode {
  constructor(id, { fallback, tolerance, suspended }, children, key) {
    this.id = id
    this.fallback = fallback
    this.children = children
    this.key = key
    this.tolerance = tolerance
    this.suspended = suspended
  }
  type = VDOMType.SUSPENSE
}
```

- **`fallback`** — The VDOM tree to render while suspended (i.e., the loading state).
- **`tolerance`** — A debounce time (in milliseconds) before switching to the fallback. This prevents flash-of-loading-state for fast operations.
- **`suspended`** — An observable or boolean indicating whether this boundary is currently suspended.

During rendering, the `createSuspenseNode` function (in `packages/core/src/vdom/vdom.js`) subscribes to the `suspended` signal and swaps between the fallback and children content with an optional debounce.

### `RenderRawHtmlNode(id, content, key)`

Created for raw HTML content, typically via `rawHtml()`. This node type bypasses the normal VDOM diffing and directly inserts HTML into the DOM.

```js
class RenderRawHtmlNode {
  constructor(id, content, key) {
    this.id = id
    this.content = content
    this.key = key
  }
  type = VDOMType.RAW_HTML
}
```

- **`content`** — The raw HTML string, or an observable/promise that resolves to one. During rendering, `subscribeContent` subscribes to the content and uses `renderer.createElementsFromRaw(content)` to parse and insert it.

### `ObservableNode`

Unlike the other render nodes, `ObservableNode` is **not a class** but a runtime construct created internally by `createObservableNode` (in `packages/core/src/vdom/vdom.js`) when an RxJS observable is embedded directly in JSX.

```jsx
<div>{someObservable$}</div>
```

When the VDOM encounters an observable value during node creation, it calls `createObservableNode`, which:

1. Subscribes to the observable with `switchMap`.
2. On each emission, creates a child VNode (element, text, component, etc.) that reflects the emitted value.
3. Manages placement and removal of the dynamic content as the observable emits new values.

The `ObservableNode` type is `VDOMType.OBSERVABLE`.

---

## 5. Build-Time Compiler Optimization

The JSX runtime functions rely on **stable IDs** to efficiently reconcile VDOM trees between renders. While `jsxDEV` generates IDs from source location at runtime, the production build uses a **build-time compiler** that injects deterministic IDs directly into the `jsx()`/`jsxs()` calls.

### The Compiler Package

Located at `packages/compiler/src/transform.js`, the `@jsxrx/compiler` package provides a Vite plugin that transforms the AST during production builds.

### How It Works

The `transform(ast, id)` function walks the AST using `zimmerframe` and looks for `CallExpression` nodes whose callee name is `jsx` or `jsxs`:

```js
export function transform(ast, id) {
  return walk(ast, {}, {
    CallExpression(node, { next }) {
      if (node.callee.name === "jsx" || node.callee.name === "jsxs") {
        const locationKey = generateLocationKey(node, id)
        node = next({}) ?? node
        return {
          ...node,
          arguments: [
            { type: "Literal", value: locationKey, raw: JSON.stringify(locationKey) },
            ...node.arguments,
          ],
        }
      }
      return next({})
    },
  })
}
```

For each JSX call expression found, the transform **prepends a new first argument** — a short (8-character) SHA-256 hash derived from the file identifier and the node's source position (`start` and `end` offsets):

```js
function generateLocationKey(node, id) {
  const locationString = `${id}:${node.start}:${node.end}`
  return createHash("sha256")
    .update(locationString)
    .digest("hex")
    .substring(0, 8)
}
```

### Result

Before the transform:

```js
jsx("div", { className: "foo" }, "Hello")
```

After the transform:

```js
jsx("a1b2c3d4", "div", { className: "foo" }, "Hello")
```

The ID `"a1b2c3d4"` becomes the first argument to `jsx()` — the same slot that receives the runtime-generated ID in development. This means:

- **Deterministic IDs** — The same source code always produces the same IDs, regardless of order of execution or runtime conditions.
- **Stable reconciliation** — VDOM diffing uses these IDs to match nodes across renders, avoiding unnecessary DOM mutations.
- **Production performance** — No runtime ID generation overhead; all IDs are computed once at build time.

---

## 6. VDOM Constants

The VDOM system uses two sets of constants to classify nodes and render events, defined in `packages/core/src/constants/`.

### `VDOMType`

A frozen enum that discriminates the different kinds of render nodes and intermediate values:

```js
// packages/core/src/constants/vdom.js
export const VDOMType = Object.freeze({
  TEXT: "TEXT",
  ELEMENT: "ELEMENT",
  COMPONENT: "COMPONENT",
  RAW_HTML: "RAW_HTML",
  FRAGMENT: "FRAGMENT",
  OBSERVABLE: "OBSERVABLE",
  SUSPENSE: "SUSPENSE",
  CHILDREN: "CHILDREN",
  NULL: "NULL",
})
```

| Constant | Used by |
|---|---|
| `TEXT` | Plain text values (`string`, `number`) encountered in JSX |
| `ELEMENT` | `RenderElementNode` — HTML elements |
| `COMPONENT` | `RenderComponentNode` — Component functions |
| `RAW_HTML` | `RenderRawHtmlNode` — Raw HTML content |
| `FRAGMENT` | `RenderFragmentNode` — `<>...</>` fragments |
| `OBSERVABLE` | `ObservableNode` — Embedded RxJS observables |
| `SUSPENSE` | `RenderSuspenseNode` — Suspense boundaries |
| `CHILDREN` | Internal children container used during VDOM tree construction |
| `NULL` | Null/empty nodes (no-op nodes used for `null`/`undefined` in JSX) |

These constants are used throughout the VDOM pipeline — in `createNode` (the factory function) to dispatch to the correct node constructor, and in `compareTo` methods to quickly reject mismatches during reconciliation.

### `VRenderEventType`

A frozen enum that describes the type of render event emitted during reconciliation:

```js
// packages/core/src/constants/render.js
export const VRenderEventType = Object.freeze({
  PLACE: "PLACE",
  REMOVE: "REMOVE",
  MOVE: "MOVE",
})
```

| Event | Meaning |
|---|---|
| `PLACE` | A node was inserted into the DOM |
| `REMOVE` | A node was removed from the DOM |
| `MOVE` | A node was moved to a new position within the DOM |

These events are emitted by the batch renderer (`packages/core/src/vdom/batch-renderer.js`) as part of the reconciliation process, providing a stream of DOM mutations that can be observed or logged.

---

## Summary

The JSX pipeline in JsxRx can be summarized in four stages:

1. **Configuration** — `tsconfig.json` sets `"jsx": "react-jsx"` and `"jsxImportSource": "@jsxrx/core"`, telling the compiler where to find the runtime.

2. **Transpilation** — TypeScript converts JSX into calls to `jsx()` and `jsxs()`, importing them automatically from `@jsxrx/core/jsx-runtime`.

3. **Runtime** — The `jsx`/`jsxs`/`jsxDEV` functions interpret the tag type and create the appropriate VDOM render node (`RenderElementNode`, `RenderComponentNode`, `RenderFragmentNode`, or `RenderSuspenseNode`).

4. **Optimization (optional)** — In production builds, `@jsxrx/compiler` injects deterministic SHA-256-based IDs into every `jsx()`/`jsxs()` call, enabling efficient VDOM reconciliation without runtime ID generation overhead.

The resulting VDOM tree is then processed by the JsxRx renderer, which walks the nodes, subscribes to observables, manages Suspense boundaries, and produces DOM mutations through the configured renderer adapter.
