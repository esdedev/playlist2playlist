export const en = {
  "app.tagline": "Move your Spotify library to a new account",
  "app.demo": "Demo",
  "app.demoNotice": "Demo mode: fake accounts, nothing real is touched.",

  "steps.old": "Old account",
  "steps.new": "New account",
  "steps.transfer": "Transfer",

  "old.title": "Connect your old account",
  "old.body": "The one that has your playlists and liked songs. We only ask to read it.",
  "old.button": "Connect old account",
  "old.connectedAs": "Old account: {name}",

  "new.title": "Connect your new account",
  "new.body":
    "Spotify will open again. On its screen click “Not you?” and log in with your new account.",
  "new.button": "Connect new account",
  "new.stillOld": "Spotify keeps opening your old account?",
  "new.logoutLink": "Log out of Spotify here",
  "new.logoutHint": ", then come back and press the button again.",
  "new.sameAccount":
    "That is the same account as the old one. Click “Not you?” on Spotify's screen and choose your new account.",
  "new.connectedAs": "New account: {name}",
  "common.change": "Change",

  "transfer.title": "Ready to copy",
  "transfer.from": "From {from} to {to}",
  "transfer.fromFile": "From the file of {from} to {to}",
  "transfer.loading": "Counting your library…",
  "transfer.button": "Transfer everything",
  "transfer.buttonSelected": "Transfer selection",
  "transfer.customize": "Choose what to copy",
  "transfer.playlistsToggle": "Show playlists ({n})",
  "transfer.running": "Copying… keep this tab open.",
  "transfer.reading": "Reading your old account…",
  "transfer.writing": "Copying to your new account…",
  "transfer.cancel": "Cancel",
  "transfer.interrupted":
    "The last transfer was interrupted. Continue: anything already copied is skipped, nothing is duplicated.",
  "transfer.continue": "Continue",
  "transfer.failed": "Something went wrong: {error}",
  "transfer.retry": "Try again (nothing is duplicated)",
  "transfer.nothing": "Nothing selected.",
  "transfer.waiting": "Spotify asked us to slow down. Waiting {n} s…",
  "transfer.stopping": "Stopping after the current step…",
  "transfer.sameAccountFile":
    "This backup comes from the account you connected as the new one. Connect a different account.",

  "phase.ownedPlaylists": "Your playlists",
  "phase.followedPlaylists": "Playlists you follow",
  "phase.liked": "Liked songs",
  "phase.albums": "Saved albums",
  "phase.artists": "Followed artists",
  "phase.ownedPlaylists.hint": "Recreated in the new account, same order",
  "phase.followedPlaylists.hint": "Followed from the new account",
  "phase.liked.hint": "Saved in the same order",

  "done.title": "All done",
  "done.titleAborted": "Stopped before the end",
  "done.rateLimited":
    "Spotify asked to pause for about {n} minutes. Come back then and press Continue; nothing is duplicated.",
  "done.abortedBody":
    "Everything copied so far is kept. Press Continue to finish; nothing is duplicated.",
  "done.created": "{n} created",
  "done.added": "{n} added",
  "done.already": "{n} already there",
  "done.skipped": "{n} not copied",
  "done.skippedTitle": "Not copied ({n})",
  "done.reason.local": "Local file: add it from the Spotify desktop app",
  "done.reason.api-error": "Spotify rejected it",
  "done.unavailable": "Songs in your playlists that are no longer on Spotify, left out: {n}.",
  "done.notCopiedEver":
    "Not possible to copy: playlist covers, listening history and recommendations.",
  "done.downloadReport": "Download report",
  "done.downloadBackup": "Download backup (JSON)",
  "done.startOver": "Start over",
  "done.disconnect": "Disconnect both accounts",

  "export.title": "Backup downloaded",
  "export.body": "Keep the file. You can import it into any account later from this page.",
  "export.button": "Download backup",
  "export.reading": "Reading your account…",

  "import.title": "Import a backup file",
  "import.body": "Choose the .json file you downloaded from this page.",
  "import.choose": "Choose file",
  "import.invalid.not-json": "That file is not a backup from this page (not JSON).",
  "import.invalid.unsupported-version": "That backup was made by a newer version of this page.",
  "import.invalid.invalid": "That file is not a valid backup from this page.",

  "allowlist.title": "This account can't use this page yet",
  "allowlist.body":
    "Spotify only lets 5 accounts use a free app. Ask the owner of this page to add your account's e-mail, or use your own Client ID.",
  "auth.denied": "You cancelled the Spotify login.",
  "auth.failed": "Spotify login failed. Try again.",
  "auth.expired":
    "Your Spotify session expired. Connect the account again; the transfer continues where it stopped.",

  "setup.title": "Use your own Spotify Client ID",
  "setup.intro":
    "Spotify only lets 5 accounts use each free app, so this page can use yours. It takes two minutes and you only do it once.",
  "setup.step1": "Open the Spotify developer dashboard and log in.",
  "setup.step1.link": "Create an app",
  "setup.step2": "Fill in the form with these values (copy buttons below) and tick “Web API”.",
  "setup.appName": "App name",
  "setup.appDescription": "App description",
  "setup.redirect": "Redirect URI",
  "setup.step3":
    "Save. In the app go to Settings → User Management and add the e-mails of both of your Spotify accounts.",
  "setup.step4": "Copy the Client ID from the app page and paste it here.",
  "setup.clientId": "Client ID",
  "setup.invalid": "A Client ID has 32 letters and numbers.",
  "setup.save": "Save and continue",
  "setup.remove": "Stop using my Client ID",
  "setup.back": "Back",
  "setup.premium": "Spotify requires the account that creates the app to have Premium.",
  "common.copy": "Copy",
  "common.copied": "Copied",

  "footer.privacy": "Runs entirely in your browser. No server, no tracking.",
  "footer.source": "Source code",
  "footer.ownClientId": "Advanced: use your own Client ID",
  "footer.exportOnly": "Only download a backup",
  "footer.import": "Import a backup file",
  "footer.language": "Español",
} as const

export type MessageKey = keyof typeof en
