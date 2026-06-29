# `@jsxrx/core` API Reference

Source files: `packages/core/src/component.js`, `packages/core/src/observable.js`, `packages/core/src/context.js`, `packages/core/src/jsx.d.ts`, `packages/core/src/vdom/render.js`, `packages/core/src/dom/render.js`, `packages/core/src/dom/inputs.js`, `packages/core/src/style/clsx.js`, `packages/core/src/raw-html.js`, `packages/core/src/lazy.js`, `packages/core/src/suspense.js`, `packages/core/src/fragment.js`, `packages/core/src/loggers.js`

---

## 1. Core State & Reactivity

### `state`

```ts
state<T>(initialValue: T): IState<T>
```

Creates a reactive state cell backed by a `BehaviorSubject`. `IState<T>` extends `Observable<T>` with a `.value` getter for synchronous reads and a `.set(value: T)` method for updates. All subscriptions receive the latest value immediately upon subscribe.

```tsx
import { state } from "@jsxrx/core"

const count$ = state(0)

// Synchronous read
console.log(count$.value) // 0

// Synchronous write
count$.set(count$.value + 1)

// Subscribe reactively
count$.subscribe(v => console.log("count:", v))
```

**Internals:** `State` extends `ObservableDelegate` and implements `IState<T>`. The constructor accepts a `BehaviorSubject<T>`.

---

### `emitter`

```ts
// When the observable emits a non-nullable function:
emitter<T extends Fn>(value$: Observable<T>): Emitter<T>

// When the observable may emit null/undefined:
emitter<T extends Fn>(value$: Observable<T | null | undefined>): OptionalEmitter<T>
```

Creates an event emitter from an observable of functions. Calling `.emit(...args)` resolves the latest value from the observable (using `lastValueFrom` + `take(1)`) and invokes it with the provided arguments. If the emitter was created from a nullable observable, `.emit()` returns `undefined` when the latest function is nullish.

```tsx
import { state, emitter } from "@jsxrx/core"
import { of } from "rxjs"

// Non-nullable: emit always returns the function's return value
const onClickEmitter = emitter(of((id: string) => fetch(`/api/items/${id}`)))
await onClickEmitter.emit("42") // calls fetch(...)

// Optional (nullable): emit returns undefined if no handler
const onSubmit$ = state<((data: FormData) => void) | null>(null)
const submitEmitter = emitter(onSubmit$)
const result = await submitEmitter.emit(formData) // result is void | undefined
```

---

### `defer`

```ts
defer<T>(value: Observable<T>): IDeferred<T>
```

Wraps an observable in an `IDeferred<T>` wrapper (`{ kind: "stream", value$: Observable<T> }`). When used inside `combine()`, a deferred value is **not** unwrapped — the observable itself is emitted rather than its resolved value. This allows nested observables to be passed through `combine()` without automatic flattening.

```tsx
import { state, defer, combine } from "@jsxrx/core"

const stream$ = state(42)
const deferred$ = defer(stream$)

const result$ = combine({ plain: stream$, deferred: deferred$ })
result$.subscribe(({ plain, deferred }) => {
  // plain    -> 42 (unwrapped)
  // deferred -> Observable<number> (not unwrapped — still an Observable)
})
```

---

### `ref`

```ts
ref<T>(construct: new () => T): Ref<T>
```

Creates a DOM element reference. Returns `ElementRef<T>` with `.kind = "ref"` and `.current: BehaviorSubject<T | null>`. The constructor parameter is used only for type inference — the value is initialized to `null`.

```tsx
import { ref } from "@jsxrx/core"

const buttonRef = ref(HTMLButtonElement)

// In JSX:
// <button ref={buttonRef}>Click me</button>

buttonRef.current.subscribe(el => {
  if (el) console.log("Button mounted:", el.tagName)
})
```

---

### `fromRef`

```ts
fromRef<T>(value: Ref<T> | Observable<T | Ref<T>> | T): Observable<T | null>
```

Resolves refs and observables to a flat observable of the ref's `.current` value. Accepts a plain value, a `Ref`, an `Observable<T>`, or an `Observable<Ref<T>>`. Nested observables are flattened via `switchMap`.

```tsx
import { ref, fromRef } from "@jsxrx/core"

const divRef = ref(HTMLDivElement)
fromRef(divRef).subscribe(el => {
  // el: HTMLDivElement | null
})
```

---

### `isRef`

```ts
isRef<T>(value: unknown): value is Ref<T>
```

Type guard that checks whether a value is an instance of `ElementRef` (i.e., created by `ref()`).

```tsx
import { isRef } from "@jsxrx/core"

if (isRef(someValue)) {
  someValue.current.subscribe(el => {
    /* ... */
  })
}
```

---

### `isAsyncState`

```ts
isAsyncState<T>(value: unknown): value is AsyncState<T>
```

Type guard for async state objects. Checks for `kind === "async"` and that `state$` is an observable.

---

### `isActivityAwareObservable`

```ts
isActivityAwareObservable(observable: unknown): boolean
```

Checks whether an observable is an instance of `ActivityAwareObservable` — i.e., whether it has a `.pending$` property that tracks async activity.

---

## 2. Component Model

### `Props.take`

```ts
Props.take<P, D>(input$: Observable<P>, defaultProps?: D): InputTake<P & D>
```

Destructures the component's props observable into individual `propName$` streams. Each key gets a `$` suffix (e.g., `name` → `name$`). Default values from `defaultProps` fill in for props that are `null` or `undefined`.

The returned proxy object has enumerable keys matching only the currently-present prop keys (discovered dynamically). Use `Props.take` for accessing individual reactive prop streams.

```tsx
import { Props } from "@jsxrx/core"

function Greeting(props$) {
  const { name$, age$ } = Props.take(props$, { age: 18 })

  return combine({ name: name$, age: age$ }).pipe(
    map(({ name, age }) => (
      <div>
        Hello {name}, you are {age} years old.
      </div>
    )),
  )
}
```

**Important:** The destructured proxy does **not** support `Object.keys()` or spreading. For those operations, use `Props.spread`.

---

### `Props.spread`

```ts
Props.spread<P, D>(input$: Observable<P>, defaultProps?: D): Observable<InputSpread<P & D>>
```

Like `Props.take`, but returns an `Observable` of the full props object where every key maps to an `Observable` of its value (keys **without** a `$` suffix). Use this for passing props through to native elements or when you need to spread the props object.

```tsx
import { Props } from "@jsxrx/core"

function Wrapper(props$) {
  return Props.spread(props$).pipe(map(props => <div {...props} />))
}
```

---

### `Fragment`

```ts
Fragment: Component<PropsWithChildren<{}>>
```

A component that always returns `null`. Used for `<>...</>` JSX syntax. Children are rendered without a wrapper element in the DOM.

```tsx
import { Fragment } from "@jsxrx/core"

function List() {
  return (
    <>
      <li>Item 1</li>
      <li>Item 2</li>
    </>
  )
}
```

---

### `lazy`

```ts
// Overload 1: default export
lazy<"default", T extends Record<"default", Component<any>>>(
  importer: () => Promise<T>
): T["default"]

// Overload 2: named export
lazy<N extends string, T extends Record<N, Component<any>>>(
  importer: () => Promise<T>,
  name: N
): T[N]
```

Creates a lazily-loaded component. Accepts a dynamic `import()` function and an optional export name (defaults to `"default"`). The lazy component renders a `RenderComponentNode` once the module resolves.

```tsx
import { lazy } from "@jsxrx/core"

// Default export
const LoginPage = lazy(() => import("./LoginPage"))

// Named export
const AdminDashboard = lazy(() => import("./dashboards"), "AdminDashboard")

function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Router>
        <Route path="/login" component={LoginPage} />
        <Route path="/admin" component={AdminDashboard} />
      </Router>
    </Suspense>
  )
}
```

> **Note:** The lazy component uses `Props.spread` internally and emits via `switchMap`. Always wrap lazy components in a `<Suspense>` boundary.

---

### `Suspense`

```ts
// Component<PropsWithChildren<SuspenseProps>>
interface SuspenseProps {
  fallback: ElementNode
  tolerance?: number // debounce time in ms before swapping to fallback
  suspended?: boolean | Observable<boolean>
}
```

Suspense boundary component. When any descendant's props or children are in a pending/loading state, the fallback is rendered instead. The `tolerance` option adds a debounce to prevent flickering during rapid state changes. The `suspended` prop allows manual control.

```tsx
import { Suspense } from "@jsxrx/core"

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />} tolerance={200}>
      <AsyncContent />
    </Suspense>
  )
}
```

---

### `rawHtml`

```ts
rawHtml(id: string, content: string | Observable<string | null | undefined> | Promise<string | null | undefined> | null | undefined, key?: any): IRenderRawHtmlNode
```

Creates a raw HTML render node. Useful for injecting SVG markup, third-party widget HTML, or any content that should bypass the VDOM. The content can be static, observable, or promise-based.

> ⚠️ **Security:** Ensure any content passed to `rawHtml()` is sanitized. Never pass unsanitized user input, as this creates an XSS vulnerability.

```tsx
import { rawHtml } from "@jsxrx/core"
import { of } from "rxjs"

// Static SVG
const icon = rawHtml("chart-icon", `<svg viewBox="0 0 24 24">...</svg>`)

// Dynamic HTML
const widget = rawHtml("live-widget", widgetHtml$, "widget-key")

function Dashboard() {
  return (
    <div>
      {icon}
      {widget}
    </div>
  )
}
```

---

## 3. Observable Utilities

### `combine`

```ts
combine<T extends Record<string, unknown>>(data: T): Observable<CombineOutput<T>>
```

Merges a plain object containing plain values, observables, and deferred values into a single observable. Emits when any input observable changes. Plain values are automatically wrapped with `of()`. Deferred values (`IDeferred`) are emitted as observables rather than unwrapped. Render nodes are also wrapped with `of()`.

Uses `combineLatest` internally with a 1ms debounce and `shallowComparator`-based deduplication, followed by `share()`.

```tsx
import { state, defer, combine } from "@jsxrx/core"
import { map } from "rxjs"

const name$ = state("Alice")
const age$ = state(30)
const config$ = defer(someStream$)

const view$ = combine({ name: name$, age: age$, config: config$ }).pipe(
  map(({ name, age, config }) => (
    <div>
      <h1>
        {name}, {age}
      </h1>
      <ConfigRenderer stream={config} />
    </div>
  )),
)
```

---

### `pending`

```ts
pending(value: Observable<unknown> | AsyncState<unknown>, debounce?: number): Observable<boolean>
```

Derives a loading boolean from observables. Emits `true` while the source hasn't resolved. Handles three input types:

- **`AsyncState`**: uses the built-in `.pending$` stream
- **`ActivityAwareObservable`**: uses the observable's `.pending$` property
- **`Observable<PendingState>`**: inspects the emitted state object for `state === "pending"`

The optional `debounce` parameter (default: 5ms) delays and deduplicates transitions to prevent flickering.

```tsx
import { pending } from "@jsxrx/core"
import { of } from "rxjs"
import { map } from "rxjs/operators"

const data$ = fetchData().pipe(
  map(data => ({ state: "success", value: data, error: null })),
)
const loading$ = pending(data$)

loading$.subscribe(isLoading => {
  console.log(isLoading ? "Loading..." : "Done!")
})
```

---

### `activity`

```ts
activity(): {
  pending$: Observable<boolean>
  start<T>(): MonoTypeOperatorFunction<T>    // tap operator factory
  complete<T>(): MonoTypeOperatorFunction<T> // tap operator factory
  pipe<T, R>(operator: OperatorFunction<T, R>): OperatorFunction<T, R>
  toObservable<T>(observable: Observable<T>): Observable<T>
}
```

Creates an activity tracker. Returns a `pending$` stream that starts as `true` and transitions to `false` on completion or error. `start()` and `complete()` are factory functions that return RxJS `tap` operators, which can be piped into observable chains to mark activity boundaries. `pipe(operator)` is a convenience that composes `start()`, the given operator, and `complete()` into a single operator. `toObservable` wraps an observable in an `ActivityAwareObservable` that exposes the tracker's `pending$`.

```tsx
import { activity } from "@jsxrx/core"
import { ajax } from "rxjs/ajax"

const tracker = activity()

const data$ = of(null).pipe(
  tracker.start(),
  switchMap(() => ajax.getJSON("/api/users"))
  tracker.complete()
)

// Equivalent using the pipe() convenience:
const data$ = of(null).pipe(
  tracker.pipe(ajax.getJSON("/api/users"))
)

const activityAware$ = tracker.toObservable(data$)

tracker.pending$.subscribe(pending => {
  console.log("Activity pending:", pending)
})
```

---

### `toActivityAware`

```ts
toActivityAware<T>(attacher: (attach: (observable: Observable<unknown>) => Observable<T>) => Observable<T>): Observable<T>
```

Wraps an observable chain to become activity-aware. The `attacher` callback receives an `attach` function that connects child observables — if a child is itself `ActivityAwareObservable`, its `.pending$` is linked to the wrapper's `pending$`.

```tsx
import { toActivityAware } from "@jsxrx/core"

const aware$ = toActivityAware(attach =>
  someSource$.pipe(switchMap(value => attach(fetchDetails(value)))),
)

// aware$.pending$ exists and tracks all attached observables
```

---

### `ObservableDelegate<T>`

```ts
class ObservableDelegate<T> extends Observable<T>
```

Base class extending RxJS `Observable`. Overrides `pipe()` to automatically append `shareReplay({ refCount: true, bufferSize: 1 })` to every pipe chain, ensuring late subscribers receive the latest value.

---

### `ActivityAwareObservable<T>`

```ts
class ActivityAwareObservable<T> extends Observable<T> {
  pending$: Observable<boolean>
}
```

Extends `Observable` with a `.pending$` property for activity tracking. Used internally by Suspense boundaries to detect pending operations.

---

### `Input<T>`

```ts
class Input<T> extends ObservableDelegate<T> {
  static from<T>(input$: Observable<T>): Input<T>
  unmounted$: Observable<boolean>
  context: IContextMap
  subscription: Subscription
  take<D>(defaultProps?: D): InputTake<T & D>
  spread<D>(defaultProps?: D): Observable<InputSpread<T & D>>
  observe(subscription: Subscription): void
}
```

The component input observable — this is what the `props$` parameter of every component actually is. `Input` extends `ObservableDelegate` with component lifecycle and prop destructuring capabilities.

**Key features:**

- Debounces prop changes by 1ms and deduplicates using `compareProps`
- Exposes `unmounted$` for cleanup (completes on unmount)
- `context` provides access to the component's context scope
- `subscription` is the component's lifecycle subscription
- `take()` and `spread()` destructure props dynamically via a `Proxy`

> **Note:** `Input.from()` is a type assertion helper. It throws if the argument is not already an `Input` instance.

---

### `State<T>`

```ts
class State<T> extends ObservableDelegate<T> implements IState<T> {
  get value(): T
  set(value: T): void
}
```

Extends `ObservableDelegate`, implementing `IState<T>`. Created internally by `state()`. The `.value` getter reads synchronously from the underlying `BehaviorSubject`. The `.set()` method calls `.next()` on the subject.

---

### `ElementRef<T>`

```ts
class ElementRef<T> implements Ref<T> {
  kind: "ref"
  current: BehaviorSubject<T | null>
}
```

Implements `Ref<T>`. Created by `ref()`. Used to capture DOM element references.

---

### `Defer<T>`

```ts
class Defer<T> implements IDeferred<T> {
  kind: "stream"
  value$: Observable<T>
}
```

Implements `IDeferred<T>`. Created by `defer()`. Wraps an observable to prevent automatic unwrapping in `combine()`.

---

### `isObservableDelegate`

```ts
isObservableDelegate<T>(value: unknown): value is ObservableDelegate<T>
```

Type guard for `ObservableDelegate` and `State` instances.

---

## 4. Context

### `Context<T>`

```ts
class Context<T> implements IContext<T> {
  constructor(name: string, initialValue: T)
  initialValue: T
  symbol: symbol
  create(): BehaviorSubject<T>
}
```

Creates a typed context key. Each `Context` instance has a unique `symbol` for identity in the context map.

```tsx
import { Context } from "@jsxrx/core"

const ThemeContext = new Context("theme", "light")
const UserContext = new Context("user", null)

// In a component:
function App(props$: Observable<{}>, { context }: Lifecycle) {
  context.set(ThemeContext, of("dark"))

  return <Child />
}
```

---

### `ContextMap`

```ts
class ContextMap implements IContextMap {
  constructor(upstream$?: Observable<Record<symbol, Observable<unknown>>>)
  set<T>(context: Context<T>, value$: Observable<T>): void
  require<T extends Context<any>>(context: T): Observable<T["initialValue"]>
  optional<T>(context: Context<T>): Observable<T>
  downstream(): ContextMap
}
```

Context scope manager. Maintains a local scope of context values merged with an optional upstream scope (parent).

- **`set(context, value$)`**: Overrides a context value in the current scope
- **`require(context)`**: Returns the context value observable, throws if not found (wraps in `toActivityAware`)
- **`optional(context)`**: Returns the context value, or falls back to `context.initialValue` if not set
- **`downstream()`**: Creates a child scope that inherits from the current merged stream

```tsx
import { Context, ContextMap } from "@jsxrx/core"
import { of } from "rxjs"

const ThemeCtx = new Context("theme", "light")

const parent = new ContextMap()
parent.set(ThemeCtx, of("dark"))

const child = parent.downstream()
child.require(ThemeCtx).subscribe(theme => console.log(theme)) // "dark"

// optional: falls back to initialValue
child.optional(ThemeCtx).subscribe(theme => console.log(theme)) // "dark"

const empty = new ContextMap()
empty.optional(ThemeCtx).subscribe(theme => console.log(theme)) // "light" (initialValue)
```

---

## 5. Style Utilities

### `classes`

```ts
classes(...tokens: ClassValue[]): Observable<string>
```

Reactive class name builder. Accepts strings, objects, arrays, and observables nested at any depth. Uses `clsx` internally for string concatenation. Observable tokens are flattened recursively via `switchMap`. Object values can be observables of booleans.

```tsx
import { state, classes } from "@jsxrx/core"

const isActive$ = state(true)
const extraClass$ = state("shadow-lg")

const className$ = classes(
  "base-btn",
  { active: isActive$, disabled: false },
  extraClass$,
  ["px-4", "py-2"],
)

// className$ emits: "base-btn active shadow-lg px-4 py-2"
```

---

### `variants`

```ts
variants<T extends string>(
  input: Observable<T> | T,
  variantMap: Record<T, ClassValue>,
  defaultStyles?: ClassValue
): Observable<string>
```

Reactive variant selector. Selects a class value from a map based on the current variant key. Falls back to `defaultStyles` if the variant key is not in the map. The value from the map is passed through `classes()`, so it supports the same nested reactive types.

```tsx
import { state, variants } from "@jsxrx/core"

type ButtonVariant = "primary" | "danger" | "ghost"
const variant$ = state<ButtonVariant>("primary")

const buttonClass$ = variants(
  variant$,
  {
    primary: "bg-blue-500 text-white",
    danger: "bg-red-500 text-white",
    ghost: "bg-transparent text-gray-700",
  },
  "bg-gray-200 text-black",
) // fallback

// Combined with classes:
const className$ = classes(buttonClass$, "rounded-lg", "px-4 py-2")
```

---

## 6. DOM & Rendering (`@jsxrx/core/dom`)

### `createRoot`

```ts
createRoot(
  element: Element | null | undefined,
  options?: {
    batchTime?: number    // default: 10 (ms between render batches)
    logger?: Logger
  }
): VRoot
```

Creates a DOM render root. Returns a `VRoot` with a `.mount(elementNode: ElementNode)` method. If `batchTime` is > 0, renders are batched through `BatchRenderer`. If `batchTime` is 0, bypasses batching for synchronous rendering.

```tsx
import { createRoot } from "@jsxrx/core/dom"

const root = createRoot(document.getElementById("app"), { batchTime: 16 })
const subscription = root.mount(<App />)

// Later, to unmount:
subscription.unsubscribe()
```

---

### `fromRefEvent`

```ts
fromRefEvent<T extends EventTarget>(
  ref: Ref<T> | Observable<T | Ref<T>> | T,
  name: Observable<string> | string,
  while$?: Observable<boolean>
): Observable<Event>
```

Creates an observable from DOM events on a ref element. Returns `NEVER` (a no-op observable) if the ref is `null` or `while$` emits `false`. All three inputs are combined with `combineLatest`, and the event listener is re-bound on changes via `switchMap`.

```tsx
import { ref } from "@jsxrx/core"
import { fromRefEvent as fromDomRefEvent } from "@jsxrx/core/dom"

const buttonRef = ref(HTMLButtonElement)
const click$ = fromDomRefEvent(buttonRef, "click")

click$.subscribe(event => {
  console.log("Button clicked:", event)
})

// With a conditional while$:
const enabled$ = state(true)
const hover$ = fromDomRefEvent(buttonRef, "mouseenter", enabled$)
```

---

### `createTestingRenderer`

```ts
createTestingRenderer(): IRenderer<Text, Element>
```

Creates a vitest-compatible DOM renderer where all DOM mutation methods throw by default, requiring explicit mocking. Use with `vi.spyOn()` to assert render operations in unit tests.

```tsx
import { createTestingRenderer } from "@jsxrx/core/dom"
import { vi } from "vitest"

const renderer = createTestingRenderer()

// Throws: "Testing renderer 'createElement' requires mocking"
// renderer.createElement("div")

// Mock specific methods:
vi.spyOn(renderer, "createElement").mockReturnValue(mockElement)
```

---

## 7. Debug

### `createDebugLogger`

```ts
createDebugLogger(groups?: ("publishEvents" | "batchEvents")[]): Logger
```

Creates a debug logger with specified event groups enabled. Defaults to both groups if no argument is passed. The returned `Logger` logs to `console.debug` with `[BATCH]` prefix.

**Available groups:**

- `"publishEvents"` — logs `publishEvent` calls
- `"batchEvents"` — logs `beginBatch`, `completeBatch`, `placeEvent`, `removeEvent`

```tsx
import { createDebugLogger } from "@jsxrx/core"
import { createRoot } from "@jsxrx/core/dom"

const logger = createDebugLogger(["batchEvents"])
const root = createRoot(document.getElementById("app"), { logger })
```

The `Logger` class exposes individual methods for each event type: `publishEvent`, `beginBatch`, `completeBatch`, `placeEvent`, `moveEvent`, `removeEvent`.

---

## 8. VDOM Node Types

The following classes implement the `IRenderNode` interface from the type definitions. They are created internally by the JSX runtime and can also be used directly for introspection or low-level operations.

### `RenderElementNode`

```ts
class RenderElementNode implements IRenderElementNode {
  constructor(
    id: string,
    tag: string,
    props: Record<string, any>,
    children: ElementNode,
    key?: any,
  )
  type: VDOMType.ELEMENT
  id: string
  tag: string
  props: Record<string, any>
  children: ElementNode
  key: any
  compareTo(node: IRenderNode): boolean
}
```

Represents an HTML element in the VDOM tree. Props are compared via `shallowComparator`; children are compared recursively.

---

### `RenderComponentNode`

```ts
class RenderComponentNode implements IRenderComponentNode {
  constructor(
    id: string,
    component: Component<any>,
    props: Record<string, any>,
    key?: any,
  )
  type: VDOMType.COMPONENT
  id: string
  component: Component<any>
  props: Record<string, any>
  name: string // from component.displayName ?? component.name
  key: any
  compareTo(node: IRenderNode): boolean
}
```

Represents a component instance in the VDOM tree. The `name` property is derived from the component's `displayName` or function name. Props comparison uses `compareProps`.

---

### `RenderFragmentNode`

```ts
class RenderFragmentNode implements IRenderFragmentNode {
  constructor(id: string, children: ElementNode, key?: any)
  type: VDOMType.FRAGMENT
  id: string
  children: ElementNode
  key: any
  compareTo(node: IRenderNode): boolean
}
```

Represents a JSX fragment (`<>...</>`) in the VDOM tree.

---

### `RenderSuspenseNode`

```ts
class RenderSuspenseNode implements IRenderSuspenseNode {
  constructor(
    id: string,
    props: SuspenseProps,
    children: ElementNode,
    key?: any,
  )
  type: VDOMType.SUSPENSE
  fallback: ElementNode
  children: ElementNode
  tolerance?: number
  suspended?: boolean
  compareTo(node: IRenderNode): boolean
}
```

Represents a Suspense boundary in the VDOM tree.

---

### `RenderRawHtmlNode`

```ts
class RenderRawHtmlNode implements IRenderRawHtmlNode {
  constructor(id: string, content: IRenderRawHtmlNode["content"], key?: any)
  type: VDOMType.RAW_HTML
  content:
    | string
    | Observable<string | null | undefined>
    | Promise<string | null | undefined>
    | null
    | undefined
  key: any
  compareTo(node: IRenderNode): boolean
}
```

Represents a raw HTML injection point in the VDOM tree.

---

### `isRenderNode`

```ts
isRenderNode(value: unknown): value is IRenderNode
```

Type guard that checks whether a value is an instance of any render node class (`RenderElementNode`, `RenderComponentNode`, `RenderFragmentNode`, `RenderSuspenseNode`, or `RenderRawHtmlNode`).

---

### `compareProps`

```ts
compareProps<T>(a: T, b: T): boolean
```

Deep-compares two props objects, recursing into render nodes and arrays of render nodes.

---

### `compareRenderNode`

```ts
compareRenderNode(a: unknown, b: unknown): boolean
```

Compares two values, returning `true` if both are render nodes with matching `id`, `type`, and `.compareTo()` result.

---

## 9. VDOM Constants

### `VDOMType`

```ts
const VDOMType = {
  TEXT: "TEXT",
  ELEMENT: "ELEMENT",
  COMPONENT: "COMPONENT",
  RAW_HTML: "RAW_HTML",
  FRAGMENT: "FRAGMENT",
  OBSERVABLE: "OBSERVABLE",
  SUSPENSE: "SUSPENSE",
  CHILDREN: "CHILDREN",
  NULL: "NULL",
} as const

type IVDOMType = keyof typeof VDOMType
```

Identifies the type of a VDOM node. All node classes reference one of these constants in their `type` property.

---

### `VRenderEventType`

```ts
const VRenderEventType = {
  PLACE: "PLACE",
  REMOVE: "REMOVE",
  MOVE: "MOVE",
} as const

type IVRenderEventType = keyof typeof VRenderEventType
```

Identifies the type of a render event dispatched by the batching renderer.

---

## 10. JSX Runtime (`@jsxrx/core/jsx-runtime`)

Import path: `@jsxrx/core/jsx-runtime`

This is the **automatic JSX runtime** used by transpilers (TypeScript/Babel) when `"jsx": "react-jsx"` is configured.

### `jsx`

```ts
jsx(type: ElementType, props: unknown, key?: Key | undefined): ElementNode
```

JSX factory for the automatic runtime (single child or self-closing elements). Internally calls `_jsx()` in the VDOM layer.

```tsx
// Transpiled from: <div className="box" />
// Becomes:
import { jsx } from "@jsxrx/core/jsx-runtime"
jsx("div", { className: "box" })
```

### `jsxs`

```ts
jsxs(type: ElementType, props: unknown, key?: Key | undefined): ElementNode
```

JSX factory for the automatic runtime with multiple children. The transpiler chooses `jsxs` or `jsx` based on the number of children.

```tsx
// Transpiled from: <div><span>A</span><span>B</span></div>
// Becomes:
import { jsxs } from "@jsxrx/core/jsx-runtime"
jsxs("div", {
  children: [jsx("span", { children: "A" }), jsx("span", { children: "B" })],
})
```

### `Fragment`

```ts
Fragment: Component<PropsWithChildren<{}>>
```

Re-exported from the core package. Same `Fragment` used for `<>...</>` syntax.

### `JSX` namespace

The JSX namespace type definitions for intrinsic elements, attributes, and events are exported under the `JSX` namespace for TypeScript type-checking integration.

---

## 11. JSX Dev Runtime (`@jsxrx/core/jsx-dev-runtime`)

Import path: `@jsxrx/core/jsx-dev-runtime`

This is the **development JSX runtime** used when `"jsx": "react-jsxdev"` is configured. It adds source location information for better debugging.

### `jsxDEV`

```ts
jsxDEV(
  type: ElementType,
  props: unknown,
  key?: Key | undefined,
  isStatic?: boolean,
  source?: JSXSource,
  self?: unknown
): ElementNode
```

Dev-mode JSX factory with source location. Re-exports `Fragment` and `JSX` namespace from `jsx-runtime`.

```ts
interface JSXSource {
  fileName?: string
  lineNumber?: number
  columnNumber?: number
}
```

---

## 12. Key Types

### Lifecycle & Component Types

| Type                | Description                                                                                                            |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Component<P>`      | `(props: Observable<P>, lifecycle: Lifecycle) => ElementNode` with optional `displayName`                              |
| `ComponentType<P>`  | Alias for `Component<P>`                                                                                               |
| `Lifecycle`         | `{ context: IContextMap; subscription: Subscription; mounted$: Observable<boolean>; unmounted$: Observable<boolean> }` |
| `ComponentInstance` | `{ context: IContextMap; suspension: SuspensionController }`                                                           |

### State & Ref Types

| Type                            | Description                                                                 |
| ------------------------------- | --------------------------------------------------------------------------- |
| `IState<T>`                     | `Observable<T>` with `.value: T` and `.set(value: T): void`                 |
| `Ref<T>`                        | `{ kind: "ref"; current: SubjectLike<T \| null> }`                          |
| `IDeferred<T>`                  | `{ kind: "stream"; value$: Observable<T> }`                                 |
| `Emitter<T extends Fn>`         | `{ emit: (...args: Parameters<T>) => Promise<ReturnType<T>> }`              |
| `OptionalEmitter<T extends Fn>` | `{ emit: (...args: Parameters<T>) => Promise<ReturnType<T> \| undefined> }` |

### Async & Pending Types

| Type               | Description                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AsyncState<T, E>` | `{ kind: "async"; pending$: Observable<boolean>; state$: Observable<PendingState<T>>; value$: Observable<T>; error$: Observable<E> }`                        |
| `PendingState<T>`  | `{ state: "idle" \| "pending"; value: null; error: null } \| { state: "success"; value: T; error: null } \| { state: "error"; value: null; error: unknown }` |

### Context Types

| Type          | Description                                                                                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IContext<T>` | `{ initialValue: T; create(): BehaviorSubject<T> }`                                                                                                         |
| `IContextMap` | `{ set<T>(ctx: IContext<T>, value$: Observable<T>): void; require<T>(ctx: T): Observable<T["initialValue"]>; optional<T>(ctx: Context<T>): Observable<T> }` |

### Suspension Types

| Type                   | Description                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `SuspensionController` | `{ suspend(): void; resume(): void; downstream(): SuspensionController; complete(): void }` |
| `SuspensionContext`    | `{ suspended$: Observable<boolean>; downstream(): SuspensionController; complete(): void }` |

### VDOM & Rendering Types

| Type                    | Description                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `ElementNode`           | `Observable<ElementNode> \| IRenderNode \| IRenderText \| ElementNode[] \| null \| undefined`                       |
| `IRenderText`           | `string \| number \| bigint \| boolean`                                                                             |
| `IRenderNode`           | Union of all render node interfaces                                                                                 |
| `IRenderElementNode`    | `{ type: "ELEMENT"; tag: string; props: Record<string, any>; children: ElementNode; ... }`                          |
| `IRenderComponentNode`  | `{ type: "COMPONENT"; component: Component<any>; props: Record<string, any>; name: string; ... }`                   |
| `IRenderFragmentNode`   | `{ type: "FRAGMENT"; children: ElementNode; ... }`                                                                  |
| `IRenderSuspenseNode`   | `{ type: "SUSPENSE"; fallback: ElementNode; tolerance?: number; suspended?: boolean; ... }`                         |
| `IRenderRawHtmlNode`    | `{ type: "RAW_HTML"; content: string \| Observable<...> \| Promise<...> \| null \| undefined; ... }`                |
| `IRenderer<T, E>`       | Renderer interface with `createElement`, `createTextNode`, `setProperty`, `listen`, `place`, `move`, `remove`, etc. |
| `VRoot`                 | `{ mount(element: ElementNode): Subscription }`                                                                     |
| `VRenderEvent<T, E>`    | `{ event: IVRenderEventType; payload: T \| E; position: ElementPosition<T, E> }`                                    |
| `VNode<T, E, N>`        | Internal VDOM node with `mount()`, `update()`, `placeIn()`, `remove()`                                              |
| `ElementPosition<T, E>` | `{ parent: E; previous?: ElementPosition<T, E>; lastElement?: T \| E }`                                             |

### Prop Utility Types

| Type                         | Description                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `Properties<T>`              | Maps each key `K` to `Ref<T[K]> \| T[K] \| Observable<T[K]>`                           |
| `InputTake<P>`               | Maps each key `K` in `P` to `Observable<V>` with a `$` suffix (e.g., `name$`)          |
| `InputSpread<P>`             | Maps each key `K` in `P` to `Observable<V>` without suffix                             |
| `CombineOutput<T>`           | Unwraps observables to values in `T`, but preserves observables for `IDeferred` values |
| `PropsWithChildren<T>`       | `T & { children?: ElementNode }`                                                       |
| `PropsWithKey<T>`            | `T & { key?: Key \| null }`                                                            |
| `PropsWithKeyAndChildren<T>` | `PropsWithChildren<T> & PropsWithKey<T>`                                               |
| `WithClassName`              | `{ className?: string }`                                                               |
| `WithChildren`               | `{ children?: ElementNode }`                                                           |
| `ClassValue`                 | `clsx.ClassValue \| Observable<ClassValue>` (recursive)                                |

### Event Types

All standard DOM event handler types are available under the `JsxRx` namespace: `ReactEventHandler`, `ClipboardEventHandler`, `CompositionEventHandler`, `DragEventHandler`, `FocusEventHandler`, `FormEventHandler`, `ChangeEventHandler`, `InputEventHandler`, `KeyboardEventHandler`, `MouseEventHandler`, `TouchEventHandler`, `PointerEventHandler`, `UIEventHandler`, `WheelEventHandler`, `AnimationEventHandler`, `ToggleEventHandler`, `TransitionEventHandler`.

### JSX Intrinsic Elements

Full type definitions for all HTML and SVG intrinsic elements are available under `JsxRx.JSX.IntrinsicElements`, with complete props including ARIA attributes, data attributes, and CSS properties.

---

## 13. Entry Points Summary

| Entry Point                   | Description                                                          |
| ----------------------------- | -------------------------------------------------------------------- |
| `@jsxrx/core`                 | Main package — all core APIs                                         |
| `@jsxrx/core/dom`             | DOM renderer (`createRoot`, `fromRefEvent`, `createTestingRenderer`) |
| `@jsxrx/core/jsx-runtime`     | Automatic JSX runtime (`jsx`, `jsxs`, `Fragment`, `JSX` namespace)   |
| `@jsxrx/core/jsx-dev-runtime` | Development JSX runtime (`jsxDEV` with source locations)             |

---

## 14. Internal Functions

The following functions are used internally by the JSX runtime and VDOM engine. They are exported but typically not called directly.

### `_jsx`

```ts
_jsx(id: string, input: string | Component<any>, props: any, children: ElementNode, key?: any): RenderElementNode | RenderComponentNode
```

Internal JSX factory used by `jsx`/`jsxs` runtimes. Creates `RenderElementNode` for string tags and `RenderComponentNode` for component functions. Automatically merges `children` into props for components.

### `_fragment`

```ts
_fragment(id: string, children: ElementNode, key?: any): RenderFragmentNode
```

Internal fragment factory. Normalizes children via `asArray()`.

### `_suspense`

```ts
_suspense(id: string, props: SuspenseProps, children: ElementNode, key?: any): RenderSuspenseNode
```

Internal Suspense factory. Destructures `fallback`, `tolerance`, and `suspended` from props.
