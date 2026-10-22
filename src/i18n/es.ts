import type { MessageKey } from "./en"

export const es: Record<MessageKey, string> = {
  "app.tagline": "Pasa tu biblioteca de Spotify a una cuenta nueva",
  "app.demo": "Demo",
  "app.demoNotice": "Modo demo: cuentas de mentira, no se toca nada real.",

  "steps.old": "Cuenta vieja",
  "steps.new": "Cuenta nueva",
  "steps.transfer": "Transferir",

  "old.title": "Conecta tu cuenta vieja",
  "old.body": "La que tiene tus playlists y tus me gusta. Solo pedimos permiso para leerla.",
  "old.button": "Conectar cuenta vieja",
  "old.connectedAs": "Cuenta vieja: {name}",

  "new.title": "Conecta tu cuenta nueva",
  "new.body":
    "Spotify se abrirá otra vez. En su pantalla pulsa «¿No eres tú?» y entra con tu cuenta nueva.",
  "new.button": "Conectar cuenta nueva",
  "new.stillOld": "¿Spotify te vuelve a abrir la cuenta vieja?",
  "new.logoutLink": "Cierra sesión en Spotify aquí",
  "new.logoutHint": ", vuelve y pulsa otra vez el botón.",
  "new.sameAccount":
    "Es la misma cuenta que la vieja. En la pantalla de Spotify pulsa «¿No eres tú?» y elige tu cuenta nueva.",
  "new.connectedAs": "Cuenta nueva: {name}",
  "common.change": "Cambiar",

  "transfer.title": "Todo listo para copiar",
  "transfer.from": "De {from} a {to}",
  "transfer.fromFile": "Del fichero de {from} a {to}",
  "transfer.loading": "Contando tu biblioteca…",
  "transfer.button": "Transferir todo",
  "transfer.buttonSelected": "Transferir lo elegido",
  "transfer.customize": "Elegir qué copiar",
  "transfer.playlistsToggle": "Ver playlists ({n})",
  "transfer.running": "Copiando… no cierres esta pestaña.",
  "transfer.reading": "Leyendo tu cuenta vieja…",
  "transfer.writing": "Copiando a tu cuenta nueva…",
  "transfer.cancel": "Cancelar",
  "transfer.interrupted":
    "La última transferencia se cortó. Continúa: lo ya copiado se salta y no se duplica nada.",
  "transfer.continue": "Continuar",
  "transfer.failed": "Algo ha fallado: {error}",
  "transfer.retry": "Reintentar (no se duplica nada)",
  "transfer.nothing": "No hay nada elegido.",

  "phase.ownedPlaylists": "Tus playlists",
  "phase.followedPlaylists": "Playlists que sigues",
  "phase.liked": "Canciones que te gustan",
  "phase.albums": "Álbumes guardados",
  "phase.artists": "Artistas que sigues",
  "phase.ownedPlaylists.hint": "Se crean en la cuenta nueva, en el mismo orden",
  "phase.followedPlaylists.hint": "La cuenta nueva pasa a seguirlas",
  "phase.liked.hint": "Se guardan en el mismo orden",

  "done.title": "Listo",
  "done.titleAborted": "Se paró antes de acabar",
  "done.abortedBody":
    "Lo copiado hasta ahora se queda. Pulsa Continuar para terminar; no se duplica nada.",
  "done.created": "{n} creadas",
  "done.added": "{n} añadidas",
  "done.already": "{n} ya estaban",
  "done.skipped": "{n} sin copiar",
  "done.skippedTitle": "Sin copiar ({n})",
  "done.reason.local": "Fichero local: añádelo desde la app de escritorio de Spotify",
  "done.reason.api-error": "Spotify lo rechazó",
  "done.unavailable":
    "{n} canciones de tus playlists ya no están en Spotify y se han quedado fuera.",
  "done.notCopiedEver":
    "No se pueden copiar: portadas de playlists, historial de escucha y recomendaciones.",
  "done.downloadReport": "Descargar informe",
  "done.downloadBackup": "Descargar copia (JSON)",
  "done.startOver": "Empezar de nuevo",
  "done.disconnect": "Desconectar las dos cuentas",

  "export.title": "Copia descargada",
  "export.body":
    "Guarda el fichero. Puedes importarlo en cualquier cuenta más adelante desde esta página.",
  "export.button": "Descargar copia",
  "export.reading": "Leyendo tu cuenta…",

  "import.title": "Importar una copia",
  "import.body": "Elige el fichero .json que descargaste de esta página.",
  "import.choose": "Elegir fichero",
  "import.invalid.not-json": "Ese fichero no es una copia de esta página (no es JSON).",
  "import.invalid.unsupported-version": "Esa copia la hizo una versión más nueva de esta página.",
  "import.invalid.invalid": "Ese fichero no es una copia válida de esta página.",

  "allowlist.title": "Esta cuenta aún no puede usar la página",
  "allowlist.body":
    "Spotify solo deja que 5 cuentas usen una app gratuita. Pide al dueño de esta página que añada el email de tu cuenta, o usa tu propio Client ID.",
  "auth.denied": "Has cancelado el inicio de sesión en Spotify.",
  "auth.failed": "No se pudo iniciar sesión en Spotify. Inténtalo otra vez.",

  "setup.title": "Usa tu propio Client ID de Spotify",
  "setup.intro":
    "Spotify solo deja que 5 cuentas usen cada app gratuita, así que esta página puede usar la tuya. Son dos minutos y solo se hace una vez.",
  "setup.step1": "Abre el panel de desarrolladores de Spotify y entra.",
  "setup.step1.link": "Crear una app",
  "setup.step2":
    "Rellena el formulario con estos valores (botones de copiar abajo) y marca «Web API».",
  "setup.appName": "Nombre de la app",
  "setup.appDescription": "Descripción",
  "setup.redirect": "Redirect URI",
  "setup.step3":
    "Guarda. En la app ve a Settings → User Management y añade los emails de tus dos cuentas de Spotify.",
  "setup.step4": "Copia el Client ID de la página de la app y pégalo aquí.",
  "setup.clientId": "Client ID",
  "setup.invalid": "Un Client ID tiene 32 letras y números.",
  "setup.save": "Guardar y seguir",
  "setup.remove": "Dejar de usar mi Client ID",
  "setup.back": "Volver",
  "setup.premium": "Spotify exige que la cuenta que crea la app tenga Premium.",
  "common.copy": "Copiar",
  "common.copied": "Copiado",

  "footer.privacy": "Funciona entero en tu navegador. Sin servidor y sin rastreo.",
  "footer.source": "Código fuente",
  "footer.ownClientId": "Avanzado: usar tu propio Client ID",
  "footer.exportOnly": "Solo descargar una copia",
  "footer.import": "Importar una copia",
  "footer.language": "English",
}
