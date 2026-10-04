# Instalación (jugadores)

No necesitas Python, Node.js, Docker ni `--luadebug`.

## 1. El mod (Steam Workshop)

1. Abre la página del mod [**Isaac Chronicle**](https://steamcommunity.com/sharedfiles/filedetails/?id=3812867579) en Steam Workshop y pulsa **Suscribirse**.
2. Inicia The Binding of Isaac. En el menú **Mods** comprueba que está activado (lo está por defecto).

El mod es invisible: no muestra nada dentro del juego.

## 2. La app Isaac Companion

Descárgala de la [última versión](https://github.com/Galfar10/Isaac-Chronicle/releases/latest) según tu sistema:

| Sistema | Archivo |
|---|---|
| Windows | `IsaacCompanion-win-x64.zip` |
| Steam Deck / Linux | `IsaacCompanion-linux-x64.tar.gz` |
| Mac con Apple Silicon (M1 o posterior) | `IsaacCompanion-macos-arm64.zip` |
| Mac con Intel | `IsaacCompanion-macos-x64.zip` |

### Windows

1. Descarga `IsaacCompanion-win-x64.zip` y descomprímelo donde quieras (por ejemplo `Documentos\IsaacCompanion`).
2. Ejecuta `IsaacCompanion.exe`.
   - Windows puede mostrar *“Windows protegió su PC”* porque el ejecutable no está firmado: **Más información → Ejecutar de todas formas**.
   - El firewall no debería preguntar nada: solo escucha en `127.0.0.1`.
3. Se abre el navegador en <http://127.0.0.1:47823>. Deja la ventana de la app abierta mientras juegas.

### Que arranque solo con Windows (opcional)

`Win + R` → `shell:startup` → crea ahí un acceso directo a `IsaacCompanion.exe` (añade `--no-open` al destino si no
quieres que abra el navegador cada vez).

### Steam Deck / Linux

En Steam Deck el juego funciona con Proton; la app encuentra sola el `log.txt` del juego, también si Isaac está
instalado en la tarjeta microSD.

1. En **modo Escritorio**, descarga `IsaacCompanion-linux-x64.tar.gz` y extráelo en tu carpeta personal
   (queda en `/home/deck/IsaacCompanion`).
2. En Steam: **The Binding of Isaac → Propiedades → General → Parámetros de lanzamiento** y escribe:

   ```
   "/home/deck/IsaacCompanion/steam-launch.sh" %command%
   ```

   Con eso la app **arranca sola al abrir Isaac y se cierra al salir**, tanto en modo Juego como en modo Escritorio.
3. **Para verlo en el móvil** (lo normal en la Deck, que solo tiene una pantalla): una vez, en modo Escritorio, abre
   Isaac, entra en <http://127.0.0.1:47823>, pulsa **📱 Móvil → Activar modo móvil**, escanea el QR y guarda la página
   en favoritos. Queda recordado: después basta con abrir ese favorito mientras juegas en modo Juego.
   El enlace del móvil también se escribe en `IsaacCompanion/companion.log`.

Sin el paso 2 también puedes abrirla a mano desde una terminal (Konsole): `~/IsaacCompanion/isaac-companion`.

### macOS

Repentance y Repentance+ no tienen versión para Mac: se juegan con **CrossOver**, **Whisky** o Wine. La app busca el
`log.txt` dentro de esas botellas automáticamente.

1. Descarga el zip de tu Mac (Apple Silicon o Intel) y descomprímelo.
2. La app no está firmada con un certificado de Apple, así que la primera vez macOS la bloquea. Abre **Terminal** y
   ejecuta (cambia la ruta si la has movido):

   ```
   xattr -dr com.apple.quarantine ~/Downloads/IsaacCompanion
   ```

   Alternativa: intenta abrirla y luego ve a **Ajustes del Sistema → Privacidad y seguridad → Abrir igualmente**.
3. Haz doble clic en `isaac-companion` (se abre en una ventana de Terminal) y déjala abierta mientras juegas.
4. Si la web se queda en **ESPERANDO A ISAAC** con una partida empezada, tu botella está en una ruta no estándar:
   indica el archivo con `--log`, por ejemplo
   `./isaac-companion --log "/ruta/a/la/botella/drive_c/users/crossover/Documents/My Games/Binding of Isaac Repentance+/log.txt"`.

¿Juegas en un PC o en la Deck y solo quieres **ver** la web en el Mac? No hace falta instalar nada en el Mac: usa el
modo móvil (el QR / enlace funciona en cualquier navegador de la misma red).

## 3. Jugar

- La web muestra **🟢 ISAAC CONECTADO** en cuanto empiezas o continúas una partida.
- **Segundo monitor**: botón *2º monitor* o abre <http://127.0.0.1:47823/?mode=monitor> y pon el navegador en pantalla completa.
- **Idioma de nombres**: botón *ES/EN* (los nombres en español salen de los archivos de tu juego).
- **Móvil / tablet**: en la web del PC pulsa **📱 Móvil → Activar modo móvil** y escanea el QR con el móvil (conectado
  a la misma red Wi-Fi que el PC). La primera vez Windows pregunta por el Firewall: permite **Redes privadas** (en macOS, **Permitir** conexiones entrantes). Guarda la
  página en favoritos o en la pantalla de inicio; la opción queda recordada aunque reinicies. La copia de GitHub Pages no
  sirve en el móvil (es HTTPS y no puede hablar con tu PC): usa siempre el QR.

## Imágenes de los objetos

Si has extraído los recursos del juego con la herramienta oficial
`Steam\steamapps\common\The Binding of Isaac Rebirth\tools\ResourceExtractor\ResourceExtractor.exe`
(crea la carpeta `extracted_resources`), la app usa **tus propios sprites** y nombres en español.
Si no, usa los iconos de la wiki (necesita internet) o un dibujo de reserva.

## Opciones de la app

| Opción | Uso |
|---|---|
| `--port 47900` | otro puerto |
| `--no-open` | no abrir el navegador |
| `--log "C:\...\log.txt"` | ruta de `log.txt` si no se detecta (en Deck / Mac, la ruta dentro del prefijo de Proton o la botella) |
| `--game-dir "D:\...\The Binding of Isaac Rebirth"` | carpeta del juego si no se detecta |
| `--reveal-distance 1.5` | distancia (en casillas) a la que se identifica un pedestal; por defecto 2 |
| `--update-data` | descarga los datos más recientes de la wiki (sin actualizar el mod) |
| `--origin=https://mi-web` | permitir una copia alojada de la web |
| `--lan` / `--no-lan` | forzar el modo móvil activado / desactivado (si no, se usa lo último elegido en la web) |

## Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| **COMPANION DESCONECTADO** | La app no está abierta o se cerró. Ábrela; la web se reconecta sola. |
| **ESPERANDO A ISAAC** | El juego no está abierto o el mod no ha escrito nada aún. Inicia una partida. |
| **ISAAC ABIERTO · SIN DATOS** | Estás en el menú, o el mod está desactivado / no descargado. Revisa el menú Mods y vuelve a entrar en la partida. |
| **log.txt not found** | El juego nunca se ha abierto en esta cuenta, o tu carpeta Documentos está en otro sitio. Usa `--log`. |
| “Port 47823 is already in use” | Ya hay una copia de la app abierta. |
| Objeto “no encontrado en la base de datos” | Objeto de otro mod: se muestra el nombre que da el juego. |
| Versión del mod incompatible | Actualiza la app (o espera a que Steam actualice el mod). |
| Steam Deck: el juego no arranca tras poner los parámetros de lanzamiento | La ruta al script es incorrecta o no tiene permiso de ejecución: `chmod +x ~/IsaacCompanion/steam-launch.sh ~/IsaacCompanion/isaac-companion`. |
| Steam Deck / Mac: **ESPERANDO A ISAAC** siempre | No se ha encontrado el `log.txt`. La ruta que usa la app sale al arrancar (en la Deck, en `companion.log`). Usa `--log`. |
| macOS: “no se puede abrir porque Apple no puede comprobar…” | Ejecuta el comando `xattr` del apartado macOS. |
