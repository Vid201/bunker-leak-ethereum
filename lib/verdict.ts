import type { Finding } from "./types";

export type Verdict =
  | "exposed"
  | "likely"
  | "none"
  | "inconclusive"
  | "contract-exposed"
  | "contract-likely"
  | "contract-clear"
  | "contract-unknown";

export function verdict(findings: Finding[]): Verdict {
  // Contracts have no key: judge them only by the keys that control them.
  if (findings.some((f) => f.vector === "contract")) {
    const control = findings.filter((f) => f.vector === "control");
    if (control.some((f) => f.status === "exposed")) return "contract-exposed";
    if (control.some((f) => f.status === "likely")) return "contract-likely";
    if (control.some((f) => f.status === "error")) return "inconclusive";
    if (control.length && control.every((f) => f.status === "clear")) return "contract-clear";
    return "contract-unknown";
  }
  if (findings.some((f) => f.status === "exposed")) return "exposed";
  if (findings.some((f) => f.status === "likely")) return "likely";
  // Optional coverage gaps alone do not invalidate successful checks.
  if (findings.some((f) =>
    f.status === "error" ||
    (f.vector === "onchain-signature" && f.status === "info")
  )) return "inconclusive";
  return findings.some((f) => f.status === "clear") ? "none" : "inconclusive";
}

export function recoveredKey(findings: Finding[]): Finding | undefined {
  // Prefer an on-chain tx as proof, then any other source.
  return findings.find((f) => f.publicKey && f.id === "proof:tx") ?? findings.find((f) => f.publicKey);
}
