/** Origin of the deployed site. Change it when moving to a custom domain (and drop PAGES_BASE_PATH in the deploy workflow). */
export const SITE_ORIGIN = "https://vid201.github.io";

/** Full public URL of the site root, no trailing slash. Follows the same base path as next.config.ts. */
export const SITE_URL = `${SITE_ORIGIN}${process.env.PAGES_BASE_PATH ?? ""}`;

export const SITE_NAME = "Bunker Leak";

export const SITE_TITLE = "Bunker Leak: check if your Ethereum public key is exposed";

export const SITE_DESCRIPTION =
  "Check whether your Ethereum address has revealed its public key on Ethereum, L2s, alt-L1s or in public off-chain signatures. Built for Justin Drake's 'bunker mode'.";
