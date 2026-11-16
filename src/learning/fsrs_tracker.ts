// SPDX-License-Identifier: AGPL-3.0-only
import { createEmptyCard, fsrs, Rating, State, TypeConvert, type Card } from "ts-fsrs";

/** Rules the generator can focus on. Keyed in storage, not derived from a scenario id. */
export const TRACKED_RULE_IDS = [
  "RVV-15.1",
  "RVV-15.2a",
  "RVV-15.2b",
  "RVV-18.1",
  "RVV-18.2",
  "RVV-54",
  "RVV-SIGNS-B1-B7",
] as const;

export type TrackedRuleId = (typeof TRACKED_RULE_IDS)[number];

const TRACKED = new Set<string>(TRACKED_RULE_IDS);
const STORAGE_KEY = "odt.fsrs.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RuleMastery {
  ruleId: TrackedRuleId;
  due: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  misses: number;
  state: "New" | "Learning" | "Review" | "Relearning";
  retrievability: number;
}

export interface FsrsTracker {
  recordAttempt(ruleIds: readonly string[], isCorrect: boolean): void;
  getRuleMastery(): RuleMastery[];
  getNextFocusRule(): TrackedRuleId;
}

interface StoredCard {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  misses: number;
  state: number;
  last_review: number | null;
}

interface MemoryCard {
  card: Card;
  misses: number;
}

export function createMemoryStorage(): StorageLike {
  const items = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return items.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      items.set(key, value);
    },
    removeItem(key: string): void {
      items.delete(key);
    },
  };
}

function browserOrMemoryStorage(): StorageLike {
  const storage = (globalThis as { localStorage?: StorageLike }).localStorage;
  if (storage) {
    return storage;
  }
  return createMemoryStorage();
}

function stateName(state: State): RuleMastery["state"] {
  if (state === State.Learning) {
    return "Learning";
  }
  if (state === State.Review) {
    return "Review";
  }
  if (state === State.Relearning) {
    return "Relearning";
  }
  return "New";
}

function fromCard(memory: MemoryCard): StoredCard {
  const card = memory.card;
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    misses: memory.misses,
    state: card.state,
    last_review: card.last_review ? card.last_review.getTime() : null,
  };
}

function toMemory(stored: StoredCard): MemoryCard {
  return {
    misses: stored.misses ?? 0,
    card: TypeConvert.card({
      due: new Date(stored.due),
      stability: stored.stability,
      difficulty: stored.difficulty,
      elapsed_days: stored.elapsed_days,
      scheduled_days: stored.scheduled_days,
      reps: stored.reps,
      lapses: stored.lapses,
      state: stored.state,
      last_review: stored.last_review === null ? null : new Date(stored.last_review),
    }),
  };
}

function emptyMemory(stamp: Date): MemoryCard {
  return { card: createEmptyCard(stamp), misses: 0 };
}

export function createFsrsTracker(options?: {
  storage?: StorageLike;
  now?: () => Date;
  storageKey?: string;
}): FsrsTracker {
  const storage = options?.storage ?? browserOrMemoryStorage();
  const now = options?.now ?? ((): Date => new Date());
  const storageKey = options?.storageKey ?? STORAGE_KEY;
  const scheduler = fsrs({ enable_fuzz: false, enable_short_term: true });

  function read(): Map<TrackedRuleId, MemoryCard> {
    const cards = new Map<TrackedRuleId, MemoryCard>();
    let stored: Partial<Record<TrackedRuleId, StoredCard>> = {};
    const raw = storage.getItem(storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { cards?: Partial<Record<TrackedRuleId, StoredCard>> };
        stored = parsed.cards ?? {};
      } catch {
        stored = {};
      }
    }
    const stamp = now();
    let missing = false;
    for (const ruleId of TRACKED_RULE_IDS) {
      const item = stored[ruleId];
      if (!item) {
        cards.set(ruleId, emptyMemory(stamp));
        missing = true;
        continue;
      }
      cards.set(ruleId, toMemory(item));
    }
    if (missing) {
      write(cards);
    }
    return cards;
  }

  function write(cards: ReadonlyMap<TrackedRuleId, MemoryCard>): void {
    const payload: Partial<Record<TrackedRuleId, StoredCard>> = {};
    for (const ruleId of TRACKED_RULE_IDS) {
      const memory = cards.get(ruleId);
      if (memory) {
        payload[ruleId] = fromCard(memory);
      }
    }
    storage.setItem(storageKey, JSON.stringify({ cards: payload }));
  }

  function masteryOf(cards: ReadonlyMap<TrackedRuleId, MemoryCard>, stamp: Date): RuleMastery[] {
    return TRACKED_RULE_IDS.map((ruleId) => {
      const memory = cards.get(ruleId) ?? emptyMemory(stamp);
      const card = memory.card;
      let retrievability = 0;
      if (card.reps > 0) {
        const raw = scheduler.get_retrievability(card, stamp, false);
        const value = typeof raw === "number" ? raw : Number(raw);
        retrievability = Number.isFinite(value) ? value : 0;
      }
      return {
        ruleId,
        due: card.due.getTime(),
        stability: card.stability,
        difficulty: card.difficulty,
        reps: card.reps,
        lapses: card.lapses,
        misses: memory.misses,
        state: stateName(card.state),
        retrievability,
      };
    });
  }

  function phase(card: Card, stamp: Date): number {
    if (card.state === State.Learning || card.state === State.Relearning) {
      return 0;
    }
    if (card.state === State.New) {
      return 1;
    }
    return card.due.getTime() <= stamp.getTime() ? 0 : 2;
  }

  return {
    recordAttempt(ruleIds: readonly string[], isCorrect: boolean): void {
      const cards = read();
      const stamp = now();
      const grade = isCorrect ? Rating.Good : Rating.Again;
      let changed = false;
      for (const ruleId of ruleIds) {
        if (!TRACKED.has(ruleId)) {
          continue;
        }
        const tracked = ruleId as TrackedRuleId;
        const card = cards.get(tracked);
        if (!card) {
          continue;
        }
        cards.set(tracked, {
          card: scheduler.next(card.card, stamp, grade).card,
          misses: card.misses + (isCorrect ? 0 : 1),
        });
        changed = true;
      }
      if (changed) {
        write(cards);
      }
    },
    getRuleMastery(): RuleMastery[] {
      return masteryOf(read(), now());
    },
    getNextFocusRule(): TrackedRuleId {
      const stamp = now();
      const cards = read();
      const ranked = TRACKED_RULE_IDS.map((ruleId) => {
        const memory = cards.get(ruleId) ?? emptyMemory(stamp);
        return { ruleId, memory };
      }).sort((left, right) => {
        const leftPhase = phase(left.memory.card, stamp);
        const rightPhase = phase(right.memory.card, stamp);
        if (leftPhase !== rightPhase) {
          return leftPhase - rightPhase;
        }
        if (right.memory.misses !== left.memory.misses) {
          return right.memory.misses - left.memory.misses;
        }
        if (left.memory.card.due.getTime() !== right.memory.card.due.getTime()) {
          return left.memory.card.due.getTime() - right.memory.card.due.getTime();
        }
        return left.ruleId < right.ruleId ? -1 : 1;
      });
      return ranked[0]?.ruleId ?? "RVV-15.1";
    },
  };
}
