import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Finding } from "../lib/types";
const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("../lib/http", () => ({ fetchJson }));
vi.mock("../lib/chains", () => ({ CHAINS: [{ id: 1, name: "Ethereum", safe: "eth" }] }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); fetchJson.mockReset(); });
afterEach(() => vi.useRealTimers());
const address = "0x0000000000000000000000000000000000001234";

it("does not call a failed ownership lookup clean", async () => {
  const { checkSafe } = await import("../lib/checks/safe");
  fetchJson.mockRejectedValue(Error("offline"));
  const findings: Finding[] = [];
  const pending = checkSafe({ address, keys: {}, emit: f => findings.push(f) });
  await vi.runAllTimersAsync();
  await pending;
  expect(findings.map(f => f.status)).toEqual(["error"]);
});

it("reports failed confirmation lookups as incomplete", async () => {
  const { checkSafe } = await import("../lib/checks/safe");
  fetchJson.mockResolvedValueOnce({ safes: [address] }).mockRejectedValueOnce(Error("offline"));
  const findings: Finding[] = [];
  const pending = checkSafe({ address, keys: {}, emit: f => findings.push(f) });
  await vi.runAllTimersAsync();
  await pending;
  expect(findings.find(f => f.id === "safe:coverage")?.status).toBe("error");
});
