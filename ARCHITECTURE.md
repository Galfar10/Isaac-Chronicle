# Arquitectura

## Resumen

```
 THE BINDING OF ISAAC (Repentance / Repentance+)
        │  callbacks vanilla (MC_POST_UPDATE, MC_POST_NEW_ROOM, ...)
        ▼
 ISAAC MOD (Lua, Steam Workshop)          isaac-mod/
        │  Isaac.DebugString("IRTC|1|<seq>|<tipo>|<json>")
        ▼
 log.txt  (Documents/My Games/Binding of Isaac Repentance+/log.txt)
        │  lectura incremental (poll 100 ms)
        ▼
 ┌──────────────── ISAAC COMPANION (un solo .exe, 127.0.0.1) ────────────────┐
 │ BRIDGE  bridge/src        LogTail → WireDecoder → GameStateStore          │
 │ BACKEND backend/src       API REST + WebSocket /ws + SQLite (node:sqlite) │
 │ WEB     web/dist          servida por el mismo proceso                    │
 └───────────────────────────────────────────────────────────────────────────┘
        │  WebSocket (estado completo + eventos de dominio)
        ▼
 NAVEGADOR (segundo monitor / móvil en la misma red si se habilita)
   STATS · OBJETO CERCANO · SALA · INVENTARIO · SINERGIAS · MAPA · HISTORIAL
```

Bridge y backend son módulos separados (paquetes `bridge/` y `backend/`) pero corren en **un único proceso**,
el *Companion*. Así el usuario solo ejecuta un programa y no hay un puerto extra entre bridge y backend.

## 1. Investigación de APIs (Fase 1)

Fuentes consultadas: documentación de la API Lua de Repentance (wofsauge.github.io/IsaacDocs/rep), documentación
oficial que trae el juego en `tools/LuaDocs` (es antigua, de Afterbirth+), repentogon.com, y comprobaciones
directas en una instalación real de Repentance+ (log.txt, metadata.xml de mods de Workshop, `extracted_resources`).

### A) Qué se obtiene con Lua estándar (vanilla) — lo que usa el mod

| Dato | API usada |
|---|---|
| Personaje | `EntityPlayer:GetPlayerType()`, `GetName()` (tainted = PlayerType 21..40) |
| Stats | `player.Damage`, `MaxFireDelay`, `TearRange`, `ShotSpeed`, `MoveSpeed`, `Luck` |
| Vida | `GetHearts`, `GetMaxHearts`, `GetSoulHearts`, `GetBlackHearts` (máscara de bits), `GetBoneHearts`, `GetEternalHearts`, `GetGoldenHearts`, `GetRottenHearts`, `GetBrokenHearts`, `GetHeartLimit` |
| Recursos | `GetNumCoins`, `GetNumBombs`, `GetNumKeys`, `HasGoldenKey`, `HasGoldenBomb` |
| Transformaciones | `HasPlayerForm(PlayerForm)` |
| Inventario | `GetCollectibleNum(id)` recorriendo `1..ItemConfig:GetCollectibles().Size-1`, `GetActiveItem(slot)`, `GetActiveCharge(slot)`, `GetTrinket(0/1)`, `GetCard(0..3)`, `GetPill(0..3)` |
| Píldoras | `ItemPool:IsPillIdentified(color)` y `GetPillEffect(color, player)` (solo si ya está identificada) |
| Objetos de la sala | `Isaac.FindByType(EntityType.ENTITY_PICKUP, -1, -1)` → `Variant`, `SubType`, `Position`, `InitSeed`; `EntityPickup.Price`, `OptionsPickupIndex`; calidad con `ItemConfig:GetCollectible(id).Quality` |
| Recogida | `player.QueuedItem.Item` (objeto sobre la cabeza, aún no en el inventario) |
| Piso | `Level:GetStage()`, `GetStageType()`, `GetAbsoluteStage()`, `GetName()`, `GetCurses()`, `IsAltStage()` |
| Sala | `Level:GetCurrentRoomIndex()`, `GetCurrentRoomDesc()` (GridIndex, ListIndex, VisitedCount), `Room:GetType()`, `GetRoomShape()`, `IsClear()` |
| Mapa | `Level:GetRooms()` → `RoomDescriptor` (GridIndex, VisitedCount, Clear, DisplayFlags, Data.Type, Data.Shape) |
| Run | `Game():GetSeeds():GetStartSeedString()`, `Game().Difficulty`, `Game():IsGreedMode()`, `Isaac.GetChallenge()`, `Game():GetFrameCount()` |
| Eventos | `MC_POST_GAME_STARTED(isContinued)`, `MC_PRE_GAME_EXIT(shouldSave)`, `MC_POST_GAME_END(isGameOver)`, `MC_POST_NEW_LEVEL`, `MC_POST_NEW_ROOM`, `MC_POST_UPDATE` (30 Hz), `MC_POST_RENDER` (heartbeat también en pausa) |
| Salida | `Isaac.DebugString(str)` → línea `[INFO] - Lua Debug: <str>` en log.txt (máx. ~10 KB por llamada) |

Comprobado en la instalación real: en Repentance+ vanilla **no existen** `Isaac.GetLocalizedString` ni
`Isaac.GetString` (llamarlas da *attempt to call a nil value*), y `ItemConfig.Item.Name` devuelve claves
como `#BRIMSTONE_NAME`. Por eso **los nombres y textos los pone la web**, no el mod.

### B) Qué añadiría REPENTOGON

REPENTOGON es un *script extender* que se instala con un launcher externo (no está en Workshop) y cambia Lua a 5.4.
Aporta, entre otros, `MC_POST_ADD_COLLECTIBLE` (id 1005) y `EntityPickup:IsBlind()`. Decisión: **no es requisito**.
El mod lo detecta (`REPENTOGON ~= nil`) y solo lo usa para ocultar pedestales “?” de los pisos alternativos.
Exigirlo rompería la experiencia “suscribirse y jugar”.

### C) Qué necesita un bridge externo

Un mod Lua normal **no puede** abrir sockets, hacer HTTP ni lanzar procesos. Solo con la opción de lanzamiento
`--luadebug` se habilitan `require` arbitrario y `socket`, pero da acceso total al sistema a **todos** los mods
instalados (riesgo de seguridad) y la librería socket incluida no es compatible con REPENTOGON (Lua 5.4).
Por eso la comunicación usa **log.txt** (como hacen los item trackers clásicos) y un proceso externo, el Companion,
lo lee y sirve la web por WebSocket.

### D) Qué no se puede obtener (y la alternativa)

| Limitación | Alternativa aplicada |
|---|---|
| Nombres/descr. traducidos en Lua vanilla | La web los obtiene de la BD por ID (stringtable del propio juego en local + wiki) |
| Pedestales “?” de pisos alternativos (vanilla) | Con REPENTOGON se ocultan; sin él el ID es visible (documentado). Curse of the Blind sí se respeta siempre |
| Evento “objeto añadido” (vanilla) | `QueuedItem` + comparación de inventario cada segundo (cubre objetos sin pedestal: D4, Eden...) |
| Orden real de corazones negros/almas | `GetBlackHearts` es una máscara: se muestra el número de huecos negros, no el orden exacto |
| Tiempo de juego exacto del HUD | Se usa `GetFrameCount()/30` (tiempo de juego, se detiene en pausa) |
| Iniciar el Companion desde el mod | Imposible sin `--luadebug`. El usuario abre el Companion (o pone un acceso directo en `shell:startup` para que arranque con Windows, ver INSTALL.md) |
| Coop: datos de jugadores 2-4 | V1 sigue al jugador 0 (Esaú/The Soul no se muestran por separado) |
| Probabilidad de diablo/ángel/planetario | No hay API vanilla fiable: no se muestra (no se inventa) |

## 1b. Sistema de descubrimiento (no es un radar ni un EID)

Filosofía: **pedestales** → “solo sé qué es cuando me acerco”; **pastillas y cartas** → “no sé qué hacen
hasta que las recojo”.

El filtrado ocurre **en el servidor** (`bridge/src/store.ts`): el bridge guarda la identidad real de cada entidad
en una estructura interna (`TrackedItem`, nunca serializada) y la web solo recibe una vista saneada
(`RoomItem` con `id: null`, sin `quality`, `name`, `pillEffect`). Así ni `item_spawned`, ni `/api/state`,
ni el WebSocket pueden filtrar información, aunque alguien inspeccione la red.

### Pedestales (coleccionables y baratijas en el suelo)

- Posiciones reales: `Entity.Position` de cada pickup y del jugador (API vanilla, en píxeles; 1 casilla = 40 px).
- Revelar: `distance(player, item) <= ITEM_REVEAL_DISTANCE` (2 casillas por defecto, `protocol/src/constants.ts`,
  configurable con `--reveal-distance` / `IRTC_REVEAL_DISTANCE`).
- Volver a ocultar: distancia `> ITEM_CONCEAL_DISTANCE` (3,5 casillas). La banda intermedia evita parpadeos.
- Varios objetos: cada uno se evalúa por separado; solo se identifica el que está al alcance.
- Al entrar en una sala la posición anterior se descarta (y el mod envía `pos` antes de `pickups`) para que una
  posición obsoleta nunca revele nada.
- Eventos: `item_spawned` (siempre sin identidad si está lejos), `item_revealed`, `item_concealed`.
  El historial registra `item_found` solo cuando el objeto se identifica por cercanía.
- Curse of the Blind / pedestales “?”: siguen ocultos aunque estés encima (`unknown: 'blind'`).
- Limitación: la posición del jugador se envía como máximo 5 veces/s y solo si se movió > 8 px, así que la
  revelación puede tardar hasta ~200 ms.

### Pastillas y cartas

Regla actual (decisión del usuario):
- **Cartas**: se revelan al recogerlas, nunca antes.
- **Pastillas**: como en el juego, desconocidas (suelo y bolsillo) hasta que **se toman**. Al tomarla (`MC_USE_PILL`
  con evidencia) se revela, se muestra en la carta central (“PASTILLA DESCUBIERTA”) y ese color queda conocido el
  resto de la run. Si el juego ya ha identificado el color (`IsPillIdentified`: tomada antes en la run, PHD…) se
  muestra en el bolsillo. Entre runs los colores cambian, así que un efecto descubierto antes vuelve a ser
  desconocido hasta tomarlo. (Los puntos de abajo sobre “al recogerlas” aplican a las cartas.)

- **En el suelo**: siempre desconocidas (`unknown: 'not_picked'`), aunque estés encima y aunque ya las hayas
  descubierto en otra partida. El mod no consulta el efecto de las pastillas del suelo.
- **Al recogerlas** (aparecen en `GetCard(slot)` / `GetPill(slot)`): la carta se muestra por su id y la pastilla por
  su efecto, que el mod obtiene con `ItemPool:GetPillEffect(color, player)` solo para las pastillas que ya están en el
  bolsillo. Nota: el HUD del juego muestra “???” en pastillas sin identificar; la web sí muestra su efecto al
  recogerla, por decisión explícita.
- **Al tirarla**: la carta/pastilla que el jugador tira del bolsillo sigue identificada en el suelo (solo esa entidad,
  no otras copias). Se detecta como “salió del bolsillo sin uso registrado” y se enlaza con la entidad del mismo tipo
  que aparece en ≤ 3 s (en cualquier orden de llegada); se recuerda durante la run aunque cambies de sala.
- En ese momento la carta/efecto queda registrado como **descubierto** (persistente, evento `discovery`, entrada
  “¡NUEVO DESCUBRIMIENTO!” en el historial).
- **Uso**: `MC_USE_CARD` / `MC_USE_PILL` siguen registrándose (historial “USADO”) solo si era la carta/pastilla que el
  jugador tenía en la mano (slot 0 en la actualización anterior; en pastillas, además, el efecto coincide con el del
  color que tenía). Efectos lanzados por otros objetos (Echo Chamber…) y usos de otros jugadores (coop) se ignoran.
  Observado en partida real: el juego pasa `UseFlag.USE_OWNED` (4) también en usos normales desde el bolsillo.
- El descubrimiento se asocia al **efecto real** (`PillEffect` id / `Card` id), no al color: los colores de las
  pastillas cambian en cada run.
- Persistencia: tabla `discoveries` (vistas `discovered_pills` y `discovered_cards`) en la SQLite local. Sobrevive a
  cerrar la web, el Companion o Isaac y a empezar runs nuevas. `GET /api/discoveries` devuelve lo descubierto.
- Las cartas en el suelo, además, siguen la regla de proximidad.

### Lo que el HUD oculta, la web también

- **Mapa**: no se envía (`map: null`, `mapHidden`) con **Curse of the Lost** (bit 4 de `Level:GetCurses()`) ni tras
  tomar **Amnesia** (`PillEffect` 25, cualquier origen, Echo Chamber incluido) hasta el siguiente piso. Si la
  maldición desaparece (Black Candle), el mapa vuelve.
- **Vida**: con **Curse of the Unknown** (bit 8) la vida se envía a cero con `healthHidden: true`.
- El mod reenvía `level` cuando cambian las maldiciones a mitad de piso (comprobación 3 veces/s).

## 2. Protocolo mod → bridge (wire protocol 1)

Una línea por mensaje: `IRTC|1|<seq>|<tipo>|<json>`. Mensajes > 6000 caracteres se trocean:
`IRTC|1|<seq>|+<i>/<n>|<trozo>`. Claves cortas porque se escriben en disco.

| tipo | cuándo | contenido |
|---|---|---|
| `hello` | carga del mod / inicio de run | versión, protocolo, REPENTOGON |
| `run` | `MC_POST_GAME_STARTED` (o resync si se recarga el mod) | seed, dificultad, reto, personaje |
| `level` / `room` / `map` | nuevo piso / nueva sala | piso, sala, salas visibles del minimapa |
| `pickups` | cada 3 frames **solo si cambió** | lista de objetos de la sala (antes de recoger) |
| `pos` | cada 6 frames, solo si hay objetos y el jugador se movió > 8 px | posición del jugador |
| `stats` | cada 15 frames **solo si cambió** | stats, vida, recursos, transformaciones |
| `inv` | cada 30 frames o al terminar una recogida, **solo si cambió** | inventario |
| `queued` | al levantar un objeto | id y tipo (colleccionable/baratija) |
| `use` | `MC_USE_PILL` / `MC_USE_CARD` del jugador 1 | efecto o carta, color de la pastilla, `held` (evidencia de uso real) |
| `hb` | cada 2 s de tiempo real (también en pausa) | heartbeat |
| `end` / `exit` | muerte o victoria / salir al menú | |
| `err` | excepción en un lector (una vez por error) | |

El mod nunca ejecuta trabajo pesado por frame: el escaneo de inventario (~730 llamadas) se hace como máximo 1 vez/s
y todo se compara por cadena JSON antes de escribir, así que en una sala tranquila solo se escribe el heartbeat.

## 3. Estado y eventos (Companion → web)

`GET /api/state` y el WebSocket usan el mismo esquema (`protocol/src/state.ts`, `schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "connection": { "game": "connected|idle|waiting|disconnected", "lastPacketAt": 0, "modVersion": "0.1.0", "protocolOk": true, "repentogon": false, "paused": false, "error": null },
  "run": { "id": "uuid aleatorio", "character": { "type": 0, "name": "Isaac", "tainted": false }, "floor": { "stage": 1, "name": "Basement I", "curses": 0 }, "time": 63, "seed": "ABCD 1234", "status": "playing" },
  "player": { "health": {}, "resources": {}, "transformations": [], "position": { "x": 0, "y": 0 } },
  "stats": { "damage": 3.5, "tears": 2.73, "fireDelay": 10, "range": 6.5, "rangeRaw": 260, "shotSpeed": 1, "speed": 1, "luck": 0 },
  "inventory": { "collectibles": [{ "id": 118, "count": 1, "order": 1 }], "actives": [], "trinkets": [], "cards": [], "pills": [] },
  "room": {}, "roomItems": [{ "key": 1, "kind": "collectible", "id": 118, "x": 320, "y": 280, "price": 0, "distance": 2.1 }],
  "nearestKey": 1, "lastPicked": null, "map": [], "history": []
}
```

Mensajes WebSocket (`/ws`):

```json
{ "v": 1, "type": "welcome", "server": { "version": "0.1.0", "dataVersion": "..." }, "state": { } }
{ "v": 1, "type": "update", "seq": 42, "events": [ { "event": "item_spawned", "data": { "id": 118, "x": 320, "y": 180 } } ], "state": { } }
{ "v": 1, "type": "pong", "t": 1700000000000 }
```

Eventos de dominio: `connection_changed`, `run_started`, `run_ended`, `floor_changed`, `room_changed`,
`item_spawned`, `item_revealed`, `item_concealed`, `item_removed`, `item_picked`, `nearest_changed`,
`stats_changed` (con `deltas`), `inventory_changed`, `discovery`, `transformation`, `mod_error`.
Todos los eventos de objetos usan la vista saneada (ver §1b). Los envíos se agrupan (máx. 1 cada 50 ms) y **nunca se
reenvía un estado idéntico**.

Stats: el juego da `MaxFireDelay` y `TearRange`; la web muestra lo mismo que el HUD:
lágrimas = `30 / (MaxFireDelay + 1)`, alcance = `TearRange / 40`. No se recalcula nada más.

## 4. API REST

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | estado del servidor, del juego y nº de objetos/sinergias |
| GET | `/api/version` | versiones (app, protocolos, datos, mod) |
| GET | `/api/state` | estado completo |
| GET | `/api/items/:id` | coleccionable por ID |
| GET | `/api/items/:kind/:id` | `collectible`, `trinket`, `card`, `pill` (efecto) |
| GET | `/api/items?refs=collectible:118,trinket:1` | varios a la vez |
| GET | `/api/items/search?q=&kind=&limit=` | búsqueda (inglés o español, sin acentos) |
| GET | `/api/synergies` | lista paginada (`limit`, `offset`) |
| GET | `/api/synergies?items=collectible:118,collectible:114` | sinergias entre esos objetos |
| GET | `/api/synergies/:kind/:id` | sinergias de un objeto |
| GET | `/api/characters`, `/api/transformations` | datos de referencia |
| GET | `/api/discoveries` | efectos de pastilla y cartas ya descubiertos por el jugador |
| GET | `/api/runs`, `/api/runs/:id` | historial persistido de runs |
| GET | `/gfx/collectibles/:file`, `/gfx/trinkets/:file` | sprites desde los archivos extraídos del propio usuario |

## 5. Base de datos

SQLite embebido mediante `node:sqlite` (sin módulos nativos → el Companion es un único ejecutable).
Tablas: `items`, `item_effects`, `item_tags`, `item_sources`, `synergies`, `item_synergies`, `characters`,
`transformations`, `versions`, `runs`, `run_events` (`database/migrations/001_init.sql`) y `discoveries`
con las vistas `discovered_pills` / `discovered_cards` (`002_discoveries.sql`).

**¿Por qué no PostgreSQL?** El Companion corre en el PC de cada jugador; exigir un servidor PostgreSQL contradice
“no instalar nada”. El SQL de las migraciones es portable; si en el futuro hay un servicio público con cuentas,
el `Repository` es la única capa a adaptar.

### Fuentes de datos y normalización

| Fuente | Qué aporta | Licencia / distribución |
|---|---|---|
| Archivos del propio juego del usuario (`extracted_resources`: `items.xml`, `items_metadata.xml`, `itempools.xml`, `pocketitems.xml`, `players.xml`, `playerforms.xml`, `stringtable.sta`) | nombre y frase en **inglés y español**, calidad, tags, pools, tipo, cargas, sprite, personajes, transformaciones | se leen en local al arrancar; **no se redistribuyen** |
| Binding of Isaac Wiki (bindingofisaacrebirth.wiki.gg, API MediaWiki) | descripción larga, efectos, **sinergias** | CC BY-SA 4.0, incluido en `database/seed/wiki.json` con atribución por objeto |
| `database/seed/overrides.json` | correcciones manuales | propio |

`database/import/normalize.ts` fusiona por `(kind, id)`: el juego manda en nombres/calidad/tags; la wiki en
descripciones/efectos/sinergias. Las sinergias se resuelven por nombre a IDs; si un objeto no se puede resolver,
la sinergia **se descarta** (nunca se inventa). Texto marcado en la wiki como eliminado en Repentance (`{{dlc|nr}}`)
se filtra.

Actualizar datos **sin tocar el mod**: `IsaacCompanion.exe --update-data` (descarga la wiki a la carpeta de datos)
o editar `overrides.json`; al arrancar, si cambia la versión del dataset, se recarga la BD. El mod solo envía IDs.

## 6. Seguridad y privacidad

- El servidor escucha **solo en 127.0.0.1** (no accesible desde la red).
- **Modo móvil** (opcional, desactivado por defecto, se activa desde la web del PC con `POST /api/lan`, que solo acepta
  peticiones del propio PC con origen localhost y `Content-Type: application/json`): añade escuchas en las IPv4
  **privadas** del PC (mismo puerto). Toda petición que no venga de loopback exige: dirección de origen privada
  (RFC 1918 / link-local), la clave aleatoria de `dataDir/lan.json` (primero `?key=` del QR, que se cambia por una cookie
  `HttpOnly; SameSite=Strict` y se quita de la URL) y `Origin` igual al host. `/api/lan` (los enlaces con clave) nunca se
  sirve por la red. Al desactivarlo se cierran las escuchas y los WebSocket remotos.
- API y WebSocket rechazan orígenes que no sean localhost (o los añadidos con `--origin=` / `IRTC_ALLOWED_ORIGINS`).
  Respuesta a *Private Network Access* de Chrome incluida para una web alojada que conecte a 127.0.0.1.
- No se guarda nombre de usuario ni Steam ID. Cada run tiene un UUID aleatorio. Se guarda seed y personaje
  (para poder reanudar el historial de una run continuada).
- El mod no usa `--luadebug`, no abre red ni archivos: solo escribe en el log del juego.
- `/gfx` solo sirve `.png` con nombre validado dentro de la carpeta de recursos extraídos.

## 7. Robustez

| Caso | Comportamiento |
|---|---|
| Isaac cerrado | sin heartbeat > 6 s → `ISAAC DESCONECTADO`; si el proceso `isaac-ng.exe` sigue vivo → `ISAAC ABIERTO · SIN DATOS` |
| Isaac reiniciado | log.txt se recrea → el tail detecta truncado y vuelve a leer desde el inicio |
| Companion arrancado a mitad de run | se reproduce el log existente y se recupera el estado |
| Mod recargado (`luamod`) | el mod reenvía `run` con `resync` y la run se conserva |
| Run continuada | se reutiliza el id de run guardado (misma seed y personaje) y su historial |
| Datos inválidos | validación estructural por tipo; la línea se ignora y se registra |
| Objeto desconocido / de otro mod | la web muestra el nombre que da el juego y “no encontrado en la BD” |
| Versión de protocolo distinta | aviso “versión del mod incompatible” |
| Servidor caído / navegador cerrado | la web reconecta con backoff exponencial + ping/pong y detección de conexión muerta |
| Error en un lector Lua | cada lector está aislado con `pcall`; se informa una vez y el juego sigue |
