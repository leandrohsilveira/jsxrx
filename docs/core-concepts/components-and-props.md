# Components & Props

Components are the fundamental building blocks of JsxRx applications. However, they work very differently from the components you may be used to in React, Solid, or Vue. This guide explains the JsxRx component model in depth — how components receive props, how they destructure them, how they manage lifecycle, and what they can return.

---

## Table of Contents

1. [Components Receive Observable Props](#1-components-receive-observable-props)
2. [Props.take() — Destructuring Props](#2-propstake--destructuring-props)
3. [Props.spread() — Observing the Full Props Object](#3-propsspread--observing-the-full-props-object)
4. [Props Accept `T | Observable<T>`](#4-props-accept-t--observablet)
5. [children$ — Always an Observable](#5-children--always-an-observable)
6. [The Lifecycle Parameter](#6-the-lifecycle-parameter)
7. [Component Return Types](#7-component-return-types)
8. [Component Type Signature](#8-component-type-signature)
9. [How Props Flow Under the Hood](#9-how-props-flow-under-the-hood)
10. [Common Patterns](#10-common-patterns)
11. [Summary](#11-summary)

---

## 1. Components Receive Observable Props

This is the single most important difference between JsxRx and React.

### React vs JsxRx

In React, a component receives a **plain props object**:

```tsx
// React
function Greeting({ name }: { name: string }) {
  return <h1>Hello, {name}</h1>
}
```

In JsxRx, a component receives an **`Observable<Props>`** — a stream of props that can emit new values at any time:

```tsx
// JsxRx
import type { Observable } from "rxjs"

type GreetingProps = {
  name: string
}

function Greeting(props$: Observable<GreetingProps>) {
  // props$ is an Observable — it can emit new props at any time
  return <h1>Hello, {/* ... */}</h1>
}
```

### Why Observable Props?

In JsxRx, **components are not re-run when props change**. The component function executes exactly once when the component is mounted. Instead of re-running the function, a parent pushes new prop values into the `props$` stream, and only the observables derived from those props trigger DOM updates.

This is fundamentally different from React's model:

| Framework | On prop change... |
|---|---|
| **React** | The component function re-executes from top to bottom |
| **JsxRx** | New props are pushed into `props$`. Only observables derived from changed props emit, triggering surgical DOM updates. The component function never re-runs. |

### The `$` Suffix Convention

Throughout JsxRx, the `$` suffix on a variable name signals **"this is an Observable"**. You'll see it on:

- The component's props parameter: `props$`
- Individual extracted props: `name$`, `age$`, `children$`
- State variables: `count$`, `items$`
- Derived streams: `doubleCount$`, `fullName$`

This convention helps you distinguish plain values from reactive streams at a glance.

### The `Input` Class

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

## 2. Props.take() — Destructuring Props

`Props.take(input$, defaultProps?)` is the primary way to break apart the props observable into individual, named prop streams. It returns a Proxy object where each key has a `$` suffix appended.

### Basic Usage

```tsx
import { Props } from "@jsxrx/core"
import type { Observable } from "rxjs"

type MyComponentProps = {
  name: string
  age?: number
}

function MyComponent(props$: Observable<MyComponentProps>) {
  // Destructure prop streams with $ suffix
  const { name$, age$ } = Props.take(props$, { age: 0 })

  // name$ is Observable<string>
  // age$ is Observable<number> (defaults to 0 if not provided)

  return (
    <p>
      {name$} is {age$} years old
    </p>
  )
}

// Usage:
// <MyComponent name="Alice" />           — age$ emits 0 (default)
// <MyComponent name="Bob" age={30} />    — age$ emits 30
// <MyComponent name={nameObservable$} /> — name$ tracks the observable
```

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

## 3. Props.spread() — Observing the Full Props Object

`Props.spread(input$, defaultProps?)` returns an `Observable` that emits the complete props object as a single unit. Unlike `take()`, the returned object has **plain keys** (no `$` suffix), but each value is an `Observable<T>`.

### Basic Usage

```tsx
import { Props } from "@jsxrx/core"
import { map } from "rxjs"

function Button(props$: Observable<ButtonProps>) {
  return (
    <button>
      {Props.spread(props$).pipe(
        map(spreadProps => {
          // spreadProps is an object where every key is an Observable
          // spreadProps.label is Observable<string>
          // spreadProps.disabled is Observable<boolean>
          return <span>{spreadProps.label}</span>
        })
      )}
    </button>
  )
}
```

### When to Use `spread()` vs `take()`

| Use Case | Method |
|---|---|
| You need individual prop streams with `$` suffix | `Props.take()` |
| You need to pass all props through to a native element | `Props.spread()` |
| You need to iterate over prop keys dynamically | `Props.spread()` |
| You need the complete props shape at once | `Props.spread()` |
| You want lazy, per-prop subscription | `Props.take()` |

### Forwarding Unrecognized Props

A common pattern is forwarding props to a native HTML element while also extracting known props:

```tsx
type CardProps = {
  title: string
  className?: string   // forwarded to the <div>
  id?: string          // forwarded to the <div>
}

function Card(props$: Observable<CardProps>) {
  const { title$ } = Props.take(props$)

  return (
    <>
      {Props.spread(props$).pipe(
        map(({ className, id }) => (
          <div className={className} id={id}>
            <h2>{title$}</h2>
          </div>
        ))
      )}
    </>
  )
}
```

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

## 4. Props Accept `T | Observable<T>`

Any prop can be passed either as a plain static value or as an Observable. JsxRx automatically coerces plain values to Observables internally.

### Both Forms Are Valid

```tsx
// Static value — passed directly
<Greeting name="Alice" />

// Observable value — binds reactively
const name$ = state("Alice")
<Greeting name={name$} />

// These are equivalent from the component's perspective.
// In both cases, Props.take() gives you an Observable<string>.
```

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

## 5. children$ — Always an Observable

In JsxRx, `children$` is **always an Observable**, even when static JSX children are passed. This is a critical departure from React, where `children` is whatever the parent passes (string, element, array, etc.).

### Basic Usage

```tsx
import { Props, type PropsWithChildren } from "@jsxrx/core"
import type { Observable } from "rxjs"

// PropsWithChildren<T> adds children$ to the props type
type LayoutProps = PropsWithChildren<{
  title: string
}>

function Layout(props$: Observable<LayoutProps>) {
  const { title$, children$ } = Props.take(props$)

  return (
    <div>
      <header>
        <h1>{title$}</h1>
      </header>
      <main>
        {children$}   {/* children$ is an Observable<ElementNode> */}
      </main>
    </div>
  )
}
```

### The `PropsWithChildren` Type Helper

```ts
// packages/core/src/jsx.d.ts — line 109
export type PropsWithChildren<T = {}> = T & {
  children?: ElementNode
}
```

`PropsWithChildren<T>` merges your custom props with the `children` prop. The `?` makes it optional — you can use the component without children.

Other type helpers for common prop patterns:

```ts
export type WithClassName = {
  className?: string
}

export type WithChildren = {
  children?: ElementNode
}

export type PropsWithKey<T = {}> = T & {
  key?: JsxRx.Key | null
}

export type PropsWithKeyAndChildren<T = {}> = PropsWithChildren<T> & PropsWithKey<T>
```

### How children$ Flows

When you write JSX with children:

```tsx
<Layout title="My App">
  <p>Welcome to my app!</p>
</Layout>
```

The `<p>` element is placed into the props object as `props.children`. When `Layout` calls `Props.take(props$)`, the `children` prop is extracted into `children$` — an Observable that emits the `<p>` element.

If the parent dynamically changes children:

```tsx
const page$ = state("home")

{page$.pipe(
  map(page =>
    <Layout title="My App">
      {page === "home" ? <HomeContent /> : <AboutContent />}
    </Layout>
  )
)}
```

When `page$` changes from `"home"` to `"about"`, the entire `<Layout>` is re-created with new children. The `children$` Observable inside `Layout` emits the new content (`<AboutContent />`), and the `<main>` element updates accordingly — without re-calling the `Layout` function.

### Children Coercion

Like all props, the `children` value is automatically coerced. A static `<p>Hello</p>` becomes `Observable<ElementNode>`. An Observable child stays an Observable. The component always sees `children$` as `Observable<ElementNode>`.

---

## 6. The Lifecycle Parameter

Every component receives a second parameter — the `Lifecycle` object. Most components don't need it, but it's essential for advanced patterns like manual DOM subscriptions, timers, or integration with non-JsxRx libraries.

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

### Declaring the Lifecycle Parameter

```tsx
import type { Observable } from "rxjs"
import type { Lifecycle } from "@jsxrx/core"

function MyComponent(
  props$: Observable<MyProps>,
  { subscription, mounted$, unmounted$ }: Lifecycle
) {
  // Use the lifecycle parameter for advanced cases
  return <div>Hello</div>
}
```

### `subscription` — Automatic Cleanup

The `subscription` is an RxJS `Subscription` object. Any child subscription you add to it will be automatically unsubscribed when the component unmounts:

```tsx
import { interval } from "rxjs"

function Clock(
  props$: Observable<{}>,
  { subscription }: Lifecycle
) {
  const tick$ = interval(1000) // emits every second

  // Add a subscription that will be cleaned up on unmount
  subscription.add(
    tick$.subscribe(tick => {
      console.log("Tick:", tick)
    })
  )

  return <p>Check the console</p>
}
```

Without adding to `subscription`, the interval would continue running even after the component is removed from the DOM, causing a memory leak.

### `context` — Context API Access

The `context` object provides access to JsxRx's Context API:

```ts
export interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
}
```

This is how components read from and write to context providers. For detailed coverage, see the Context API documentation.

### `mounted$` and `unmounted$` — Lifecycle Observables

These are boolean Observables that indicate the component's mount state:

```tsx
function AnalyticsTracker(
  props$: Observable<{ pageId: string }>,
  { mounted$, unmounted$ }: Lifecycle
) {
  const { pageId$ } = Props.take(props$)

  // Track page views
  mounted$.pipe(
    filter(mounted => mounted)
  ).subscribe(() => {
    analytics.track("component_mounted", { pageId: /* ... */ })
  })

  return <div>Tracking...</div>
}
```

- `mounted$` emits `true` when the component is mounted
- `unmounted$` emits `true` just before the component is unmounted

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

---

## 7. Component Return Types

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

### 2. Observable<ElementNode> — Dynamic JSX

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

### 4. null or undefined — Render Nothing

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

## 8. Component Type Signature

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

## 9. How Props Flow Under the Hood

Understanding the internal data flow helps you reason about when and how your component reacts to prop changes.

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

## 10. Common Patterns

### Pattern: Controlled Input

```tsx
function TextInput(props$: Observable<{
  value: string
  onChange: (value: string) => void
}>) {
  const { value$, onChange$ } = Props.take(props$)

  return (
    <input
      value={value$}
      onInput={onChange$.pipe(
        map(handler => (e: InputEvent) =>
          handler((e.target as HTMLInputElement).value)
        )
      )}
    />
  )
}
```

### Pattern: Derived Props

```tsx
import { map } from "rxjs"

function UserCard(props$: Observable<{
  firstName: string
  lastName: string
  avatar?: string
}>) {
  const { firstName$, lastName$, avatar$ } = Props.take(props$, {
    avatar: "/default-avatar.png",
  })

  // Derive a full name from first and last name
  const fullName$ = combineLatest([firstName$, lastName$]).pipe(
    map(([first, last]) => `${first} ${last}`)
  )

  return (
    <div>
      <img src={avatar$} alt={fullName$} />
      <span>{fullName$}</span>
    </div>
  )
}
```

### Pattern: Props With Side Effects

```tsx
import { tap } from "rxjs"

function AnalyticsWrapper(
  props$: Observable<{ pageId: string; children: ElementNode }>,
  { subscription }: Lifecycle
) {
  const { pageId$, children$ } = Props.take(props$)

  // Track page views each time pageId$ emits
  subscription.add(
    pageId$.pipe(
      tap(pageId => analytics.track("page_view", { pageId }))
    ).subscribe()
  )

  return <div>{children$}</div>
}
```

### Pattern: Combining Props.take() and Props.spread()

```tsx
function StyledCard(props$: Observable<{
  title: string
  className?: string
  style?: CSSProperties
  children: ElementNode
}>) {
  // Extract title separately (component needs it for logic)
  const { title$ } = Props.take(props$, { className: "" })

  // Spread everything for forwarding to the DOM element
  return (
    <>
      {Props.spread(props$).pipe(
        map(({ className, style, children }) => (
          <div className={className} style={style}>
            <h3>{title$}</h3>
            <div>{children}</div>
          </div>
        ))
      )}
    </>
  )
}
```

### Pattern: Ref Forwarding

```tsx
import { ref, type Ref } from "@jsxrx/core"

function CustomInput(props$: Observable<{
  value: string
  inputRef: Ref<HTMLInputElement>
}>) {
  const { value$, inputRef$ } = Props.take(props$)

  return <input ref={inputRef$} value={value$} />
}

// Parent:
function Parent() {
  const inputRef = ref(HTMLInputElement)

  function focusInput() {
    inputRef.current.value?.focus()
  }

  return (
    <>
      <CustomInput value="hello" inputRef={inputRef} />
      <button onClick={focusInput}>Focus</button>
    </>
  )
}
```

---

## 11. Summary

| Concept | Key Insight |
|---|---|
| **Props are Observable** | `props$: Observable<P>` — not a plain object. The component function runs once. |
| **Props.take()** | Destructures `props$` into individual `propName$` streams with `$` suffix. Uses a Proxy for lazy access. |
| **Props.spread()** | Returns `Observable` of the full props object (keys without `$`). Use for forwarding or dynamic key sets. |
| **T \| Observable<T>** | Any prop accepts static values or Observables. Internally coerced. |
| **children$** | Always an `Observable<ElementNode>`. Use `PropsWithChildren<T>` type helper. |
| **Lifecycle** | Second parameter with `subscription` (auto-cleanup), `context` (context API), `mounted$`, `unmounted$`. |
| **Return types** | JSX elements, `Observable<ElementNode>`, `null`/`undefined`, or arrays (with `key`). |
| **Component type** | `Component<P>` = `(props: Observable<P>, lifecycle: Lifecycle) => ElementNode` |

The JsxRx component model is designed for **surgical reactivity**. Components initialize once, setting up an Observable pipeline. Props flow through as streams, and only the observables you embed in JSX trigger DOM updates. There are no re-renders, no dependency arrays, and no reconciliation of the entire tree — just the parts that need to change.

---

## Source Files Referenced

| Concept | Source File |
|---|---|
| `Props` class (`take`, `spread`) | [`packages/core/src/component.js`](../../packages/core/src/component.js) |
| `Input` class (`#take`, `spread`) | [`packages/core/src/observable.js`](../../packages/core/src/observable.js) (line 140–302) |
| Component type, Lifecycle type | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) (line 97–148) |
| PropsWithChildren, WithClassName, etc. | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts) (line 109–131) |
| Component mounting (`createComponentNode`) | [`packages/core/src/vdom/vdom.js`](../../packages/core/src/vdom/vdom.js) (line 841–958) |
| Context API (`ContextMap`) | [`packages/core/src/context.js`](../../packages/core/src/context.js) |
