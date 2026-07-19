/**
 * Control Plane boundary tests. The Control Plane in v0.2.0 is DISABLED
 * only — this suite asserts that at the type level, at runtime, and via a
 * network-silence check that spans every plausible I/O global.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  CONTROL_PLANE_DISABLED,
  parseControlPlaneMode,
  type ControlPlaneCapabilities,
  type ControlPlaneStatus,
} from "../src/services/control/ControlPlane";
import { DisabledControlPlaneAdapter } from "../src/services/control/DisabledControlPlane";
import { deriveRehearsalPlaneStatus } from "../src/domain/rehearsalPlane";

describe("DisabledControlPlaneAdapter — runtime", () => {
  it("every capability field is false, status is DISABLED, capabilities are frozen", () => {
    const adapter = new DisabledControlPlaneAdapter();
    expect(adapter.capabilities.status).toBe("DISABLED");
    expect(adapter.capabilities.canTransmitCommand).toBe(false);
    expect(adapter.capabilities.canTransmitRf).toBe(false);
    expect(adapter.capabilities.canControlAntenna).toBe(false);
    expect(adapter.capabilities.canControlGroundStation).toBe(false);
    expect(adapter.capabilities.canPerformOtaUpdate).toBe(false);
    expect(Object.isFrozen(adapter.capabilities)).toBe(true);
  });

  it("attempted mutation of capabilities does not change values", () => {
    const adapter = new DisabledControlPlaneAdapter();
    try {
      // @ts-expect-error capabilities fields are readonly; attempt a runtime mutation anyway
      adapter.capabilities.canTransmitCommand = true;
    } catch {
      // frozen objects throw in strict mode — acceptable, values must still be false
    }
    expect(adapter.capabilities.canTransmitCommand).toBe(false);
    expect(adapter.capabilities.status).toBe("DISABLED");
  });

  it("getStatus() returns DISABLED", () => {
    const adapter = new DisabledControlPlaneAdapter();
    expect(adapter.getStatus()).toBe("DISABLED");
  });

  it("each control method throws Error(CONTROL_PLANE_DISABLED)", () => {
    const adapter = new DisabledControlPlaneAdapter();
    expect(() => adapter.transmitCommand()).toThrow(CONTROL_PLANE_DISABLED);
    expect(() => adapter.transmitRf()).toThrow(CONTROL_PLANE_DISABLED);
    expect(() => adapter.controlAntenna()).toThrow(CONTROL_PLANE_DISABLED);
    expect(() => adapter.controlGroundStation()).toThrow(CONTROL_PLANE_DISABLED);
    expect(() => adapter.performOtaUpdate()).toThrow(CONTROL_PLANE_DISABLED);
  });
});

describe("DisabledControlPlaneAdapter — type-level", () => {
  it("ControlPlaneCapabilities rejects a true literal on canTransmitCommand", () => {
    const bad: ControlPlaneCapabilities = {
      status: "DISABLED",
      // @ts-expect-error canTransmitCommand must be the literal type false, true is not assignable
      canTransmitCommand: true,
      canTransmitRf: false,
      canControlAntenna: false,
      canControlGroundStation: false,
      canPerformOtaUpdate: false,
    };
    expect(bad).toBeTruthy();
  });

  it("ControlPlaneStatus rejects REHEARSAL_ONLY and ENABLED", () => {
    // @ts-expect-error "REHEARSAL_ONLY" is not a member of ControlPlaneStatus
    const a: ControlPlaneStatus = "REHEARSAL_ONLY";
    // @ts-expect-error "ENABLED" is not a member of ControlPlaneStatus
    const b: ControlPlaneStatus = "ENABLED";
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
  });
});

describe("DisabledControlPlaneAdapter — network silence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("constructing, reading capabilities, getStatus(), and invoking every throwing method touches zero I/O globals", () => {
    const fetchMock = vi.fn();
    const xhrMock = vi.fn();
    const wsMock = vi.fn();
    const sendBeaconMock = vi.fn();
    const eventSourceMock = vi.fn();
    const webTransportMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("XMLHttpRequest", xhrMock);
    vi.stubGlobal("WebSocket", wsMock);
    vi.stubGlobal("navigator", { sendBeacon: sendBeaconMock });
    vi.stubGlobal("EventSource", eventSourceMock);
    if (typeof (globalThis as unknown as { WebTransport?: unknown }).WebTransport === "undefined") {
      vi.stubGlobal("WebTransport", webTransportMock);
    }

    const adapter = new DisabledControlPlaneAdapter();
    void adapter.capabilities;
    adapter.getStatus();

    for (const fn of [
      () => adapter.transmitCommand(),
      () => adapter.transmitRf(),
      () => adapter.controlAntenna(),
      () => adapter.controlGroundStation(),
      () => adapter.performOtaUpdate(),
    ]) {
      try {
        fn();
      } catch {
        // expected — every control method throws
      }
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(xhrMock).not.toHaveBeenCalled();
    expect(wsMock).not.toHaveBeenCalled();
    expect(sendBeaconMock).not.toHaveBeenCalled();
    expect(eventSourceMock).not.toHaveBeenCalled();
    expect(webTransportMock).not.toHaveBeenCalled();
  });
});

describe("parseControlPlaneMode", () => {
  it('"disabled" is accepted with no unrecognizedValue', () => {
    expect(parseControlPlaneMode("disabled")).toEqual({ status: "DISABLED", unrecognizedValue: null });
  });

  it("undefined/null/empty string resolve to DISABLED with unrecognizedValue null", () => {
    expect(parseControlPlaneMode(undefined)).toEqual({ status: "DISABLED", unrecognizedValue: null });
    expect(parseControlPlaneMode(null)).toEqual({ status: "DISABLED", unrecognizedValue: null });
    expect(parseControlPlaneMode("")).toEqual({ status: "DISABLED", unrecognizedValue: null });
  });

  it.each(["rehearsal-only", "flight", "enabled", "true", "1", "on", "DISABLED_PLUS", "control"])(
    '"%s" resolves to DISABLED with unrecognizedValue set to the original raw value',
    (raw) => {
      const result = parseControlPlaneMode(raw);
      expect(result.status).toBe("DISABLED");
      expect(result.unrecognizedValue).toBe(raw);
    }
  );

  it("whitespace/case variants of disabled are accepted", () => {
    expect(parseControlPlaneMode(" Disabled ")).toEqual({ status: "DISABLED", unrecognizedValue: null });
    expect(parseControlPlaneMode("DISABLED")).toEqual({ status: "DISABLED", unrecognizedValue: null });
    expect(parseControlPlaneMode("  disabled")).toEqual({ status: "DISABLED", unrecognizedValue: null });
  });
});

describe("deriveRehearsalPlaneStatus", () => {
  it("LIVE_READ_ONLY -> LOCAL_ONLY", () => {
    expect(deriveRehearsalPlaneStatus("LIVE_READ_ONLY")).toBe("LOCAL_ONLY");
  });

  it("REPLAY -> LOCAL_ONLY", () => {
    expect(deriveRehearsalPlaneStatus("REPLAY")).toBe("LOCAL_ONLY");
  });

  it("SIMULATED -> NOT_APPLICABLE", () => {
    expect(deriveRehearsalPlaneStatus("SIMULATED")).toBe("NOT_APPLICABLE");
  });
});
