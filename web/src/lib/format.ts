import { CURSES, ROOM_TYPE_NAMES } from '@irtc/protocol';
import type { Lang } from './i18n';
import { translate } from './strings';

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ago(ms: number | null, now: number, lang: Lang = 'es'): string {
  if (ms === null) return '—';
  const d = Math.max(0, Math.round((now - ms) / 1000));
  if (d < 2) return translate(lang, 'ago.now');
  if (d < 60) return translate(lang, 'ago.s', { n: d });
  if (d < 3600) return translate(lang, 'ago.min', { n: Math.floor(d / 60) });
  return translate(lang, 'ago.h', { n: Math.floor(d / 3600) });
}

export function signed(n: number, digits = 2): string {
  const v = Number(n.toFixed(digits));
  return `${v > 0 ? '+' : ''}${v}`;
}

export function fixed(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

const ROOM_TYPE_ES: Record<number, string> = {
  1: 'Sala',
  2: 'Tienda',
  3: 'Sala de error',
  4: 'Sala del tesoro',
  5: 'Jefe',
  6: 'Minijefe',
  7: 'Sala secreta',
  8: 'Sala supersecreta',
  9: 'Arcade',
  10: 'Sala maldita',
  11: 'Desafío',
  12: 'Biblioteca',
  13: 'Sacrificio',
  14: 'Sala del diablo',
  15: 'Sala del ángel',
  16: 'Sótano',
  17: 'Boss Rush',
  18: 'Dormitorio',
  19: 'Dormitorio sucio',
  20: 'Cámara',
  21: 'Sala de dados',
  22: 'Mercado negro',
  24: 'Planetario',
  27: 'Salida secreta',
  28: 'Útero azul',
  29: 'Ultrasecreta',
};

export function roomTypeName(type: number | null | undefined, lang: Lang = 'es'): string {
  if (type === null || type === undefined) return '—';
  if (lang === 'en') return ROOM_TYPE_NAMES[type] ?? `Room ${type}`;
  return ROOM_TYPE_ES[type] ?? ROOM_TYPE_NAMES[type] ?? `Sala ${type}`;
}

export function curseNames(mask: number): string[] {
  return CURSES.filter((c) => (mask & c.bit) !== 0).map((c) => c.name);
}

/** Floor label from the game (strips untranslated "#KEY" strings). */
export function floorName(name: string | null | undefined, stage: number | null | undefined, lang: Lang = 'es'): string {
  if (name && !name.startsWith('#')) return name;
  return stage ? translate(lang, 'floor.n', { n: stage }) : '—';
}

export function priceLabel(price: number, lang: Lang = 'es'): string | null {
  if (price > 0) return `${price} ¢`;
  if (price < 0) return translate(lang, 'price.devil');
  return null;
}
