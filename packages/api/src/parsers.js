/**
 * @template Req
 * @returns {import("./types.js").RequestBodyParser<Req>}
 */
export function jsonRequestBody(contentType = "application/json") {
  return body => ({
    headers: {
      "Content-Type": contentType,
    },
    body: JSON.stringify(body),
  })
}

/**
 * @template Res
 * @returns{import("./types.js").ResponseBodyParser<Res>}
 */
export function jsonResponseBody(accepts = "application/json") {
  return {
    accepts: [accepts],
    async parse(response) {
      const contentType = response.headers.get("Content-Type")
      if (contentType?.startsWith(accepts)) {
        return {
          ok: response.ok,
          headers: response.headers,
          status: response.status,
          body: await response.json(),
        }
      }
      const text = await response.text()
      throw new Error(
        `Unexpected response content type "${accepts}" for content: ${text}`,
      )
    },
  }
}

/**
 * @returns {import("./types.js").ResponseBodyParser<null>}
 */
export function noResponseBody() {
  return {
    accepts: [],
    async parse(response) {
      return {
        ok: response.ok,
        headers: response.headers,
        status: response.status,
        body: null,
      }
    },
  }
}
