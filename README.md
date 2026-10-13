# Bunker Leak

**Has your Ethereum public key leaked?** Enter an address or ENS name. The site checks public data for any place
the address revealed its secp256k1 public key, and recovers the key as proof when it can.

Context: Justin Drake's ["bunker mode" post](https://x.com/drakefjustin/status/2107837081313505768) (Oct 7, 2026)
suggests moving funds to addresses whose public key is still hidden behind a hash, in case ECDSA gets broken
(by AI-driven math or by quantum computers).

## What it checks

| Vector | Source | Proof |
| --- | --- | --- |
| Signed txs on 20 EVM chains (Ethereum, L2s, alt-L1s) | `eth_getTransactionCount` over RPC | Key recovered from a sample tx (Blockscout/Etherscan) |
| EIP-7702 delegation | `eth_getCode` = `0xef0100…` | Signed authorization |
| Signatures submitted by others (on chains with nonce 0) | Etherscan V2 `getLogs` by topic: Approval/permit, Permit2, EIP-3009, CoW, UniswapX, Seaport, delegateBySig, outgoing Transfer | Unverified event candidates and tx links (not proof of a signature) |
| Snapshot votes and proposals | Snapshot hub + IPFS envelope | Key recovered from the EIP-712 signature |
| Safe co-signer confirmations | Safe Transaction Service | Key recovered from the confirmation |
| Farcaster | Neynar (account lookup and verification signatures) | Key recovered from the verification claim |

Failed checks, unverified event candidates, or no successful checks produce an incomplete verdict unless stronger evidence establishes exposure. Optional checks skipped for missing keys or unsupported plans remain listed but do not prevent a “No leak found” verdict when other checks completed successfully. Event scans paginate; scans exceeding the browser work limit are explicitly marked incomplete.

**Contract addresses** have no key of their own, so they get a controller check instead. It identifies:

- Safe multisigs: owners, threshold and modules.
- Coinbase Smart Wallets: address and passkey owners.
- Kernel accounts: owner of the ECDSA validator.
- Generic `owner()` / EIP-1967 proxy admins.

Each controller is probed for exposure: signed txs, EIP-7702, Snapshot, and, for Safes, its own confirmations
recovered from the Safe's history. The result is compared against the signing threshold.

Every recovered key is checked against the address (`keccak256(pubkey)[12:] == address`) before it is shown.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # static site in out/, host anywhere (Vercel, GitHub Pages, IPFS, S3)
```

The site is **fully static**: every check runs in the visitor's browser and talks to public APIs directly. No backend
and no server-side secrets are needed.

## Deploy to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and publishes on every push to `main`.

1. Push this repo to GitHub.
2. In the repo, open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main` (or run the workflow manually). The site appears at `https://<user>.github.io/<repo>/`.

The workflow sets `PAGES_BASE_PATH=/<repo>` because project sites are served from a subpath. If you use a custom
domain or a `<user>.github.io` repo, delete that env line so the site is served from `/`.

**API keys are optional and supplied by each user** through the "API keys" button in the header. They're stored in
that browser's localStorage and sent only to the matching provider:

- **Etherscan V2** enables the permit-style signature scan and sample-tx lookup on chains without keyless Blockscout.
- **Safe** lifts the rate limit on the keyless Safe API.
- **Alchemy** gives more reliable RPCs.
- **Neynar** enables Farcaster account lookup and verification-signature recovery. Without a key, the entire Farcaster check is skipped.

`npm test` runs public-key recovery tests against real mainnet fixtures: legacy (pre and post EIP-155), 2930, 1559, 4844
and 7702 txs, plus a Snapshot vote and a Farcaster claim.

## Layout

- `app/page.tsx` is the explainer and search. `app/check/page.tsx` shows results for `/check?address=…`.
- `lib/run.ts` resolves ENS and orchestrates the checks. Results are not persisted. Concurrent checks for the same address and API credentials share an in-flight run; revisiting after completion starts fresh checks.
- `lib/checks/*` holds one module per leak vector. `lib/providers/*` holds the RPC, Etherscan and Blockscout clients.
- `lib/recover.ts` rebuilds signing payloads and recovers and verifies public keys.
- `lib/keys.ts` is the user API-key store. `components/ApiKeysButton.tsx` is the settings panel.
- `components/CheckResults.tsx` holds the live results: verdict, recovered key, chain grid, findings, check timestamp and Etherscan link.

## License

Licensed under either of

- Apache License, Version 2.0 ([LICENSE-APACHE](LICENSE-APACHE))
- MIT license ([LICENSE-MIT](LICENSE-MIT))

at your option.
