# JsxRx Documentation

JsxRx is a **Component-driven JavaScript UI Library** that uses JSX for building components, powered by **RxJS observables** for reactivity. Build declarative, reactive user interfaces with a familiar component model and fine-grained observable subscriptions.

---

## User Guide

The JsxRx User Guide is a progressive walkthrough designed to be read in order. Each page builds on the previous one and ends with a "Next" link.

1. **[Getting Started](guide/01-getting-started.md)** — Setup: installation, Vite configuration, and your first component
2. **[Components & State](guide/02-components-and-state.md)** — Function components, reactive state with `state()`, and derived values
3. **[Observables as the Source of Reactivity](guide/03-observables.md)** — How RxJS Observables drive DOM updates with surgical precision
4. **[Properties Intake](guide/04-props.md)** — Receiving props with `Props.take()` and `Props.spread()`
5. **[Event Handling](guide/05-event-handling.md)** — Direct handlers, `emitter()` pattern, and `fromRefEvent()`
6. **[Suspending Unready Subtrees](guide/06-suspense.md)** — `<Suspense>` boundaries for loading states
7. **[API Client, Endpoints, Fetch and Action](guide/07-api-client.md)** — HTTP endpoints: reactive `fetch()` and imperative `action()`
8. **[Activity-Aware Suspense](guide/08-activity-aware-suspense.md)** — Auto-suspending with ActivityAwareObservable and API integration
9. **[Lifecycle](guide/09-lifecycle.md)** — The `Lifecycle` parameter: subscriptions, mount tracking, and context access
10. **[Context API](guide/10-context.md)** — Reactive state sharing via imperative context
11. **[Routing](guide/11-routing.md)** — Declarative routing, route trees, and resolvers
12. **[Lazy Loading](guide/12-lazy-loading.md)** — Code splitting with `lazy()` and `lazyResolver()`
13. **[Testing](guide/13-testing.md)** — Testing JsxRx components with `@jsxrx/testing-library`

## Contributing

These documents cover internal implementation details of JsxRx. They are intended for developers who want to contribute to JsxRx or understand its internals.

- [Observables Internals](contributing/observables-internals.md) — VDOM reconciliation, ObservableDelegate, Input, State, and Batch Rendering internals
- [Components Internals](contributing/components-internals.md) — Props intake mechanics, lifecycle creation, VDOM flow
- [JSX Internals](contributing/jsx-internals.md) — JSX transpilation pipeline, runtime functions, VDOM node types
- [Activity-Aware & Suspense Internals](contributing/activity-aware-internals.md) — ActivityAwareObservable, Suspense auto-detection, API client integration

## API Reference

- [api/core.md](api/core.md) — `@jsxrx/core` complete API: state, components, context, style, DOM, JSX runtime
- [api/router.md](api/router.md) — `@jsxrx/router` and `@jsxrx/router/browser`: route definitions, BrowserRouter, URL matching
- [api/api-client.md](api/api-client.md) — `@jsxrx/api`: HTTP client, endpoints, `fetch()` vs `action()` modes
- [api/utils.md](api/utils.md) — `@jsxrx/utils`: assertion, array/object/observable helpers
- [api/compiler.md](api/compiler.md) — `@jsxrx/compiler`: AST transform for build-time optimization
- [api/vite-plugin.md](api/vite-plugin.md) — `@jsxrx/vite-plugin`: Vite plugin configuration

## Examples

- [examples/counter.md](examples/counter.md) — Counter app example (runnable)
- [examples/todo-app.md](examples/todo-app.md) — Todo app example with component composition and derived state (runnable)

## Quick Links

- [Core package README](../packages/core/README.md) — Quickstart guide for `@jsxrx/core`
