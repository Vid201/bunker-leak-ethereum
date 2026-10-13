"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { type ApiKeys, KEY_INFO, keyStore } from "@/lib/keys";

export function ApiKeysButton() {
  const keys = useSyncExternalStore(keyStore.subscribe, keyStore.get, keyStore.getServer);
  const [open, setOpen] = useState(false);
  const count = KEY_INFO.filter((k) => keys[k.id]).length;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-surface-2"
      >
        API keys{count > 0 && <span className="ml-1.5 rounded bg-accent px-1 text-bg">{count}</span>}
      </button>
      {open && <KeysPanel keys={keys} onClose={() => setOpen(false)} />}
    </div>
  );
}

function KeysPanel({ keys, onClose }: { keys: ApiKeys; onClose: () => void }) {
  const [draft, setDraft] = useState<ApiKeys>(keys);

  return (
    <div className="absolute right-0 z-20 mt-2 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-4 shadow-xl">
      <h2 className="font-semibold">Optional API keys</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Everything works without keys. Adding your own free keys unlocks more checks. They&apos;re stored only in this
        browser and sent directly to the matching provider.
      </p>
      <form
        className="mt-3 flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          keyStore.set(draft);
          onClose();
        }}
      >
        {KEY_INFO.map((k) => (
          <label key={k.id} className="block">
            <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
              {k.name}
              <a href={k.url} target="_blank" rel="noreferrer" className="text-xs font-normal text-accent underline">
                get a key ↗
              </a>
            </span>
            <span className="block text-xs text-muted">{k.unlocks}</span>
            <input
              type="password"
              value={draft[k.id] ?? ""}
              onChange={(e) => setDraft({ ...draft, [k.id]: e.target.value })}
              autoComplete="off"
              spellCheck={false}
              placeholder="not set"
              className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
        ))}
        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setDraft({});
              keyStore.set({});
            }}
            className="text-xs text-muted underline hover:text-text"
          >
            Clear all
          </button>
          <button type="submit" className="rounded-md bg-text px-4 py-2 text-sm font-medium text-bg">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
