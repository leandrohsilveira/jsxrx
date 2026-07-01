/**
 * @import { Observable } from "rxjs"
 * @import { NavigateFn, NavigateOptions, Route, RouteResolverInput, Routes } from "../types.js"
 */

import { combine, emitter, Props } from "@jsxrx/core"
import {
  debounceTime,
  distinctUntilChanged,
  fromEvent,
  isObservable,
  map,
  merge,
  of,
  startWith,
  Subject,
  switchMap,
} from "rxjs"
import { matchUrl, parsePathnameParams } from "../utils.js"
import { jsx } from "@jsxrx/core/jsx-runtime"
import { asArray, shallowComparator } from "@jsxrx/utils"

/**
 * @exports @typedef BrowserRouterProps
 * @property {Routes} routes
 */

/**
 * @param {Observable<BrowserRouterProps>} props$
 */
export function BrowserRouter(props$) {
  const { routes$ } = Props.take(props$)

  const { url$, navigateTo, refresh } = createHistoryObservable()

  // @ts-expect-error yes, there's no id on default JSX type.
  return jsx("browserRouter:root", RouteComponent, {
    routes: routes$,
    url: url$,
    navigateTo,
    refresh,
  })
}

/**
 * @typedef RouteComponentProps
 * @property {Routes} routes
 * @property {URL} url
 * @property {NavigateFn} navigateTo
 * @property {() => void} refresh
 * @property {string} [path]
 * @property {boolean} [matched]
 */

/**
 * @param {Observable<RouteComponentProps>} props$
 * @param {import("@jsxrx/core").Lifecycle} lifecycle
 */
export function RouteComponent(props$, { context }) {
  const { routes$, path$, url$, navigateTo$, matched$, refresh$ } = Props.take(
    props$,
    {
      path: "",
      matched: true,
    },
  )

  const refreshEmitter = emitter(refresh$)
  const navigateToEmmiter = emitter(navigateTo$)

  const match$ = combine({ routes: routes$, path: path$, url: url$ }).pipe(
    debounceTime(1),
    map(({ routes, url, path }) =>
      matchUrl(
        url,
        path || "/",
        !isRoute(routes) || routes.children ? "startsWith" : "exact",
      ),
    ),
  )

  /** @type {RouteResolverInput} */
  const resolverInput = {
    url$,
    path: new Proxy(
      {},
      {
        get(_, name) {
          return match$.pipe(
            map(match => match?.params ?? {}),
            distinctUntilChanged(shallowComparator),
            map(params => params[String(name)]),
          )
        },
      },
    ),
    query: new Proxy(
      {},
      {
        get(_, name) {
          return match$.pipe(
            map(match =>
              Object.fromEntries(match?.url.searchParams.entries() ?? []),
            ),
            distinctUntilChanged(shallowComparator),
            map(params => params[String(name)]),
          )
        },
      },
    ),
    navigate(to, options) {
      return navigateToEmmiter.emit(to, options)
    },
    refresh() {
      return refreshEmitter.emit()
    },
    context,
  }

  return combine({ routes: routes$, path: path$ }).pipe(
    debounceTime(1),
    distinctUntilChanged(shallowComparator),
    map(({ routes, path }) => {
      if (isRoute(routes)) {
        return combine({
          parentMatch: matched$,
          match: match$,
        }).pipe(
          map(({ parentMatch, match }) => parentMatch && !!match),
          distinctUntilChanged(),
          debounceTime(1),
          switchMap(match => {
            if (!match) return of(null)

            const props$ = resolveProps(
              routes,
              resolverInput,
              routes.children
                ? // @ts-expect-error standard jsx function does not have this id optmization
                  jsx(`route:${routes.id}:children`, RouteComponent, {
                    url: url$,
                    path,
                    routes: routes.children,
                    navigateTo: navigateTo$,
                    refresh: refresh$,
                  })
                : null,
            )

            return props$.pipe(
              map(props =>
                // @ts-expect-error standard jsx function does not have this id optmization
                jsx(`route:${routes.id}`, routes.component, props),
              ),
            )
          }),
        )
      }

      const routesEntries = Object.entries(routes)

      const matchedRoute$ = url$.pipe(
        debounceTime(1),
        map(url => {
          const [, route] =
            routesEntries.find(([key]) => {
              const subPath = key === "index" ? path : `${path}${key}`

              return !!matchUrl(url, subPath || "/")
            }) ?? []
          return route
        }),
        distinctUntilChanged(),
      )

      return routesEntries.map(([key, route]) => {
        const subPath = key === "index" ? path : `${path}${key}`
        return jsx(
          `routes:${subPath}`,
          RouteComponent,
          {
            routes: route,
            path: subPath,
            url: url$,
            navigateTo: navigateTo$,
            refresh: refresh$,
            matched: matchedRoute$.pipe(
              map(matchedRoute => matchedRoute === route),
            ),
          },
          // @ts-expect-error standard jsx function does not have this id optmization
          `routes:${subPath}`,
        )
      })
    }),
    debounceTime(1),
  )
}

/**
 * @param {Route} route
 * @param {RouteResolverInput} input
 * @param {JsxRx.ElementNode} children
 *
 * @returns {Observable<Record<string, *>>}
 */
function resolveProps(route, input, children) {
  if ("resolve" in route) {
    const resolver$ = isObservable(route.resolve)
      ? route.resolve
      : of(route.resolve)
    return resolver$.pipe(
      map(resolve => ({
        ...resolve(input),
        children,
      })),
    )
  }
  return of({
    children,
  })
}

const distinctUrlChanged = distinctUntilChanged(
  (a, b) => a?.toString() === b?.toString(),
)
const mapToUrl = map(() => toUrl())

function createHistoryObservable() {
  /** @type {Subject<URL>} */
  const navigate$ = new Subject()
  /** @type {Subject<Symbol>} */
  const refresher$ = new Subject()

  const popstate$ = fromEvent(window, "popstate").pipe(mapToUrl)

  return {
    url$: merge(
      merge(navigate$, popstate$).pipe(startWith(toUrl()), distinctUrlChanged),
      refresher$.pipe(mapToUrl),
    ),

    /**
     * @param {string} to
     * @param {NavigateOptions} [options]
     */
    navigateTo(to, options) {
      const url = toUrl(parsePathnameParams(to, options?.params ?? {}))

      if (options?.query) {
        for (const [name, values] of Object.entries(options.query)) {
          for (const value of asArray(values)) {
            if (value === null || value === undefined) continue
            url.searchParams.append(name, String(value))
          }
        }
      }

      navigate$.next(url)

      if (options?.replace)
        return window.history.replaceState({}, "", url.toString())
      return window.history.pushState({}, "", url.toString())
    },

    refresh() {
      refresher$.next(Symbol())
    },
  }
}

/**
 * @param {string} [to]
 */
function toUrl(to) {
  return new URL(to ?? window.location.href, window.location.origin)
}

/**
 * @param {unknown} value
 * @returns {value is Route}
 */
function isRoute(value) {
  return value !== null && typeof value === "object" && "component" in value
}
