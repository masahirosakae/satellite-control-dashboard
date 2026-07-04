import type { ProviderHealth } from "../../domain/types";
import { C, MONO, fmtIso } from "../layout/theme";

const STATUS_COLOR: Record<ProviderHealth["status"], string> = {
  OK: C.green,
  DEGRADED: C.amber,
  ERROR: C.red,
  TOKEN_MISSING: C.amber,
  IDLE: C.dim,
};

export function ProviderHealthPanel({ health }: { health: ProviderHealth[] }) {
  return (
    <div className="p-2 h-full overflow-y-auto flex flex-col gap-1" style={{ fontFamily: MONO }}>
      {health.map((h) => (
        <div key={h.providerId} className="rounded border" style={{ borderColor: C.line, background: C.panel2, padding: "5px 8px" }}>
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{h.label}</span>
            <span
              className="rounded"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: "0.1em",
                padding: "1px 6px",
                color: STATUS_COLOR[h.status],
                border: "1px solid " + STATUS_COLOR[h.status],
                background: STATUS_COLOR[h.status] + "1a",
              }}
            >
              {h.status}
            </span>
          </div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>
            last ok: {fmtIso(h.lastSuccessAt)}
            {h.lastError && (
              <span style={{ color: C.red }}> · err: {h.lastError.length > 70 ? h.lastError.slice(0, 70) + "…" : h.lastError}</span>
            )}
            {h.detail && <span style={{ color: C.amber }}> · {h.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
