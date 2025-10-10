import { AsyncState, PendingState } from "@jsxrx/core"
import { Observable } from "rxjs"

export type ParamsMap = Record<string, unknown>

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "HEAD"

export interface HttpRequestParams<T = unknown> {
  params?: ParamsMap
  search?: ParamsMap
  headers?: ParamsMap
  body?: T
}

export interface HttpResponseParams<T = unknown> {
  ok: boolean
  headers: Headers
  body: T
  status: number
}

export type HttpEndpointParams<Input, Req, Res, Output> = HttpRequestParams & {
  path: string
  method?: HttpMethod
  responseBodyParser: ResponseBodyParser<Res>
  responseSetup(output: HttpResponseParams<Res>): Output
} & (
    | {
        requestBodyParser?: undefined
        requestSetup?(params: Input): HttpRequestParams
      }
    | {
        requestBodyParser: RequestBodyParser<Req>
        requestSetup(params: Input): HttpRequestParams<Req>
      }
  )

export interface Action<I, O> extends AsyncState<O> {
  perform(value: I): Promise<O>
  reset(): void
}

export interface HttpEndpoint<I, O> {
  send: RequestFn<I, O>
  fetch(input: Observable<I>): Observable<PendingState<O>>
  action(): Action<I, O>
}

export interface HttpClientParams {
  baseUrl: string
  defaultHeaders?: ParamsMap
}

export type RequestFn<I, O> = { input: I; output: O } extends {
  input: null
  output: null
}
  ? () => Promise<void>
  : I extends null
    ? () => Promise<O>
    : O extends null
      ? (input: I) => Promise<void>
      : (input: I) => Promise<O>

export interface HttpClient {
  createEndpoint<Req, Res, Input = null, Output = null>(
    params: HttpEndpointParams<Input, Req, Res, Output>,
  ): HttpEndpoint<Input, Output>
}

export type RequestBodyParser<T = unknown> = (
  body: T,
) => HttpRequestParams<BodyInit | null>
export type ResponseBodyParser<T = unknown> = {
  accepts: string[]
  parse(response: Response): Promise<HttpResponseParams<T>>
}
