/** Splits `items` into consecutive groups of at most `size` elements. */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError(`chunk size must be ≥ 1, got ${size}`)
  const groups: T[][] = []
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size))
  return groups
}
