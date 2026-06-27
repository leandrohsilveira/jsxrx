# Event Handling

JsxRx offers two primary patterns for handling events: the `emitter()` pattern for callback-based events (form submissions, button clicks) and the `fromRefEvent()` pattern for DOM-level events (click outside, scroll, resize). For simple cases, direct event handler attributes (`onClick`, `onInput`) also work.

**Source files:** [`packages/core/src/component.js`](../../packages/core/src/component.js#L43-L51) (`emitter`), [`packages/core/src/dom/inputs.js`](../../packages/core/src/dom/inputs.js#L39-L52) (`fromRefEvent`)

---

## Table of Contents

1. [The emitter() Pattern](#the-emitter-pattern)
2. [The fromRefEvent() Pattern](#the-fromrefevent-pattern)
3. [Direct DOM Event Handlers](#direct-dom-event-handlers)
4. [Choosing the Right Pattern](#choosing-the-right-pattern)
5. [Lifecycle-Aware Event Subscriptions](#lifecycle-aware-event-subscriptions)

---

## The emitter() Pattern

**Source files:** [`packages/core/src/component.js`](../../packages/core/src/component.js#L43-L51)

Used when a callback function is passed as a prop from a resolver or parent component. The `emitter()` utility decouples the callback from the subscription lifecycle, ensuring the **latest** function is always invoked — even if the callback changes over time.

### Basic Usage

```tsx
import { emitter, Props, state } from "@jsxrx/core"
import { map } from "rxjs"
import type { Observable } from "rxjs"

// In the resolver — define the callback
function LoginResolver({ navigate }) {
  const loginAction = loginEndpoint.action()

  function handleSubmit(data: LoginData) {
    loginAction.perform(data).then(() => navigate("/dashboard"))
  }

  return {
    onSubmit: handleSubmit,           // plain function
    isSubmitting: loginAction.pending$,
  }
}

// In the component — use emitter
export default function LoginForm(props$: Observable<LoginFormProps>) {
  const { onSubmit$, isSubmitting$ } = Props.take(props$)
  const submitEmitter = emitter(onSubmit$)

  // Form state (local to component)
  const email$ = state("")
  const password$ = state("")

  function handleFormSubmit(e: Event) {
    e.preventDefault()
    submitEmitter.emit({ email: email$.value, password: password$.value })
  }

  return (
    <form onSubmit={handleFormSubmit}>
      <input type="email" value={email$.value}
        onInput={e => email$.set(e.currentTarget.value)} />
      <input type="password" value={password$.value}
        onInput={e => password$.set(e.currentTarget.value)} />
      <button type="submit" disabled={isSubmitting$}>
        {isSubmitting$.pipe(map(p => p ? "Logging in..." : "Login"))}
      </button>
    </form>
  )
}
```

### Why `emitter()`?

- The callback function (`onSubmit`) can change reactively — different forms or views may pass different handlers over time
- `emitter()` always calls the **latest** function emitted by the observable, never a stale closure
- Decouples **event timing** from **prop change timing** — the callback observable may emit a new function after the component has already set up its event handlers
- No manual subscribe-and-store pattern needed

### How `emitter()` Works Internally

```ts
// Simplified implementation
function emitter(value$) {
  return {
    async emit(...args) {
      const fn = await lastValueFrom(value$.pipe(take(1)))
      return await fn?.(...args)
    },
  }
}
```

1. `emitter()` takes an `Observable<Fn>` (or `Observable<Fn | null | undefined>`)
2. Each call to `.emit(...args)` resolves the latest function from the observable using `lastValueFrom` with `take(1)`
3. The resolved function is invoked with the provided arguments
4. If the observable emits `null` or `undefined` (nullable case), `.emit()` returns `undefined` instead of throwing

### Interfaces

```ts
interface Emitter<T extends Fn> {
  emit: AsyncFn<T>                          // always expects a callback
}

interface OptionalEmitter<T extends Fn> {
  emit: AsyncFn<(...args: Parameters<T>) => ReturnType<T> | undefined>
}
```

- **`Emitter<T>`** — created when the observable emits a non-nullable function type. `.emit()` always successfully resolves and invokes a callback.
- **`OptionalEmitter<T>`** — created when the observable type includes `null | undefined`. `.emit()` may resolve to `undefined` if no callback is currently available.

---

## The fromRefEvent() Pattern

**Source files:** [`packages/core/src/dom/inputs.js`](../../packages/core/src/dom/inputs.js#L39-L52)

Used for listening to DOM events on specific elements via refs. Returns an `Observable<Event>` that can be composed with other RxJS operators — ideal for click-outside detection, scroll listeners, resize observations, and any event stream that needs to be combined with other reactive state.

### Basic Usage

```tsx
import { ref, fromRef, state, Props } from "@jsxrx/core"
import { fromRefEvent } from "@jsxrx/core/dom"
import { combine, filter, map } from "rxjs"
import type { Observable } from "rxjs"
import type { Lifecycle } from "@jsxrx/core"

function Dropdown(props$: Observable<DropdownProps>, { subscription }: Lifecycle) {
  const { items$ } = Props.take(props$)
  const open$ = state(false)
  const triggerRef = ref(HTMLElement)
  const dropdownRef = ref(HTMLDivElement)

  // Listen for click on trigger
  const triggerClick$ = fromRefEvent(triggerRef, "click")
  subscription.add(
    triggerClick$.subscribe(() => open$.set(!open$.value))
  )

  // Close on click outside
  const documentClick$ = fromRefEvent(document, "click")
  const outsideClick$ = combine({
    event: documentClick$,
    open: open$,
    dropdown: fromRef(dropdownRef),
  }).pipe(
    filter(({ event, open, dropdown }) =>
      open && dropdown && !dropdown.contains(event.target as Node)
    )
  )
  subscription.add(
    outsideClick$.subscribe(() => open$.set(false))
  )

  return (
    <div>
      <button ref={triggerRef}>Toggle</button>
      {open$.pipe(map(open => open && (
        <div ref={dropdownRef}>
          {items$}
        </div>
      )))}
    </div>
  )
}
```

### Why `fromRefEvent()`?

- Creates an `Observable<Event>` from a DOM element + event name — the event can be composed with other observables via RxJS operators
- Uses RxJS `fromEvent` internally
- Respects the optional `while$` parameter for conditional listening (e.g., only listen while the dropdown is open)
- The ref can be a `Ref<T>`, an observable of elements, or a direct element reference — the function normalizes all forms
- Works with `document`, `window`, or any `EventTarget`, not just element refs

### Signature

```ts
fromRefEvent<T extends EventTarget>(
  ref: Ref<T> | Observable<T | Ref<T>> | T,
  name$: Observable<string> | string,
  while$?: Observable<boolean>
): Observable<Event>
```

### How It Works

1. The ref is normalized via `fromRef()` — supports `Ref<T>`, `Observable<T | Ref<T>>`, or a plain element
2. All three inputs (`ref`, `name`, `while`) are combined with `combineLatest`
3. When all inputs emit, `switchMap` creates or tears down the `fromEvent` listener
4. If `ref` is `null` or `while$` emits `false`, the observable returns `NEVER` (a no-op that never emits)
5. When the ref, event name, or while condition changes, the old listener is torn down and a new one is set up

This means you can dynamically change the event name or the element being listened to — the event listener automatically re-binds.

### Conditional Listening with `while$`

```tsx
const enabled$ = state(true)
const hover$ = fromRefEvent(buttonRef, "mouseenter", enabled$)

// Only emits when enabled$ is true
// Setting enabled$.set(false) silently tears down the listener
```

---

## Direct DOM Event Handlers

For simple, self-contained events, you can use direct event handler attributes (like `onClick`, `onInput`). This works because JsxRx's DOM renderer attaches event listeners directly to DOM elements:

```tsx
import { state } from "@jsxrx/core"

function Counter() {
  const count$ = state(0)

  function increment() {
    count$.set(count$.value + 1)
  }

  function handleInput(e: InputEvent) {
    const value = (e.currentTarget as HTMLInputElement).value
    name$.set(value)
  }

  return (
    <div>
      <button onClick={increment}>
        Count: {count$}
      </button>
      <input onInput={handleInput} />
    </div>
  )
}
```

### Why Direct Handlers Work

- Components run **once** and never re-render — the function references defined during initialization are stable for the entire component lifecycle
- There are **no stale closure issues** because state variables like `count$` expose their current value synchronously via `.value`, even inside a closure
- The DOM renderer sets event listeners directly on the native element, so the handler always fires when the DOM event occurs

### Limitations

- The handler function is captured at component initialization time — it never changes
- If you need a handler that changes over time (e.g., different callbacks based on props), use `emitter()` instead
- Direct handlers are not available as Observable streams — you cannot pipe them through RxJS operators

---

## Choosing the Right Pattern

| Pattern | When to Use |
|---|---|
| **Direct handler** (`onClick={fn}`) | Simple, self-contained events that don't need the callback to come from outside. State reads via `.value` are fine. |
| **`emitter(callback$)`** | Callback function passed from resolver or parent; callback may change over time; needs to invoke a function with specific arguments at the moment of the event. |
| **`fromRefEvent(ref, name)`** | DOM events tied to specific elements; need the event as an observable stream for composition with other observables; conditional listening; click-outside detection; scroll/resize. |

### Quick Decision Flow

```text
Do you need the callback to come from a prop or resolver?
  ├── Yes → Do you need to compose the event with other observables?
  │         ├── Yes → fromRefEvent(ref, name) + combine()
  │         └── No  → emitter(callback$)
  └── No  → Do you need the event as an Observable stream?
            ├── Yes → fromRefEvent(ref, name)
            └── No  → Direct handler (onClick, onInput)
```

---

## Lifecycle-Aware Event Subscriptions

When subscribing to observables manually — such as those created by `fromRefEvent()` — always use the component's `subscription` (from `Lifecycle`) to auto-cleanup on unmount:

```tsx
import { fromRefEvent } from "@jsxrx/core/dom"
import { ref } from "@jsxrx/core"
import type { Observable, Lifecycle } from "@jsxrx/core"

function ScrollSpy(
  props$: Observable<{ threshold: number }>,
  { subscription }: Lifecycle
) {
  const { threshold$ } = Props.take(props$)

  // Create an event observable
  const scroll$ = fromRefEvent(window, "scroll")

  // Subscribe and register for auto-cleanup
  subscription.add(
    scroll$.subscribe(() => {
      const scrollY = window.scrollY
      console.log("Scrolled to:", scrollY)
    })
  )

  return <div>Check console for scroll events</div>
}
```

### Why This Matters

- Without adding to `subscription`, manual subscriptions would continue listening after the component is removed from the DOM, causing **memory leaks** and potentially triggering updates on unmounted DOM nodes
- The `subscription` object is an RxJS `Subscription` that is automatically unsubscribed when the component unmounts
- All subscriptions created by observables embedded in JSX (via `{observable$}`) are managed automatically by the renderer — you only need manual `subscription.add()` for side-effect subscriptions (e.g., `subscribe()` calls, timers, imperative cleanup)

### Pattern: Combining emitter with Lifecycle

```tsx
function PollingComponent(
  props$: Observable<{ interval: number; onTick: () => void }>,
  { subscription }: Lifecycle
) {
  const { interval$, onTick$ } = Props.take(props$)
  const tickEmitter = emitter(onTick$)

  // Set up an interval that calls the latest onTick
  subscription.add(
    interval$.pipe(
      switchMap(ms => interval(ms)),
      tap(() => tickEmitter.emit())
    ).subscribe()
  )

  return <div>Polling...</div>
}
```

This pattern combines three event-handling concepts:
- **`emitter()`** for reactive callbacks that may change
- **`Lifecycle.subscription`** for automatic cleanup
- **RxJS composition** (`pipe`, `switchMap`, `tap`) to orchestrate the event flow

---

## Source Files Referenced

| Concept | Source File |
|---|---|
| `emitter()` | [`packages/core/src/component.js`](../../packages/core/src/component.js#L43-L51) |
| `fromRef()` | [`packages/core/src/component.js`](../../packages/core/src/component.js#L67-L80) |
| `fromRefEvent()` | [`packages/core/src/dom/inputs.js`](../../packages/core/src/dom/inputs.js#L39-L52) |
| `state()`, `ref()` | [`packages/core/src/component.js`](../../packages/core/src/component.js#L22-L24) |
| `Emitter<T>`, `OptionalEmitter<T>` | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L39-L51) |
| `Lifecycle` | [`packages/core/src/jsx.d.ts`](../../packages/core/src/jsx.d.ts#L137-L145) |
