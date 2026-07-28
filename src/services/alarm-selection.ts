/**
 * Pure selection helpers for the alarm table. Selection lives alongside a list
 * that refreshes on a timer and via SSE, so ids that disappear must be pruned
 * to avoid deleting rows the user can no longer see.
 */

export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(id)) next.add(id);
  return next;
}

export function areAllSelected(selected: ReadonlySet<string>, visibleIds: readonly string[]): boolean {
  return visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
}

export function toggleAllSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[]
): Set<string> {
  const next = new Set(selected);

  if (areAllSelected(selected, visibleIds)) {
    for (const id of visibleIds) next.delete(id);
  } else {
    for (const id of visibleIds) next.add(id);
  }

  return next;
}

export function pruneSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[]
): Set<string> {
  const visible = new Set(visibleIds);
  return new Set([...selected].filter((id) => visible.has(id)));
}
