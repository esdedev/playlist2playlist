import { describe, expect, test } from "vitest"
import { decodeEntities } from "./html"

describe("decodeEntities", () => {
  test("decodes the entities Spotify returns in descriptions", () => {
    expect(
      decodeEntities("Rock &amp; roll &#x27;80s&#x27; &quot;hits&quot; &#39;x&#39; &lt;3 &gt;"),
    ).toBe("Rock & roll '80s' \"hits\" 'x' <3 >")
  })
  test("decodes only once", () => {
    expect(decodeEntities("&amp;amp;")).toBe("&amp;")
  })
  test("leaves plain text alone", () => {
    expect(decodeEntities("just text")).toBe("just text")
  })
})
