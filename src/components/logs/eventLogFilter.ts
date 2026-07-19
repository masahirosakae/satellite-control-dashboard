/**
 * Pure filtering helpers for EventLog — no JSX, no React state. Kept
 * separate so the filtering logic is independently testable.
 */
export interface DisplayLogEntry {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  type: string;
  msg: string;
}

export function filterEvents(
  entries: DisplayLogEntry[],
  enabledLevels: ReadonlySet<DisplayLogEntry["level"]>,
  typeFilter: string
): DisplayLogEntry[] {
  return entries.filter((e) => enabledLevels.has(e.level) && (typeFilter === "ALL" || e.type === typeFilter));
}

/**
 * Returns the selected type filter, or "ALL" if the previously-selected
 * type no longer appears among availableTypes (e.g. after a mode switch or
 * the 300-entry log trim dropped every entry of that type).
 */
export function normalizeTypeFilter(selected: string, availableTypes: readonly string[]): string {
  if (selected === "ALL") return "ALL";
  return availableTypes.includes(selected) ? selected : "ALL";
}
