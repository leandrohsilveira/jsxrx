import { Component, IContextMap, Properties, WithChildren } from "@jsxrx/core"
import { Observable } from "rxjs"

export type NavigateOptions = {
  replace?: boolean
  query?: Record<
    string,
    string | number | null | undefined | (string | number | null | undefined)[]
  >
  params?: Record<string, string | number | null | undefined>
}
export type NavigateFn = (to: string, options?: NavigateOptions) => void

export interface RouteResolverInput<
  Path extends string = string,
  Query extends string = string,
> {
  path: Record<Path, Observable<string>>
  query: Record<Query, Observable<string[] | undefined>>
  context: IContextMap
  url$: Observable<URL>
  navigate: NavigateFn
  refresh: () => void
}

export type RouteWithChildrenOptions = {
  children: Routes
}

export type ResolvedProps<Props> = Properties<Omit<Props, "children">>

export type RouteOptions<Props, Path extends string, Query extends string> = {
  params?: {
    path?: Path[]
    query?: Query[]
  }
  resolve(input: RouteResolverInput<Path, Query>): ResolvedProps<Props>
  children?: Props extends WithChildren ? Routes : never
}

export type Route<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Props = any,
  Path extends string = string,
  Query extends string = string,
> = RouteWithProps<Props, Path, Query> | RouteBasic<Props>

export interface RouteBasic<Props> {
  id: string
  component: Props extends WithChildren
    ? Component<WithChildren>
    : Component<unknown>
  children?: Props extends WithChildren ? Routes : never
}

export type RouteWithProps<
  Props,
  Path extends string,
  Query extends string,
> = RouteOptions<Props, Path, Query> & {
  id: string
  component: Component<Props>
  children?: Props extends WithChildren ? Routes : never
}

export type Routes =
  | {
      [key: `/${string}`]: Route | Routes
    }
  | {
      index: Route
    }

export interface RouteMatch {
  url: URL
  fragments: string[]
  params: Record<string, string>
  pattern: string
}
