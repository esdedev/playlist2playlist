/** Saves `data` as a pretty-printed JSON file in the browser. */
export function downloadJson(filename: string, data: unknown): void {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2)
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function dateStamp(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}
