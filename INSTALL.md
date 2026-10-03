# Instalación (jugadores)

No necesitas Python, Node.js, Docker ni `--luadebug`.

## 1. El mod (Steam Workshop)

1. Abre la página del mod **Isaac Real-Time Companion** en Steam Workshop y pulsa **Suscribirse**.
2. Inicia The Binding of Isaac. En el menú **Mods** comprueba que está activado (lo está por defecto).

El mod es invisible: no muestra nada dentro del juego.

## 2. La app Isaac Companion

1. Descarga `IsaacCompanion-win-x64.zip` y descomprímelo donde quieras (por ejemplo `Documentos\IsaacCompanion`).
2. Ejecuta `IsaacCompanion.exe`.
   - Windows puede mostrar *“Windows protegió su PC”* porque el ejecutable no está firmado: **Más información → Ejecutar de todas formas**.
   - El firewall no debería preguntar nada: solo escucha en `127.0.0.1`.
3. Se abre el navegador en <http://127.0.0.1:47823>. Deja la ventana de la app abierta mientras juegas.

### Que arranque solo con Windows (opcional)

`Win + R` → `shell:startup` → crea ahí un acceso directo a `IsaacCompanion.exe` (añade `--no-open` al destino si no
quieres que abra el navegador cada vez).

## 3. Jugar

- La web muestra **🟢 ISAAC CONECTADO** en cuanto empiezas o continúas una partida.
- **Segundo monitor**: botón *2º monitor* o abre <http://127.0.0.1:47823/?mode=monitor> y pon el navegador en pantalla completa.
- **Idioma de nombres**: botón *ES/EN* (los nombres en español salen de los archivos de tu juego).

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
| `--log "C:\...\log.txt"` | ruta de `log.txt` si no se detecta |
| `--game-dir "D:\...\The Binding of Isaac Rebirth"` | carpeta del juego si no se detecta |
| `--reveal-distance 1.5` | distancia (en casillas) a la que se identifica un pedestal; por defecto 2 |
| `--update-data` | descarga los datos más recientes de la wiki (sin actualizar el mod) |
| `--origin=https://mi-web` | permitir una copia alojada de la web |

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
| Steam Deck / Linux | El mod funciona; la app se puede ejecutar desde el código (`npm start`), ver DEVELOPMENT.md. |
