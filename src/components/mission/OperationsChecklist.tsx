import type { ChecklistItem, ChecklistStatus } from "../../domain/opsChecklist";
import { C, MONO } from "../layout/theme";

const STATUS_COLOR: Record<ChecklistStatus, string> = {
  PASS: C.green,
  WARN: C.amber,
  FAIL: C.red,
  CHECKING: C.cyan,
  PENDING: C.dim,
  CONFIG_REQUIRED: C.amber,
  INFO: C.cyan,
  N_A: C.dim,
};

function statusLabel(status: ChecklistStatus): string {
  if (status === "N_A") return "N/A";
  return status.replace(/_/g, " ");
}

export function OperationsChecklist({ items }: { items: ChecklistItem[] }) {
  return (
    <div className="p-2 h-full overflow-y-auto flex flex-col gap-1" style={{ fontFamily: MONO }}>
      {items.map((it) => (
        <div key={it.id} className="rounded border" style={{ borderColor: C.line, background: C.panel2, padding: "5px 8px" }}>
          <div className="flex items-center justify-between gap-2">
            <span style={{ fontSize: 10, color: C.text, fontWeight: 700 }}>{it.label}</span>
            <span
              className="rounded"
              style={{
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: "0.1em",
                padding: "1px 6px",
                color: STATUS_COLOR[it.status],
                border: "1px solid " + STATUS_COLOR[it.status],
                background: STATUS_COLOR[it.status] + "1a",
              }}
            >
              {statusLabel(it.status)}
            </span>
          </div>
          <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>{it.detail}</div>
        </div>
      ))}
    </div>
  );
}
