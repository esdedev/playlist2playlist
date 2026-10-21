import { describe, expect, test } from "vitest"
import { chunk } from "./chunk"

describe("chunk", () => {
  test("splits into groups of the given size with a remainder", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  test("exact multiple has no empty tail", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ])
  })
  test("empty input gives no chunks", () => {
    expect(chunk([], 40)).toEqual([])
  })
  test("size below 1 throws", () => {
    expect(() => chunk([1], 0)).toThrow()
  })
})
