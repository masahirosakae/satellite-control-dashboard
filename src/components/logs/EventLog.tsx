import { useEffect, useMemo, useState } from "react";
import { C, MONO } from "../layout/theme";
import { filterEvents, normalizeTypeFilter, type DisplayLogEntry } from "./eventLogFilter";

export type { DisplayLogEntry };

const LEVELS: DisplayLogEntry["level"][] = ["INFO", "WARN", "ERROR"];

export function EventLog({ entries }: { entries: DisplayLogEntry[] }) {
  const col = { INFO: C.cyan, WARN: C.amber, ERROR: C.red } as const;
  const [enabledLevels, setEnabledLevels] = useState<Set<DisplayLogEntry["level"]>>(new Set(LEVELS));
  const [typeFilter, setTypeFilter] = useState("ALL");

  const types = useMemo(() => Array.from(new Set(entries.map((e) => e.type))).sort(), [entries]);

  // Reset the select to ALL when its currently-selected type vanishes
  // (mode switch, or the 300-entry trim dropping the last entry of a type).
  useEffect(() => {
    const normalized = normalizeTypeFilter(typeFilter, types);
    if (normalized !== typeFilter) setTypeFilter(normalized);
  }, [types, typeFilter]);

  const filtered = filterEvents(entries, enabledLevels, typeFilter);
  const allLevelsOff = enabledLevels.size === 0;

  const toggleLevel = (level: DisplayLogEntry["level"]) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  };

  let emptyMessage: string | null = null;
  if (entries.length === 0) emptyMessage = "No events.";
  else if (allLevelsOff) emptyMessage = "All levels hidden — enable a level filter.";
  else if (filtered.length === 0) emptyMessage = "No events match filter.";

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: MONO }}>
      <div
        className="flex items-center gap-1 flex-wrap shrink-0"
        style={{ padding: "4px 8px", borderBottom: "1px solid " + C.line }}
      >
        {LEVELS.map((level) => {
          const on = enabledLevels.has(level);
          return (
            <button
              key={level}
              onClick={() => toggleLevel(level)}
              aria-pressed={on}
              className="rounded"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: "0.08em",
                padding: "2px 7px",
                background: on ? col[level] + "22" : "#0e1729",
                color: on ? col[level] : C.dim,
                border: "1px solid " + (on ? col[level] : C.line),
                cursor: "pointer",
              }}
            >
              {level}
            </button>
          );
        })}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by event type"
          className="rounded outline-none ml-auto"
          style={{
            background: "#050a13",
            border: "1px solid " + C.line,
            color: C.text,
            fontFamily: MONO,
            fontSize: 9.5,
            padding: "2px 6px",
          }}
        >
          <option value="ALL">ALL</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto" style={{ padding: "4px 8px" }}>
        {emptyMessage && (
          <div style={{ color: C.dim, fontSize: 10, padding: 8 }}>
            {emptyMessage}
          </div>
        )}
        {filtered.map((l) => (
          <div key={l.id} className="flex gap-2 border-b" style={{ borderColor: "#0e1728", fontSize: 10, padding: "3px 0" }}>
            <span className="shrink-0" style={{ color: C.dim }}>{l.time}</span>
            <span className="w-11 shrink-0" style={{ color: col[l.level], fontWeight: 700 }}>{l.level}</span>
            <span className="w-14 shrink-0" style={{ color: C.dim }}>{l.type}</span>
            <span style={{ color: C.text }}>{l.msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
