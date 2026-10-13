import pLimit from "p-limit";
import { type Address, type Hex, decodeAbiParameters, getAddress, isAddressEqual, parseAbi, size, slice, zeroAddress } from "viem";
import { CHAINS, addressUrl, type ChainConfig } from "../chains";
import { errorMessage } from "../http";
import type { ApiKeys } from "../keys";
import { client } from "../providers/rpc";
import type { Controller, Finding, Status } from "../types";
import type { ChainState, CheckContext } from "./context";
import { DELEGATION_PREFIX, scanChains } from "./evm";
import { safeOwnerSignatures } from "./safe";
import { checkSnapshot } from "./snapshot";

const MAX_CONTROLLERS = 20;
// EIP-1967 admin slot: whoever holds it can replace the contract's code.
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const SENTINEL = "0x0000000000000000000000000000000000000001";

const isRealContract = (code?: Hex) => Boolean(code && code !== "0x" && !code.startsWith(DELEGATION_PREFIX));

/** A contract on any chain means this address has no private key at all (EIP-7702 accounts still do). */
export const isContractAccount = (states: Map<number, ChainState>) => [...states.values()].some((s) => isRealContract(s.code));

interface ControllerRef {
  address?: Address;
  label: string;
  passkey?: boolean;
  /** How it controls the account, when not obvious (e.g. "proxy admin"). */
  role?: string;
}

type Identity =
  | { kind: "safe"; label: string; owners: Address[]; threshold: number; modules: Address[] }
  | { kind: "account"; label: string; controllers: ControllerRef[] }
  | { kind: "unknown"; label: string };

const ABI = parseAbi([
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
  "function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)",
  "function nextOwnerIndex() view returns (uint256)",
  "function ownerAtIndex(uint256 index) view returns (bytes)",
  "function rootValidator() view returns (bytes21)",
  "function getDefaultValidator() view returns (address)",
  "function ecdsaValidatorStorage(address account) view returns (address owner)",
  "function owner() view returns (address)",
  "function entryPoint() view returns (address)",
]);

/** Works out who can act for the contract on one chain, by probing well-known account layouts. */
async function identify(chain: ChainConfig, address: Address, keys: ApiKeys): Promise<Identity> {
  const c = client(chain, keys.alchemy);
  const read = <T,>(functionName: string, args: unknown[] = [], at: Address = address) =>
    c.readContract({ address: at, abi: ABI, functionName, args } as never) as Promise<T>;
  const attempt = <T,>(p: Promise<T>) => p.then((v) => v, () => undefined);

  // Safe multisig
  const owners = await attempt(read<readonly Address[]>("getOwners"));
  if (owners?.length) {
    const [threshold, modules] = await Promise.all([
      read<bigint>("getThreshold"),
      attempt(read<readonly [readonly Address[], Address]>("getModulesPaginated", [SENTINEL, 10n])),
    ]);
    return { kind: "safe", label: "Safe multisig", owners: [...owners], threshold: Number(threshold), modules: [...(modules?.[0] ?? [])] };
  }

  // Coinbase Smart Wallet: owners are ABI-encoded addresses (32 bytes) or passkey coordinates (64 bytes).
  const next = await attempt(read<bigint>("nextOwnerIndex"));
  if (next !== undefined) {
    const raw = await Promise.all(Array.from({ length: Math.min(Number(next), MAX_CONTROLLERS) }, (_, i) => attempt(read<Hex>("ownerAtIndex", [BigInt(i)]))));
    const controllers = raw.flatMap((b): ControllerRef[] => {
      if (!b || b === "0x") return []; // removed owner
      if (size(b) === 32) {
        const [a] = decodeAbiParameters([{ type: "address" }], b);
        return [{ address: a, label: a }];
      }
      return [{ label: `Passkey ${slice(b, 0, 6)}…`, passkey: true }];
    });
    return { kind: "account", label: "Coinbase Smart Wallet", controllers };
  }

  // Kernel (ZeroDev): the owner lives in the ECDSA validator, keyed by account.
  const root = await attempt(read<Hex>("rootValidator"));
  const validator = root ? (`0x${root.slice(4)}` as Address) : await attempt(read<Address>("getDefaultValidator"));
  if (validator && !isAddressEqual(validator, zeroAddress)) {
    const owner = await attempt(read<Address>("ecdsaValidatorStorage", [address], validator));
    return owner && !isAddressEqual(owner, zeroAddress)
      ? { kind: "account", label: "Kernel smart account", controllers: [{ address: owner, label: owner }] }
      : { kind: "unknown", label: "Kernel smart account with a non-ECDSA validator (e.g. passkey)" };
  }

  // Generic: Ownable owner (SimpleAccount, LightAccount, most admin-controlled contracts) and EIP-1967 proxy admin.
  const [owner, adminWord, entryPoint] = await Promise.all([
    attempt(read<Address>("owner")),
    attempt(c.getStorageAt({ address, slot: ADMIN_SLOT })),
    attempt(read<Address>("entryPoint")),
  ]);
  const admin = adminWord && BigInt(adminWord) !== 0n ? getAddress(`0x${adminWord.slice(-40)}`) : undefined;
  const controllers: ControllerRef[] = [
    ...(owner && !isAddressEqual(owner, zeroAddress) ? [{ address: owner, label: owner, role: "owner()" }] : []),
    ...(admin ? [{ address: admin, label: admin, role: "proxy admin" }] : []),
  ];
  const label = entryPoint ? "ERC-4337 smart account" : "Smart contract";
  return controllers.length ? { kind: "account", label, controllers } : { kind: "unknown", label };
}

type SafeSigs = Map<string, { publicKey: Hex; url: string }>;

/** Lighter version of the full check, enough to tell whether a controller's key is exposed. */
async function probe(address: Address, keys: ApiKeys, sigs: SafeSigs): Promise<Controller> {
  const base = { address, label: address, url: `/check?address=${address}` };
  const found: Finding[] = [];
  const sub: CheckContext = { address, keys, emit: (f) => found.push(f) };
  try {
    const [states] = await Promise.all([scanChains(sub), checkSnapshot(sub)]);
    if (isContractAccount(states)) {
      return { ...base, kind: "contract", status: "info", reason: "A contract (e.g. a nested Safe), controlled by its own keys. Check it separately." };
    }
    const sig = sigs.get(address.toLowerCase());
    if (sig) return { ...base, kind: "eoa", status: "exposed", reason: "Signed a confirmation for this Safe, and the key was recovered from it" };
    const delegated = found.find((f) => f.vector === "eip7702" && f.status === "exposed");
    if (delegated) return { ...base, kind: "eoa", status: "exposed", reason: delegated.title };
    const txs = found.filter((f) => f.vector === "tx" && f.status === "exposed");
    if (txs.length) return { ...base, kind: "eoa", status: "exposed", reason: `${txs[0].title}${txs.length > 1 ? ` (+${txs.length - 1} more chains)` : ""}` };
    const snap = found.find((f) => f.vector === "snapshot");
    if (snap?.status === "exposed") return { ...base, kind: "eoa", status: "exposed", reason: "Signed Snapshot votes, and the key was recovered" };
    if (snap?.status === "likely") return { ...base, kind: "eoa", status: "likely", reason: "Signed Snapshot votes" };
    const failed = found.filter((f) => f.vector === "tx" && f.status === "error").length;
    if (states.size === 0 && failed > 0) return { ...base, kind: "eoa", status: "error", reason: "RPC checks failed" };
    return { ...base, kind: "eoa", status: "clear", reason: failed ? `No exposure found (${failed} chains failed)` : "No exposure found" };
  } catch (e) {
    return { ...base, kind: "eoa", status: "error", reason: errorMessage(e) };
  }
}

/**
 * With `threshold` signatures needed, the account is at risk once that many controllers are exposed.
 * Controllers that can't be fully checked (nested contracts, failed checks) might push it over.
 */
export function aggregate(controllers: Controller[], threshold: number): Status {
  const count = (...s: Status[]) => controllers.filter((c) => s.includes(c.status)).length;
  const exposed = count("exposed");
  if (exposed >= threshold) return "exposed";
  if (exposed + count("likely", "info") >= threshold) return "likely";
  if (exposed + count("likely", "info", "error") >= threshold) return "error";
  return "clear";
}

/** Vector C for contracts: who controls this account, and are their keys exposed? */
export async function checkContract(ctx: CheckContext, states: Map<number, ChainState>) {
  const chains = CHAINS.filter((c) => isRealContract(states.get(c.id)?.code));

  // Same Safe/account deployed on several chains usually has the same setup; group identical ones.
  const groups = new Map<string, { identity: Identity; chains: ChainConfig[] }>();
  await Promise.all(
    chains.map(async (chain) => {
      try {
        const identity = await identify(chain, ctx.address, ctx.keys);
        const key = JSON.stringify(identity, (_, v) => (typeof v === "string" ? v.toLowerCase() : v));
        const g = groups.get(key) ?? { identity, chains: [] };
        g.chains.push(chain);
        groups.set(key, g);
      } catch (e) {
        ctx.emit({ id: `control:${chain.id}`, vector: "control", status: "error", chainId: chain.id, chainName: chain.name, title: `Couldn't read who controls this contract on ${chain.name}`, detail: errorMessage(e) });
      }
    }),
  );

  // Owners' own Safe confirmations reveal their keys even if they never sent a transaction.
  const sigs: SafeSigs = new Map();
  await Promise.all(
    [...groups.values()]
      .filter((g) => g.identity.kind === "safe")
      .flatMap((g) => g.chains)
      .map((chain) =>
        safeOwnerSignatures(chain, ctx.address, ctx.keys.safe)
          .then((m) => m.forEach((v, k) => sigs.set(k, v)))
          .catch(() => {}),
      ),
  );

  const limit = pLimit(3);
  const probes = new Map<string, Promise<Controller>>();
  const probeOnce = (a: Address) => {
    const k = a.toLowerCase();
    if (!probes.has(k)) probes.set(k, limit(() => probe(a, ctx.keys, sigs)));
    return probes.get(k)!;
  };

  await Promise.all(
    [...groups.values()].map(async ({ identity, chains: on }) => {
      const where = on.map((c) => c.name).join(", ");
      const base = { id: `control:${on.map((c) => c.id).join("-")}`, vector: "control" as const, chainId: on.length === 1 ? on[0].id : undefined, chainName: where };

      if (identity.kind === "unknown") {
        ctx.emit({
          ...base,
          status: "info",
          title: `${identity.label} on ${where}: controller unknown`,
          detail: "No owner, admin or signer was found. The contract may be immutable (no one controls it), or it uses an unrecognized setup. If it does have owner or admin keys, check those addresses.",
        });
        return;
      }

      const list: ControllerRef[] = identity.kind === "safe" ? identity.owners.map((o) => ({ address: o, label: o })) : identity.controllers;
      const controllers = await Promise.all(
        list.slice(0, MAX_CONTROLLERS).map(async (c): Promise<Controller> => {
          if (c.passkey || !c.address) {
            return { label: c.label, kind: "passkey", status: "exposed", reason: "Passkey (P-256) public keys are stored on-chain by the wallet, so this one is always visible" };
          }
          const r = await probeOnce(c.address);
          return c.role ? { ...r, reason: `${c.role}: ${r.reason}` } : r;
        }),
      );
      const threshold = identity.kind === "safe" ? identity.threshold : 1;
      const status = aggregate(controllers, threshold);
      const exposed = controllers.filter((c) => c.status === "exposed").length;
      const modules = identity.kind === "safe" && identity.modules.length
        ? ` It also has ${identity.modules.length} module${identity.modules.length === 1 ? "" : "s"} enabled. Modules can act without owner signatures, so check who controls them too.`
        : "";
      const summary =
        identity.kind === "safe"
          ? `${exposed} of ${controllers.length} owners have exposed keys. ${threshold} signature${threshold === 1 ? " is" : "s are"} needed to act.`
          : controllers.length === 1
            ? `Controlled by a single key, which is ${exposed ? "exposed" : "not exposed"}.`
            : `${exposed} of ${controllers.length} controlling keys exposed. Any one of them can act for this account.`;
      const meaning = {
        exposed: "If ECDSA were broken, these keys alone would be enough to take control.",
        likely: "Some controllers couldn't be fully checked (nested contracts or unconfirmed signatures), and they could be enough to take control.",
        error: "Some controller checks failed, so it's unclear whether enough keys are exposed.",
        clear: exposed ? "That's not enough to take control on its own." : "None of the controlling keys has been revealed.",
      }[status as "exposed" | "likely" | "error" | "clear"];

      ctx.emit({
        ...base,
        status,
        title: `${identity.label} on ${where}`,
        detail: `${summary} ${meaning}${modules}`,
        controllers,
        threshold,
        evidence: [
          ...on.slice(0, 3).map((c) => ({ label: `Contract on ${c.name}`, url: addressUrl(c, ctx.address) })),
          ...(identity.kind === "safe" ? on.filter((c) => c.safe).slice(0, 2).map((c) => ({ label: `Open in Safe (${c.name})`, url: `https://app.safe.global/home?safe=${c.safe}:${ctx.address}` })) : []),
        ],
      });
    }),
  );
}
