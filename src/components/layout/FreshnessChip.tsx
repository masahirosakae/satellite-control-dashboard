import type { FreshnessStatus } from "../../domain/types";
import { FRESHNESS_COLOR, MONO } from "./theme";

export function FreshnessChip({ status, title }: { status: FreshnessStatus; title?: string }) {
  const col = FRESHNESS_COLOR[status];
  return (
    <span
      title={title}
      className="rounded"
      style={{
        fontSize: 8.5,
        fontWeight: 800,
        letterSpacing: "0.12em",
        fontFamily: MONO,
        padding: "1px 6px",
        color: col,
        background: col + "1a",
        border: "1px solid " + col,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}
