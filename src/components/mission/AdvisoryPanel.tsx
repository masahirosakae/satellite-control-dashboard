import type { Advisory, AdvisorySeverity } from "../../domain/advisory";
import { C, MONO } from "../layout/theme";

const SEV_COLOR: Record<AdvisorySeverity, string> = {
  CRITICAL: C.red,
  WARN: C.amber,
};

export function AdvisoryPanel({
  active,
  acked,
  onAck,
}: {
  active: Advisory[];
  acked: Advisory[];
  onAck: (id: string) => void;
}) {
  return (
    <div className="p-2 h-full overflow-y-auto flex flex-col gap-1" style={{ fontFamily: MONO }}>
      {active.length === 0 && <div style={{ color: C.dim, fontSize: 10, padding: 8 }}>No active advisories.</div>}
      {active.map((a) => (
        <div key={a.id} className="rounded border" style={{ borderColor: C.line, background: C.panel2, padding: "5px 8px" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="rounded"
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  padding: "1px 6px",
                  color: SEV_COLOR[a.severity],
                  border: "1px solid " + SEV_COLOR[a.severity],
                  background: SEV_COLOR[a.severity] + "1a",
                }}
              >
                {a.severity}
              </span>
              <span style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{a.title}</span>
            </div>
            <button
              onClick={() => onAck(a.id)}
              className="rounded shrink-0"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: "0.08em",
                padding: "2px 8px",
                background: "#0e1729",
                color: C.dim,
                border: "1px solid " + C.line,
                cursor: "pointer",
              }}
            >
              ACK
            </button>
          </div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{a.detail}</div>
        </div>
      ))}
      {acked.map((a) => (
        <div
          key={a.id}
          className="rounded border"
          style={{ borderColor: C.line, background: C.panel2, padding: "5px 8px", opacity: 0.55 }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className="rounded"
                style={{
                  fontSize: 8.5,
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  padding: "1px 6px",
                  color: C.dim,
                  border: "1px solid " + C.line,
                }}
              >
                {a.severity}
              </span>
              <span style={{ fontSize: 10, color: C.dim, fontWeight: 700 }}>{a.title}</span>
            </div>
            <span className="shrink-0" style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: "0.08em", color: C.dim }}>ACK</span>
          </div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{a.detail}</div>
        </div>
      ))}
    </div>
  );
}
