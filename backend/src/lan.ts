import { randomBytes, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';

/**
 * Optional "mobile mode": the Companion also listens on the PC's private LAN address so a phone on the same
 * Wi-Fi can open the web UI. Off by default; every LAN request must carry a random access key
 * (first via ?key=, then an HttpOnly SameSite=Strict cookie) and come from a private address.
 */

export const LAN_COOKIE = 'irtc_key';

export function newLanKey(): string {
  return randomBytes(18).toString('base64url');
}

function v4(addr: string): string {
  return addr.startsWith('::ffff:') ? addr.slice(7) : addr;
}

export function isLoopback(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = v4(addr);
  return a === '::1' || a.startsWith('127.');
}

/** RFC 1918 / link-local IPv4 and unique-local / link-local IPv6. */
export function isPrivateAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  const a = v4(addr).toLowerCase();
  const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(a);
  if (m) {
    const [x, y] = [Number(m[1]), Number(m[2])];
    return x === 10 || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 169 && y === 254);
  }
  return /^f[cd][0-9a-f]{2}:/.test(a) || a.startsWith('fe80:');
}

/** Private IPv4 addresses of this PC (Wi-Fi / Ethernet), excluding loopback and link-local. */
export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      if (isPrivateAddress(n.address) && !n.address.startsWith('169.254.')) out.push(n.address);
    }
  }
  return [...new Set(out)];
}

export function keyMatches(given: string | null | undefined, key: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
