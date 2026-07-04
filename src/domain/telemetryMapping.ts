/**
 * Known Field Mapping Layer.
 *
 * Real decoded telemetry field names differ per satellite and per decoder
 * (SatNOGS/Kaitai decoders emit arbitrary keys). We therefore never assume
 * fixed keys; instead we map recognizable patterns onto dashboard "cards"
 * and pass everything else through as unmapped generic fields.
 */
import type { TelemetryField } from "./types";

export type CardKey = "battV" | "battI" | "temp" | "cpu" | "signal" | "storage";

interface KnownFieldRule {
  cardKey: CardKey;
  match: RegExp;
  label: string;
  unit: string;
}

export const KNOWN_FIELD_RULES: KnownFieldRule[] = [
  { cardKey: "battV", match: /(^|[_.])v_?bat|bat(t(ery)?)?[_.]?v(olt(age)?)?([_.]|$)/i, label: "BATT VOLTAGE", unit: "V" },
  { cardKey: "battI", match: /(^|[_.])i_?bat|bat(t(ery)?)?[_.]?(i|curr(ent)?)([_.]|$)/i, label: "BATT CURRENT", unit: "A" },
  { cardKey: "temp", match: /temp(erature)?/i, label: "TEMPERATURE", unit: "°C" },
  { cardKey: "cpu", match: /cpu|obc[_.]?load/i, label: "CPU LOAD", unit: "%" },
  { cardKey: "signal", match: /rssi|sig(nal)?[_.]?(strength|level|dbm)?$/i, label: "SIGNAL", unit: "dBm" },
  { cardKey: "storage", match: /storage|memory[_.]?(used|usage)|flash/i, label: "STORAGE", unit: "%" },
];

export function matchKnownField(key: string): KnownFieldRule | null {
  for (const rule of KNOWN_FIELD_RULES) {
    if (rule.match.test(key)) return rule;
  }
  return null;
}

function coerceValue(v: unknown): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export interface MappedTelemetry {
  fields: TelemetryField[];
  /** best (first) match per card; a card without a match must render N/A */
  cards: Partial<Record<CardKey, TelemetryField>>;
}

export function mapTelemetryFields(decoded: Record<string, unknown> | null | undefined): MappedTelemetry {
  const fields: TelemetryField[] = [];
  const cards: Partial<Record<CardKey, TelemetryField>> = {};
  if (!decoded) return { fields, cards };

  for (const [key, raw] of Object.entries(decoded)) {
    const rule = matchKnownField(key);
    const field: TelemetryField = {
      key,
      label: rule ? rule.label : key,
      value: coerceValue(raw),
      unit: rule ? rule.unit : null,
      mapped: rule !== null,
    };
    fields.push(field);
    if (rule && !(rule.cardKey in cards) && typeof field.value === "number") {
      cards[rule.cardKey] = field;
    }
  }
  return { fields, cards };
}
