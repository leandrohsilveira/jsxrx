/**
 * @import { Observable } from "rxjs"
 * @import { HttpClient, HttpClientParams, HttpEndpoint, HttpEndpointParams, ParamsMap, RequestFn } from "./types.js"
 * @import { PendingState } from "@jsxrx/core"
 */

import { state } from "@jsxrx/core"
import { asArray, shallowEqual } from "@jsxrx/utils"
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  from,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from "rxjs"

/**
 * @param {HttpClientParams} params
 * @returns {HttpClient}
 */
export function createHttpClient({ baseUrl, defaultHeaders = {} }) {
  return {
    /**
     * @template Req
     * @template Res
     * @template [Input=null]
     * @template [Output=null]
     * @param {HttpEndpointParams<Input, Req, Res, Output>} params
     * @returns {HttpEndpoint<Input, Output>}
     */
    createEndpoint({
      method = "GET",
      path,
      params = {},
      search = {},
      headers = {},
      body,
      requestSetup,
      responseSetup,
      requestBodyParser,
      responseBodyParser,
    }) {
      const send = /** @type {RequestFn<Input, Output>} */ (
        async input => {
          const setupResult = requestSetup?.(input)
          const parsedRequestParams = requestBodyParser?.(
            /** @type {*} */ (setupResult?.body ?? body ?? null),
          )

          const mergedParams = {
            ...params,
            ...parsedRequestParams?.params,
            ...setupResult?.params,
          }

          const mergedSearch = {
            ...search,
            ...parsedRequestParams?.search,
            ...setupResult?.search,
          }

          const mergedHeaders = {
            ...defaultHeaders,
            ...headers,
            Accept: responseBodyParser.accepts.join(","),
            ...parsedRequestParams?.headers,
            ...setupResult?.headers,
          }

          const resolvedPath = Object.entries(mergedParams).reduce(
            (result, [name, value]) =>
              result.replace(new RegExp(`{${name}}`, "g"), String(value)),
            path,
          )

          const response = await fetch(
            joinUrl(baseUrl, resolveSearch(resolvedPath, mergedSearch)),
            {
              method,
              headers: toHeaders(mergedHeaders),
              body: parsedRequestParams?.body,
            },
          )

          const result = await responseBodyParser.parse(response)

          return responseSetup(result)
        }
      )

      return {
        send,
        fetch(input$) {
          return input$.pipe(
            debounceTime(1),
            distinctUntilChanged(shallowEqual),
            switchMap(
              input =>
                /** @type {Observable<PendingState<Output>>} */ (
                  from(send(input)).pipe(
                    map(value => ({ state: "success", value, error: null })),
                    startWith({ state: "pending", value: null, error: null }),
                    catchError(error =>
                      of({ state: "error", value: null, error }),
                    ),
                  )
                ),
            ),
            shareReplay({ bufferSize: 1, refCount: true }),
          )
        },
        action() {
          const state$ = state(
            /** @type {PendingState<Output>} */ ({
              state: "idle",
              value: null,
              error: null,
            }),
          )
          return {
            kind: "async",
            state$: state$.pipe(debounceTime(1)),
            pending$: state$.pipe(
              debounceTime(1),
              map(state => state.state === "pending"),
              distinctUntilChanged(),
            ),
            value$: state$.pipe(
              debounceTime(1),
              filter(state => state.state === "success"),
              map(state => state.value),
            ),
            error$: state$.pipe(
              debounceTime(1),
              filter(state => state.state === "error"),
              map(state => state.error),
            ),
            reset() {
              state$.set({ state: "idle", value: null, error: null })
            },
            async perform(input) {
              try {
                state$.set({ state: "pending", value: null, error: null })
                const value = /** @type {Output} */ (await send(input))
                state$.set({ state: "success", value, error: null })
                return value
              } catch (error) {
                state$.set({ state: "error", value: null, error })
                throw error
              }
            },
          }
        },
      }
    },
  }
}

/**
 * @param {...string} segments
 */
function joinUrl(...segments) {
  return segments.map(value => value.replace(/^\/+|\/+$/g, "")).join("/")
}

/**
 * @param {ParamsMap} headers
 */
function toHeaders(headers) {
  const result = new Headers()
  for (const [name, raw] of Object.entries(headers)) {
    const values = asArray(raw)
    for (const value of values) {
      result.append(name, String(value))
    }
  }
  return result
}

/**
 * @param {string} path
 * @param {ParamsMap} search
 */
function resolveSearch(path, search) {
  const searchParams = new URLSearchParams()

  for (const [name, raw] of Object.entries(search)) {
    const values = asArray(raw)
    for (const value of values) {
      searchParams.append(name, String(value))
    }
  }

  if (searchParams.size === 0) return path
  return `${path}?${searchParams.toString()}`
}
