// SPDX-License-Identifier: AGPL-3.0-only
import type { Category } from "../schema/scenario.js";

const SEED_PATTERN = /^ODT-([A-Za-z0-9]+)-(B|AM|A)$/;

export interface ParsedSeed {
  raw: string;
  seed: string;
  category: Category;
}

export function formatSeed(seed: string, category: Category): string {
  return `ODT-${seed}-${category}`;
}

export function parseSeed(value: string): ParsedSeed {
  const match = SEED_PATTERN.exec(value);
  const seed = match?.[1];
  const category = match?.[2];
  if (!seed || (category !== "B" && category !== "AM" && category !== "A")) {
    throw new Error(`Seed moet de vorm ODT-<SEED>-<CATEGORY> hebben, kreeg "${value}".`);
  }
  return { raw: value, seed, category };
}

/** FNV-ish mix so the same seed string always maps to the same uint32. */
export function hashSeed(text: string): number {
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return (hash ^ (hash >>> 16)) >>> 0;
}

/** Mulberry32. Same seed, same sequence. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
