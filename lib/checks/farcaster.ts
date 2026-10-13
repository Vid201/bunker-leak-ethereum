import type { Hex, TypedDataDefinition } from "viem";
import { toHex } from "viem";
import { errorMessage, fetchJson } from "../http";
import { publicKeyFromTypedData } from "../recover";
import type { Evidence } from "../types";
import type { CheckContext } from "./context";

const HUB = "https://snapchain-api.neynar.com/v1";

export function farcasterClaimTypedData(fid: bigint, address: Hex, blockHash: Hex, network = 1): TypedDataDefinition {
  return {
    domain: {
      name: "Farcaster Verify Ethereum Address",
      version: "2.0.0",
      salt: "0xf2d857f4a3edcb9b78b4d503bfe733db1e3f6cdc2b7971ee739626c97e86a558",
    },
    types: {
      VerificationClaim: [
        { name: "fid", type: "uint256" },
        { name: "address", type: "address" },
        { name: "blockHash", type: "bytes32" },
        { name: "network", type: "uint8" },
      ],
    },
    primaryType: "VerificationClaim",
    message: { fid, address, blockHash, network },
  };
}

interface VerificationMsg {
  data: {
    fid: number;
    verificationAddAddressBody: { address: string; claimSignature: string; blockHash: string; type: number; protocol: string };
  };
}

const b64hex = (s: string) => (s.startsWith("0x") ? (s as Hex) : toHex(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));

async function fidsByAddress(address: string, key?: string): Promise<number[]> {
  if (!key) return [];
  const r = await fetchJson<Record<string, { fid: number }[]>>(
    `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${address}`,
    { headers: { "x-api-key": key } },
  );
  return Object.values(r).flat().map((u) => u.fid);
}

/**
 * Farcaster: a "verified address" is a public EIP-712 claim signed by the address.
 * A custody address signs key additions and transfers.
 */
export async function checkFarcaster(ctx: CheckContext) {
  const addr = ctx.address.toLowerCase();
  const evidence: Evidence[] = [];
  const neynarKey = ctx.keys.neynar?.trim();
  if (!neynarKey) {
    ctx.emit({
      id: "farcaster",
      vector: "farcaster",
      status: "skipped",
      title: "Farcaster check skipped",
      detail: "Add a Neynar API key to check Farcaster accounts and verification signatures.",
    });
    return;
  }
  try {
    const fids = await fidsByAddress(addr, neynarKey);
    let publicKey: Hex | null = null;
    let proofFid: number | undefined;
    for (const fid of fids.slice(0, 3)) {
      const r = await fetchJson<{ messages: VerificationMsg[] }>(`${HUB}/verificationsByFid?fid=${fid}&address=${addr}&pageSize=100`, { headers: { "x-api-key": neynarKey } });
      const m = r.messages.find(
        (m) => m.data.verificationAddAddressBody?.protocol === "PROTOCOL_ETHEREUM" && m.data.verificationAddAddressBody.address.toLowerCase() === addr,
      );
      if (!m) continue;
      const b = m.data.verificationAddAddressBody;
      if (b.type !== 0) continue; // 1 = contract (ERC-1271) verification
      const typed = farcasterClaimTypedData(BigInt(fid), addr as Hex, b64hex(b.blockHash));
      publicKey = await publicKeyFromTypedData(typed, b64hex(b.claimSignature), ctx.address);
      if (publicKey) {
        proofFid = fid;
        break;
      }
    }
    for (const fid of new Set(fids)) {
      evidence.push({ label: `Farcaster account fid ${fid}`, url: `https://farcaster.xyz/~/profiles/${fid}` });
    }

    if (publicKey) {
      ctx.emit({
        id: "farcaster",
        vector: "farcaster",
        status: "exposed",
        title: `Verified address on Farcaster (fid ${proofFid})`,
        detail: "Verifying an address on Farcaster publishes a signed claim, and anyone can recover the public key from it.",
        publicKey,
        proof: `Farcaster verification claim (fid ${proofFid})`,
        evidence,
      });
    } else if (fids.length) {
      ctx.emit({
        id: "farcaster",
        vector: "farcaster",
        status: "likely",
        title: "Linked to a Farcaster account",
        detail: "Neynar links this address to a Farcaster account as a custody or verified address. No public key was recovered from the sampled verification claims.",
        evidence,
      });
    } else {
      ctx.emit({
        id: "farcaster",
        vector: "farcaster",
        status: "clear",
        title: "Not linked to Farcaster",
      });
    }
  } catch (e) {
    ctx.emit({ id: "farcaster", vector: "farcaster", status: "error", title: "Farcaster check failed", detail: errorMessage(e) });
  }
}
