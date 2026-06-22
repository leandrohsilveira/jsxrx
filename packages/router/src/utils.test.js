import { describe, expect, it } from "vitest"
import { matchUrl, parsePathnameParams } from "./utils.js"

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

describe("parsePathnameParams function", () => {
  it("should replace a single param in the pathname", () => {
    const result = parsePathnameParams("/path/:id/name", { id: "1" })

    expect(result).toBe("/path/1/name")
  })

  it("should replace multiple params in the pathname", () => {
    const result = parsePathnameParams("/:a/:b/:c", { a: "x", b: "y", c: "z" })

    expect(result).toBe("/x/y/z")
  })

  it("should handle param at the end of the pathname", () => {
    const result = parsePathnameParams("/path/:id", { id: "42" })

    expect(result).toBe("/path/42")
  })

  it("should handle numeric values", () => {
    const result = parsePathnameParams("/path/:id/name", { id: 123 })

    expect(result).toBe("/path/123/name")
  })

  it("should skip params with undefined value", () => {
    const result = parsePathnameParams("/path/:id/name", { id: undefined })

    expect(result).toBe("/path/:id/name")
  })

  it("should skip params with null value", () => {
    const result = parsePathnameParams("/path/:id/name", { id: null })

    expect(result).toBe("/path/:id/name")
  })

  it("should skip a param with undefined value but replace other params", () => {
    const result = parsePathnameParams("/:a/:b/:c", {
      a: "x",
      b: undefined,
      c: "z",
    })

    expect(result).toBe("/x/:b/z")
  })

  it("should return the same pathname when params is empty", () => {
    const result = parsePathnameParams("/path/to/url", {})

    expect(result).toBe("/path/to/url")
  })

  it("should return the same pathname when no params match the pathname", () => {
    const result = parsePathnameParams("/path/to/url", { id: "1" })

    expect(result).toBe("/path/to/url")
  })

  it("should handle pathname with no params", () => {
    const result = parsePathnameParams("/", {})

    expect(result).toBe("/")
  })
})

/**
 * @param {string} path
 */
function createUrl(path) {
  const origin = "http://localhost:3000"

  return new URL(`${origin}${path}`, origin)
}
