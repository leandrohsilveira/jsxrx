## Core API Quick Reference

### `state()`
```ts
state<T>(initial: T): IState<T>                    // from "@jsxrx/core"
```
Reactive cell backed by `BehaviorSubject`. Extends `Observable<T>` with synchronous `.value` getter and `.set(value)`.
```tsx
import { state } from "@jsxrx/core"
const count$ = state(0)
count$.set(count$.value + 1)
;<p>{count$}</p>   {/* auto-updating text node */}
```

### `Props.take()`
```ts
Props.take<P, D>(input$: Observable<P>, defaultProps?: D): InputTake<P & D>   // from "@jsxrx/core"
```
Destructures component props into individual `propName$` observable streams (note `$` suffix). Defaults fill `null`/`undefined` props.
```tsx
import { Props } from "@jsxrx/core"
const { label$, variant$ } = Props.take(props$, { variant: "primary" })
return <button className={variant$}>{label$}</button>
```

### `Props.spread()`
```ts
Props.spread<P, D>(input$: Observable<P>, defaultProps?: D): Observable<InputSpread<P & D>>   // from "@jsxrx/core"
```
Returns `Observable` of full props object where each key maps to an `Observable` (no `$` suffix). For forwarding props.
```tsx
import { Props } from "@jsxrx/core"
return Props.spread(props$).pipe(map(props => <div {...props} />))
```

### `emitter()`
```ts
emitter<T extends Fn>(value$: Observable<T>): Emitter<T>                    // from "@jsxrx/core"
emitter<T extends Fn>(value$: Observable<T | null | undefined>): OptionalEmitter<T>
```
Creates event emitter from observable of functions. `Emitter.emit(...args)` invokes the latest function. `OptionalEmitter.emit()` returns `undefined` if no handler.
```tsx
import { emitter } from "@jsxrx/core"
const submit = emitter(onSubmit$)
submit.emit(formData)
```

### `ref()`
```ts
ref<T>(construct: new () => T): Ref<T>             // from "@jsxrx/core"
```
DOM element reference. `ElementRef<T>.current` is a `BehaviorSubject<T | null>`. Constructor arg is for type inference only.
```tsx
import { ref } from "@jsxrx/core"
const btnRef = ref(HTMLButtonElement)
;<button ref={btnRef}>Click</button>
btnRef.current.subscribe(el => el && console.log("mounted"))
```

### `fromRefEvent()`
```ts
fromRefEvent<T extends EventTarget>(                                          // from "@jsxrx/core/dom"
  ref: Ref<T> | Observable<T | Ref<T>> | T,
  name: Observable<string> | string, while$?: Observable<boolean>
): Observable<Event>
```
Creates Observable from DOM events on a ref. Returns `NEVER` if ref is `null` or `while$` emits `false`.
```tsx
import { fromRefEvent } from "@jsxrx/core/dom"
const click$ = fromRefEvent(ref(HTMLButtonElement), "click")
const hover$ = fromRefEvent(btnRef, "mouseenter", enabled$)  // conditional
```

### `combine()`
```ts
combine<T extends Record<string, unknown>>(data: T): Observable<CombineOutput<T>>   // from "@jsxrx/core"
```
Merges plain values + observables into single observable. Uses `combineLatest` + 1ms debounce + `shallowComparator` dedup + `share()`. Deferred values emit as observables (not unwrapped).
```tsx
import { combine } from "@jsxrx/core"
const view$ = combine({ name: name$, age: age$ }).pipe(
  map(({ name, age }) => <p>{name}, {age}</p>),
)
```

### `classes()`
```ts
classes(...tokens: ClassValue[]): Observable<string>   // from "@jsxrx/core"
```
Reactive class name builder. Strings, objects, arrays, observables at any nesting depth. Uses `clsx` internally.
```tsx
import { state, classes } from "@jsxrx/core"
const className$ = classes("base-btn", { active: isActive$ }, "px-4")
// emits: "base-btn active px-4"
```

### `variants()`
```ts
variants<T extends string>(                                                    // from "@jsxrx/core"
  input: Observable<T> | T, variantMap: Record<T, ClassValue>, defaultStyles?: ClassValue
): Observable<string>
```
Reactive variant selector. Selects class from map by current variant key. Falls back to `defaultStyles`.
```tsx
import { state, variants } from "@jsxrx/core"
const btnClass$ = variants(variant$, { primary: "bg-blue-500", danger: "bg-red-500" }, "bg-gray-200")
```

### `Suspense`
```ts
// Component<PropsWithChildren<SuspenseProps>>   from "@jsxrx/core"
interface SuspenseProps { fallback: ElementNode; tolerance?: number; suspended?: boolean | Observable<boolean> }
```
Suspense boundary. Auto-detects pending observables in subtree and shows fallback. `tolerance` prevents flash on fast loads.
```tsx
import { Suspense } from "@jsxrx/core"
;<Suspense fallback={<Spinner />} tolerance={200}><AsyncContent /></Suspense>
```

### `lazy()`
```ts
lazy(importer: () => Promise<T>): T["default"]                                 // from "@jsxrx/core"
lazy(importer: () => Promise<T>, name: N): T[N]
```
Lazy-loaded component. Default or named export. Caches for app lifetime. Always wrap in `<Suspense>`.
```tsx
import { lazy } from "@jsxrx/core"
const Login = lazy(() => import("./Login"))
const Dashboard = lazy(() => import("./pages"), "Dashboard")
```

### `createRoot().mount()`
```ts
createRoot(element: Element | null | undefined, options?): VRoot                   // from "@jsxrx/core/dom"
// options: { batchTime?: number, logger?: Logger }
// .mount(elementNode): Subscription  — unsubscribe to unmount
```
Creates DOM render root. `batchTime` default 10ms (0 = synchronous).
```tsx
import { createRoot } from "@jsxrx/core/dom"
const sub = createRoot(document.getElementById("app"), { batchTime: 16 }).mount(<App />)
// sub.unsubscribe() to unmount
```

### `Context<T>`
```ts
class Context<T> { constructor(name: string, initialValue: T) }   // from "@jsxrx/core"
```
Typed context key. Use with `context.set()` / `context.require()` / `context.optional()` from `Lifecycle`.
```tsx
import { Context } from "@jsxrx/core"
const ThemeCtx = new Context("theme", "light")
// Provide: context.set(ThemeCtx, of("dark"))
// Consume: context.require(ThemeCtx)     // throws if not set
//          context.optional(ThemeCtx)    // falls back to initialValue
```

### `Lifecycle`
```ts
import type { Lifecycle } from "@jsxrx/core"

interface Lifecycle {
  subscription: Subscription          // auto-cleanup on unmount
  mounted$: Observable<boolean>       // emits true once when mounted
  unmounted$: Observable<boolean>     // emits true once before unmount
  context: IContextMap                // imperative context API
}
```

### `IContextMap`
```ts
interface IContextMap {
  set<T>(context: IContext<T>, value$: Observable<T>): void
  require<T extends IContext<any>>(context: T): Observable<T["initialValue"]>
  optional(context: Context<T>): Observable<T>
}
```

### `rawHtml()`
```ts
rawHtml(id: string, content: RawHtmlContent, key?: any): IRenderRawHtmlNode   // from "@jsxrx/core"
```
Raw HTML render node. Bypasses VDOM for SVG, third-party widgets. **Security:** sanitize all input (XSS vector).
```tsx
import { rawHtml } from "@jsxrx/core"
const icon = rawHtml("chart-icon", `<svg viewBox="0 0 24 24">...</svg>`)
const widget = rawHtml("live-widget", widgetHtml$)
```

### `pending()`
```ts
pending(value: Observable<unknown> | AsyncState<unknown>, debounce?: number): Observable<boolean>   // from "@jsxrx/core"
```
Derives loading boolean from observable. Handles `AsyncState`, `ActivityAwareObservable`, and `Observable<PendingState>`. Default debounce 5ms.
```tsx
import { pending } from "@jsxrx/core"
const loading$ = pending(myData$)
```

### `activity()` / `toActivityAware()`
```ts
activity(): { pending$, start(), complete<T>(), pipe<T,R>(op), toObservable<T>(obs) }   // from "@jsxrx/core"
toActivityAware<T>(attacher: (attach) => Observable<T>): Observable<T>                    // returned has .pending$
```
`activity()` — imperative tracker with `start()`/`complete()` tap operators. `toActivityAware()` — declarative wrapper; nested activity-aware observables tracked via `attach()`.
```tsx
import { activity, toActivityAware } from "@jsxrx/core"
const tracker = activity()
const data$ = of(null).pipe(tracker.pipe(ajax.getJSON("/api/users")))
// or: const aware$ = toActivityAware(attach => source$.pipe(switchMap(v => attach(fetch(v)))))
```

### `Fragment`
```ts
Fragment: Component<PropsWithChildren<{}>>          // from "@jsxrx/core"
```
For `<>...</>` syntax. Always renders `null` — children rendered without wrapper.
```tsx
import { Fragment } from "@jsxrx/core"
;<><li>A</li><li>B</li></>
```

### `defer()`
```ts
defer<T>(value: Observable<T>): IDeferred<T>        // from "@jsxrx/core"
```
Wraps observable to prevent auto-unwrapping in `combine()`. The observable itself is emitted, not its resolved value.
```tsx
import { defer, combine } from "@jsxrx/core"
combine({ plain: state(42), deferred: defer(state(42)) })
// plain emits number, deferred emits Observable<number>
```

### `fromRef()`
```ts
fromRef<T>(value: Ref<T> | Observable<T | Ref<T>> | T): Observable<T | null>   // from "@jsxrx/core"
```
Resolves refs and observables to flat observable of ref's `.current`. Nested observables flattened via `switchMap`.
```tsx
import { ref, fromRef } from "@jsxrx/core"
fromRef(ref(HTMLDivElement)).subscribe(el => console.log(el?.tagName))
```

### `isRef()`
```ts
isRef<T>(value: unknown): value is Ref<T>            // from "@jsxrx/core"
```
Type guard — checks if value is an `ElementRef` instance (created by `ref()`).
```tsx
import { isRef } from "@jsxrx/core"
if (isRef(someValue)) someValue.current.subscribe(el => {})
```
