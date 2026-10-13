"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export const checkUrl = (q: string) => `/check?address=${encodeURIComponent(q)}`;

export function AddressForm({ initial = "", size = "lg" }: { initial?: string; size?: "lg" | "sm" }) {
  const router = useRouter();
  const [input, setInput] = useState(initial);
  // Tied to the navigation itself, so it can't get stuck when the page is restored later.
  const [pending, startTransition] = useTransition();
  const pad = size === "lg" ? "py-3.5 text-base" : "py-2.5 text-sm";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    startTransition(() => router.push(checkUrl(q)));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <label htmlFor="address" className="sr-only">
        Ethereum address or ENS name
      </label>
      <input
        id="address"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="0x… or name.eth"
        spellCheck={false}
        autoComplete="off"
        className={`min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 font-mono outline-none focus:border-accent ${pad}`}
      />
      <button type="submit" disabled={pending} className={`rounded-lg bg-text px-5 font-medium text-bg disabled:opacity-60 ${pad}`}>
        {pending ? "Opening…" : "Check address"}
      </button>
    </form>
  );
}
