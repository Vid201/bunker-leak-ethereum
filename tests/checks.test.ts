import { beforeEach, describe, expect, it, vi } from "vitest";
import { pad, toEventSelector } from "viem";
import type { Finding } from "../lib/types";
import type { CheckContext } from "../lib/checks/context";
import { HttpError } from "../lib/http";
import { EtherscanUnsupported } from "../lib/providers/etherscan";
import { verdict } from "../lib/verdict";

const mocks = vi.hoisted(() => ({ nonce: vi.fn(), code: vi.fn(), logs: vi.fn(), fetch: vi.fn(), txs: vi.fn() }));
vi.mock("../lib/chains", () => ({
  CHAINS: [{ id: 1, name: "Ethereum", explorer: "https://etherscan.io" }, { id: 10, name: "Optimism", explorer: "https://optimistic.etherscan.io" }],
  addressUrl: (_: unknown, a: string) => a,
  txUrl: (_: unknown, h: string) => h,
}));
vi.mock("../lib/providers/rpc", () => ({ client: () => ({ getTransactionCount: mocks.nonce, getCode: mocks.code, readContract: async () => [] }) }));
vi.mock("../lib/providers/etherscan", () => ({ logsByTopic: mocks.logs, txList: mocks.txs, EtherscanUnsupported: class extends Error {} }));
vi.mock("../lib/http", async (original) => ({ ...await original<typeof import("../lib/http")>(), fetchJson: mocks.fetch }));
import { scanChains, recoverFromTxs } from "../lib/checks/evm";
import { checkOnchainSignatures } from "../lib/checks/onchainSignatures";
import { checkFarcaster } from "../lib/checks/farcaster";

const address = "0x0000000000000000000000000000000000001234";
let findings: Finding[];
let ctx: CheckContext;
beforeEach(() => {
  vi.resetAllMocks();
  findings = [];
  ctx = { address, keys: {}, emit: f => findings.push(f) };
});

describe("nonce interpretation", () => {
  it("does not infer signatures from a contract nonce or try recovering its key", async () => {
    mocks.nonce.mockResolvedValue(1);
    mocks.code.mockResolvedValue("0x6000");
    const states = await scanChains(ctx);
    await recoverFromTxs({ ...ctx, keys: { etherscan: "key" } }, states);
    expect(findings.some(f => f.status === "exposed")).toBe(false);
    expect(mocks.txs).not.toHaveBeenCalled();
  });
  it("still detects signed EOA transactions and 7702 delegations", async () => {
    mocks.nonce.mockResolvedValue(1);
    mocks.code.mockResolvedValueOnce("0x").mockResolvedValueOnce(`0xef0100${address.slice(2)}`);
    await scanChains(ctx);
    expect(findings.filter(f => f.status === "exposed")).toHaveLength(3);
  });
});

it("treats arbitrary Approval logs as unverified information", async () => {
  mocks.logs.mockImplementation(async (_key, _chain, position) => position === 1 ? [{
    address: "0x0000000000000000000000000000000000009999",
    topics: [toEventSelector("Approval(address,address,uint256)"), pad(address)],
    transactionHash: `0x${"ab".repeat(32)}`,
  }] : []);
  await checkOnchainSignatures({ ...ctx, keys: { etherscan: "key" } }, new Map([[1, { nonce: 0, code: "0x" }]]));
  expect(findings.some(f => f.status === "exposed" || f.status === "likely")).toBe(false);
  expect(findings[0].title).toContain("Unverified");
});

it("reports partial event-scan failures", async () => {
  mocks.logs.mockImplementation(async (_key, chain) => { if (chain === 10) throw Error("offline"); return []; });
  await checkOnchainSignatures({ ...ctx, keys: { etherscan: "key" } }, new Map([[1, { nonce: 0, code: "0x" }], [10, { nonce: 0, code: "0x" }]]));
  expect(findings.at(-1)?.status).toBe("error");
});

describe("Neynar-only Farcaster checks", () => {
  it.each([undefined, "", "   "])("makes no requests without a key (%s)", async (neynar) => {
    await checkFarcaster({ ...ctx, keys: { neynar } });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(findings.map(f => f.status)).toEqual(["skipped"]);
  });
  it("reports an empty Neynar result as clear", async () => {
    mocks.fetch.mockResolvedValue({});
    await checkFarcaster({ ...ctx, keys: { neynar: "key" } });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(findings.map(f => f.status)).toEqual(["clear"]);
  });
  it.each([401, 503])("reports Neynar HTTP %s as an error", async (status) => {
    mocks.fetch.mockRejectedValue(new HttpError(status, "https://api.neynar.com"));
    await checkFarcaster({ ...ctx, keys: { neynar: "key" } });
    expect(findings.map(f => f.status)).toEqual(["error"]);
  });
  it("recovers a verification key using authenticated Neynar requests only", async () => {
    const verifiedAddress = "0x187c7b0393ebe86378128f2653d0930e33218899";
    mocks.fetch.mockResolvedValueOnce({ [verifiedAddress]: [{ fid: 3 }] }).mockResolvedValueOnce({ messages: [{ data: {
      fid: 3,
      verificationAddAddressBody: {
        address: verifiedAddress, protocol: "PROTOCOL_ETHEREUM", type: 0,
        blockHash: "0x14659d548fe5027e931e4e3fe62394a64e5b2bf5c017774c798c21302558e137",
        claimSignature: "4gvnsYaX4BRsWIEin0j5lp9O2jC3aCu/BaE32HzhEkt5XfRsFE4VUzcPwgahkHUMJMZ7FgN5Uo6zTpqnhTCB8hs=",
      },
    } }] });
    await checkFarcaster({ ...ctx, address: verifiedAddress, keys: { neynar: "key" } });
    expect(findings[0].status).toBe("exposed");
    expect(findings[0].publicKey).toMatch(/^0x04/);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    for (const [url, options] of mocks.fetch.mock.calls) {
      expect(new URL(url).hostname.endsWith(".neynar.com")).toBe(true);
      expect(options.headers["x-api-key"]).toBe("key");
    }
  });
});

describe("Etherscan plan coverage", () => {
  it.each([false, true])("marks unsupported chains skipped, including when all are unsupported (%s)", async (all) => {
    mocks.logs.mockImplementation(async (_key, chain) => {
      if (all || chain === 10) throw new EtherscanUnsupported("Not supported on this plan");
      return [];
    });
    await checkOnchainSignatures({ ...ctx, keys: { etherscan: "key" } }, new Map([[1, { nonce: 0, code: "0x" }], [10, { nonce: 0, code: "0x" }]]));
    const summary = findings.at(-1)!;
    expect(summary.status).toBe("skipped");
    expect(summary.title).toContain(`Scanned ${all ? 0 : 1} chain`);
    expect(summary.detail).toContain("Skipped");
    expect(summary.detail).toContain("Optimism");
    expect(verdict(findings)).toBe("inconclusive");
    expect(verdict([...findings, { id: "tx:1", vector: "tx", status: "clear", title: "No signed txs" }])).toBe("none");
  });

  it("keeps genuine failures as errors when another chain is unsupported", async () => {
    mocks.logs.mockImplementation(async (_key, chain) => {
      if (chain === 10) throw new EtherscanUnsupported("Not supported on this plan");
      throw Error("timed out");
    });
    await checkOnchainSignatures({ ...ctx, keys: { etherscan: "key" } }, new Map([[1, { nonce: 0, code: "0x" }], [10, { nonce: 0, code: "0x" }]]));
    const summary = findings.at(-1)!;
    expect(summary.status).toBe("error");
    expect(summary.detail).toContain("Skipped");
    expect(summary.detail).toContain("Could not scan: Ethereum: timed out");
  });
});
