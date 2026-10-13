import { describe, expect, it } from "vitest";
import { formatTransaction, getAddress, toHex, type RpcTransaction } from "viem";
import { publicKeyToAddress } from "viem/accounts";
import txs from "./fixtures/txs.json";
import vote from "./fixtures/snapshot-vote.json";
import { compressPublicKey, publicKeyFromTx, publicKeyFromTypedData } from "../lib/recover";
import { snapshotTypedData } from "../lib/checks/snapshot";
import { farcasterClaimTypedData } from "../lib/checks/farcaster";

describe("publicKeyFromTx", () => {
  for (const [kind, raw] of Object.entries(txs as unknown as Record<string, RpcTransaction>)) {
    it(`recovers the sender key from a ${kind} tx`, async () => {
      const tx = formatTransaction(raw);
      const pub = await publicKeyFromTx(tx, getAddress(tx.from));
      expect(pub).toMatch(/^0x04[0-9a-f]{128}$/);
      expect(publicKeyToAddress(pub!)).toBe(getAddress(tx.from));
    });
  }

  it("returns null when the key does not belong to the expected address", async () => {
    const tx = formatTransaction(txs.eip1559 as unknown as RpcTransaction);
    expect(await publicKeyFromTx(tx, "0x0000000000000000000000000000000000000001")).toBeNull();
  });
});

describe("off-chain signatures", () => {
  it("recovers a key from a Snapshot vote envelope", async () => {
    const pub = await publicKeyFromTypedData(snapshotTypedData(vote.data), vote.sig as `0x${string}`, getAddress(vote.address));
    expect(pub).not.toBeNull();
  });

  it("recovers a key from a Farcaster verification claim", async () => {
    const address = "0x187c7b0393ebe86378128f2653d0930e33218899";
    const sig = toHex(Buffer.from("4gvnsYaX4BRsWIEin0j5lp9O2jC3aCu/BaE32HzhEkt5XfRsFE4VUzcPwgahkHUMJMZ7FgN5Uo6zTpqnhTCB8hs=", "base64"));
    const typed = farcasterClaimTypedData(3n, address, "0x14659d548fe5027e931e4e3fe62394a64e5b2bf5c017774c798c21302558e137");
    expect(await publicKeyFromTypedData(typed, sig, getAddress(address))).not.toBeNull();
  });
});

it("compresses public keys", async () => {
  const tx = formatTransaction(txs.eip1559 as unknown as RpcTransaction);
  const pub = (await publicKeyFromTx(tx, getAddress(tx.from)))!;
  expect(compressPublicKey(pub)).toMatch(/^0x0[23][0-9a-f]{64}$/);
});
