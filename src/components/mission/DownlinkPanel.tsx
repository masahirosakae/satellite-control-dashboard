/** SIMULATED mode: virtual file downlink progress (unchanged MVP feature). */
import { C, MONO } from "../layout/theme";
import type { SimFile } from "../../services/simulator/Simulator";

export function DownlinkPanel({ files }: { files: SimFile[] }) {
  const sc = { QUEUED: C.dim, ACTIVE: C.cyan, COMPLETE: C.green } as const;
  return (
    <div className="p-2 h-full flex flex-col gap-1 overflow-y-auto" style={{ fontFamily: MONO }}>
      {files.map((f) => {
        const pct = (f.done / f.sizeKB) * 100;
        return (
          <div key={f.id} className="rounded border" style={{ borderColor: C.line, background: C.panel2, padding: "4px 8px" }}>
            <div className="flex justify-between" style={{ fontSize: 10 }}>
              <span style={{ color: C.text }}>
                <span style={{ color: C.cyan }}>{f.id}</span> {f.name}
              </span>
              <span style={{ color: sc[f.status], fontWeight: 700 }}>{f.status}</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 overflow-hidden" style={{ height: 5, borderRadius: 99, background: "#050a13" }}>
                <div
                  style={{
                    height: "100%",
                    borderRadius: 99,
                    width: pct + "%",
                    background: f.status === "COMPLETE" ? C.green : C.cyan,
                    transition: "width 0.25s linear",
                  }}
                />
              </div>
              <span className="w-24 text-right" style={{ fontSize: 9, color: C.dim }}>
                {Math.round(f.done)}/{f.sizeKB} KB
              </span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 9, color: C.dim, marginTop: 2 }}>
        Send START_DOWNLINK with a FILE ID during a pass to begin transfer. (VIRTUAL)
      </div>
    </div>
  );
}
