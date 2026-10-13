import { type Address, type Hex, hashMessage, hexToNumber, isAddressEqual, slice } from "viem";
import { CHAINS, type ChainConfig } from "../chains";
import { fetchJson } from "../http";
import { recoverVerified } from "../recover";
import type { Evidence } from "../types";
import type { CheckContext } from "./context";

const API = "https://api.safe.global/tx-service";

interface Confirmation {
  owner: string;
  signature: Hex | null;
  signatureType: "EOA" | "ETH_SIGN" | "APPROVED_HASH" | "CONTRACT_SIGNATURE";
}

interface MultisigTx {
  safeTxHash: Hex;
  confirmations?: Confirmation[];
}

// The keyless Safe API allows only a couple of requests per second, so queue them globally.
let nextSlot = 0;
async function throttle(hasKey: boolean) {
  const gap = hasKey ? 120 : 600;
  const now = Date.now();
  const wait = Math.max(0, nextSlot - now);
  nextSlot = Math.max(now, nextSlot) + gap;
  if (wait) await new Promise((r) => setTimeout(r, wait));
}

async function get<T>(chain: ChainConfig, path: string, key?: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await throttle(Boolean(key));
    try {
      return await fetchJson<T>(`${API}/${chain.safe}/api${path}`, {
        headers: key ? { authorization: `Bearer ${key}` } : undefined,
        timeoutMs: 10_000,
      });
    } catch (e) {
      if (attempt < 2 && e instanceof Error && e.message.includes("HTTP 429")) {
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}

/** Turns a Safe confirmation into (hash, signature) for ECDSA recovery. */
function recoverable(tx: MultisigTx, c: Confirmation): { hash: Hex; sig: Hex } | null {
  if (!c.signature || c.signature.length !== 132) return null;
  if (c.signatureType === "EOA") return { hash: tx.safeTxHash, sig: c.signature };
  if (c.signatureType === "ETH_SIGN") {
    // Safe encodes eth_sign signatures with v + 4.
    const v = hexToNumber(slice(c.signature, 64, 65)) - 4;
    return {
      hash: hashMessage({ raw: tx.safeTxHash }),
      sig: `${slice(c.signature, 0, 64)}${v.toString(16).padStart(2, "0")}` as Hex,
    };
  }
  return null;
}

/**
 * Recovers owners' public keys from a Safe's own confirmation history, in one request:
 * owners usually sign off-chain, so this catches keys that never sent a transaction.
 */
export async function safeOwnerSignatures(
  chain: ChainConfig,
  safe: Address,
  key?: string,
): Promise<Map<string, { publicKey: Hex; url: string }>> {
  const found = new Map<string, { publicKey: Hex; url: string }>();
  if (!chain.safe) return found;
  const r = await get<{ results: MultisigTx[] }>(chain, `/v2/safes/${safe}/multisig-transactions/?limit=100`, key);
  for (const tx of r.results ?? []) {
    for (const c of tx.confirmations ?? []) {
      const owner = c.owner.toLowerCase();
      if (found.has(owner)) continue;
      const rs = recoverable(tx, c);
      const publicKey = rs && (await recoverVerified(rs.hash, rs.sig, c.owner as Address));
      if (publicKey) {
        found.set(owner, {
          publicKey,
          url: `https://app.safe.global/transactions/tx?safe=${chain.safe}:${safe}&id=multisig_${safe}_${tx.safeTxHash}`,
        });
      }
    }
  }
  return found;
}

/**
 * Safe co-signers sign off-chain. Their confirmations (with signatures) are public
 * in the Safe Transaction Service, and the executed tx carries them on-chain too.
 */
export async function checkSafe(ctx: CheckContext) {
  const owned: { chain: ChainConfig; safe: string }[] = [];
  let failed = 0;
  await Promise.all(
    CHAINS.filter((c) => c.safe).map(async (chain) => {
      try {
        const r = await get<{ safes: string[] }>(chain, `/v1/owners/${ctx.address}/safes/`, ctx.keys.safe);
        for (const safe of r.safes ?? []) owned.push({ chain, safe });
      } catch {
        failed++;
      }
    }),
  );

  if (!owned.length) {
    ctx.emit({
      id: "safe",
      vector: "safe",
      status: failed > 0 ? "error" : "clear",
      title: failed > 0 ? "Couldn't reach the Safe API" : "Not an owner of any Safe multisig",
      detail: failed ? `Safe API unavailable for ${failed} chains.` : undefined,
    });
    return;
  }

  let publicKey: Hex | null = null;
  let proof: string | undefined;
  const evidence: Evidence[] = [];
  let signed = false;

  let confirmationFailures = 0;
  for (const { chain, safe } of owned.slice(0, 6)) {
    try {
      const r = await get<{ results: MultisigTx[] }>(chain, `/v2/safes/${safe}/multisig-transactions/?limit=20`, ctx.keys.safe);
      for (const tx of r.results ?? []) {
        const mine = tx.confirmations?.find((c) => isAddressEqual(c.owner as Hex, ctx.address));
        if (!mine || mine.signatureType === "CONTRACT_SIGNATURE") continue;
        if (mine.signatureType === "APPROVED_HASH") continue; // done via an on-chain tx; covered by the nonce check
        signed = true;
        const rs = recoverable(tx, mine);
        if (rs && !publicKey) {
          publicKey = await recoverVerified(rs.hash, rs.sig, ctx.address);
          if (publicKey) {
            proof = `Safe confirmation on ${chain.name}`;
            evidence.unshift({
              label: `Signed Safe tx ${tx.safeTxHash.slice(0, 10)}… (${chain.name})`,
              url: `https://app.safe.global/transactions/tx?safe=${chain.safe}:${safe}&id=multisig_${safe}_${tx.safeTxHash}`,
            });
          }
        }
        if (publicKey) break;
      }
    } catch {
      confirmationFailures++;
    }
    if (publicKey) break;
  }

  if (failed || confirmationFailures) {
    ctx.emit({
      id: "safe:coverage", vector: "safe", status: "error",
      title: "Safe coverage incomplete",
      detail: `${failed} chain lookups and ${confirmationFailures} confirmation lookups failed.`,
    });
  }

  for (const { chain, safe } of owned.slice(0, 5)) {
    evidence.push({ label: `Owner of Safe ${safe.slice(0, 8)}… on ${chain.name}`, url: `https://app.safe.global/home?safe=${chain.safe}:${safe}` });
  }

  ctx.emit({
    id: "safe",
    vector: "safe",
    // Anyone can deploy a Safe listing you as an owner, so ownership alone proves nothing.
    status: publicKey || signed ? "exposed" : "info",
    title: `Owner of ${owned.length} Safe multisig${owned.length === 1 ? "" : "s"}`,
    detail: publicKey
      ? "Safe confirmations are signatures stored publicly in the Safe Transaction Service and included in the executed transaction's calldata."
      : signed
        ? "This owner signed Safe transactions, and those signatures are public."
        : "No signed confirmation from this owner was found in the sampled Safes. Being listed as an owner alone leaks nothing, since anyone can create a Safe with your address in it. But any co-signature does reveal the key.",
    publicKey: publicKey ?? undefined,
    proof,
    evidence,
  });
}
