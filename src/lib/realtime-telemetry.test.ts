import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRealtimeStats,
  REALTIME_LATENCY_THRESHOLD_MS,
  recordRealtimeEvent,
  resetRealtimeTelemetry,
} from "./realtime-telemetry";

vi.mock("sonner", () => ({ toast: { warning: vi.fn() } }));

function payload(createdAtMs: number, table = "orders") {
  return {
    table,
    eventType: "INSERT",
    new: { id: "x", created_at: new Date(createdAtMs).toISOString() },
  };
}

describe("realtime-telemetry", () => {
  beforeEach(() => resetRealtimeTelemetry());

  it("records latency from created_at to now", () => {
    const s = recordRealtimeEvent("kds", payload(Date.now() - 400));
    expect(s).not.toBeNull();
    expect(s!.latencyMs).toBeGreaterThanOrEqual(400);
    expect(s!.latencyMs).toBeLessThan(1500);
  });

  it("ignores payloads without created_at", () => {
    expect(recordRealtimeEvent("kds", { table: "orders", new: {} })).toBeNull();
  });

  it("ignores stale events (>60s old)", () => {
    expect(recordRealtimeEvent("kds", payload(Date.now() - 120_000))).toBeNull();
  });

  it("aggregates stats", () => {
    recordRealtimeEvent("kds", payload(Date.now() - 100));
    recordRealtimeEvent("kds", payload(Date.now() - 200));
    recordRealtimeEvent("kds", payload(Date.now() - 300));
    const stats = getRealtimeStats();
    expect(stats.count).toBe(3);
    expect(stats.avg).toBeGreaterThan(0);
    expect(stats.max).toBeGreaterThanOrEqual(stats.avg);
    expect(stats.threshold).toBe(REALTIME_LATENCY_THRESHOLD_MS);
  });

  it("fires alert above threshold via CustomEvent", () => {
    const spy = vi.fn();
    if (typeof window !== "undefined") {
      window.addEventListener("flux:realtime-slow", spy);
    }
    const overshoot = REALTIME_LATENCY_THRESHOLD_MS + 500;
    // Simula latência alta usando um created_at bem no passado mas <60s.
    recordRealtimeEvent("kds", payload(Date.now() - overshoot));
    if (typeof window !== "undefined") {
      expect(spy).toHaveBeenCalledTimes(1);
      window.removeEventListener("flux:realtime-slow", spy);
    }
  });
});
