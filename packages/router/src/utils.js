/**
 * @import { RouteMatch } from "./types.js"
 */

import { assert } from "@jsxrx/utils"

/**
 * @param {URL} url
 * @param {string} pattern
 * @param {'exact' | 'startsWith'} [mode='startsWith']
 * @returns {RouteMatch | null}
 */
export function matchUrl(url, pattern, mode = "startsWith") {
  const urlFragments = url.pathname.split("/").filter(frag => !!frag)
  const patternFragments = pattern.split("/").filter(frag => !!frag)

  if (urlFragments.length === 0 && patternFragments.length === 0)
    return {
      url,
      pattern,
      fragments: urlFragments,
      params: {},
    }
  if (mode === "exact" && urlFragments.length !== patternFragments.length)
    return null
  if (patternFragments.length > urlFragments.length) return null

  /** @type {Record<string, string>} */
  const params = {}

  for (let i = 0; i < urlFragments.length; i++) {
    const urlFragment = urlFragments[i]
    const patternFragment = patternFragments[i]

    if (urlFragment && patternFragment === undefined) break
    if (/^:.+/.test(patternFragment)) {
      const paramName = patternFragment.substring(1)

      assert(
        !params[paramName],
        `Url pattern path parameter names must not repeat. (repeated parameter ${paramName})`,
      )

      params[paramName] = urlFragment
      continue
    }
    if (urlFragment !== patternFragment) return null
  }

  return {
    params,
    url,
    pattern,
    fragments: urlFragments,
  }
}

/**
 * @param {string} pathname
 * @param {Record<string, string | number | null | undefined>} params
 */
export function parsePathnameParams(pathname, params) {
  return Object.entries(params).reduce((acc, [name, value]) => {
    if (value === undefined || value === null) return acc
    return acc.replace(
      new RegExp(`\\/:${name}(\\/|$)`, "g"),
      (_, suffix) => `/${value}${suffix}`,
    )
  }, pathname)
}
