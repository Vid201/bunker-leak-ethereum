import { Suspense } from "react";
import { AddressForm } from "@/components/AddressForm";
import { CoverageSections, Footer, MigrationTips } from "@/components/InfoSections";
import { SiteHeader } from "@/components/SiteHeader";
import { DRAKE_TWEET_URL, TweetCard, TweetFallback } from "@/components/TweetCard";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:py-8">
      <SiteHeader />

      <section className="mt-10 sm:mt-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Has your Ethereum public key been revealed?</h1>
        <p className="mt-3 text-muted">
          Paste an address or ENS name to search Ethereum, L2s, alt-L1s and public signature databases for any
          place its public key became visible.
        </p>
        <div className="mt-6">
          <AddressForm />
        </div>
      </section>

      <section className="mt-12 grid gap-3 text-[15px] leading-relaxed sm:grid-cols-3">
        <Point n="1" title="Your address hides your key">
          An Ethereum address is just a hash of your public key. Until you sign something, the key itself stays private.
        </Point>
        <Point n="2" title="Signing reveals it">
          Every transaction, permit, vote or signed message publishes a signature, and the public key can be recovered from it. This applies on any chain.
        </Point>
        <Point n="3" title="Bunker mode">
          If ECDSA were ever broken (by AI or quantum), only revealed keys could be attacked. Justin Drake suggests calmly preparing by moving funds to fresh addresses.
        </Point>
      </section>

      <section className="mt-8">
        <Suspense fallback={<TweetFallback />}>
          <TweetCard />
        </Suspense>
        <p className="mt-2 text-sm text-muted">
          Coverage:{" "}
          <a className="underline" href="https://cryptoslate.com/openais-math-breakthrough-raises-fears-ai-could-break-bitcoin-and-ethereum-security-within-months/" target="_blank" rel="noreferrer">
            CryptoSlate
          </a>
          {" · "}
          <a className="underline" href="https://www.cointribune.com/en/ethereum-researcher-calls-for-crypto-bunker-mode" target="_blank" rel="noreferrer">
            Cointribune
          </a>
          {" · "}
          <a className="underline" href={DRAKE_TWEET_URL} target="_blank" rel="noreferrer">
            Original post
          </a>
        </p>
      </section>

      <div className="mt-12">
        <CoverageSections />
      </div>
      <div className="mt-12">
        <MigrationTips />
      </div>
      <Footer />
    </main>
  );
}

function Point({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="font-mono text-xs text-muted">{n}</div>
      <div className="mt-1 font-medium">{title}</div>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </div>
  );
}
