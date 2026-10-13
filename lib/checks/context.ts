import type { Address, Hex } from "viem";
import type { ApiKeys } from "../keys";
import type { Finding } from "../types";

export interface ChainState {
  nonce: number;
  code: Hex | undefined;
}

export interface CheckContext {
  address: Address;
  emit: (f: Finding) => void;
  keys: ApiKeys;
}
