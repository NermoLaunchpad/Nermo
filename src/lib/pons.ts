import { CHARITY_ERROR_TEXT } from "./charity";
import { parseAbi, zeroAddress, type Address } from "viem";

/**
 * Pons V2 on Robinhood Chain (chain id 4663).
 * Source: docs.ponsfamily.com/docs/v2 (Contracts). Selectors verified:
 * launchToken 0xf35abbcf / 0xa72101af, launchAndBuy 0xf85f8e41.
 */
export const PONS = {
  factory: "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e",
  launchAndBuy: "0xe33E9E479dF8802cb0866d5d05258bEc4cF62948",
  memeHook: "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044",
  feeEscrow: "0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e",
  buybackVault: "0x42df2a798f82289E177311362e8f5ccC45c1219c",
  launchLocker: "0x267444D099b10fB5Ed7c3Cc7B7c767AdcA574952",
  launchDeployer: "0x3711ceA4feaDE896C913C68F01Eda97Cb06D1A42",
} as const satisfies Record<string, Address>;

export const NATIVE = zeroAddress;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as Address;

/** Approved pair assets at time of writing. Approval is re-checked on-chain before offering. */
export const PAIR_ASSETS: { symbol: string; address: Address; decimals: number }[] = [
  { symbol: "ETH", address: zeroAddress, decimals: 18 },
  { symbol: "USDG", address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", decimals: 6 },
  { symbol: "cbBTC", address: "0xcec185eb182c47d1ba1efc84e6959e18cd620be4", decimals: 8 },
  { symbol: "TSLA", address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", decimals: 18 },
  { symbol: "NVDA", address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", decimals: 18 },
  { symbol: "AAPL", address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", decimals: 18 },
  { symbol: "SPY", address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", decimals: 18 },
  { symbol: "QQQ", address: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", decimals: 18 },
  { symbol: "COIN", address: "0x6330d8c3178a418788df01a47479c0ce7ccf450b", decimals: 18 },
];

export function pairInfo(address: Address) {
  const hit = PAIR_ASSETS.find((a) => a.address.toLowerCase() === address.toLowerCase());
  return hit ?? { symbol: "TOKEN", address, decimals: 18 };
}

const STRUCTS = [
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }",
  "struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }",
  "struct LaunchedToken { address token; address curve; address deployer; address creatorFeeRecipient; address pairToken; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; uint16 creatorTaxBps; bool buybackEnabled; uint8 phase; uint256 sweptQuote; uint256 sweptTokens; uint256 sweptAt; bool exists; }",
  "struct FeePolicy { address protocolFeeRecipient; uint16 protocolFeeShareBps; uint16 buybackBurnBps; uint16 hookFeeBps; uint16 maxInternalPriceImpactBps; }",
] as const;

export const factoryAbi = parseAbi([
  ...STRUCTS,
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)",
  "function launchToken(TokenParams params, uint256 launchConfigId, address pairToken, address[] snipeTaxExemptions) payable returns (address token, address curve)",
  "function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)",
  "function launchFee() view returns (uint256)",
  "function maxCreatorTaxBps() view returns (uint256)",
  "function canLaunch(address account) view returns (bool)",
  "function launchEnabled() view returns (bool)",
  "function launchForwarder() view returns (address)",
  "function launchConfigCount() view returns (uint256)",
  "function getLaunchConfig(uint256 id) view returns (LaunchConfig)",
  "function approvedPairTokens(address pairToken) view returns (bool)",
  "function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)",
  "function getLaunchedToken(address token) view returns (LaunchedToken)",
  "function getLaunchFeePolicy(address token) view returns (FeePolicy)",
  "function pendingCreatorFeeRecipient(address token) view returns (address recipient, uint256 effectiveAt, uint256 expiresAt)",
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
]);

export const routerAbi = parseAbi([
  ...STRUCTS,
  "function launchAndBuy(TokenParams params, uint256 launchConfigId, address pairToken, uint256 quoteIn, uint256 minTokensOut, address recipient, address[] snipeTaxExemptions) payable returns (address token, address curve, uint256 tokensOut)",
  "event Launched(address indexed token, address indexed curve, address indexed recipient, address launcher, uint256 quoteSpent, uint256 tokensReceived)",
]);

export const curveAbi = parseAbi([
  "function buy(uint256 quoteIn, uint256 minTokensOut, address recipient) payable returns (uint256 tokensOut)",
  "function sweepFees(uint256 minBuybackTokensOut)",
  "function quoteFeeBalance() view returns (uint256)",
  "function sell(uint256 tokensIn, uint256 minQuoteOut, address recipient) returns (uint256 quoteOut)",
  "function getReserves() view returns (uint256 quoteReserve, uint256 tokenReserve)",
  "function realQuoteReserve() view returns (uint256)",
  "function graduationThreshold() view returns (uint256)",
  "function sellableTokens() view returns (uint256)",
  "function readyToGraduate() view returns (bool)",
  "function graduated() view returns (bool)",
  "function feeBps() view returns (uint256)",
  "function creatorTaxBps() view returns (uint256)",
  "function buybackEnabled() view returns (bool)",
  "function currentSnipeTaxBps(address recipient) view returns (uint256)",
  "function creatorTaxBalance() view returns (uint256)",
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
]);

export const tokenAbi = parseAbi([
  "struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function getTokenInfo() view returns (address tokenDeployer, string tokenLogo, string tokenDescription, Socials tokenSocials)",
]);

export const vaultAbi = parseAbi([
  "function totalLocked(address token) view returns (uint256)",
  "function totalReleased(address token) view returns (uint256)",
  "function vestedAmount(address token) view returns (uint256)",
  "function releasable(address token) view returns (uint256)",
  "function vestingStart(address token) view returns (uint256)",
  "function VESTING_DURATION() view returns (uint256)",
]);

export const escrowAbi = parseAbi([
  "function balanceOf(address recipient) view returns (uint256)",
  "function balanceOfToken(address recipient, address token) view returns (uint256)",
  "function claim() returns (uint256 amount)",
  "function claimToken(address token) returns (uint256 amount)",
]);


/** Custom errors named in the Pons V2 docs. Declared so viem can surface readable reasons. */
export const PONS_ERRORS = parseAbi([
  "error NotWhitelisted()",
  "error LaunchFeeNotPaid()",
  "error CreatorTaxTooHigh()",
  "error PairTokenNotApproved()",
  "error PairTokenDecimalsMismatch()",
  "error LaunchEconomicsMismatch()",
  "error LaunchConfigDisabled()",
  "error SlippageExceeded()",
  "error CurveGraduated()",
  "error NativeValueMismatch()",
  "error UnexpectedNativeValue()",
  "error ExemptionListTooLong()",
]);

export const ERROR_TEXT: Record<string, string> = {
  NotWhitelisted: "Pons V2 launches are currently whitelist-only, and this wallet is not on the list.",
  LaunchFeeNotPaid: "The launch fee changed. Review the launch again and retry.",
  CreatorTaxTooHigh: "The creator tax is above the Pons protocol cap.",
  PairTokenNotApproved: "That pair asset is not approved for Pons launches.",
  PairTokenDecimalsMismatch: "The pair asset reports unexpected decimals. Choose another pair.",
  LaunchEconomicsMismatch: "Pons changed the launch terms since you reviewed them. Review again and retry.",
  LaunchConfigDisabled: "That launch configuration has been disabled. Review again to pick the current one.",
  SlippageExceeded: "The price moved past your slippage limit. Try again or raise slippage.",
  CurveGraduated: "This token has graduated. Trade it on Uniswap v4.",
  NativeValueMismatch: "The ETH sent did not match the amount. Retry the transaction.",
  UnexpectedNativeValue: "ETH was sent to a token-paired launch. Retry the transaction.",
  ExemptionListTooLong: "Too many snipe tax exemptions. The limit is 32.",
};

export function explainError(e: unknown): string {
  const err = e as { shortMessage?: string; message?: string; walk?: (fn: (x: unknown) => boolean) => unknown; name?: string };
  const found = err?.walk?.((x) => !!(x as { data?: { errorName?: string } })?.data?.errorName) as { data?: { errorName?: string } } | undefined;
  const name = found?.data?.errorName;
  if (name && ERROR_TEXT[name]) return ERROR_TEXT[name];
  if (name && CHARITY_ERROR_TEXT[name]) return CHARITY_ERROR_TEXT[name];
  const msg = err?.shortMessage || err?.message || "Transaction failed.";
  if (/user rejected|denied/i.test(msg)) return "You rejected the request in your wallet.";
  if (/insufficient funds/i.test(msg)) return "This wallet does not hold enough ETH for the amount plus gas.";
  return msg.split("\n")[0];
}

export const PHASE_LABEL = ["On curve", "Swept", "Graduated", "Rescued"] as const;
export const TOKEN_SUPPLY = 1_000_000_000n * 10n ** 18n;
