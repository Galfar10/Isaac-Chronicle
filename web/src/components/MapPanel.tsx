import { MAP_GRID_WIDTH, ROOM_SHAPES } from '@irtc/protocol';
import { useClient } from '../lib/gameStore';
import { roomTypeName } from '../lib/format';
import { MapIcon } from './Icons';

const CELL = 22;
const GAP = 3;

const GLYPH: Record<number, string> = {
  2: '$', // shop
  4: '♛', // treasure
  5: '☠', // boss
  7: '?', // secret
  8: '?',
  10: '✠', // curse
  12: '▤', // library
  13: '✚', // sacrifice
  14: '⛧', // devil
  15: '✧', // angel
  20: '▣', // vault
  22: '¤',
  24: '✶', // planetarium
  29: '?',
};

/**
 * Hand-drawn parchment map built from what the minimap already shows
 * (rooms with DisplayFlags or visited). Hidden layout is never revealed.
 */
export function MapPanel() {
  const { state } = useClient();
  const rooms = (state.map ?? []).filter((r) => r.gridIndex >= 0);
  const current = state.room;
  if (state.mapHidden) {
    return (
      <section className="panel panel--map" aria-label="Mapa">
        <h2 className="panel__title">
          <MapIcon size={20} /> Mapa
        </h2>
        <div className="map map--hidden">
          <span className="map__q">?</span>
          <p>
            {state.mapHidden === 'amnesia'
              ? 'Amnesia: has olvidado el mapa de este piso.'
              : 'Curse of the Lost: el mapa está oculto en este piso.'}
          </p>
        </div>
      </section>
    );
  }
  if (!rooms.length) {
    return (
      <section className="panel panel--map" aria-label="Mapa">
        <h2 className="panel__title">
          <MapIcon size={20} /> Mapa
        </h2>
        <p className="muted small">El mapa se dibuja a medida que exploras.</p>
      </section>
    );
  }
  const cells = rooms.map((r) => {
    const shape = ROOM_SHAPES[r.shape] ?? { w: 1, h: 1 };
    return { r, x: r.gridIndex % MAP_GRID_WIDTH, y: Math.floor(r.gridIndex / MAP_GRID_WIDTH), shape };
  });
  const minX = Math.min(...cells.map((c) => c.x));
  const minY = Math.min(...cells.map((c) => c.y));
  const maxX = Math.max(...cells.map((c) => c.x + c.shape.w));
  const maxY = Math.max(...cells.map((c) => c.y + c.shape.h));
  const w = (maxX - minX) * (CELL + GAP) + 10;
  const h = (maxY - minY) * (CELL + GAP) + 10;
  const offRoom = current && (current.index ?? 0) < 0;
  return (
    <section className="panel panel--map" aria-label="Mapa">
      <h2 className="panel__title">
        <MapIcon size={20} /> Mapa
        {offRoom ? <span className="muted small"> · fuera del mapa ({roomTypeName(current?.type)})</span> : null}
      </h2>
      <div className="map">
        <svg viewBox={`-5 -5 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Mapa del piso">
          {cells.map(({ r, x, y, shape }) => {
            const px = (x - minX) * (CELL + GAP);
            const py = (y - minY) * (CELL + GAP);
            const rw = shape.w * CELL + (shape.w - 1) * GAP;
            const rh = shape.h * CELL + (shape.h - 1) * GAP;
            const cls = r.current ? 'room room--current' : r.visited ? 'room room--visited' : 'room room--seen';
            const glyph = GLYPH[r.type];
            return (
              <g key={r.gridIndex} className={cls} filter="url(#sketch)">
                <rect x={px} y={py} width={rw} height={rh} rx={2.5} />
                {shape.missing ? (
                  <rect
                    className="room__cut"
                    x={px + (shape.missing.endsWith('r') ? CELL + GAP : 0) - 1}
                    y={py + (shape.missing.startsWith('b') ? CELL + GAP : 0) - 1}
                    width={CELL + 2}
                    height={CELL + 2}
                  />
                ) : null}
                {glyph ? (
                  <text x={px + rw / 2} y={py + rh / 2 + 5} textAnchor="middle" className="room__glyph">
                    {glyph}
                  </text>
                ) : null}
                <title>{roomTypeName(r.type)}{r.visited ? '' : ' (sin visitar)'}</title>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="map__legend small">
        <span><i className="lg lg--current" /> actual</span>
        <span><i className="lg lg--visited" /> visitada</span>
        <span><i className="lg lg--seen" /> vista</span>
      </div>
    </section>
  );
}
