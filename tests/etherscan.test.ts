import { afterEach, beforeEach, expect, it, vi } from "vitest";
const fetchJson = vi.hoisted(() => vi.fn());
vi.mock("../lib/http", () => ({ fetchJson }));
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); fetchJson.mockReset(); });
afterEach(() => vi.useRealTimers());

it("reads subsequent pages instead of silently stopping at the first", async () => {
  const { logsByTopic } = await import("../lib/providers/etherscan");
  fetchJson.mockResolvedValueOnce({ result: [{ transactionHash: "first" }, { transactionHash: "second" }] })
    .mockResolvedValueOnce({ result: [{ transactionHash: "later-signature" }] });
  const pending = logsByTopic("key", 1, 1, "topic", 2);
  await vi.runAllTimersAsync();
  expect((await pending).map(l => l.transactionHash)).toEqual(["first", "second", "later-signature"]);
  expect(new URL(fetchJson.mock.calls[1][0]).searchParams.get("page")).toBe("2");
});

it("reports pagination caps as incomplete", async () => {
  const { logsByTopic } = await import("../lib/providers/etherscan");
  fetchJson.mockResolvedValue({ result: [{ transactionHash: "x" }] });
  const assertion = expect(logsByTopic("key", 1, 1, "topic", 1)).rejects.toThrow("incomplete");
  await vi.runAllTimersAsync();
  await assertion;
  expect(fetchJson).toHaveBeenCalledTimes(20);
});

it("propagates failures from a later page", async () => {
  const { logsByTopic } = await import("../lib/providers/etherscan");
  fetchJson.mockResolvedValueOnce({ result: [{}] }).mockRejectedValueOnce(Error("offline"));
  const assertion = expect(logsByTopic("key", 1, 1, "topic", 1)).rejects.toThrow("offline");
  await vi.runAllTimersAsync();
  await assertion;
});


it.each([
  ["Free API access is not supported for this chain. Please upgrade your api plan.", true],
  ["Chain temporarily unavailable", false],
  ["Invalid API Key", false],
])("classifies provider rejection: %s", async (message, unsupported) => {
  const { logsByTopic, EtherscanUnsupported } = await import("../lib/providers/etherscan");
  fetchJson.mockResolvedValue({ status: "0", message: "NOTOK", result: message });
  const result = logsByTopic("key", 1, 1, "topic").catch(error => error);
  await vi.runAllTimersAsync();
  const error = await result;
  expect(error).toBeInstanceOf(Error);
  expect(error instanceof EtherscanUnsupported).toBe(unsupported);
});
