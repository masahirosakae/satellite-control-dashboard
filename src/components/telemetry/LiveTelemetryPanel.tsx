/**
 * LIVE_READ_ONLY / REPLAY telemetry browser.
 * - Known-field cards show N/A when no real field maps to them.
 * - Generic table lists ALL decoded fields (mapped + unmapped).
 * - TOKEN_MISSING / NO_DATA / ERROR / UNAVAILABLE are shown explicitly;
 *   real data is NEVER silently replaced by simulated values.
 */
import type { TelemetrySnapshot, TelemetryField } from "../../domain/types";
import type { CardKey } from "../../domain/telemetryMapping";
import { matchKnownField } from "../../domain/telemetryMapping";
import { C, MONO, fmtIso } from "../layout/theme";
import { FreshnessChip } from "../layout/FreshnessChip";

const CARD_DEFS: { key: CardKey; label: string; unit: string }[] = [
  { key: "battV", label: "BATT VOLTAGE", unit: "V" },
  { key: "battI", label: "BATT CURRENT", unit: "A" },
  { key: "temp", label: "TEMPERATURE", unit: "°C" },
  { key: "cpu", label: "CPU LOAD", unit: "%" },
  { key: "signal", label: "SIGNAL", unit: "dBm" },
  { key: "storage", label: "STORAGE", unit: "%" },
];

function statusBanner(snap: TelemetrySnapshot): { text: string; color: string } | null {
  switch (snap.status) {
    case "TOKEN_MISSING":
      return { text: "TELEMETRY TOKEN IS NOT CONFIGURED — set SATNOGS_API_TOKEN on the server", color: C.amber };
    case "NO_DATA":
      return {
        text: "TELEMETRY UNAVAILABLE — " + (snap.error ?? "no decoded frames exist for this satellite"),
        color: C.amber,
      };
    case "ERROR":
      return { text: "TELEMETRY FETCH FAILED — " + (snap.error ?? "provider error"), color: C.red };
    case "UNAVAILABLE":
      return { text: "TELEMETRY NOT LOADED — " + (snap.error ?? "waiting for provider"), color: C.dim };
    default:
      return null;
  }
}

export function LiveTelemetryPanel({ snap }: { snap: TelemetrySnapshot }) {
  const banner = statusBanner(snap);
  const cardFields = new Map<CardKey, TelemetryField>();
  for (const f of snap.fields) {
    const rule = matchKnownField(f.key);
    if (rule && !cardFields.has(rule.cardKey) && typeof f.value === "number") {
      cardFields.set(rule.cardKey, f);
    }
  }
  const unmapped = snap.fields.filter((f) => !f.mapped);

  return (
    <div className="p-2 h-full flex flex-col gap-2 overflow-y-auto" style={{ fontFamily: MONO }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim, fontFamily: "inherit" }}>
          SRC {snap.provenance.sourceName} · OBS {fmtIso(snap.observedAt)} · DEC {snap.decoder ?? "—"}
        </span>
        <FreshnessChip status={snap.provenance.freshness} title={"fetched " + fmtIso(snap.provenance.fetchedAt)} />
      </div>

      {banner && (
        <div
          className="rounded border"
          style={{ borderColor: banner.color, color: banner.color, fontSize: 10, padding: "6px 8px", background: banner.color + "12" }}
        >
          {banner.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1">
        {CARD_DEFS.map((cd) => {
          const f = cardFields.get(cd.key);
          return (
            <div key={cd.key} className="rounded border" style={{ borderColor: C.line, background: C.panel2, padding: "4px 8px" }}>
              <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim }}>{cd.label}</div>
              <div style={{ fontSize: 17, color: f ? C.text : C.dim, fontWeight: 700, lineHeight: 1.3 }}>
                {f ? String(f.value) : "N/A"}
                <span style={{ fontSize: 9, marginLeft: 4, color: C.dim }}>{f ? cd.unit : ""}</span>
              </div>
              {f && <div style={{ fontSize: 8, color: C.dim }}>{f.key}</div>}
            </div>
          );
        })}
      </div>

      {snap.fields.length > 0 && (
        <div className="rounded border" style={{ borderColor: C.line, background: "#070d18" }}>
          <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim, padding: "4px 8px", borderBottom: "1px solid " + C.line }}>
            DECODED FIELDS ({snap.fields.length}) — {unmapped.length} UNMAPPED
          </div>
          <table className="w-full" style={{ fontSize: 10 }}>
            <tbody>
              {snap.fields.map((f) => (
                <tr key={f.key} style={{ borderTop: "1px solid #0e1728" }}>
                  <td style={{ padding: "2px 8px", color: C.dim, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{f.key}</td>
                  <td style={{ padding: "2px 8px", color: C.text, textAlign: "right" }}>{String(f.value)}</td>
                  <td style={{ padding: "2px 4px", color: C.dim, width: 34 }}>{f.unit ?? ""}</td>
                  <td style={{ padding: "2px 8px", width: 60 }}>
                    <span style={{ fontSize: 8, color: f.mapped ? C.green : C.amber }}>{f.mapped ? "MAPPED" : "RAW"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {snap.rawFrame && (
        <div className="rounded border" style={{ borderColor: C.line, background: "#070d18", padding: "4px 8px" }}>
          <div style={{ fontSize: 8.5, letterSpacing: "0.14em", color: C.dim }}>RAW FRAME (HEX)</div>
          <div style={{ fontSize: 9, color: C.cyan, wordBreak: "break-all" }}>
            {snap.rawFrame.length > 160 ? snap.rawFrame.slice(0, 160) + "…" : snap.rawFrame}
          </div>
        </div>
      )}
    </div>
  );
}
