import { describe, it, expect } from "vitest";
import { mapTelemetryFields, matchKnownField } from "../src/domain/telemetryMapping";

describe("mapTelemetryFields", () => {
  it("maps vbat to BATT VOLTAGE", () => {
    const { fields, cards } = mapTelemetryFields({ vbat: 7.9 });
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe("vbat");
    expect(fields[0].label).toBe("BATT VOLTAGE");
    expect(fields[0].unit).toBe("V");
    expect(fields[0].mapped).toBe(true);
    expect(fields[0].value).toBe(7.9);
    expect(cards.battV?.key).toBe("vbat");
  });

  it("maps temp_obc to TEMPERATURE", () => {
    const { fields } = mapTelemetryFields({ temp_obc: 12 });
    expect(fields[0].label).toBe("TEMPERATURE");
    expect(fields[0].mapped).toBe(true);
    expect(fields[0].unit).toBe("°C");
  });

  it("leaves an unknown key unmapped but preserved", () => {
    const { fields } = mapTelemetryFields({ some_unknown_field: 42 });
    expect(fields).toHaveLength(1);
    expect(fields[0].key).toBe("some_unknown_field");
    expect(fields[0].label).toBe("some_unknown_field");
    expect(fields[0].mapped).toBe(false);
    expect(fields[0].value).toBe(42);
  });

  it("stringifies object values", () => {
    const { fields } = mapTelemetryFields({ payload: { a: 1 } });
    expect(fields[0].value).toBe(JSON.stringify({ a: 1 }));
    expect(typeof fields[0].value).toBe("string");
  });

  it("returns empty fields for null input", () => {
    const result = mapTelemetryFields(null);
    expect(result.fields).toEqual([]);
    expect(result.cards).toEqual({});
  });

  it("returns empty fields for undefined input", () => {
    const result = mapTelemetryFields(undefined);
    expect(result.fields).toEqual([]);
    expect(result.cards).toEqual({});
  });
});

describe("matchKnownField", () => {
  it("matches known keys and returns null for unknown keys", () => {
    expect(matchKnownField("vbat")).not.toBeNull();
    expect(matchKnownField("totally_unknown_xyz")).toBeNull();
  });
});
