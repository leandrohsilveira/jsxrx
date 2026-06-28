# Components Internals

This document covers internal implementation details of JsxRx's component system — how props are received, coerced, and how the lifecycle is managed. It is intended for developers who want to contribute to JsxRx or understand its internals. Reading this is not necessary for using JsxRx in applications.

For the user-facing guides, see [Components & State](../guide/02-components-and-state.md) and [Properties Intake](../guide/04-props.md).

---

## Table of Contents

1. [The `Input` Class and `props$` Creation](#1-the-input-class-and-props-creation)
2. [`Props.take()` — Proxy Internals](#2-propstake--proxy-internals)
3. [`Props.spread()` — Internals](#3-propsspread--internals)
4. [Prop Coercion Internals](#4-prop-coercion-internals)
5. [Lifecycle Creation Details](#5-lifecycle-creation-details)
6. [Component Return Types](#6-component-return-types)
7. [Component Type Signature (`Component<P>`)](#7-component-type-signature-componentp)
8. [How Props Flow Under the Hood](#8-how-props-flow-under-the-hood)
9. [Source Files Referenced](#9-source-files-referenced)

---

## 1. The `Input` Class and `props$` Creation

Under the hood, the `props$` parameter is an instance of the `Input` class, which extends `ObservableDelegate` (itself extending RxJS's `Observable`). `Input` is the gateway through which all prop access flows:

```js
// packages/core/src/observable.js — line 140
export class Input extends ObservableDelegate { ... }
```

When a component is mounted, `createComponentNode` (in `packages/core/src/vdom/vdom.js`, line 841) instantiates an `Input` with the initial props:

```js
// Inside createComponentNode():
const props$ = new BehaviorSubject(node.props)
const input = new Input(props$, instance)

// The component function is called ONCE:
const render = node.component(input, {
  context: instance.context,
  subscription,
  mounted$: mounted$.asObservable(),
  unmounted$: mounted$.pipe(map(mounted => !mounted)),
})
```

When a parent re-renders with new props, the component node's `update()` method pushes new props into the underlying `BehaviorSubject` — **without re-calling the component function**:

```js
// Inside createComponentNode.update():
props$.next(nextNode.props)
```

Any observable derived from `props$` (via `Props.take()` or `Props.spread()`) automatically emits the new values, triggering DOM updates only where those observables are embedded in JSX.

---

## 2. `Props.take()` — Proxy Internals

### What `Props.take()` Does

1. **Creates a Proxy** — `Props.take()` calls `input$.take(defaultProps)` on the `Input` instance, which invokes the private `#take()` method (line 251 of `observable.js`). This returns a Proxy object.

2. **Each property access creates an Observable** — When you access `name$` on the Proxy, the `get` trap creates a derived Observable that:
   - Subscribes to the raw `props$` stream
   - Extracts the value for the `name` key (stripping the `$` suffix)
   - Flattens nested Observables (if `props.name` itself is an Observable, its values are unwrapped)
   - Fills in missing values with the corresponding default
   - Is `distinctUntilChanged()` — only emits when the value actually changes

3. **The `$` suffix** — The Proxy appends `$` to each property name when using `"suffix"` naming strategy (the default for `Props.take()`). This makes it immediately clear that each destructured variable is an Observable.

### Type System

The types for `Props.take()` are defined in `packages/core/src/jsx.d.ts`:

```ts
export type InputTake<P> = {
  [K in keyof P as `${K}$`]-?: P[K] extends Observable<infer V>
    ? Observable<V>
    : Observable<P[K]>
}
```

This mapped type:
- Appends `$` to every key (`name` → `name$`)
- Flattens `Observable<T>` values to `Observable<T>` (already an observable, stays observable)
- Wraps plain `T` values in `Observable<T>` (coerces to observable)
- Makes all keys required (the `-?`), because defaults are provided

### Default Values

The second argument to `Props.take()` provides default values for optional props:

```tsx
type ButtonProps = {
  label: string
  variant?: "primary" | "secondary"
  disabled?: boolean
}

function Button(props$: Observable<ButtonProps>) {
  const { label$, variant$, disabled$ } = Props.take(props$, {
    variant: "primary",
    disabled: false,
  })

  // variant$ is Observable<"primary" | "secondary">
  // It emits "primary" when no variant prop is passed
  // disabled$ is Observable<boolean>, defaults to false
  return (
    <button className={variant$} disabled={disabled$}>
      {label$}
    </button>
  )
}
```

Default values fill in when:
- The prop is not present in the props object at all (`undefined`)
- The prop is explicitly `undefined`

### Why the Proxy?

The Proxy pattern allows **lazy evaluation**. An Observable for a particular prop is only created when you access that prop on the Proxy. If you never access `age$`, no subscription to `age` is ever created. This reduces unnecessary work and avoids creating Observables for props the component doesn't care about.

The Proxy also makes the API feel natural — it looks like destructuring a plain object, but each value is actually a reactive stream:

```tsx
// Looks like plain destructuring...
const { name$, age$ } = Props.take(props$)

// ...but each is an Observable
name$.subscribe(console.log) // logs each name change
```

---

## 3. `Props.spread()` — Internals

### How `spread()` Works Internally

`Props.spread()` calls `input$.spread(defaultProps)` on the `Input` instance (line 203 of `observable.js`):

```js
spread(defaultProps) {
  return this.#props$.pipe(
    map(props => Object.keys(props)),          // get keys
    debounceTime(1),                            // coalesce rapid updates
    distinctUntilChanged(shallowComparator),    // only emit when keys change
    map(keys => this.#take(keys, "plain", defaultProps)), // build Proxy with "plain" naming
  )
}
```

Key differences from `Props.take()`:
- Uses `"plain"` naming strategy (keys without `$` suffix)
- Wraps in an Observable so you can use `.pipe()` and RxJS operators
- The set of keys is dynamic — if a parent starts passing new props, `spread()` emits a new Proxy with the updated keys
- Only re-emits when the **set of prop keys** changes, not on every prop value change (the individual Observables inside the spread object handle value changes)

### Type System

```ts
export type InputSpread<P> = {
  [K in keyof P]-?: P[K] extends Observable<infer V>
    ? Observable<V>
    : Observable<P[K]>
}
```

This is similar to `InputTake`, but keys are not renamed with `$` — the result is an object where each property is the Observable, not the raw value.

---

## 4. Prop Coercion Internals

### How Coercion Works

When the `Input` constructor receives a props object (line 158 of `observable.js`), it flattens each prop value:

```js
Object.entries(props).map(([key, value]) => {
  if (isObservable(value)) return [key, value]    // already an Observable — keep it
  return [key, of(value)]                          // plain value — wrap in Observable
})
```

Then in `#take()` (line 251), when building the Proxy for individual prop access, it handles three cases:

```js
// packages/core/src/observable.js — line 262
switchMap(props => {
  const value = props[name]
  if (isRef(value)) return of(value)                    // Ref — pass through as-is
  if (isObservable(value))
    return attach(value.pipe(map(value => value ?? defValue)))  // Observable — flatten
  return of(value ?? defValue)                           // Plain value — wrap with default
})
```

This means you can freely mix static and observable props:

```tsx
const isActive$ = state(true)

// Some props are static, some are reactive
<Button
  label="Save"
  variant="primary"
  disabled={isActive$.pipe(map(active => !active))}
/>
```

### Ref Props

Props of type `Ref<T>` (created with `ref()`) are handled specially — they are passed through as-is without flattening, because the `Ref` object itself (with its `current` BehaviorSubject) is what the downstream code needs:

```tsx
import { ref } from "@jsxrx/core"

function Input(props$: Observable<{ inputRef: Ref<HTMLInputElement> }>) {
  const { inputRef$ } = Props.take(props$)
  // inputRef$ is Observable<Ref<HTMLInputElement>> — not Observable<HTMLInputElement>
  return <input ref={inputRef$} />
}

function Parent() {
  const inputRef = ref(HTMLInputElement)
  // Later: inputRef.current.value gives access to the DOM element
  return <Input inputRef={inputRef} />
}
```

---

## 5. Lifecycle Creation Details

### How the Lifecycle Is Created

In `createComponentNode` (line 841 of `vdom.js`), the lifecycle is assembled and passed to the component:

```js
const mounted$ = new BehaviorSubject(false)
const subscription = new Subscription()

// Component is called ONCE with both parameters
const render = node.component(input, {
  context: instance.context,
  subscription,
  mounted$: mounted$.asObservable(),
  unmounted$: mounted$.pipe(map(mounted => !mounted)),
})
```

### The `Lifecycle` Type

```ts
// packages/core/src/jsx.d.ts — line 137
export interface Lifecycle {
  context: IContextMap       // Context scope for this component
  subscription: Subscription // Auto-cleanup on unmount
  mounted$: Observable<boolean>   // Emits true when mounted
  unmounted$: Observable<boolean> // Emits true just before unmount
}
```

- `mounted$` emits `true` when the component is mounted
- `unmounted$` emits `true` just before the component is unmounted

### `context` — Context API Access

The `context` object provides access to JsxRx's Context API:

```ts
export interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
}
```

This is how components read from and write to context providers.

---

## 6. Component Return Types

A JsxRx component can return several types of values. The return type is defined as `ElementNode`:

```ts
// packages/core/src/jsx.d.ts — line 231
export type ElementNode =
  | Observable<ElementNode>    // Observable of JSX
  | IRenderNode                // Any VDOM render node
  | IRenderText                // string | number | bigint | boolean
  | ElementNode[]              // Array of children (must use key)
  | null
  | undefined
```

### 1. JSX Elements (Most Common)

Returning JSX elements directly — this is the typical pattern:

```tsx
function StaticGreeting() {
  return <h1>Hello, World!</h1>
}

function ReactiveGreeting(props$: Observable<{ name: string }>) {
  const { name$ } = Props.take(props$)
  return <h1>Hello, {name$}!</h1>
}
```

### 2. `Observable<ElementNode>` — Dynamic JSX

Returning an Observable of JSX allows the entire component output to change dynamically:

```tsx
function ConditionalView(props$: Observable<{ mode: "edit" | "view" }>) {
  const { mode$ } = Props.take(props$)

  // Return an Observable that maps the mode to different JSX trees
  return mode$.pipe(
    map(mode => {
      if (mode === "edit") return <EditForm />
      return <ViewDisplay />
    })
  )
}
```

When `mode$` emits, the entire component subtree is reconciled — the old VDOM is unmounted and the new one is mounted.

### 3. Dynamic Component Selection

You can return an Observable that selects a component function:

```tsx
import { lazy } from "@jsxrx/core"

function DynamicPage(props$: Observable<{ page: string }>) {
  const { page$ } = Props.take(props$)

  return page$.pipe(
    map(page => {
      const Component = lazy(() => import(`./pages/${page}.jsx`))
      return <Component />
    })
  )
}
```

### 4. `null` or `undefined` — Render Nothing

Returning `null` or `undefined` renders nothing:

```tsx
function MaybeVisible(props$: Observable<{ visible: boolean }>) {
  const { visible$ } = Props.take(props$)

  return visible$.pipe(
    map(visible => visible ? <div>I'm visible!</div> : null)
  )
}
```

### 5. Arrays — Multiple Elements

Returning an array of elements requires each element to have a `key` prop:

```tsx
function ListItems(props$: Observable<{ items: string[] }>) {
  const { items$ } = Props.take(props$)

  return items$.pipe(
    map(items =>
      items.map((item, i) => <li key={item}>{item}</li>)
    )
  )
}
```

Without `key`, JsxRx cannot efficiently reconcile the children list when items are added, removed, or reordered.

---

## 7. Component Type Signature (`Component<P>`)

The formal type signature for a JsxRx component is:

```ts
// packages/core/src/jsx.d.ts — line 144
export interface Component<P> {
  (props: Observable<P>, lifecycle: Lifecycle): ElementNode
  displayName?: string
}
```

### Usage with TypeScript

There are two common ways to type your components:

**Option 1: Typing the props parameter directly**

```tsx
import type { Observable } from "rxjs"
import type { Lifecycle } from "@jsxrx/core"

function Greeting(
  props$: Observable<{ name: string }>,
  lifecycle: Lifecycle
) {
  const { name$ } = Props.take(props$)
  return <h1>Hello, {name$}!</h1>
}
```

**Option 2: Using the `Component<P>` type**

```tsx
import type { Component } from "@jsxrx/core"

type GreetingProps = { name: string }

const Greeting: Component<GreetingProps> = (props$, lifecycle) => {
  const { name$ } = Props.take(props$)
  return <h1>Hello, {name$}!</h1>
}
```

**Option 3: Omitting the lifecycle parameter (when unused)**

Most components don't use the lifecycle parameter. TypeScript allows omitting unused parameters:

```tsx
function SimpleGreeting(props$: Observable<{ name: string }>) {
  const { name$ } = Props.take(props$)
  return <h1>Hello, {name$}!</h1>
}
```

### JSX Usage

Components are used in JSX exactly as you'd expect:

```tsx
<Greeting name="Alice" />
```

The JSX compiler transforms this into:

```js
jsx(Greeting, { name: "Alice" })
```

The runtime creates a `RenderComponentNode`, and the renderer calls `Greeting(input, lifecycle)` where `input` is an `Input` instance wrapping `{ name: "Alice" }`.

---

## 8. How Props Flow Under the Hood

### Step-by-Step Flow

```text
1. Parent JSX: <Greeting name={nameSource$} />

2. VDOM: RenderComponentNode is created with props = { name: nameSource$ }

3. createComponentNode (vdom.js:841):
   - Creates BehaviorSubject(props$)
   - Creates Input instance wrapping props$
   - Calls Greeting(input, lifecycle) — ONCE

4. Inside Greeting:
   const { name$ } = Props.take(props$)
   - Props.take() calls input$.take()
   - #take() returns a Proxy
   - Accessing name$ creates a derived Observable that:
     a. Subscribes to props$
     b. Extracts props.name (which is nameSource$)
     c. Since nameSource$ is already an Observable, flattens it
     d. Applies distinctUntilChanged()

5. JSX: <h1>Hello, {name$}!</h1>
   - {name$} creates an observableNode in the VDOM
   - observableNode subscribes to name$
   - Each emission updates the text node in the DOM

6. Parent updates: nameSource$ emits "Bob"
   → props$.next({ name: nameSource$ })  (component function NOT called)
   → Input flattens the new props
   → name$ emits "Bob"
   → observableNode updates the text node
```

### Props with Observable Values

When a prop value itself is an Observable:

```tsx
<Greeting name={someObservable$} />
```

The `Input` constructor (line 158 of `observable.js`) detects this and keeps it as an Observable. The `#take()` method (line 262) then flattens it — when `someObservable$` emits, `name$` emits the unwrapped value.

### Props with Static Values

When a prop is a plain value:

```tsx
<Greeting name="Alice" />
```

The `Input` constructor wraps it with `of("Alice")`, creating an Observable that emits `"Alice"` once. The `#take()` method extracts this value as an Observable that emits `"Alice"`. If the parent later passes a different static value (e.g., `"Bob"`), the underlying `BehaviorSubject` emits the new props, and `name$` emits `"Bob"`.

---

## 9. Source Files Referenced

| Concept | Source File |
|---|---|
| `Props` class (`take`, `spread`) | [`packages/core/src/component.js`](../../packages/core/src/component.js) |
| `Input` class (`#take`, `spread`) | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) (line 140–302) |
| Component type, Lifecycle type | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) (line 97–148) |
| PropsWithChildren, WithClassName, etc. | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) (line 109–131) |
| Component mounting (`createComponentNode`) | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) (line 841–958) |
| Context API (`ContextMap`) | [`packages/core/src/context.js`](../../packages/core/src/context.js) |
