export const PAGE_GAP = "gap" as const;

export type PageSlot = number | typeof PAGE_GAP;

/**
 * Builds a compact page list: first and last page are always reachable, with a
 * window around the current page and gaps standing in for the skipped ranges.
 */
export function getPageSlots(page: number, totalPages: number, windowSize = 1): PageSlot[] {
  if (totalPages < 1) return [];

  const current = Math.min(Math.max(page, 1), totalPages);
  const shown = new Set<number>([1, totalPages]);

  for (let offset = -windowSize; offset <= windowSize; offset += 1) {
    const candidate = current + offset;
    if (candidate >= 1 && candidate <= totalPages) shown.add(candidate);
  }

  const slots: PageSlot[] = [];
  let previous = 0;

  for (const value of [...shown].sort((a, b) => a - b)) {
    if (previous && value - previous > 1) slots.push(PAGE_GAP);
    slots.push(value);
    previous = value;
  }

  return slots;
}

/** Human range of the rows shown on the current page, e.g. 31–60 of 307. */
export function getPageRange(
  page: number,
  limit: number,
  rowsOnPage: number,
  total: number
): { from: number; to: number; total: number } {
  if (rowsOnPage === 0 || total === 0) return { from: 0, to: 0, total };

  const from = (page - 1) * limit + 1;
  return { from, to: from + rowsOnPage - 1, total };
}
