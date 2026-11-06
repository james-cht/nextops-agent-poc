import { describe, expect, it } from "vitest";
import { buildAgentPocHealth } from "./agent-poc-health";

describe("buildAgentPocHealth", () => {
  it("returns health status with ok true, service name, and ISO checkedAt timestamp", () => {
    const customDate = new Date("2026-01-01T00:00:00.000Z");
    const health = buildAgentPocHealth(customDate);

    expect(health.ok).toBe(true);
    expect(health.service).toBe("agent-poc");
    expect(health.checkedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("defaults to current date when no argument is provided", () => {
    const health = buildAgentPocHealth();

    expect(health.ok).toBe(true);
    expect(health.service).toBe("agent-poc");
    expect(typeof health.checkedAt).toBe("string");
    expect(new Date(health.checkedAt).toISOString()).toBe(health.checkedAt);
  });
});
