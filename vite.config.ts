import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import type { Plugin } from "vite"
import { defineConfig } from "vitest/config"

/**
 * Content-Security-Policy for the static build. GitHub Pages cannot send headers, so it goes
 * in a <meta>. The page only ever talks to Spotify; if an XSS ever slipped in, it could not
 * send the session tokens anywhere else. Not applied in dev (Vite injects inline scripts).
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src https://api.spotify.com https://accounts.spotify.com",
  "base-uri 'self'",
  "form-action 'none'",
  "object-src 'none'",
].join("; ")

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
        injectTo: "head-prepend",
      },
    ],
  }
}

export default defineConfig({
  base: "/playlist2playlist/",
  plugins: [react(), tailwindcss(), contentSecurityPolicy()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
})
