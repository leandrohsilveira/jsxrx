/**
 * @import { Observable } from "rxjs"
 * @import { HttpClient, HttpClientParams, HttpEndpoint, HttpEndpointParams, HttpResult, ParamsMap, RequestFn } from "./types.js"
 */

import { asArray, shallowEqual } from "@jsxrx/utils"
import {
  BehaviorSubject,
  catchError,
  debounceTime,
  distinctUntilChanged,
  from,
  map,
  of,
  share,
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
          const setupResult = requestSetup(input)
          const parsedRequestParams = requestBodyParser(
            /** @type {*} */ (setupResult?.body ?? body ?? null),
          )

          const mergedParams = {
            ...params,
            ...parsedRequestParams.params,
            ...setupResult.params,
          }

          const mergedSearch = {
            ...search,
            ...parsedRequestParams.search,
            ...setupResult.search,
          }

          const mergedHeaders = {
            ...defaultHeaders,
            ...headers,
            ...parsedRequestParams.headers,
            ...setupResult.headers,
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
              body: parsedRequestParams.body,
            },
          )

          const result = await responseBodyParser(response)

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
                /** @type {Observable<HttpResult<Output>>} */ (
                  from(send(input)).pipe(
                    map(value => ({ state: "success", value, error: null })),
                    startWith({ state: "pending", value: null, error: null }),
                    catchError(error =>
                      of({ state: "error", value: null, error }),
                    ),
                  )
                ),
            ),
            share(),
          )
        },
        mutation() {
          const state$ = new BehaviorSubject(
            /** @type {HttpResult<Output>} */ ({
              state: "idle",
              value: null,
              error: null,
            }),
          )
          return {
            state$: state$.pipe(
              debounceTime(1),
              distinctUntilChanged(shallowEqual),
            ),
            reset() {
              state$.next({ state: "idle", value: null, error: null })
            },
            async mutate(input) {
              try {
                state$.next({ state: "pending", value: null, error: null })
                const value = /** @type {Output} */ (await send(input))
                state$.next({ state: "success", value, error: null })
                return value
              } catch (error) {
                state$.next({ state: "error", value: null, error })
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
