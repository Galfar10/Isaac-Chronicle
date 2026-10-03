# Publicación en Steam Workshop

Isaac usa su herramienta oficial: `Steam\steamapps\common\The Binding of Isaac Rebirth\tools\ModUploader\ModUploader.exe`.
Steam tiene que estar abierto con la cuenta que publicará el mod.

## Ficha del mod (todo preparado)

| Campo | Valor / archivo |
|---|---|
| Título | **Isaac Chronicle - Real-Time Companion** (en `isaac-mod/metadata.xml`) |
| Descripción corta (la que sube ModUploader) | `<description>` de `isaac-mod/metadata.xml` |
| Descripción completa (BBCode, para pegar en la página) | [`workshop/description.bbcode.txt`](workshop/description.bbcode.txt) |
| Imagen principal (portada) | [`workshop/preview.png`](workshop/preview.png) — 1024×1024, cuadrada |
| Galería (capturas, se añaden en la web de Steam) | [`docs/screenshots/01-objeto-cercano.png`](docs/screenshots/01-objeto-cercano.png), [`02-sinergias.png`](docs/screenshots/02-sinergias.png), [`03-desconocidos.png`](docs/screenshots/03-desconocidos.png), [`04-descubrimiento.png`](docs/screenshots/04-descubrimiento.png), [`05-movil.png`](docs/screenshots/05-movil.png) |
| Tags | `Lua`, `Tweaks` |
| Visibilidad | `Public` (cámbiala a `Private` en `metadata.xml` si quieres probar antes) |
| Enlace requerido | App Companion: <https://github.com/Galfar10/Isaac-Chronicle/releases/latest> |

## Qué se sube

Solo la carpeta [`isaac-mod/`](isaac-mod) (3 scripts Lua + `metadata.xml`, ~20 KB):

```
isaac-mod/
├── metadata.xml
├── main.lua
└── irtc/  json.lua · emitter.lua · collect.lua
```

La etiqueta `<id>` no se escribe a mano: ModUploader la añade al `metadata.xml` tras la primera subida y se usa en las
actualizaciones. **Guarda ese `metadata.xml` en el repositorio** (y pon la URL en `protocol/src/project.ts` → `workshopUrl`).

## Pasos

1. **Antes de subir**, publica la release del Companion en GitHub (el Workshop enlaza a ella): `git tag v0.1.0` y `git push --tags`.
2. Quita la copia local de pruebas para no cargar el mod dos veces: `npm run mod:uninstall`.
3. Abre `ModUploader.exe` → **Choose Mod...** → selecciona `isaac-mod/metadata.xml`.
4. Como imagen de vista previa elige `workshop/preview.png`. Revisa título y descripción y pulsa **Upload Mod**.
5. Acepta el acuerdo del Workshop si Steam lo pide (primera publicación).
6. En la página del mod en Steam:
   - **Editar descripción** → pega `workshop/description.bbcode.txt`.
   - **Añadir/editar imágenes y vídeos** → sube las 5 capturas de `docs/screenshots/`.
7. Copia el `metadata.xml` (ya con `<id>`) al repositorio, pon la URL del Workshop en `protocol/src/project.ts` y haz commit.

## Actualizaciones

- Sube `<version>` en `metadata.xml` y `VERSION` en `isaac-mod/main.lua`, y vuelve a usar ModUploader (mismo `<id>`).
- Si cambia el formato de línea, incrementa `WIRE_PROTOCOL` (`protocol/src/modMessages.ts`) y el prefijo de
  `irtc/emitter.lua`; la web avisará de “versión incompatible” si mod y app no coinciden.
- Los datos de objetos **no** requieren actualizar el mod: van en la app (`--update-data`).

## Limitaciones de Workshop

- Un mod de Workshop no puede descargar ni ejecutar programas: el Companion se distribuye aparte (GitHub Releases).
- REPENTOGON no está en Workshop, por eso no es requisito (el mod lo aprovecha si está instalado).
