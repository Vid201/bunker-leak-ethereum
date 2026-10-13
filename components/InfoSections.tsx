export function CoverageSections() {
  return (
    <section className="grid gap-6 sm:grid-cols-2">
      <div>
        <h2 className="text-lg font-semibold">What gets checked</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>Signed transactions on Ethereum and 19 L2s and alt-L1s. Your address is the same on all of them. The actual public key is recovered when possible.</li>
          <li>EIP-7702 delegations, where you signed an authorization even if someone else paid the gas.</li>
          <li>Signatures others submitted for you on chains where you never sent a tx: EIP-2612 permits, Permit2, EIP-3009 (USDC, x402), CoW, UniswapX, Seaport orders and delegateBySig.</li>
          <li>Public off-chain signatures: Snapshot votes, Safe co-signer confirmations and Farcaster address verifications.</li>
        </ul>
      </div>
      <div>
        <h2 className="text-lg font-semibold">Coverage limitations</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
          <li>Messages you signed privately for a dapp, such as Sign-In with Ethereum or off-chain orders. Whoever received them could recover your key.</li>
          <li>An xpub you shared with portfolio, tax or wallet apps. It reveals every key derived from it.</li>
          <li>Chains outside this scan’s coverage, including non-EVM chains where the same private key might be reused (Tron, Cosmos eth_secp256k1 chains).</li>
          <li>Signatures as the owner of an ERC-4337 smart account, if those aren&apos;t indexed above.</li>
        </ul>
      </div>
    </section>
  );
}

export function MigrationTips() {
  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">If you want to migrate</h2>
      <p className="mt-1 text-sm text-muted">
        This is optional preparation, not an emergency. No break of ECDSA has been demonstrated. If you decide to move funds:
      </p>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed">
        <li>Create a brand-new address and keep it quiet: no approvals, logins or votes with it.</li>
        <li>Send funds to it from the old address. Receiving funds doesn&apos;t reveal the new key.</li>
        <li>Spending from the new address later reveals its key, so move whatever remains to another fresh address at that point.</li>
        <li>Take your time and double-check addresses. A rushed migration is a bigger risk than waiting a week.</li>
      </ol>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="mt-12 border-t border-border pt-6 text-xs text-muted">
      Read-only and frontend-only: lookups go directly to public APIs. Check results are not saved in your browser.
    </footer>
  );
}
