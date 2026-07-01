---
name: jsxrx-developer
description: >
  Guidance for building frontend web apps with JsxRx — components run ONCE,
  RxJS observables drive surgical DOM updates. No hooks, no re-renders, no
  virtual DOM diffing. Use when creating, modifying, or debugging JsxRx apps.
license: MIT
compatibility: opencode
metadata:
  framework: jsxrx
  language: typescript
  reactivity: rxjs-observables
  paradigm: component-driven
---

## Mental Model

JsxRx is a **component-driven UI library** — JSX for templating, RxJS Observables
for reactivity. Components run **ONCE**, observables own the values, and JsxRx
owns the DOM (surgical updates, no VDOM diffing).

| | React | JsxRx |
|---|---|---|
| **Component** | Re-executes on every state change | Runs **ONCE** at mount |
| **State** | `useState` → re-render | `state()` → Observable, `.value` / `.set()` |
| **Derived** | `useMemo(() => …, [deps])` | `source$.pipe(map(…))` — auto-tracked |
| **Callbacks** | `useCallback` needed | Stable by default (component runs once) |
| **Side effects** | `useEffect` | RxJS operators or `.subscribe()` |
| **DOM updates** | VDOM diff on every tick | Only subscribed DOM nodes update |

Every Observable variable uses a `$` suffix: `count$`, `name$`, `items$`.
Props via `Props.take()` are auto-suffixed (e.g. prop `name` → `name$`).

## Quick Start

```bash
npm install @jsxrx/core rxjs
npm install -D @jsxrx/vite-plugin vite typescript
```

**vite.config.ts:**
```ts
import { defineConfig } from "vite"
import { jsxRX } from "@jsxrx/vite-plugin"
export default defineConfig({ plugins: [jsxRX()] })
```

**tsconfig.json:**
```json
{ "compilerOptions": { "jsx": "react-jsx", "jsxImportSource": "@jsxrx/core", "module": "ESNext", "moduleResolution": "bundler", "strict": true } }
```

**index.html:** `<div root></div>` + `<script type="module" src="./src/main.tsx"></script>`

**src/main.tsx:**
```tsx
import { createRoot } from "@jsxrx/core/dom"
createRoot(document.querySelector("[root]")).mount(<App />)
```

**src/App.tsx:**
```tsx
import { state } from "@jsxrx/core"
import { map } from "rxjs"

export function App() {
  const count$ = state(0)
  return (
    <div>
      <p>Count: {count$}</p>
      <p>Double: {count$.pipe(map(c => c * 2))}</p>
      <button onClick={() => count$.set(count$.value + 1)}>+</button>
    </div>
  )
}
```

## Core Patterns

### `state()`

```tsx
import { state } from "@jsxrx/core"
const count$ = state(0)
count$.value       // synchronous read — always current snapshot
count$.set(5)      // push new value — emits to all subscribers
```

Derive: `const doubled$ = count$.pipe(map(c => c * 2))` — auto-shared, auto-cached.

**Immutable updates for objects/arrays** (reference equality check):
```tsx
// ✅ new reference
form$.set({ ...form$.value, name: "Alice" })
todos$.set([...todos$.value, newTodo])
// ❌ mutation — same reference, no emission
form$.value.name = "Alice"; form$.set(form$.value)
```

### `Props.take()` / `Props.spread()`

```tsx
import { Props } from "@jsxrx/core"

function Button(props$: Observable<{ label: string, variant?: string }>) {
  const { label$, variant$ } = Props.take(props$, { variant: "primary" })
  return <button className={variant$}>{label$}</button>
}
```

| Method | Use when |
|---|---|
| `Props.take(props$, defaults?)` | Need individual `propName$` observables per prop |
| `Props.spread(props$)` | Forward all props to child element/component |
| Both | Extract known props, forward rest |

`children$` is **always** an `Observable<ElementNode>`, even with static children.
Use `PropsWithChildren<T>` for the type.

Props accept static values, `Observable<T>`, or `Ref<T>` — JsxRx normalizes to `Observable<T>`.

### Event Handling

```
Is the handler a callback prop that can change over time?
  ├── Yes → emitter(callback$)        // always calls latest function
  └── No  → Is it a DOM event that needs RxJS composition?
            ├── Yes → fromRefEvent(ref, name)    // from "@jsxrx/core/dom"
            └── No  → Direct handler onClick={fn} // stable, no useCallback needed
```

```tsx
// 1. Direct handler — self-contained, never changes
<button onClick={() => count$.set(count$.value + 1)}>+</button>

// 2. emitter() — callback prop that may change over time
import { emitter } from "@jsxrx/core"
const { onSubmit$ } = Props.take(props$)
const submit = emitter(onSubmit$)
submit.emit(data)  // always calls latest onSubmit function

// 3. fromRefEvent() — DOM event as observable stream
import { fromRefEvent } from "@jsxrx/core/dom"
const click$ = fromRefEvent(buttonRef, "click")
const hover$ = fromRefEvent(elRef, "mouseenter", enabled$)  // conditional
```

### Context — Imperative, No JSX Providers

```tsx
import { Context } from "@jsxrx/core"
export const ThemeCtx = new Context("theme", "light")

// Provide (in component lifecycle or route resolver):
context.set(ThemeCtx, theme$)           // value must be Observable<T>

// Consume:
const theme$ = context.require(ThemeCtx)    // throws if not set
const theme$ = context.optional(ThemeCtx)   // uses initialValue fallback
```

**NEVER** use `<ThemeCtx.Provider>` — it does not exist in JsxRx.

### Subscription Cleanup

**Every manual `.subscribe()` must be added to `subscription.add()`:**
```tsx
function Clock(props$: Observable<{}>, { subscription }: Lifecycle) {
  subscription.add(
    interval(1000).subscribe(tick => console.log(tick))
  )
}
```

**Auto-cleaned (no manual add needed):** JSX bindings `{count$}`, `Props.take()`,
`fromRefEvent()` used inside JSX.

### Lists

Use `each()` for lists from observable arrays — it preserves component instances and prevents full re-mapping on every emission:

```tsx
import { each } from "@jsxrx/core"
import { shallowComparator } from "@jsxrx/utils"

{items$.pipe(
  each(
    item$ => <TodoItem todo={item$} />,
    {
      trackBy: item => item.id,
      distinct: shallowComparator,
      whenEmpty: <p className="empty">No items</p>,
    },
  ),
)}
```

Each item gets its own `Observable<T>` via `item$` — the `trackBy` function identifies items so existing components update in place. The `distinct` option (using `shallowComparator`) skips updates when item references haven't changed. The `whenEmpty` value renders when the source array is empty.

For simple static lists, the `map` pattern still works:
```tsx
{items$.pipe(map(items => items.map(item => <TodoItem key={item.id} todo={item} />)))}
```

Always provide a stable, unique `trackBy` key when using `each()` (or `key` when using `map`).

### Conditional Rendering

**ALWAYS use `map()`, NEVER `filter()`:**
```tsx
// ✅ map() to null removes element from DOM
{show$.pipe(map(show => show ? <Panel /> : null))}
// ❌ filter() suppresses emissions — stale DOM remains forever
{show$.pipe(filter(show => show), map(() => <Panel />))}
```

## Routing at a Glance

```tsx
import { defineRoutes, route, params } from "@jsxrx/router"
import { BrowserRouter } from "@jsxrx/router/browser"

const routes = defineRoutes({
  "/": route("home", HomePage, { resolve: HomeResolver }),
  "/users/:id": route("user", UserPage, {
    params: { path: params("id") },
    resolve: UserResolver,
  }),
})

<BrowserRouter routes={routes} />
```

**Resolvers** run before the component mounts — fetch data, provision context, return props.
Co-located pattern: named export for resolver, default export for component, same file.

Key resolver APIs: `context.set/require/optional`, `navigate(to, opts?)`, `refresh()`.
Wrap route trees in `<Suspense>` for lazy loading fallback.

## API Client at a Glance

```tsx
import { createHttpClient, jsonResponseBody, jsonRequestBody } from "@jsxrx/api"

const client = createHttpClient({ baseUrl: "/api" })
const endpoint = client.createEndpoint<Input, Req, Res, Output>({ method, path, ... })

endpoint.fetch(input$)   // Observable<Output> — reactive query, auto-cancels on re-emit, has .pending$
endpoint.action()        // Action<Input, Output> — imperative mutation (perform, reset)
endpoint.send(input)     // Promise<Output> — one-off call
```

## Critical Anti-Patterns

| # | Rule |
|---|---|
| 1 | **Never `filter()` for visibility.** Use `map(cond ? <X/> : null)`. |
| 2 | **Never React hooks.** No `useState`, `useEffect`, `useMemo`, `useCallback`. |
| 3 | **Never mutate in place.** Always create new object/array references for `state().set()`. |
| 4 | **Never `<Context.Provider>`.** Context is imperative: `context.set()` / `context.require()`. |
| 5 | **Always `subscription.add()`** for every manual `.subscribe()` call. |
| 6 | **Always `emitter()`** for callback props that can change over time. |
| 7 | **Always `key`/`trackBy`** on list items — stable, unique, never array index. |
| 8 | **Never `refresh()` synchronously** in resolver body — infinite loop. Return it as callback. |
| 9 | **Never import from `"react"`.** JsxRx and React are mutually exclusive. |
| 10 | **Never dependency arrays.** RxJS tracks observable dependencies automatically. |

## References

Detailed guides for specific topics. Read these when you need depth — for
example, when implementing a complex resolver, setting up Suspense boundaries,
or writing tests.

| File | Read when... |
|---|---|
| `references/api-quick-ref.md` | You need the full signature/import for any core API (`state`, `combine`, `classes`, `variants`, `defer`, etc.) |
| `references/anti-patterns.md` | You want detailed wrong/right code examples for the 14 most common mistakes |
| `references/routing.md` | You need resolver patterns, layout routes, typed params, auth guards, or `navigate()` options |
| `references/lazy-loading.md` | You need `lazy()`, `lazyResolver()`, co-located lazy routes, module scope rules, or Suspense `tolerance` |
| `references/api-client.md` | You need `createEndpoint` configuration, body parsers, `fetch` vs `action`, or error handling |
| `references/testing.md` | You're writing tests and need `render`, `act`, `wait`, or Suspense testing patterns |
| `references/context.md` | You need the reload pattern, ThemeProvider example, or `context.set/require/optional` details |
| `references/suspense.md` | You need `toActivityAware`, `activity()`, `pending()`, manual suspension, or nested Suspense |
| `references/events.md` | You need the decision flow for event handling, `fromRefEvent` click-outside/scroll examples |
| `references/lifecycle.md` | You need the full `Lifecycle` type, `mounted$`/`unmounted$`, or destructuring patterns |
| `https://leandrohsilveira.github.io/jsxrx/` | Anything not covered above — use as fallback. Do not guess signatures or behaviors. |
