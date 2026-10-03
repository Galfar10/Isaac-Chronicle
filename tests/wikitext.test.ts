import { describe, expect, it } from 'vitest';
import { cleanWikitext, filterDlcSegments, parseInfobox, parseSynergies } from '../database/import/wikitext';
import { parseWikiPage } from '../database/import/wiki';
import { normalize } from '../database/import/normalize';

// Excerpt in the format of bindingofisaacrebirth.wiki.gg (CC BY-SA 4.0).
const PAGE = `{{infobox passive collectible
 | image name     = * {{dlc|na+|Rebirth}}
 | id             = 118
 | quote          = Blood laser barrage
 | description    = Tears are replaced with a blood laser beam.
 | quality        = 4
 | tags           = devil summonable offensive
}}

== Effects ==
* Isaac's tears are replaced with a charged blood laser beam.
* {{dlc|nr}} Old behaviour that was removed.
* {{transformation contribution|Leviathan}}

== Synergies ==
* {{I|20/20|a}} / {{I|The Inner Eye}}: Fires a spread of 2/3 Brimstone beams.
** {{Dlc|r}}Extra detail for Repentance.
* {{I|Apple!|a+nr}} / {{I|Tough Love|nr}}: Removed interaction.
* {{T|Brain Worm}}: The beam will curve 90 degrees.
* {{C|Azazel}}: Character note, not an item synergy.
`;

describe('wikitext parsing', () => {
  it('parses the infobox', () => {
    const box = parseInfobox(PAGE);
    expect(box?.type).toBe('passive collectible');
    expect(box?.params.id).toBe('118');
    expect(box?.params.quote).toBe('Blood laser barrage');
  });

  it('drops text removed in Repentance', () => {
    expect(filterDlcSegments('A {{dlc|nr}}old {{dlc|r}}new')).toBe('A new');
    expect(cleanWikitext("See {{i|Brimstone}} and [[Coins|coin]] '''bold'''")).toBe('See Brimstone and coin bold');
    expect(cleanWikitext('{{dlcalt|4|r=2}}')).toBe('2');
  });

  it('parses synergies with item/trinket partners only', () => {
    const syn = parseSynergies(PAGE.split('== Synergies ==')[1]);
    expect(syn.map((s) => s.partners.map((p) => p.name))).toEqual([['20/20', 'The Inner Eye'], ['Brain Worm']]);
    expect(syn[0].description).toBe('Fires a spread of 2/3 Brimstone beams. Extra detail for Repentance.');
    expect(syn[1].partners[0].kind).toBe('trinket');
  });

  it('builds an item record with source attribution', () => {
    const parsed = parseWikiPage({ title: 'Brimstone', content: PAGE });
    expect(parsed?.item).toMatchObject({ kind: 'collectible', id: 118, name: 'Brimstone', quality: 4, quote: 'Blood laser barrage' });
    expect(parsed?.item.effects).toEqual([
      "Isaac's tears are replaced with a charged blood laser beam.",
      'Counts toward the Leviathan transformation.',
    ]);
    expect(parsed?.item.source.license).toBe('CC BY-SA 4.0');
    expect(parsed?.synergies).toHaveLength(3);
  });

  it('normalizes: game data wins for names, wiki for descriptions; partners resolved by name', () => {
    const wiki = parseWikiPage({ title: 'Brimstone', content: PAGE })!;
    const data = normalize([
      {
        generatedAt: '',
        source: 'wiki',
        items: [
          wiki.item,
          { kind: 'collectible', id: 2, name: 'The Inner Eye', source: wiki.item.source },
          { kind: 'trinket', id: 9, name: 'Brain Worm', source: wiki.item.source },
        ],
        synergies: wiki.synergies,
        characters: [],
        transformations: [],
      },
      {
        generatedAt: '',
        source: 'game',
        items: [{ kind: 'collectible', id: 118, name: 'Brimstone', nameEs: 'Azufre', quality: 4, source: { name: 'game', url: null, license: null } }],
        synergies: [],
        characters: [],
        transformations: [],
      },
    ]);
    const brim = data.items.find((i) => i.id === 118 && i.kind === 'collectible')!;
    expect(brim.nameEs).toBe('Azufre');
    expect(brim.description).toBe('Tears are replaced with a blood laser beam.');
    expect(brim.sources.map((s) => s.name).sort()).toEqual(['game', 'wiki']);
    // 20/20 is not in the dataset => dropped (never invented); the other two resolve.
    expect(data.synergies.map((s) => `${s.b.kind}:${s.b.id}`)).toEqual(['collectible:2', 'trinket:9']);
  });
});
