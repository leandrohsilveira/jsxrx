# Event Handling

JsxRx offers three approaches for handling events, each suited to a different need: **direct DOM event handlers** for simple self-contained events, the **`emitter()` pattern** for callback-based events where the handler may change over time, and the **`fromRefEvent()` pattern** for composing DOM events as Observable streams.

Because [components run once](./02-components-and-state.md#components-run-once), there are no stale closures with any of these patterns — state values are read synchronously via `.value`, and callbacks are always resolved at invocation time.

---

## Table of Contents

- [Direct DOM Event Handlers](#direct-dom-event-handlers)
- [The `emitter()` Pattern](#the-emitter-pattern)
- [The `fromRefEvent()` Pattern](#the-fromrefevent-pattern)
- [Choosing the Right Pattern](#choosing-the-right-pattern)
- [Lifecycle-Aware Event Subscriptions](#lifecycle-aware-event-subscriptions)

---

## Direct DOM Event Handlers

For simple, self-contained events, you can use direct event handler attributes (`onClick`, `onInput`, `onSubmit`, etc.). JsxRx's DOM renderer attaches these listeners directly to the native DOM element:

```tsx
import { state } from "@jsxrx/core"

function Counter() {
  const count$ = state(0)

  function handleClick() {
    count$.set(count$.value + 1)
  }

  function handleInput(e: InputEvent) {
    const value = (e.currentTarget as HTMLInputElement).value
    name$.set(value)
  }

  return (
    <div>
      <button onClick={handleClick}>Count: {count$}</button>
      <input onInput={handleInput} />
    </div>
  )
}
```

### Why Direct Handlers Work

- **Components run once** — the function references defined during initialization are stable for the entire component lifecycle. There is no re-render cycle to break them.
- **No stale closures** — state variables like `count$` expose their current value synchronously via `.value`, even inside a closure. The getter reads the underlying `BehaviorSubject` directly.
- **Native DOM listeners** — the renderer sets event listeners directly on the element, so the handler always fires when the DOM event occurs.

### Limitations

- The handler function is captured at component initialization time and never changes. If you need a handler that changes based on props over time, use `emitter()` instead.
- Direct handlers are not available as Observable streams — you cannot pipe them through RxJS operators like `filter`, `map`, or `combineLatest`.

---

## The `emitter()` Pattern

When a callback function is passed as a prop from a parent component, the `emitter()` utility decouples the callback reference from the event invocation. This ensures the **latest** function is always called — even if the prop changes after the component is mounted.

### Login Form Example

The following example shows a resolver defining an `onSubmit` callback, and a component consuming it via `emitter()`:

```tsx
import { emitter, Props, state } from "@jsxrx/core"
import { map } from "rxjs"
import type { Observable } from "rxjs"

// In the component — use emitter
export default function LoginForm(props$: Observable<LoginFormProps>) {
  const { onSubmit$, isSubmitting$ } = Props.take(props$)
  const submitEmitter = emitter(onSubmit$)

  const email$ = state("")
  const password$ = state("")

  function handleFormSubmit(e: Event) {
    e.preventDefault()
    submitEmitter.emit({ email: email$.value, password: password$.value })
  }

  return (
    <form onSubmit={handleFormSubmit}>
      <input
        type="email"
        value={email$.value}
        onInput={e => email$.set(e.currentTarget.value)}
      />
      <input
        type="password"
        value={password$.value}
        onInput={e => password$.set(e.currentTarget.value)}
      />
      <button type="submit" disabled={isSubmitting$}>
        {isSubmitting$.pipe(map(p => (p ? "Logging in..." : "Login")))}
      </button>
    </form>
  )
}
```

### Why `emitter()` Avoids Stale Closures

- The callback function (`onSubmit`) can change reactively — different views or form states may pass different handlers over the component's lifetime.
- `emitter()` always resolves the **latest** function from the observable at the moment `.emit()` is called. The closure that captured an earlier callback is never invoked.
- Event timing is decoupled from prop change timing — the callback observable may emit a new function long after the component has already set up its event handlers.

### Emitter<T> vs OptionalEmitter<T>

- **`Emitter<T>`** — created when the observable emits a non-nullable function type. Every call to `.emit()` successfully invokes a callback.
- **`OptionalEmitter<T>`** — created when the observable type includes `null | undefined`. `.emit()` may resolve to `undefined` if no callback is currently available, allowing you to safely call it without a guard.

---

## The `fromRefEvent()` Pattern

For DOM events that need to be composed with other reactive streams, `fromRefEvent()` returns an `Observable<Event>` from a DOM element ref. This is ideal for click-outside detection, scroll listeners, resize observations, and any event stream that needs to be combined with other observables.

### Dropdown Click-Outside Example

```tsx
import { ref, fromRef, state, Props } from "@jsxrx/core"
import { fromRefEvent } from "@jsxrx/core/dom"
import { combine, filter, map } from "rxjs"
import type { Observable } from "rxjs"
import type { Lifecycle } from "@jsxrx/core"

function Dropdown(
  props$: Observable<DropdownProps>,
  { subscription }: Lifecycle,
) {
  const { items$ } = Props.take(props$)
  const open$ = state(false)
  const triggerRef = ref(HTMLElement)
  const dropdownRef = ref(HTMLDivElement)

  // Listen for click on trigger
  const triggerClick$ = fromRefEvent(triggerRef, "click")
  subscription.add(triggerClick$.subscribe(() => open$.set(!open$.value)))

  // Close on click outside
  const documentClick$ = fromRefEvent(document, "click")
  const outsideClick$ = combine({
    event: documentClick$,
    open: open$,
    dropdown: fromRef(dropdownRef),
  }).pipe(
    filter(
      ({ event, open, dropdown }) =>
        open && dropdown && !dropdown.contains(event.target as Node),
    ),
  )
  subscription.add(outsideClick$.subscribe(() => open$.set(false)))

  return (
    <div>
      <button ref={triggerRef}>Toggle</button>
      {open$.pipe(map(open => open && <div ref={dropdownRef}>{items$}</div>))}
    </div>
  )
}
```

### Conditional Listening with `while$`

The optional `while$` parameter lets you tear down and re-establish event listeners based on a boolean observable. The listener is only active while the condition is `true`:

```tsx
const enabled$ = state(true)
const hover$ = fromRefEvent(buttonRef, "mouseenter", enabled$)

// Only emits when enabled$ is true
// Setting enabled$.set(false) silently tears down the listener
```

This avoids the need for manual `subscribe`/`unsubscribe` logic — the lifecycle is managed reactively.

### Signature

```ts
fromRefEvent<T extends EventTarget>(
  ref: Ref<T> | Observable<T | Ref<T>> | T,
  name$: Observable<string> | string,
  while$?: Observable<boolean>
): Observable<Event>
```

The ref parameter accepts any of these forms:

- A `Ref<T>` created with `ref()`
- An Observable of elements or refs
- A direct element reference (e.g., `document`, `window`)

This flexibility means `fromRefEvent()` works with `document`, `window`, or any `EventTarget`, not just component-bound element refs.

---

## Choosing the Right Pattern

| Pattern                             | When to Use                                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct handler** (`onClick={fn}`) | Simple, self-contained events that don't need the callback to come from outside. State reads via `.value` are fine.                                                                 |
| **`emitter(callback$)`**            | Callback function passed from resolver or parent; callback may change over time; needs to invoke a function with specific arguments at the moment of the event.                     |
| **`fromRefEvent(ref, name)`**       | DOM events tied to specific elements; need the event as an observable stream for composition with other observables; conditional listening; click-outside detection; scroll/resize. |

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
  { subscription }: Lifecycle,
) {
  const { threshold$ } = Props.take(props$)

  // Create an event observable
  const scroll$ = fromRefEvent(window, "scroll")

  // Subscribe and register for auto-cleanup
  subscription.add(
    scroll$.subscribe(() => {
      const scrollY = window.scrollY
      console.log("Scrolled to:", scrollY)
    }),
  )

  return <div>Check console for scroll events</div>
}
```

### Why This Matters

- Without adding to `subscription`, manual subscriptions would continue listening after the component is removed from the DOM, causing **memory leaks** and potentially triggering updates on unmounted DOM nodes.
- The `subscription` object is an RxJS `Subscription` that is automatically unsubscribed when the component unmounts.
- Subscriptions created by observables embedded in JSX (via `{observable$}`) are managed automatically by the renderer. You only need manual `subscription.add()` for side-effect subscriptions — `subscribe()` calls, timers, imperative cleanup.

### Combining emitter with Lifecycle

The following example brings together all three event-handling concepts: `emitter()` for reactive callbacks, `Lifecycle.subscription` for automatic cleanup, and RxJS composition to orchestrate the event flow:

```tsx
import { emitter, Props } from "@jsxrx/core"
import { interval, switchMap, tap } from "rxjs"
import type { Observable, Lifecycle } from "@jsxrx/core"

function PollingComponent(
  props$: Observable<{ interval: number; onTick: () => void }>,
  { subscription }: Lifecycle,
) {
  const { interval$, onTick$ } = Props.take(props$)
  const tickEmitter = emitter(onTick$)

  // Set up an interval that calls the latest onTick
  subscription.add(
    interval$
      .pipe(switchMap(ms => interval(ms)))
      .subscribe(() => tickEmitter.emit()),
  )

  return <div>Polling...</div>
}
```

Here `emitter()` guarantees the interval always calls the current `onTick` callback, even if the resolver swaps it out. The `subscription.add()` ensures the entire observable chain is torn down when the component unmounts. The `switchMap` restarts the interval timer whenever the `interval$` prop changes.

---

**Next**: [Suspending Unready Subtrees](./06-suspense.md)
