"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { CHAINS } from "@/lib/chains";
import { type ApiKeys, keysFingerprint, keyStore } from "@/lib/keys";
import { resolveTarget, runChecks } from "@/lib/run";
import type { Controller, Finding, Status } from "@/lib/types";
import { recoveredKey, verdict } from "@/lib/verdict";

interface Meta {
  address: string;
  ensName?: string;
  /** Unix ms when the current check started. */
  checkedAt: number;
  chains: { id: number; name: string }[];
}

const CHAIN_LIST = CHAINS.map((c) => ({ id: c.id, name: c.name }));
type Phase = "idle" | "loading" | "done" | "error";

const RANK: Record<Status, number> = { exposed: 0, likely: 1, info: 2, error: 3, skipped: 4, clear: 5 };

/**
 * A new address or credential set remounts the run, clearing all prior results
 * and unsubscribing its callbacks before starting fresh.
 */
export function CheckResults({ query }: { query: string }) {
  const keys = useSyncExternalStore(keyStore.subscribe, keyStore.get, keyStore.getServer);
  return <CheckRun key={`${query}:${keysFingerprint(keys)}`} query={query} keys={keys} />;
}

function CheckRun({ query, keys }: { query: string; keys: ApiKeys }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Bumped to re-run; `refresh` starts a new run even if one is in flight.
  const [run, setRun] = useState({ id: 0, refresh: false });

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};
    resolveTarget(query)
      .then((target) => {
        if (cancelled) return;
        const handle = runChecks(
          target.address,
          keys,
          {
            onStart: ({ checkedAt }) => !cancelled && setMeta({ ...target, checkedAt, chains: CHAIN_LIST }),
            onFinding: (f) => !cancelled && setFindings((fs) => [...fs.filter((x) => x.id !== f.id), f]),
          },
          { force: run.refresh },
        );
        unsubscribe = handle.unsubscribe;
        return handle.done;
      })
      .then(() => !cancelled && setPhase("done"))
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message.split("\n")[0] : String(e));
        setPhase("error");
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [query, keys, run]);

  const recheck = () => {
    setPhase("loading");
    setMeta(null);
    setFindings([]);
    setError(null);
    setRun((r) => ({ id: r.id + 1, refresh: true }));
  };

  if (error) return <p className="rounded-lg bg-exposed-bg px-4 py-3 text-sm text-exposed">{error}</p>;
  if (!meta) return <ResultsSkeleton />;
  return <Results meta={meta} findings={findings} loading={phase === "loading"} onRefresh={recheck} />;
}

export function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      <div className="h-[86px] animate-pulse rounded-xl border border-border bg-surface" />
      <div className="rounded-xl border border-border bg-surface-2 p-5 text-muted">Resolving address…</div>
    </div>
  );
}

function Results({ meta, findings, loading, onRefresh }: { meta: Meta; findings: Finding[]; loading: boolean; onRefresh: () => void }) {
  const v = verdict(findings);
  const key = recoveredKey(findings);
  const listed = findings
    .filter((f) => !(f.vector === "tx" && f.id.startsWith("tx:")))
    .sort((a, b) => RANK[a.status] - RANK[b.status]);

  return (
    <div className="flex flex-col gap-5">
      <AddressHeader meta={meta} loading={loading} onRefresh={onRefresh} />
      <VerdictBanner verdict={v} loading={loading} />
      {key?.publicKey && <PublicKeyBox finding={key} />}
      <ChainGrid meta={meta} findings={findings} loading={loading} />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted">Findings</h3>
        {listed.map((f) => (
          <FindingCard key={f.id} f={f} />
        ))}
        {loading && <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted">Still checking…</div>}
      </div>
    </div>
  );
}

function AddressHeader({ meta, loading, onRefresh }: { meta: Meta; loading: boolean; onRefresh: () => void }) {
  const checked = new Date(meta.checkedAt);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {meta.ensName && <span className="font-medium">{meta.ensName}</span>}
        <span className="break-all font-mono text-sm">{meta.address}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <a href={`https://etherscan.io/address/${meta.address}`} target="_blank" rel="noreferrer" className="text-accent underline">
          View on Etherscan ↗
        </a>
        <span title={checked.toISOString()}>
          Checked {checked.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </span>
        {!loading && (
          <button onClick={onRefresh} className="underline hover:text-text">
            Re-check now
          </button>
        )}
      </div>
    </div>
  );
}

const VERDICT = {
  inconclusive: {
    title: "Check incomplete",
    body: "Some checks failed or returned unverified events, or no checks completed successfully. The available results cannot establish whether this address’s public key is hidden. Review the findings below and retry failed checks.",
    cls: "bg-surface-2 text-muted border-border",
  },
  exposed: {
    title: "Public key is visible",
    body: "This address has revealed its public key somewhere public. Nothing is wrong today, since ECDSA is still secure. If you'd like to be ready for bunker mode, you can migrate funds to a fresh address at your own pace.",
    cls: "bg-exposed-bg text-exposed border-exposed/30",
  },
  likely: {
    title: "Public key is probably visible",
    body: "There are strong signs that this address signed something public, but public-key recovery did not succeed. If you're planning a migration, it's reasonable to include this address.",
    cls: "bg-likely-bg text-likely border-likely/30",
  },
  "contract-exposed": {
    title: "Controlling keys are exposed",
    body: "This is a smart contract, so it has no public key of its own. But enough of the keys that control it have revealed their public keys that, if ECDSA were broken, someone could take control. To prepare, you can rotate those owners to fresh addresses at your own pace.",
    cls: "bg-exposed-bg text-exposed border-exposed/30",
  },
  "contract-likely": {
    title: "Controlling keys may be exposed",
    body: "This is a smart contract with no public key of its own. Some of its controllers couldn't be fully checked (nested contracts or unconfirmed signatures), and they might be enough to take control. Check the controllers below.",
    cls: "bg-likely-bg text-likely border-likely/30",
  },
  "contract-clear": {
    title: "Not enough controlling keys exposed",
    body: "This is a smart contract with no public key of its own. Not enough of the keys that control it have revealed their public keys to take control. Owners who sign later will reveal theirs, so this can change.",
    cls: "bg-clear-bg text-clear border-clear/30",
  },
  "contract-unknown": {
    title: "Smart contract: controllers unknown",
    body: "This is a smart contract, so it has no public key of its own. No owner, admin or signer was found. It may be immutable, or use an unrecognized setup. If it has controlling keys, check those addresses instead.",
    cls: "bg-surface-2 text-muted border-border",
  },
  none: {
    title: "No leak found",
    body: "None of the checked sources reveal this address's public key. A few places can't be checked from public data (see below), so keep that in mind.",
    cls: "bg-clear-bg text-clear border-clear/30",
  },
} as const;

function VerdictBanner({ verdict: v, loading }: { verdict: keyof typeof VERDICT; loading: boolean }) {
  const d = VERDICT[v];
  if (loading && (v === "none" || v === "inconclusive" || v === "contract-unknown")) {
    return <div className="rounded-xl border border-border bg-surface-2 p-5 text-muted">Scanning chains and signature databases…</div>;
  }
  return (
    <div className={`rounded-xl border p-5 ${d.cls}`}>
      <div className="text-xl font-semibold">{d.title}</div>
      <p className="mt-1 text-sm leading-relaxed opacity-90">{d.body}</p>
    </div>
  );
}

function PublicKeyBox({ finding }: { finding: Finding }) {
  const [copied, setCopied] = useState(false);
  const pub = finding.publicKey!;
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium uppercase tracking-wide text-muted">Recovered public key</h3>
        <button
          onClick={() => {
            navigator.clipboard.writeText(pub).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-2"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className="mt-2 block break-all font-mono text-xs leading-relaxed">{pub}</code>
      <p className="mt-2 text-xs text-muted">
        Recovered from{" "}
        {finding.evidence?.[0]?.url ? (
          <a href={finding.evidence[0].url} target="_blank" rel="noreferrer" className="underline">
            {finding.proof}
          </a>
        ) : (
          finding.proof
        )}
        . Hashing this key gives exactly this address.
      </p>
    </div>
  );
}

const DOT: Record<Status | "pending", string> = {
  exposed: "bg-exposed",
  likely: "bg-likely",
  clear: "bg-clear",
  info: "bg-info",
  error: "bg-muted",
  skipped: "bg-muted",
  pending: "bg-border animate-pulse",
};

function ChainGrid({ meta, findings, loading }: { meta: Meta; findings: Finding[]; loading: boolean }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
        Signed transactions per chain <span className="normal-case tracking-normal">(same address on every EVM chain)</span>
      </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {meta.chains.map((c) => {
          const fs = findings.filter((f) => f.chainId === c.id);
          const tx = fs.find((f) => f.id === `tx:${c.id}`);
          const worst = fs.sort((a, b) => RANK[a.status] - RANK[b.status])[0];
          const status: Status | "pending" = worst?.status ?? (loading ? "pending" : "error");
          const label = tx ? (tx.status === "exposed" ? tx.title.split(" on ")[0] : tx.status === "error" ? "RPC failed" : tx.status === "info" ? "contract account" : "no signed txs") : "…";
          const link = tx?.evidence?.[0]?.url;
          const inner = (
            <>
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[status]}`} />
                <span className="truncate text-sm font-medium">{c.name}</span>
              </div>
              <div className="mt-0.5 truncate pl-4 text-xs text-muted">
                {label}
                {fs.some((f) => f.vector === "eip7702") && " · 7702"}
                {fs.some((f) => f.vector === "onchain-signature" && f.status !== "clear") && " · signatures"}
              </div>
            </>
          );
          return link ? (
            <a key={c.id} href={link} target="_blank" rel="noreferrer" className="rounded-lg border border-border bg-surface px-3 py-2 hover:border-muted">
              {inner}
            </a>
          ) : (
            <div key={c.id} className="rounded-lg border border-border bg-surface px-3 py-2">
              {inner}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BADGE: Record<Status, string> = {
  exposed: "bg-exposed-bg text-exposed",
  likely: "bg-likely-bg text-likely",
  clear: "bg-clear-bg text-clear",
  info: "bg-info-bg text-info",
  error: "bg-surface-2 text-muted",
  skipped: "bg-surface-2 text-muted",
};

const VECTOR_LABEL: Record<Finding["vector"], string> = {
  tx: "Transaction",
  eip7702: "EIP-7702",
  contract: "Contract",
  control: "Who controls it",
  "onchain-signature": "On-chain signature",
  snapshot: "Snapshot",
  safe: "Safe multisig",
  farcaster: "Farcaster",
};

function FindingCard({ f }: { f: Finding }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${BADGE[f.status]}`}>{f.status}</span>
        <span className="text-xs text-muted">{VECTOR_LABEL[f.vector]}</span>
      </div>
      <div className="mt-1 font-medium">{f.title}</div>
      {f.detail && <p className="mt-1 text-sm leading-relaxed text-muted">{f.detail}</p>}
      {f.controllers && f.controllers.length > 0 && <ControllerList controllers={f.controllers} threshold={f.threshold} />}
      {f.evidence && f.evidence.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {f.evidence.map((e, i) => (
            <li key={i}>
              {e.url?.startsWith("/") ? (
                <Link href={e.url} scroll={false} className="text-accent underline">
                  {e.label}
                </Link>
              ) : e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer" className="text-accent underline">
                  {e.label} ↗
                </a>
              ) : (
                e.label
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const KIND_LABEL: Record<Controller["kind"], string> = { eoa: "Key", contract: "Contract", passkey: "Passkey" };

function ControllerList({ controllers, threshold }: { controllers: Controller[]; threshold?: number }) {
  return (
    <div className="mt-3">
      {threshold !== undefined && controllers.length > 1 && (
        <div className="mb-1.5 text-xs text-muted">
          {threshold === 1 ? `Any 1 of ${controllers.length} can act` : `Needs ${threshold} of ${controllers.length} to act`}
        </div>
      )}
      <ul className="divide-y divide-border rounded-md border border-border">
        {controllers.map((c, i) => (
          <li key={c.address ?? `${c.label}-${i}`} className="flex items-start gap-2.5 px-3 py-2">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[c.status]}`} title={c.status} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[11px] uppercase tracking-wide text-muted">{KIND_LABEL[c.kind]}</span>
                {c.url?.startsWith("/") ? (
                  <Link href={c.url} className="break-all font-mono text-xs text-accent underline">
                    {c.label}
                  </Link>
                ) : (
                  <span className="break-all font-mono text-xs">{c.label}</span>
                )}
              </div>
              <div className="text-xs text-muted">{c.reason}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
