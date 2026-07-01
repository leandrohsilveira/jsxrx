## Anti-Patterns & Common Mistakes

This section catalogs the most common mistakes when writing JsxRx code — especially React-to-JsxRx translation errors. Every anti-pattern below is a bug the agent has observed in practice. Use this as a pre-commit checklist.

---

### 1. NEVER use `filter()` for conditional rendering

`filter()` **suppresses emissions** when the predicate is `false`. When the parent observable emits and `filter()` blocks it, the last-rendered DOM elements remain in the document indefinitely — producing stale, invisible orphaned DOM. Use `map(condition ? <Element /> : null)` instead. In JsxRx, `null` or `undefined` returned from JSX means "remove this element."

```tsx
// ❌ WRONG — filter() suppresses emissions, stale DOM remains forever
{show$.pipe(
  filter(show => show),
  map(() => <div class="panel">Visible Panel</div>)
)}

// ✅ RIGHT — map() to null removes the element from DOM
{show$.pipe(
  map(show => show ? <div class="panel">Visible Panel</div> : null)
)}
```

This applies universally: never use `filter()`, `skip()`, `distinctUntilChanged()`, or any emission-suppressing operator for visibility control.

---

### 2. NEVER call `refresh()` synchronously inside a resolver

`refresh()` re-executes all resolvers on the current route tree. Calling it **inside the resolver's synchronous body** creates an infinite loop: resolver runs → calls `refresh()` → resolver runs again → calls `refresh()` → … Only call `refresh()` from **returned callbacks** or **event handlers** that fire later.

```tsx
// ❌ WRONG — refresh() called synchronously during resolver execution → infinite loop
export function EntryListResolver({ refresh }: RouteResolverInput) {
  // refresh() executes immediately here → re-runs this resolver → calls refresh() again → …
  refresh()

  return {
    entries$: entriesApi.fetch(),
  }
}

// ✅ RIGHT — refresh() returned as a callback, invoked later by user action
export function EntryListResolver({ refresh }: RouteResolverInput) {
  return {
    entries$: entriesApi.fetch(),
    onReload: () => refresh(),   // only called when user clicks "Reload"
  }
}
```

The same rule applies to `navigate()` in resolvers — wrap it in a `.subscribe()` callback or event handler, never call it at the top level of the resolver body.

---

### 3. ALWAYS create new object references for state updates

JsxRx uses reference equality to detect changes in object/array state. If you mutate in place and call `.set()` with the same reference, the framework sees no change and emits nothing. Always create a new reference via spread or immutable-return methods.

```tsx
const form$ = state({ name: "", email: "" })

// ❌ WRONG — mutates in place, then passes same reference; change undetected
form$.value.name = "Alice"
form$.set(form$.value)  // same object reference → no emission

// ❌ WRONG — mutates array in place
todos$.value.push(newTodo)
todos$.set(todos$.value)  // same array reference → no emission

// ✅ RIGHT — spread creates a new reference; change detected
form$.set({ ...form$.value, name: "Alice" })

// ✅ RIGHT — array methods that return new references
todos$.set([...todos$.value, newTodo])              // append
todos$.set(todos$.value.filter(t => t.id !== id))   // remove
todos$.set(todos$.value.map(t => t.id === id ? { ...t, done: true } : t))  // update
```

---

### 4. ALWAYS use `key` or `trackBy` in list rendering

Without `key` (or `trackBy` for `each()`), JsxRx cannot reconcile list items across emissions. DOM elements may be incorrectly reused, created, or destroyed, leading to broken state, lost focus, and incorrect event handlers. Always provide a **stable, unique** identifier for each item.

```tsx
// ❌ WRONG — no keys; DOM reconciliation breaks on re-order or insert/delete
{items$.pipe(
  map(items => items.map(item => <TodoItem todo={item} />))
)}

// ✅ RIGHT — stable, unique key on every item (simple lists)
{items$.pipe(
  map(items => items.map(item => <TodoItem key={item.id} todo={item} />))
)}

// ✅ RIGHT — trackBy with each() for optimal per-item reactivity
import { each } from "@jsxrx/core"
import { shallowComparator } from "@jsxrx/utils"

{items$.pipe(
  each(
    item$ => <TodoItem todo={item$} />,
    {
      trackBy: item => item.id,
      distinct: shallowComparator,
    },
  ),
)}
```

Use database IDs, UUIDs, or any field that is stable and unique per item. Never use array indices as keys — they change when items are inserted, removed, or reordered.

---

### 5. NEVER write `useState`, `useEffect`, `useMemo`, `useCallback`

These React hooks **do not exist** in JsxRx. Writing them will result in runtime errors (`useState is not a function`). Translate each to its JsxRx equivalent:

| React hook | JsxRx equivalent |
|---|---|
| `useState(init)` | `state(init)` — returns `{ value, set }` (an Observable) |
| `useEffect(fn, [deps])` | `subscription.add(source$.subscribe(fn))` — or RxJS `tap` |
| `useMemo(() => val, [deps])` | `source$.pipe(map(...))` — auto-shared, auto-cached |
| `useCallback(fn, [deps])` | Stable by default — component runs once, functions never re-create |

```tsx
// ❌ WRONG — React hooks don't exist in JsxRx
import { useState, useEffect, useMemo, useCallback } from "react"

function Counter() {
  const [count, setCount] = useState(0)             // 💥 runtime error
  const doubled = useMemo(() => count * 2, [count]) // 💥 runtime error
  useEffect(() => { console.log(count) }, [count])   // 💥 runtime error
}

// ✅ RIGHT — JsxRx native equivalents
import { state } from "@jsxrx/core"
import { map } from "rxjs"

function Counter() {
  const count$ = state(0)
  const doubled$ = count$.pipe(map(c => c * 2))

  // Components run once — function references are stable automatically
  function increment() { count$.set(count$.value + 1) }

  return <p>{count$} / doubled: {doubled$}</p>
}
```

---

### 6. ALWAYS add manual subscriptions to `subscription.add()`

When you call `.subscribe()` directly in a component, the subscription lives on after the component unmounts — causing **memory leaks** and potentially updating unmounted DOM nodes. The component's `Lifecycle` provides a `subscription` object: add every manual `.subscribe()` call to it for automatic cleanup on unmount.

```tsx
// ❌ WRONG — subscription leaks; continues after component unmounts
function Clock(props$: Observable<{}>) {
  // This interval runs forever even after Clock is removed from DOM
  interval(1000).subscribe(tick => console.log(tick))
  return <p>Clock</p>
}

// ✅ RIGHT — subscription.add() ensures cleanup on unmount
import type { Observable, Lifecycle } from "@jsxrx/core"

function Clock(props$: Observable<{}>, { subscription }: Lifecycle) {
  subscription.add(
    interval(1000).subscribe(tick => console.log(tick))
  )
  return <p>Clock</p>
}
```

**What is auto-cleaned (no manual `subscription.add()` needed):**
- Observable bindings in JSX: `{count$}`, `{items$.pipe(map(...))}`
- Props destructured via `Props.take()`
- `fromRefEvent()` subscriptions (if used inside JSX bindings)

**What requires manual `subscription.add()`:**
- Any explicit `.subscribe()` call
- Timer-based operations (`setInterval`, `setTimeout`)
- Direct `fromEvent()` subscriptions
- Imperative cleanup callbacks

---

### 7. NEVER create JSX `<Context.Provider>` elements

JsxRx Context is **imperative** — set via `context.set(key, value$)` in the component's `Lifecycle` or route resolvers. There are **no** JSX provider components. `<Context.Provider>` is a React pattern that does not exist in JsxRx.

```tsx
// ❌ WRONG — React-style JSX provider; does not exist in JsxRx
<AuthContext.Provider value={auth$}>
  <UserProfile />
</AuthContext.Provider>

// ✅ RIGHT — imperative context.set() in Lifecycle
import type { Observable, Lifecycle } from "@jsxrx/core"
import { AuthContext } from "./contexts/auth"

function AuthProvider(
  props$: Observable<{}>,
  { context, subscription }: Lifecycle,
) {
  const { children$ } = Props.take(props$)
  const authState$ = state({ user: null, loading: true })

  // Set context imperatively — all descendant components can now consume it
  context.set(AuthContext, authState$)

  return <>{children$}</>
}
```

Consumers read context from their own `Lifecycle`:
```tsx
function UserProfile(props$: Observable<{}>, { context }: Lifecycle) {
  const auth$ = context.require(AuthContext)  // Observable<T>
  return <p>{auth$.pipe(map(a => a.user?.name ?? "Guest"))}</p>
}
```

---

### 8. DO NOT use `props.children` — always use `children$`

In JsxRx, `children$` is **always an Observable**, even when static JSX children are passed. This is a critical difference from React where `children` is whatever the parent passes. Never access `props.children` — destructure `children$` via `Props.take()`.

```tsx
// ❌ WRONG — props.children is not an Observable; children$ is the correct prop
function Card(props$: Observable<CardProps>) {
  // Trying to access children as a static value — won't work with dynamic children
  const staticChildren = props.children  // undefined or wrong type
  return <div>{staticChildren}</div>
}

// ✅ RIGHT — children$ is always an Observable<ElementNode>
function Card(props$: Observable<CardProps>) {
  const { title$, children$ } = Props.take(props$)
  return (
    <div>
      <h3>{title$}</h3>
      <div>{children$}</div>  {/* children$ is Observable → auto-updates */}
    </div>
  )
}
```

Use `PropsWithChildren<T>` for your props type:
```tsx
import type { PropsWithChildren } from "@jsxrx/core"

type CardProps = PropsWithChildren<{ title: string }>

function Card(props$: Observable<CardProps>) {
  const { title$, children$ } = Props.take(props$)
  // ...
}
```

---

### 9. DO NOT manually manage subscriptions for JSX-embedded observables

Observables embedded directly in JSX (`{count$}`, `{items$.pipe(map(...))}`) are **automatically subscribed and unsubscribed** by the JsxRx renderer. You do not need — and should not attempt — to manually clean them up. Only explicit `.subscribe()` calls need cleanup via `subscription.add()`.

```tsx
// ❌ WRONG — trying to manually clean up JSX-bindings; unnecessary and broken
function Greeting(props$: Observable<{}>, { subscription }: Lifecycle) {
  const name$ = state("Alice")
  // This is wrong — JSX bindings are auto-managed!
  subscription.add(name$ as any)
  return <p>Hello, {name$}</p>
}

// ✅ RIGHT — JSX bindings auto-managed; only manual .subscribe() needs cleanup
function DocumentTitle(
  props$: Observable<{}>,
  { subscription }: Lifecycle,
) {
  const name$ = state("Alice")

  // JSX binding — auto-managed, no cleanup needed
  //               ↓
  //     <p>Hello, {name$}</p>

  // Manual subscription for side effect — needs cleanup
  subscription.add(
    name$.subscribe(name => { document.title = name })  // ✅ needs cleanup
  )

  return <p>Hello, {name$}</p>
}
```

---

### 10. ALWAYS use `emitter()` for callback props that change over time

Callback props (e.g., `onSubmit`, `onChange`) may change over the component's lifetime as different parent views or resolvers pass different handlers. Using a direct handler captures the **first** callback value permanently and never calls newer ones. `emitter()` decouples event timing from callback identity — it always calls the **latest** function when `.emit()` is invoked.

```tsx
// ❌ WRONG — captures the initial callback; never calls updated callbacks
function LoginForm(props$: Observable<{ onSubmit: (data: Credentials) => void }>) {
  const { onSubmit } = Props.take(props$)  // gets initial value, stale forever

  function handleSubmit(e: Event) {
    e.preventDefault()
    // onSubmit is the *first* function passed, not the current one
    onSubmit({ email: email$.value, password: password$.value })
  }
  return <form onSubmit={handleSubmit}>...</form>
}

// ✅ RIGHT — emitter() always resolves the latest callback at invocation time
import { emitter } from "@jsxrx/core"

function LoginForm(props$: Observable<{ onSubmit: (data: Credentials) => void }>) {
  const { onSubmit$ } = Props.take(props$)
  const submitEmitter = emitter(onSubmit$)

  function handleSubmit(e: Event) {
    e.preventDefault()
    submitEmitter.emit({ email: email$.value, password: password$.value })  // always latest
  }
  return <form onSubmit={handleSubmit}>...</form>
}
```

Use direct handlers (`onClick={fn}`) only for **self-contained events** where the handler is defined inside the component and never needs to change.

---

### 11. NEVER mutate state directly — always use `.set()`

`state$` wraps an RxJS `BehaviorSubject`. Reading `state$.value` returns the current snapshot, but **mutating properties on the returned value does nothing** — the underlying subject is not notified. Only `.set()` pushes a new value through the stream.

```tsx
const count$ = state(0)

// ❌ WRONG — directly mutating the value; no emission, nothing updates
count$.value = 5          // silently does nothing — .value is a getter
count$.value++            // silently does nothing

// ❌ WRONG — mutating nested fields of object state
const form$ = state({ name: "", email: "" })
form$.value.name = "Alice"  // mutates the local copy; no emission

// ✅ RIGHT — always call .set() to push a new value through the stream
count$.set(5)
count$.set(count$.value + 1)
form$.set({ ...form$.value, name: "Alice" })
```

---

### 12. DO NOT write `[dep1, dep2]` dependency arrays

JsxRx has **no dependency arrays** — RxJS automatically tracks which source observables feed into a derivation. Writing `[dep1, dep2]` is a React habit that has no meaning in JsxRx. Every React construct that needs dependency arrays (`useMemo`, `useEffect`, `useCallback`) is replaced by RxJS operators that track dependencies implicitly.

```tsx
// ❌ WRONG — dependency arrays don't exist; this is React syntax
const doubled = useMemo(() => count * 2, [count])        // 💥 not a thing
useEffect(() => { fetchData(id) }, [id])                  // 💥 not a thing
const handler = useCallback(() => { doThing() }, [dep])   // 💥 not a thing

// ❌ WRONG — same instinct, wrong syntax for JsxRx
// Don't try to invent JsxRx equivalents of dependency arrays. They don't exist.

// ✅ RIGHT — RxJS tracks the observable graph automatically
const doubled$ = count$.pipe(map(c => c * 2))            // auto-tracks count$

// ✅ RIGHT — subscriptions react to every emission, no dependency declaration needed
subscription.add(
  id$.subscribe(id => fetchData(id))                      // runs whenever id$ emits
)

// ✅ RIGHT — functions are stable by default (component runs once); no useCallback needed
function handleClick() { count$.set(count$.value + 1) }
```

---

### 13. ALWAYS use `Props.take()` with TypeScript types

`Props.take()` is a generic function. Without a type argument, the destructured props lose all type information — they become `Observable<any>`. Always pass the props type explicitly for type safety.

```tsx
type UserCardProps = {
  name: string
  email: string
  avatar?: string
}

// ❌ WRONG — no type argument; prop$ streams are untyped Observable<any>
function UserCard(props$: Observable<UserCardProps>) {
  const { name$, email$, avatar$ } = Props.take(props$)  // all any
  // no autocomplete, no type checking on usage
}

// ✅ RIGHT — type argument gives full type inference on each destructured prop$
function UserCard(props$: Observable<UserCardProps>) {
  const { name$, email$, avatar$ } = Props.take<UserCardProps>(props$, {
    avatar: "/default.png",  // default for optional prop
  })
  // name$: Observable<string>, email$: Observable<string>, avatar$: Observable<string>
}
```

---

### 14. DO NOT mix React and JsxRx imports

React and JsxRx are **mutually exclusive** UI frameworks. Importing from `"react"` in a JsxRx project causes confusion, broken type inference, and runtime errors. A JsxRx project should have **zero** React imports.

```tsx
// ❌ WRONG — mixing React and JsxRx imports
import React from "react"              // ❌ remove this
import { useState } from "react"       // ❌ remove this
import type { FC } from "react"        // ❌ remove this
import { state } from "@jsxrx/core"    // ✅ keep this

// ❌ WRONG — React type annotations
const App: React.FC = () => { ... }    // ❌ JsxRx components are plain functions

// ✅ RIGHT — JsxRx-only imports
import { state, Props } from "@jsxrx/core"
import type { Observable } from "rxjs"
import type { Lifecycle } from "@jsxrx/core"

// ✅ RIGHT — JsxRx components are plain functions, no type annotation needed
function App() {
  return <div>Hello, JsxRx</div>
}
```

Common React imports to **remove** from any JsxRx file:
- `"react"`, `"react-dom"`, `"react-dom/client"`
- `"react/jsx-runtime"`, `"react/jsx-dev-runtime"`
- `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`
- `React.FC`, `React.ReactNode`, `React.CSSProperties` (use `ElementNode` and plain types)
- `createContext`, `createElement`, `memo`, `forwardRef`
