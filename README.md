# Nermo

Nermo is a multi-method launcher built on the live Pons V2 contracts on Robinhood Chain.

## Launch Methods

| Method | Pons V2 behaviour | Optional developer buy |
| --- | --- | --- |
| Zero Tax | `creatorTaxBps = 0`, buyback off | Same launch transaction |
| Buyback & Lock | `buybackEnabled = true`, creator tax 0 | Same launch transaction |
| Charity | 100% of the creator-side fee allocation routes through Pons Charity | Same launch transaction |
| Creator Tax | Creator sets 0% to 10% | Same launch transaction |
| Auto Dev Tokens Burn | Creator tax 0, buyback off | Purchased tokens are sent directly to `0x000000000000000000000000000000000000dEaD` |

Developer buy is a launch option shared by every Method. When the amount is above zero, normal Methods use the live Pons V2 `launchAndBuy` forwarder. Charity uses Pons Charity `launchWithBuy`. Nermo fixes new launches to the native ETH pair so launching with an optional developer buy needs only one wallet transaction and no ERC-20 approval transaction.

The developer buy uses a non-zero `minTokensOut` based on the slippage setting. Pons V2 appends the opening-buy recipient to the launch-second snipe-tax exemption list, and token creation plus the buy settle atomically.

For Auto Dev Tokens Burn, the launch-and-buy `recipient` is the burn address itself, so the bought tokens never enter the developer wallet.

## Method metadata

Pons V2 does not expose a `launchMethod` field, so each token's Method is read from its on-chain launch terms: a Pons Charity registry entry means Charity, buyback enabled means Buyback & Lock, a creator tax above 0% means Creator Tax, a launch-and-buy whose opening buy went to the dead address means Auto Dev Burn, and anything else is Zero Tax. The token description is exactly what the creator typed; nothing is added to it.

## Launch feed

Explore discovers recent Pons launches through the configured feed/Blockscout path and verifies each candidate with `PonsV2LaunchFactory.getLaunchedToken()` before displaying it.

## Environment variables

See `.env.example`. Recommended production setup:

- `NEXT_PUBLIC_RPC_URL`: Alchemy Robinhood Mainnet RPC
- `RPC_URL`: server-side Alchemy Robinhood Mainnet RPC
- `BLOCKSCOUT_URL=https://robinhoodchain.blockscout.com`
- `ALLOW_RPC_INDEXER_FALLBACK=false`
- `PINATA_JWT`: optional image upload credential

## Pons Charity

The Charity Method uses the live Pons Charity contracts and the bundled charity directory. Third-party licensing is preserved in `THIRD_PARTY_LICENSE_PONS_CHARITY`.

## Token image uploads with Vercel Blob

Nermo uses the Vercel Blob store connected to the project. New Vercel Blob connections use OIDC, so a long-lived `BLOB_READ_WRITE_TOKEN` is not required.

The existing **private** Blob store is supported. Uploaded files stay private in Blob and are exposed as immutable public token-logo URLs through `/api/token-image`. This means the on-chain `logo` field receives a normal `https://<your Nermo domain>/...` URL while the Blob store itself can remain private.

Required Vercel setup:

- Connect the Blob store to the `nermo` project for Production and Preview.
- Keep the generated `BLOB_STORE_ID` variable.
- Redeploy after connecting the store so Vercel provides the OIDC credentials to Functions.
- `BLOB_WEBHOOK_PUBLIC_KEY` may remain, but Nermo does not need it for image upload.
- `PINATA_JWT` is optional and used only as a fallback when no Blob store is connected.

## config.json

All site settings live in `config.json` at the project root.

- `site.url`: the canonical domain. Uploaded token logos are written on-chain under this URL, so set it to the real Nermo domain before the first launch. `NEXT_PUBLIC_SITE_URL` overrides it.

- `reown.projectId`: Reown (WalletConnect) project id used by the Connect Wallet modal. Add your Nermo domains to the project's allowed domains in the Reown dashboard.
- `platformToken.ca`: the $NERMO contract address. Leave empty before launch. Once set and redeployed, the `/token` page, Copy CA button, Buy button and the pinned Explore card all switch to the live token.
- `platformToken.buyUrl`: buy link template; `{ca}` is replaced with the contract address.
- `site.x`, `site.telegram`: optional links shown on the $NERMO page.

`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PLATFORM_TOKEN_CA` and `NEXT_PUBLIC_REOWN_PROJECT_ID` override the file if set in Vercel.

## Before going public

1. Reown dashboard: add your Nermo domains to the project's allowed domains.
2. Vercel environment: set `NEXT_PUBLIC_RPC_URL` and `RPC_URL` to a dedicated Robinhood Chain RPC (the public one is rate limited).
3. Vercel storage: connect a Blob store and set `BLOB_STORE_ID`, or set `PINATA_JWT`, so image uploads work.
4. Make one small real launch per Method from your own wallet, plus one buy and one sell, before announcing.

## Design

Black only. The palette comes from the Nermo monogram: liquid-glass chrome with a cool mint rim on pure black. Tokens live at the top of `src/app/globals.css`. Brand files are `public/brand/nermo-mark.png` (transparent) and `public/brand/nermo-icon.png`.

Launches made on Nermo carry the bytes "NERMO" at the start of their CREATE2 salt (`src/lib/origin.ts`).
