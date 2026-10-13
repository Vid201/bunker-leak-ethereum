import type { Hex } from "viem";

/**
 * exposed  – proven: we recovered the public key, or saw something that cannot happen without a signature.
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
}
