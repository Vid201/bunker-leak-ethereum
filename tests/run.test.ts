import { beforeEach, expect, it, vi } from "vitest";
import type { CheckContext } from "../lib/checks/context";
const mocks = vi.hoisted(() => ({ scan: vi.fn(), snapshot: vi.fn() }));
vi.mock("../lib/checks/evm", () => ({ scanChains: mocks.scan, recoverFromTxs: async () => {} }));
vi.mock("../lib/checks/snapshot", () => ({ checkSnapshot: mocks.snapshot }));
vi.mock("../lib/checks/safe", () => ({ checkSafe: async () => {} }));
vi.mock("../lib/checks/farcaster", () => ({ checkFarcaster: async () => {} }));
vi.mock("../lib/checks/onchainSignatures", () => ({ checkOnchainSignatures: async () => {} }));
import { runChecks } from "../lib/run";
const address = "0x0000000000000000000000000000000000001234";
const handlers = () => ({ onStart: vi.fn(), onFinding: vi.fn() });
// Follow-up checks start once the chain scan resolves (it decides EOA vs contract).
const tick = () => new Promise((r) => setTimeout(r));
let storage: Map<string, string>;
beforeEach(() => {
  vi.clearAllMocks();
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: vi.fn((k: string) => storage.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => storage.set(k, v)),
    removeItem: (k: string) => storage.delete(k),
    key: (i: number) => [...storage.keys()][i] ?? null,
    get length() { return storage.size; },
  });
  mocks.scan.mockResolvedValue(new Map());
  mocks.snapshot.mockImplementation(async (ctx: CheckContext) => ctx.emit({ id: "snapshot", vector: "snapshot", status: "clear", title: "No votes" }));
});

it("starts fresh checks after completion, including with identical credentials", async () => {
  await runChecks(address, { etherscan: "key" }, handlers()).done;
  await runChecks(address, { etherscan: "key" }, handlers()).done;
  expect(mocks.scan).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem).not.toHaveBeenCalled();
  expect(localStorage.setItem).not.toHaveBeenCalled();
});

it("ignores legacy result storage and leaves API-key storage untouched", async () => {
  storage.set(`bunker-leak:result:${address}|`, JSON.stringify({ checkedAt: Date.now(), findings: [] }));
  storage.set("bunker-leak:api-keys", JSON.stringify({ etherscan: "key" }));
  const before = new Map(storage);
  const h = handlers();
  await runChecks(address, {}, h).done;
  expect(mocks.scan).toHaveBeenCalledTimes(1);
  expect(h.onFinding).toHaveBeenCalled();
  expect(storage).toEqual(before);
  expect(localStorage.getItem).not.toHaveBeenCalled();
});

it("shares in-flight results and detaches unsubscribed listeners", async () => {
  let finish!: () => void;
  let context!: CheckContext;
  mocks.snapshot.mockImplementationOnce((ctx: CheckContext) => {
    context = ctx;
    ctx.emit({ id: "first", vector: "snapshot", status: "clear", title: "First" });
    return new Promise<void>(r => { finish = r; });
  });
  const first = handlers();
  const original = runChecks(address, {}, first);
  await tick();
  const second = handlers();
  const joined = runChecks(address, {}, second);
  expect(joined.done).toBe(original.done);
  expect(second.onFinding.mock.calls[0][0]).toMatchObject({ id: "first" });
  original.unsubscribe();
  context.emit({ id: "second", vector: "snapshot", status: "clear", title: "Second" });
  expect(first.onFinding).toHaveBeenCalledTimes(1);
  expect(second.onFinding).toHaveBeenCalledTimes(2);
  finish();
  await joined.done;
  expect(mocks.scan).toHaveBeenCalledTimes(1);
});

it("does not join an in-flight run using different credentials", async () => {
  let finish!: () => void;
  mocks.snapshot.mockImplementationOnce(() => new Promise<void>(r => { finish = r; }));
  const old = runChecks(address, { etherscan: "old" }, handlers());
  const fresh = runChecks(address, { etherscan: "new" }, handlers());
  expect(fresh.done).not.toBe(old.done);
  await fresh.done;
  finish();
  await old.done;
  expect(mocks.scan).toHaveBeenCalledTimes(2);
});

it("an older forced-overlap run cannot remove the newer run", async () => {
  let finishOld!: () => void;
  let finishNew!: () => void;
  mocks.snapshot.mockImplementationOnce(() => new Promise<void>(r => { finishOld = r; }))
    .mockImplementationOnce(() => new Promise<void>(r => { finishNew = r; }));
  const old = runChecks(address, {}, handlers());
  const fresh = runChecks(address, {}, handlers(), { force: true });
  await tick();
  finishOld();
  await old.done;
  expect(storage.size).toBe(0);
  const joined = runChecks(address, {}, handlers());
  expect(joined.done).toBe(fresh.done);
  finishNew();
  await fresh.done;
  expect(storage.size).toBe(0);
});
