import { Check } from "lucide-react"
import { useI18n } from "@/i18n"
import { cn } from "@/lib/utils"
import type { Screen } from "./state"

const STEPS = [
  { key: "old", label: "steps.old" },
  { key: "new", label: "steps.new" },
  { key: "transfer", label: "steps.transfer" },
] as const

export function Stepper({ screen }: { screen: Screen }) {
  const { t } = useI18n()
  const current = screen === "done" ? 3 : STEPS.findIndex((s) => s.key === screen)
  return (
    <ol className="mb-6 flex items-center gap-2 text-sm" aria-label="Progress">
      {STEPS.map((step, i) => {
        const done = i < current
        const active = i === current
        return (
          <li
            key={step.key}
            className="flex flex-1 items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border font-medium text-xs",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("truncate", active ? "font-medium" : "text-muted-foreground")}>
              {t(step.label)}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}
