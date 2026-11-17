/**
 * Deterministic Daily Edition seeding using UTC date string + Mulberry32 PRNG.
 */

const EPOCH_UTC_MS = Date.UTC(2026, 0, 1);
const MS_PER_DAY = 86_400_000;

export function getDailyEditionInfo(now: Date = new Date()): {
  dateKey: string;
  editionNumber: number;
  seed: number;
} {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const dateKey = `${year}-${month}-${day}`;

  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysSinceEpoch = Math.max(1, Math.floor((todayUtcMs - EPOCH_UTC_MS) / MS_PER_DAY) + 1);

  return {
    dateKey,
    editionNumber: daysSinceEpoch,
    seed: hashString(`PAPERWEIGHT_${dateKey}_EDITION_${daysSinceEpoch}`),
  };
}

export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return function next(): number {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
