import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"

function Placeholder() {
  return <p className="p-4">playlist2playlist</p>
}

const root = document.getElementById("root")
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Placeholder />
    </StrictMode>,
  )
}
