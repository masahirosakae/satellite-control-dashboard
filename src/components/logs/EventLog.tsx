import { C, MONO } from "../layout/theme";

export interface DisplayLogEntry {
  id: string;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  type: string;
  msg: string;
}

export function EventLog({ entries }: { entries: DisplayLogEntry[] }) {
  const col = { INFO: C.cyan, WARN: C.amber, ERROR: C.red } as const;
  return (
    <div className="h-full overflow-y-auto" style={{ fontFamily: MONO, padding: "4px 8px" }}>
      {entries.length === 0 && (
        <div style={{ color: C.dim, fontSize: 10, padding: 8 }}>No events.</div>
      )}
      {entries.map((l) => (
        <div key={l.id} className="flex gap-2 border-b" style={{ borderColor: "#0e1728", fontSize: 10, padding: "3px 0" }}>
          <span className="shrink-0" style={{ color: C.dim }}>{l.time}</span>
          <span className="w-11 shrink-0" style={{ color: col[l.level], fontWeight: 700 }}>{l.level}</span>
          <span className="w-14 shrink-0" style={{ color: C.dim }}>{l.type}</span>
          <span style={{ color: C.text }}>{l.msg}</span>
        </div>
      ))}
    </div>
  );
}
