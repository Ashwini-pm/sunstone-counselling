// Shape of the question bank. Content itself lives in the database and is
// supplied by the Sunstone team — nothing is hardcoded here on purpose.

/** A row from the `questions` bank. */
export interface Question {
  id: string
  bank: string
  positionGroup: string
  sortOrder: number
  content: string
  /** S3 URL of the Hinglish avatar video. Null until generated. */
  avatarUrl: string | null
  durationSec: number
}

/** One question as drawn into a specific attempt, in its frozen position. */
export interface AttemptQuestion {
  questionId: string
  position: number
  content: string
  /** Signed playback URL, minted per request. Null if not yet generated. */
  avatarUrl: string | null
  durationSec: number
}

/** Fisher-Yates. Unbiased, unlike `sort(() => Math.random() - 0.5)`. */
export function shuffle<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Pick one at random. */
export function pickOne<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * Draw one question per position_group, ordered by each group's sort_order.
 *
 * Grouping is what lets two leads get different questions in the same slot:
 * group "motivation" might hold six variants, and each lead is asked one of
 * them. A bank with one question per group degrades gracefully to a fixed set.
 */
export function drawQuestions(pool: Question[]): Question[] {
  const groups = new Map<string, Question[]>()
  for (const q of pool) {
    const existing = groups.get(q.positionGroup)
    if (existing) existing.push(q)
    else groups.set(q.positionGroup, [q])
  }

  return [...groups.entries()]
    .map(([, variants]) => pickOne(variants))
    .sort((a, b) =>
      a.sortOrder !== b.sortOrder
        ? a.sortOrder - b.sortOrder
        : a.positionGroup.localeCompare(b.positionGroup),
    )
}
