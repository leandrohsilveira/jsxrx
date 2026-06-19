import { describe, expect, it } from "vitest"
import { matchUrl } from "./utils.js"

describe("matchUrl function", () => {
  describe("given pattern with parameters", () => {
    const pattern = "/path/:id/name"

    describe("and mode is exact", () => {
      it("should return match object when the given url is exactly the same", () => {
        const url = createUrl("/path/1/name")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toEqual({
          url,
          pattern,
          fragments: ["path", "1", "name"],
          params: {
            id: "1",
          },
        })
      })

      it("should return null when the given url fragments length is smaller than pattern fragments length", () => {
        const url = createUrl("/path/1")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })

      it("should return null when the given url fragments length is greater than pattern fragments length", () => {
        const url = createUrl("/path/1/name/another")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })

      it("should return null when the given url with same fragments length but the last fragment is different", () => {
        const url = createUrl("/path/1/test")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })
    })

    describe("and mode is startWith (or not given)", () => {
      it("should return match object when the given url is exactly the same", () => {
        const url = createUrl("/path/1/name")
        const match = matchUrl(url, pattern, "startsWith")

        expect(match).toEqual({
          url,
          pattern,
          fragments: ["path", "1", "name"],
          params: {
            id: "1",
          },
        })
      })

      it("should return null when the given url fragments length is smaller than pattern fragments length", () => {
        const url = createUrl("/path/1")
        const match = matchUrl(url, pattern)

        expect(match).toBeNull()
      })

      it("should return null when the given url with same fragments length but the last fragment is different", () => {
        const url = createUrl("/path/1/test")
        const match = matchUrl(url, pattern, "startsWith")

        expect(match).toBeNull()
      })

      it("should return null when the given url fragments length is greater than pattern fragments length", () => {
        const url = createUrl("/path/1/name/another")
        const match = matchUrl(url, pattern)

        expect(match).toEqual({
          url,
          pattern,
          fragments: ["path", "1", "name", "another"],
          params: {
            id: "1",
          },
        })
      })
    })
  })

  describe("given pattern with no parameters", () => {
    const pattern = "/path/to/url"

    describe("and mode is exact", () => {
      it("should return match object when the given url is exactly the same", () => {
        const url = createUrl("/path/to/url")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toEqual({
          url,
          pattern,
          fragments: ["path", "to", "url"],
          params: {},
        })
      })

      it("should return null when the given url fragments length is smaller than pattern fragments length", () => {
        const url = createUrl("/path/to")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })

      it("should return null when the given url fragments length is greater than pattern fragments length", () => {
        const url = createUrl("/path/to/url/another")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })

      it("should return null when the given url with same fragments length but the last fragment is different", () => {
        const url = createUrl("/path/to/test")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })

      it("should return null when the given url with same fragments length but the middle fragment is different", () => {
        const url = createUrl("/path/test/url")
        const match = matchUrl(url, pattern, "exact")

        expect(match).toBeNull()
      })
    })

    describe("and mode is startWith (or not given)", () => {
      it("should return match object when the given url is exactly the same", () => {
        const url = createUrl("/path/to/url")
        const match = matchUrl(url, pattern, "startsWith")

        expect(match).toEqual({
          url,
          pattern,
          fragments: ["path", "to", "url"],
          params: {},
        })
      })

      it("should return null when the given url fragments length is smaller than pattern fragments length", () => {
        const url = createUrl("/path/to")
        const match = matchUrl(url, pattern)

        expect(match).toBeNull()
      })

      it("should return null when the given url with same fragments length but the last fragment is different", () => {
        const url = createUrl("/path/to/test")
        const match = matchUrl(url, pattern, "startsWith")

        expect(match).toBeNull()
      })

      it("should return null when the given url fragments length is greater than pattern fragments length", () => {
        const url = createUrl("/path/to/url/another")
        const match = matchUrl(url, pattern)

        expect(match).toEqual({
          url,
          pattern,
          fragments: ["path", "to", "url", "another"],
          params: {},
        })
      })

      it("should return null when the given url with same fragments length but the middle fragment is different", () => {
        const url = createUrl("/path/test/url")
        const match = matchUrl(url, pattern, "startsWith")

        expect(match).toBeNull()
      })
    })
  })

  describe("given pattern with repeated parameters names", () => {
    const pattern = "/path/:id/to/:id"

    it("when matches, it should throw an error", () => {
      const url = createUrl("/path/1/to/1")

      expect(() => matchUrl(url, pattern)).toThrowError(
        "Url pattern path parameter names must not repeat. (repeated parameter id)",
      )
    })

    it("when it does not match, it should return null", () => {
      const url = createUrl("/path/1")

      const match = matchUrl(url, pattern)

      expect(match).toBeNull()
    })
  })
})

/**
 * @param {string} path
 */
function createUrl(path) {
  const origin = "http://localhost:3000"

  return new URL(`${origin}${path}`, origin)
}
