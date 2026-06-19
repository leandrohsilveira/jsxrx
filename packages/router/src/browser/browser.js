/**
 * @import { Observable } from "rxjs"
 * @import { NavigateFn, NavigateOptions, Route, RouteResolverInput, Routes } from "../types.js"
 */

import { combine, emitter, Props } from "@jsxrx/core"
import {
  debounceTime,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  startWith,
  Subject,
} from "rxjs"
import { matchUrl } from "../utils.js"
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
  const { routes } = Props.take(props$)

  const { url$, navigateTo } = createHistoryObservable()

  // @ts-expect-error yes, there's no id on default JSX type.
  return jsx("browserRouter:root", RouteComponent, {
    routes,
    url: url$,
    navigateTo,
  })
}

/**
 * @typedef RouteComponentProps
 * @property {Routes} routes
 * @property {URL} url
 * @property {NavigateFn} navigateTo
 * @property {string} [path]
 * @property {boolean} [matched]
 */

/**
 * @param {Observable<RouteComponentProps>} props$
 * @param {import("@jsxrx/core").Lifecycle} lifecycle
 */
export function RouteComponent(props$, { context }) {
  const {
    routes: routes$,
    path,
    url,
    navigateTo,
    matched,
  } = Props.take(props$, { path: "", matched: true })

  const navigateTo$ = emitter(navigateTo)

  const match$ = combine({ routes: routes$, path, url }).pipe(
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
    url$: url,
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
      return navigateTo$.emit(to, options)
    },
    context,
  }

  return combine({ routes: routes$, path }).pipe(
    debounceTime(1),
    distinctUntilChanged(shallowComparator),
    map(({ routes, path }) => {
      if (isRoute(routes)) {
        return matched.pipe(
          distinctUntilChanged(),
          debounceTime(1),
          map(match => {
            if (!match) return null

            const props = resolveProps(
              routes,
              resolverInput,
              routes.children
                ? // @ts-expect-error standard jsx function does not have this id optmization
                  jsx(`route:${routes.id}:children`, RouteComponent, {
                    url,
                    path,
                    routes: routes.children,
                    navigateTo,
                  })
                : null,
            )

            // @ts-expect-error standard jsx function does not have this id optmization
            return jsx(`route:${routes.id}`, routes.component, props)
          }),
        )
      }

      const routesEntries = Object.entries(routes)

      const matchedRoute$ = url.pipe(
        debounceTime(1),
        map(url => {
          const [, route] =
            routesEntries.find(([key]) => {
              const subPath = key === "index" ? path : `${path}${key}`

              return !!matchUrl(url, subPath || "/")
            }) ?? []
          return route
        }),
      )

      return routesEntries.map(([key, route]) => {
        const subPath = key === "index" ? path : `${path}${key}`
        return jsx(
          `routes:${subPath}`,
          RouteComponent,
          {
            routes: route,
            path: subPath,
            url,
            navigateTo,
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
 * @returns {Record<string, *>}
 */
function resolveProps(route, input, children) {
  if ("resolve" in route) {
    return {
      ...route.resolve(input),
      children,
    }
  }
  return {
    children,
  }
}

function createHistoryObservable() {
  /** @type {Subject<URL>} */
  const navigate$ = new Subject()
  const popstate$ = fromEvent(window, "popstate").pipe(map(() => toUrl()))

  return {
    url$: merge(navigate$, popstate$).pipe(
      startWith(toUrl()),
      distinctUntilChanged((a, b) => a?.toString() === b?.toString()),
    ),

    /**
     * @param {string} to
     * @param {NavigateOptions} [options]
     */
    navigateTo(to, options) {
      const url = toUrl(to)
      if (options?.query) {
        for (const [name, values] of Object.entries(options.query)) {
          for (const value of asArray(values)) {
            if (value === null || value === undefined) continue
            url.searchParams.append(name, String(value))
          }
        }
      }
      navigate$.next(url)
      window.history.pushState({}, "", url.toString())
    },
  }

  /**
   * @param {string} [to]
   */
  function toUrl(to) {
    return new URL(to ?? window.location.href, window.location.origin)
  }
}

/**
 * @param {unknown} value
 * @returns {value is Route}
 */
function isRoute(value) {
  return value !== null && typeof value === "object" && "component" in value
}
