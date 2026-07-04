import type { CSSProperties, ReactNode } from "react";
import { C } from "./theme";

export function Panel({
  title,
  right,
  children,
  className = "",
  style = {},
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={"flex flex-col rounded border overflow-hidden " + className}
      style={{ background: C.panel, borderColor: C.line, ...style }}
    >
      <div
        className="flex items-center justify-between shrink-0 border-b"
        style={{ borderColor: C.line, background: C.panel2, padding: "5px 10px" }}
      >
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.18em", color: C.cyan }}>{title}</span>
        {right}
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
