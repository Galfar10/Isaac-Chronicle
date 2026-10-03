import { createContext, useContext } from 'react';
import type { ItemRecord } from '@irtc/protocol';

export type Lang = 'es' | 'en';

export const LangContext = createContext<Lang>('es');
export const useLang = () => useContext(LangContext);

/** Item name in the selected language (Spanish comes from the game's own string table). */
export function itemName(item: ItemRecord | null, lang: Lang, fallback: string): string {
  if (!item) return fallback;
  return (lang === 'es' && item.nameEs) || item.name;
}

export function itemQuote(item: ItemRecord | null, lang: Lang): string | null {
  if (!item) return null;
  return (lang === 'es' && item.quoteEs) || item.quote;
}

export function refName(ref: { name: string; nameEs?: string | null }, lang: Lang): string {
  return (lang === 'es' && ref.nameEs) || ref.name;
}

export const KIND_LABEL: Record<string, { es: string; en: string }> = {
  collectible: { es: 'Objeto', en: 'Item' },
  trinket: { es: 'Baratija', en: 'Trinket' },
  card: { es: 'Carta', en: 'Card' },
  pill: { es: 'Píldora', en: 'Pill' },
};

export const ITEM_TYPE_LABEL: Record<string, string> = {
  passive: 'Pasivo',
  active: 'Activo',
  familiar: 'Familiar',
  trinket: 'Baratija',
  tarot: 'Tarot',
  tarot_reverse: 'Tarot invertido',
  suit: 'Carta de palo',
  rune: 'Runa',
  special: 'Carta especial',
  object: 'Objeto de bolsillo',
};
