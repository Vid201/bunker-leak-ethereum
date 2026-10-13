import type { Address, Hex } from "viem";

/**
 * exposed  – proven: the public key was recovered, or something was seen that cannot happen without a signature.
 * likely   – strong heuristic (e.g. tokens left the address although it never sent a tx on that chain).
 * clear    – this source shows no leak.
 * info     – context worth showing (e.g. "this is a contract").
 * skipped  – check not run (missing API key, not applicable).
 * error    – provider failed; result unknown.
 */
export type Status = "exposed" | "likely" | "clear" | "info" | "skipped" | "error";

export type Vector =
  | "tx" // sent a transaction (nonce > 0)
  | "eip7702" // signed an EIP-7702 authorization
  | "contract" // address is a smart contract
  | "control" // who controls a contract account, and whether their keys are exposed
  | "onchain-signature" // permit / Permit2 / EIP-3009 / order signatures submitted by someone else
  | "snapshot"
  | "safe"
  | "farcaster";

export interface Evidence {
  label: string;
  url?: string;
}

export interface Finding {
  id: string;
  vector: Vector;
  status: Status;
  title: string;
  detail?: string;
  chainId?: number;
  chainName?: string;
  evidence?: Evidence[];
  /** Uncompressed secp256k1 public key (0x04…), only when recovered and verified against the address. */
  publicKey?: Hex;
  /** Human-readable description of where the public key was recovered from. */
  proof?: string;
  /** For "control" findings: the keys that control a contract account. */
  controllers?: Controller[];
  /** For "control" findings: how many controllers must sign to act (1 for single-owner accounts). */
  threshold?: number;
}

export interface Controller {
  /** Missing for passkeys, which have no address. */
  address?: Address;
  label: string;
  /** passkey = P-256 key stored on-chain by the account itself; no address of its own. */
  kind: "eoa" | "contract" | "passkey";
  status: Status;
  reason: string;
  /** Link to a full check of this controller, or to the evidence. */
  url?: string;
}
