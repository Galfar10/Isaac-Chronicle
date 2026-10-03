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
