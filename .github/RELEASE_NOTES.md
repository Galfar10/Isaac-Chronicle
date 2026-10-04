## Isaac Chronicle — Companion (Windows · Steam Deck / Linux · macOS)

### Novedades · What's new (0.4.0): Steam Deck y macOS · Steam Deck and macOS

- 🎮 **Steam Deck / Linux**: `IsaacCompanion-linux-x64.tar.gz`. Extráelo en tu carpeta personal y pon en los parámetros de lanzamiento de Isaac `"/home/deck/IsaacCompanion/steam-launch.sh" %command%`: la app arranca y se cierra con el juego. Encuentra el `log.txt` de Proton, también en la microSD.
- 🍎 **macOS** (Isaac con CrossOver, Whisky o Wine): `IsaacCompanion-macos-arm64.zip` (Apple Silicon) / `IsaacCompanion-macos-x64.zip` (Intel). La primera vez: `xattr -dr com.apple.quarantine ~/Downloads/IsaacCompanion`.
- 🎮 **Steam Deck / Linux**: `IsaacCompanion-linux-x64.tar.gz`. Extract it in your home folder and set Isaac's launch options to `"/home/deck/IsaacCompanion/steam-launch.sh" %command%`: the app starts and stops with the game. It finds Proton's `log.txt`, also on the microSD card.
- 🍎 **macOS** (Isaac through CrossOver, Whisky or Wine): `IsaacCompanion-macos-arm64.zip` (Apple Silicon) / `IsaacCompanion-macos-x64.zip` (Intel). First run: `xattr -dr com.apple.quarantine ~/Downloads/IsaacCompanion`.
- Guía paso a paso · Step by step: [INSTALL.md](https://github.com/Galfar10/Isaac-Chronicle/blob/main/INSTALL.md)

### 0.3.4

- ♥ La ventana **Apoyar** aparece en cuanto la web muestra *desconectado* (Isaac cerrado), sin espera.
- ♥ The **Support** dialog appears as soon as the page shows *disconnected* (Isaac closed), with no delay.

### 0.3.3

- ♥ Al cerrar Isaac, la web muestra unos segundos después la ventana **Apoyar** (Ko-fi / GitHub Sponsors). No aparece al pausar, cambiar de ventana ni volver al menú.
- ♥ When Isaac is closed, the web page shows the **Support** dialog (Ko-fi / GitHub Sponsors) a few seconds later. It does not appear when pausing, switching windows or going back to the menu.

### 0.3.2

- ♥ El botón **Apoyar** abre una ventana con las dos opciones: **Ko-fi** y **GitHub Sponsors**. Opcional.
- ♥ The **Support** button opens a dialog with both options: **Ko-fi** and **GitHub Sponsors**. Optional.

### 0.3.1

- ♥ Enlace **Apoyar** (Ko-fi) en la web del Companion y enlaces de Ko-fi / GitHub Sponsors en la guía de inicio. Opcional.
- ♥ **Support** link (Ko-fi) in the Companion web page, plus Ko-fi / GitHub Sponsors links in the getting-started guide. Optional.

### 0.3.0

- 📱 **Modo móvil**: en la web del PC pulsa **Móvil → Activar modo móvil** y escanea el QR con el móvil (misma red Wi-Fi).
  Desactivado por defecto, solo red local y con clave privada. La primera vez permite *Redes privadas* en el Firewall de Windows.
- 📱 **Mobile mode**: on the PC page press **Mobile → Turn on mobile mode** and scan the QR code with your phone (same Wi-Fi).
  Off by default, local network only, protected by a private key. The first time, allow *Private networks* in the Windows Firewall prompt.

**ES**
1. Suscríbete al mod [**Isaac Chronicle** en Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3812867579).
2. Descarga el archivo de tu sistema (Windows: `IsaacCompanion-win-x64.zip` → `IsaacCompanion.exe`), descomprímelo y ábrelo (déjalo abierto mientras juegas).
3. Se abre <http://127.0.0.1:47823>. También puedes usar <https://galfar10.github.io/Isaac-Chronicle/>.
4. Interfaz en castellano e inglés: botón **ES/EN**.
5. Móvil: botón **📱 Móvil** en la web del PC y escanea el QR.

> Windows puede mostrar “Windows protegió su PC” porque el ejecutable no está firmado: **Más información → Ejecutar de todas formas**.

**EN**
1. Subscribe to [**Isaac Chronicle** on Steam Workshop](https://steamcommunity.com/sharedfiles/filedetails/?id=3812867579).
2. Download the file for your system (Windows: `IsaacCompanion-win-x64.zip` → `IsaacCompanion.exe`), unzip it and run it (keep it open while you play).
3. <http://127.0.0.1:47823> opens automatically. You can also use <https://galfar10.github.io/Isaac-Chronicle/>.
4. English and Spanish interface: **ES/EN** button.
5. Phone: **📱 Mobile** button on the PC page, then scan the QR code.

> Windows may show “Windows protected your PC” because the executable is not signed: **More info → Run anyway**.

No Node.js, Python or `--luadebug` needed. Everything runs locally (127.0.0.1; your LAN only if you turn on mobile mode).
