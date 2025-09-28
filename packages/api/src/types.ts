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

export interface HttpEndpointParams<Input, Req, Res, Output>
  extends HttpRequestParams {
  path: string
  method?: HttpMethod
  requestBodyParser: RequestBodyParser<Req>
  responseBodyParser: ResponseBodyParser<Res>
  requestSetup(params: Input): HttpRequestParams<Req>
  responseSetup(output: HttpResponseParams<Res>): Output
}

export type HttpResult<T, E = unknown> =
  | { state: "idle" | "pending"; value: null; error: null }
  | { state: "success"; value: T; error: null }
  | { state: "error"; value: null; error: E }

export interface Mutation<I, O> {
  state$: Observable<HttpResult<O>>
  mutate(value: I): Promise<O>
  reset(): void
}

export interface HttpEndpoint<I, O> {
  send: RequestFn<I, O>
  fetch(input: Observable<I>): Observable<HttpResult<O>>
  mutation(): Mutation<I, O>
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
export type ResponseBodyParser<T = unknown> = (
  response: Response,
) => Promise<HttpResponseParams<T>>
