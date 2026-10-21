# Changes

## Nermo rebrand

- Renamed Pons Methods to Nermo, with the Nermo monogram as logo, favicon, app icon and share card.
- New black-only liquid-glass interface: chrome headings and primary buttons, mint-rimmed glass panels, glass icon orbs, dark Reown wallet modal.
- Launch marker in the CREATE2 salt changed from "PMETH" to "NERMO". Pons Methods launches are no longer shown as launched here.
- Platform token is now $NERMO with no contract address until it launches.
- `NEXT_PUBLIC_SITE_URL` can override the canonical site URL.

## History inherited from Pons Methods

- Removed the long footer disclaimer paragraph.
- Removed the generic homepage/footer slogan text requested for removal.
- Developer buy is now an optional launch control shared by all five Methods.
- Developer buy and token creation use one atomic launch transaction when a buy amount is entered.
- Pons Methods launches are fixed to the native ETH pair so no separate ERC-20 approval transaction is needed.
- Zero Tax keeps creator tax at 0% and supports the optional developer buy.
- Buyback & Lock starts Pons V2 buyback enabled and supports the optional developer buy.
- Charity routes 100% of the creator-side fee allocation to the selected charity, keeps creator tax at 0%, and supports the optional developer buy through `launchWithBuy`.
- Creator Tax supports 0% to 10% and also supports the optional developer buy.
- Replaced Auto Dev Buy with **Auto Dev Tokens Burn**. If a developer buy is entered, the Pons launch-and-buy router sends the purchased tokens directly to `0x000000000000000000000000000000000000dEaD` in the same launch transaction.
- Opening-buy slippage protection remains enabled with a calculated `minTokensOut`.
- The current Pons V2 `launchForwarder()` is read on-chain before using the atomic launch-and-buy path.
- Existing old `auto-dev-buy` Method metadata is normalized to the new Auto Dev Tokens Burn label for backward compatibility.

## Vercel Blob / image upload fix

- Replaced the Pinata-only upload requirement with the connected Vercel Blob store.
- Uses Vercel OIDC automatically, matching the current Vercel storage connection.
- Supports the existing private Blob store.
- Added `/api/token-image` to serve uploaded token logos publicly through the Pons Methods domain with long-lived CDN caching.
- Pinata is now an optional fallback only.
- Updated `@vercel/blob` to 2.8.0, which supports OIDC-authenticated Blob access.

- Removed public-facing technical parameter strings and raw contract call examples from Method cards and pages.

## Reown, $METHODS page and platform pin

- Wallet connection now uses Reown AppKit (WalletConnect QR, MetaMask, Rabby, Coinbase and 500+ wallets), themed to the site.
- New `config.json` for site, Reown and platform token settings.
- New `/token` page for $METHODS with Copy CA, Buy on Pons, Blockscout and live stats once the CA is set.
- $METHODS is pinned first in Explore and on the home page as the Platform token.
- Copy CA and Buy on Pons buttons added to every token page.
- Prices use readable subscript notation, for example 0.0₈168 ETH.
- Token logos try several IPFS gateways before falling back to initials.
- Launch time now uses the Blockscout creation record first, fixing the blank "Launched" field.
- Next.js upgraded to 14.2.35 (security patch).

## Pre-launch audit fixes

- Every Pons V2 contract call was checked against the official source (github.com/ponsdotdev/pons-labs): launch, launchTokenFor, launchAndBuy, buy, sell, sweepFees, escrow claims, buyback vault and token info all match.
- Auto Dev Burn now declares the burn address as a snipe tax exemption, so the burned opening buy is not hit by the Pons opening tax.
- Charity opening buys declare the buyer as a snipe tax exemption for the same reason.
- Auto Dev Burn now requires a developer buy; without one it would be identical to Zero Tax.
- Trading no longer stalls if a curve does not expose the snipe tax view.
- New "Your creator fees" panel on token pages: creators can sweep curve fees and claim from the Pons fee escrow.
- Image uploads check the real file signature, are rate limited, and always write the canonical ponsmethods.com URL on-chain.
- Security headers added (HSTS, frame blocking, nosniff, referrer and permissions policies).
- Social share card (Open Graph and X) with the current five Methods.
- Wording: "Auto Dev Tokens Burn" renamed "Auto Dev Burn"; claims that fees "cannot be redirected" corrected, because the Pons protocol owner can change a fee recipient after a public three-day notice; Buyback copy states tokens are locked, not burned, and that buybacks can be switched off.

## Clean descriptions

- The token description is now exactly what the creator types. Nothing is appended.
- Methods are read entirely from on-chain launch terms, including Auto Dev Burn (a launch-and-buy whose opening buy went to the dead address).
- Tags written by early test launches are hidden from display.
- Removed the "Launched on Pons Methods only" filter and the "derived" badge, which relied on the tag.

## Launched on Pons Methods filter (restored)

- New launches carry a marker in their CREATE2 salt (the bytes "PMETH"), visible in the launch transaction input on Blockscout. Nothing is added to the token description.
- Explore has the "Launched on Pons Methods only" tick box again, and token pages show a "Launched on Pons Methods" badge.
- Early launches that still carry the old description tag are recognised too.
