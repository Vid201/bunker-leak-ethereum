import {
  type Address,
  type Hex,
  type Transaction,
  type TransactionSerializable,
  type TypedDataDefinition,
  hashTypedData,
  isAddressEqual,
  keccak256,
  recoverPublicKey,
  serializeTransaction,
} from "viem";
import { publicKeyToAddress } from "viem/accounts";

type Sig = { r: Hex; s: Hex; yParity: number };

/** Rebuilds the exact payload the sender signed and returns it together with the signature. */
export function signingPayload(tx: Transaction): { hash: Hex; signature: Sig } | null {
  const common = {
    nonce: tx.nonce,
    gas: tx.gas,
    to: tx.to ?? undefined,
    value: tx.value,
    data: tx.input,
  };
  let unsigned: TransactionSerializable;
  let yParity: number;

  switch (tx.type) {
    case "legacy": {
      const v = BigInt(tx.v);
      if (v === 27n || v === 28n) {
        // Pre-EIP-155: no chain id in the signing payload.
        unsigned = { ...common, type: "legacy", gasPrice: tx.gasPrice };
        yParity = Number(v - 27n);
      } else if (v >= 35n) {
        const chainId = Number((v - 35n) / 2n);
        unsigned = { ...common, type: "legacy", gasPrice: tx.gasPrice, chainId };
        yParity = Number((v - 35n) % 2n);
      } else return null;
      break;
    }
    case "eip2930":
      unsigned = { ...common, type: "eip2930", chainId: tx.chainId, gasPrice: tx.gasPrice, accessList: tx.accessList };
      yParity = tx.yParity;
      break;
    case "eip1559":
      unsigned = {
        ...common,
        type: "eip1559",
        chainId: tx.chainId,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        accessList: tx.accessList,
      };
      yParity = tx.yParity;
      break;
    case "eip4844":
      unsigned = {
        ...common,
        type: "eip4844",
        to: tx.to!,
        chainId: tx.chainId,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        maxFeePerBlobGas: tx.maxFeePerBlobGas,
        blobVersionedHashes: tx.blobVersionedHashes,
        accessList: tx.accessList,
      };
      yParity = tx.yParity;
      break;
    case "eip7702":
      unsigned = {
        ...common,
        type: "eip7702",
        chainId: tx.chainId,
        maxFeePerGas: tx.maxFeePerGas,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
        accessList: tx.accessList,
        authorizationList: tx.authorizationList,
      };
      yParity = tx.yParity;
      break;
    default:
      // Deposit txs (OP 0x7e), zkSync EIP-712 (0x71), Arbitrum system txs… have no plain ECDSA signature.
      return null;
  }
  if (yParity !== 0 && yParity !== 1) return null;
  return { hash: keccak256(serializeTransaction(unsigned)), signature: { r: tx.r, s: tx.s, yParity } };
}

/** Recovers a public key and only returns it if it really belongs to `expected`. */
export async function recoverVerified(
  hash: Hex,
  signature: Hex | Sig,
  expected: Address,
): Promise<Hex | null> {
  try {
    const pub = await recoverPublicKey({ hash, signature });
    return isAddressEqual(publicKeyToAddress(pub), expected) ? pub : null;
  } catch {
    return null;
  }
}

export async function publicKeyFromTx(tx: Transaction, expected: Address): Promise<Hex | null> {
  const p = signingPayload(tx);
  return p ? recoverVerified(p.hash, p.signature, expected) : null;
}

export async function publicKeyFromTypedData(
  typed: TypedDataDefinition,
  signature: Hex,
  expected: Address,
): Promise<Hex | null> {
  try {
    return await recoverVerified(hashTypedData(typed), signature, expected);
  } catch {
    return null;
  }
}

/** Compressed form (33 bytes) is handy to display next to the full key. */
export function compressPublicKey(pub: Hex): Hex {
  const x = pub.slice(4, 68);
  const yLastByte = parseInt(pub.slice(-2), 16);
  return `0x${yLastByte % 2 === 0 ? "02" : "03"}${x}`;
}
