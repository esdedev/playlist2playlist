# playlist2playlist

Copy your Spotify library from one account to another: your playlists, the playlists you
follow, your liked songs, saved albums and followed artists.

**[Open playlist2playlist](https://esdedev.github.io/playlist2playlist/)** ·
**[Try the demo](https://esdedev.github.io/playlist2playlist/?demo=1)** (fake accounts) ·
[Español](#español)

- Runs entirely in your browser. There is no server, no account and no tracking: your
  Spotify data goes from Spotify to your browser and back to Spotify.
- Connect the old account, connect the new one, press **Transfer everything**.
- Safe to run twice: anything already in the new account is skipped, nothing is duplicated,
  nothing is ever deleted from either account.
- Download a backup of your library as a JSON file, and import it into any account later.
- English and Spanish.

## What is copied

| From the old account | In the new account |
|---|---|
| Playlists you created | Recreated with the same name, description, privacy and songs in the same order |
| Playlists you follow | Followed |
| Liked songs | Liked, oldest first, so the order stays the same |
| Saved albums | Saved |
| Followed artists | Followed |

Not possible with Spotify's API: playlist cover images, listening history, recommendations
and the followers of your playlists. Local files inside playlists cannot be added by any app;
the report lists them so you can add them from the Spotify desktop app. Within each batch of
40 liked songs Spotify may store them in a slightly different order.

## Why there is an allow-list

Since 2025–2026 Spotify only lets a free ("Development Mode") app be used by **5 accounts**,
chosen by the app's owner, and requires the owner to have Spotify Premium. Wider access is
reserved for registered companies with a large user base. So:

- The hosted page uses the maintainer's app. If your account is not on its list, the page
  tells you.
- **Anyone can use their own app instead** (two minutes, once): open the page, click
  *Advanced: use your own Client ID* at the bottom and follow the steps. In short:
  1. Go to [developer.spotify.com/dashboard/create](https://developer.spotify.com/dashboard/create).
  2. Any name and description, tick **Web API**, and add the Redirect URI
     `https://esdedev.github.io/playlist2playlist/` (exactly, with the final slash).
  3. Save, open *Settings → User Management* and add the e-mails of both of your accounts.
  4. Copy the Client ID into the page.

The Client ID is not a secret (the page uses OAuth with PKCE, no client secret). It is stored
in your browser only.

## Privacy

- Access tokens live in `sessionStorage` and disappear when you close the tab;
  *Disconnect both accounts* removes them immediately.
- The old account is only asked for read permissions.
- The only network requests go to `accounts.spotify.com` and `api.spotify.com`.

## Self-hosting and development

Requires Node 24 and pnpm.

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5173/playlist2playlist/ (add ?demo=1 for fake accounts)
pnpm test
pnpm lint
pnpm build        # static site in dist/
```

To use a default Client ID, create `.env.local` with `VITE_SPOTIFY_CLIENT_ID=<your id>` and
add `http://127.0.0.1:5173/playlist2playlist/` as a Redirect URI of your Spotify app
(Spotify rejects `localhost`; use `127.0.0.1`). The GitHub Pages workflow reads the same
value from the repository variable `VITE_SPOTIFY_CLIENT_ID`.

The code: `src/lib/reader.ts` reads the source account into a snapshot, `src/lib/writer.ts`
writes a snapshot into the destination (idempotent and resumable), `src/lib/spotify-api.ts`
handles retries and rate limits, and `src/test/fake-spotify.ts` is an in-memory Spotify used by
the tests and the demo. Design notes: `docs/superpowers/specs/`.

It uses the Web API endpoints introduced in February 2026 (`/me/library`, `/playlists/{id}/items`,
`POST /me/playlists`); the older ones are not available to new apps.

## Licence

[AGPL-3.0](LICENSE). Not affiliated with Spotify. Spotify is a trademark of Spotify AB.

---

## Español

Pasa tu biblioteca de Spotify de una cuenta a otra: tus playlists, las que sigues, tus
canciones que te gustan, tus álbumes y los artistas que sigues.

**[Abrir playlist2playlist](https://esdedev.github.io/playlist2playlist/)** ·
**[Probar la demo](https://esdedev.github.io/playlist2playlist/?demo=1)**

1. Conecta la cuenta vieja.
2. Conecta la nueva. En la pantalla de Spotify pulsa «¿No eres tú?» y entra con la nueva.
3. Pulsa **Transferir todo**.

Funciona entero en tu navegador, sin servidor. Puedes repetirlo sin miedo: lo que ya está en
la cuenta nueva se salta y nunca se borra nada. También puedes descargar una copia en JSON e
importarla más tarde.

**Límite de Spotify:** una app gratuita solo la pueden usar 5 cuentas que elige su dueño. Si
tu cuenta no está en la lista de esta página, usa tu propio Client ID: abajo del todo,
*Avanzado: usar tu propio Client ID*, y sigue los cuatro pasos (dos minutos, una sola vez; la
cuenta que crea la app necesita Premium).

No se pueden copiar las portadas de las playlists, el historial ni las recomendaciones. Los
ficheros locales tampoco: el informe final te dice cuáles son.
