# Desarrollo

Requisitos: Node.js ≥ 22.13 (se usa `node:sqlite` integrado; probado con Node 24).

```bash
npm install
```

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run mock` | Companion + partida simulada (escribe en un log.txt temporal el mismo formato que el mod). Opciones: `-- --speed 2`, `-- --once`, `-- --no-open` |
| `npm run demo` | compila la web y lanza el mock |
| `npm start` | Companion real (lee el log.txt de tu Isaac) |
| `npm run dev` | Companion en modo watch + Vite en <http://127.0.0.1:5173> con proxy a la API |
| `npm test` | toda la batería de tests (Vitest) |
| `npm run typecheck` | TypeScript estricto (node, web y tests) |
| `npm run build` | typecheck + web + bundle del Companion |
| `npm run package` | ejecutable único `release/IsaacCompanion/IsaacCompanion.exe` + zip |
| `npm run import:wiki` | descarga la wiki → `database/seed/wiki.json` |
| `npm run import:game` | lee tus `extracted_resources` → `database/local/game.json` (solo inspección, no se versiona) |
| `npm run db:build` | construye `data/companion.sqlite` e imprime un resumen |
| `npm run mod:install` / `mod:uninstall` | copia/quita el mod en la carpeta `mods` del juego |

## Variables de entorno

`IRTC_PORT`, `IRTC_REVEAL_DISTANCE`, `IRTC_LOG_PATH`, `IRTC_GAME_DIR`, `IRTC_DATA_DIR`, `IRTC_ALLOWED_ORIGINS` (coma), `IRTC_NO_OPEN=1`.

## Tests

| Archivo | Cubre |
|---|---|
| `tests/wire.test.ts` | formato de línea, troceado, datos inválidos, versión incompatible |
| `tests/store.test.ts` | estado: run, sala, objetos antes de recoger, más cercano, recogida, stats con deltas, fin, resync, heartbeat |
| `tests/logTail.test.ts` | lectura incremental, líneas parciales, truncado al reiniciar el juego, archivo ausente |
| `tests/wikitext.test.ts` | parser de la wiki, filtro de texto eliminado en Repentance, sinergias, normalización |
| `tests/db.test.ts` | migraciones, búsqueda por ID/nombre (ES/EN), sinergias entre objetos, runs |
| `tests/api.test.ts` | endpoints REST, CORS/origen, WebSocket (welcome, update, pong, sin duplicados) |
| `tests/reconnect.test.ts` | reconexión del cliente web tras reiniciar el servidor, mensajes inválidos |
| `tests/discovery.test.ts` | lejos/cerca/alejarse, dos objetos, pastillas y cartas sin usar/primer uso/ya descubiertas, persistencia tras reiniciar el Companion y reabrir la web, sin fugas en `item_spawned`/WebSocket/REST |
| `tests/e2e-mock.test.ts` | log.txt → bridge → backend → WebSocket → BD con la partida simulada |
| `tests/lua-mod.test.ts` | **ejecuta el mod Lua real** en una VM Lua 5.3 (fengari) con la API de Isaac simulada y decodifica su salida |

El test Lua valida sintaxis, el JSON y el formato de cable; no sustituye a probar en el juego (la API simulada
reproduce las firmas documentadas, no el motor).

## Probar con el juego real

1. `npm run mod:install`
2. Abre Isaac y activa el mod.
3. `npm start` → <http://127.0.0.1:47823>.
4. Para ver qué escribe el mod: busca líneas `IRTC|` en `Documents\My Games\Binding of Isaac Repentance+\log.txt`.
5. Tras cambiar Lua: en la consola del juego `luamod isaac-real-time-companion` (el mod se resincroniza solo).

## Añadir o corregir datos

- Sinergias o textos: `database/seed/overrides.json`

```json
{
  "items": [{ "kind": "collectible", "id": 118, "description": "Texto corregido" }],
  "synergies": [{ "a": { "kind": "collectible", "id": 118 }, "b": { "kind": "collectible", "id": 114 }, "description": "…", "sourceUrl": "https://…" }]
}
```

- Las sinergias deben tener fuente verificable (`sourceUrl`). Nunca se generan automáticamente.
- Al arrancar, el Companion recalcula la versión del dataset y recarga la BD si cambió.

## Extender el protocolo

1. Añade el tipo en `protocol/src/modMessages.ts` (+ validación en `wire.ts`).
2. Prodúcelo en `isaac-mod/irtc/collect.lua` / `main.lua` (siempre con `pcall` y `sendIfChanged`).
3. Redúcelo en `bridge/src/store.ts` y añade campos **opcionales** a `GameState` (compatibilidad hacia atrás).
4. Test en `tests/store.test.ts` y `tests/lua-mod.test.ts`.

## Estilo visual

Tokens en `web/src/styles/global.css` (paleta mazmorra/pergamino, sin neón ni degradados modernos).
Fuentes empaquetadas (funcionan sin internet): IM Fell English SC (títulos) y Alegreya (texto), licencia OFL.
Iconos SVG propios en `web/src/components/Icons.tsx`; las texturas son ruido SVG generado, sin imágenes externas.
