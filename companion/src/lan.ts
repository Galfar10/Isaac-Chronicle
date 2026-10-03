import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newLanKey } from '../../backend/src/lan.js';

export interface LanSettings {
  enabled: boolean;
  /** Random access key for the phone link. Never leaves this PC except inside that link/QR. */
  key: string;
}

/** Mobile mode settings, kept in the local profile (dataDir/lan.json). The key is created once. */
export function loadLanSettings(dataDir: string): LanSettings {
  const file = join(dataDir, 'lan.json');
  try {
    if (existsSync(file)) {
      const s = JSON.parse(readFileSync(file, 'utf8')) as Partial<LanSettings>;
      if (typeof s.key === 'string' && s.key.length >= 16) return { enabled: s.enabled === true, key: s.key };
    }
  } catch {
    /* recreated below */
  }
  const fresh = { enabled: false, key: newLanKey() };
  saveLanSettings(dataDir, fresh);
  return fresh;
}

export function saveLanSettings(dataDir: string, s: LanSettings): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'lan.json'), JSON.stringify(s));
}
