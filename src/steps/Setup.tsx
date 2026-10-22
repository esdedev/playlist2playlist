import { ExternalLink } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useI18n } from "@/i18n"
import { isValidClientId, redirectUriFor, setOwnClientId } from "@/lib/config"
import { CopyField } from "./shared"

type Props = {
  canGoBack: boolean
  hasOwnClientId: boolean
  onDone: () => void
  onBack: () => void
}

export function Setup({ canGoBack, hasOwnClientId, onDone, onBack }: Props) {
  const { t } = useI18n()
  const [value, setValue] = useState("")
  const [touched, setTouched] = useState(false)
  const valid = isValidClientId(value)
  const redirect = redirectUriFor(window.location)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("setup.title")}</CardTitle>
        <CardDescription>{t("setup.intro")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-5 pl-5 text-sm marker:font-medium marker:text-muted-foreground">
          <li className="space-y-2">
            <p>{t("setup.step1")}</p>
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://developer.spotify.com/dashboard/create"
                target="_blank"
                rel="noreferrer"
              >
                {t("setup.step1.link")}
                <ExternalLink />
              </a>
            </Button>
            <p className="text-muted-foreground text-xs">{t("setup.premium")}</p>
          </li>
          <li className="space-y-3">
            <p>{t("setup.step2")}</p>
            <CopyField label={t("setup.appName")} value="playlist2playlist" />
            <CopyField
              label={t("setup.appDescription")}
              value="Copy my library between my accounts"
            />
            <CopyField label={t("setup.redirect")} value={redirect} />
          </li>
          <li>
            <p>{t("setup.step3")}</p>
          </li>
          <li className="space-y-2">
            <label htmlFor="client-id" className="block">
              {t("setup.step4")}
            </label>
            <Input
              id="client-id"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder="0123456789abcdef0123456789abcdef"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={touched && !valid}
              className="font-mono"
            />
            {touched && !valid && <p className="text-destructive text-xs">{t("setup.invalid")}</p>}
          </li>
        </ol>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2">
        <Button
          disabled={!valid}
          onClick={() => {
            setOwnClientId(localStorage, value)
            onDone()
          }}
        >
          {t("setup.save")}
        </Button>
        {canGoBack && (
          <Button variant="ghost" onClick={onBack}>
            {t("setup.back")}
          </Button>
        )}
        {hasOwnClientId && (
          <Button
            variant="ghost"
            className="ml-auto text-muted-foreground"
            onClick={() => {
              setOwnClientId(localStorage, null)
              onDone()
            }}
          >
            {t("setup.remove")}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
