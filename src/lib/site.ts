import { getAddress, isAddress, type Address } from "viem";
import config from "../../config.json";

/**
 * Single place to configure the site. Edit config.json and redeploy.
 * Set platformToken.ca to the $NERMO contract address once it launches: the $NERMO page,
 * the Copy CA button, the Buy button and the pinned Explore card all update from it.
 */
/** NEXT_PUBLIC_SITE_URL overrides the canonical URL, which is also written into uploaded token logo links. */
export const SITE = { ...config.site, url: (process.env.NEXT_PUBLIC_SITE_URL || config.site.url).replace(/\/$/, "") };

export const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || config.reown.projectId;

const rawCa = (process.env.NEXT_PUBLIC_PLATFORM_TOKEN_CA || config.platformToken.ca || "").trim();

export const PLATFORM = {
  ...config.platformToken,
  ca: (isAddress(rawCa) ? getAddress(rawCa) : null) as Address | null,
};

export const platformBuyUrl = () =>
  PLATFORM.ca ? PLATFORM.buyUrl.replace("{ca}", PLATFORM.ca) : null;

export const isPlatformToken = (a?: string) => !!PLATFORM.ca && !!a && a.toLowerCase() === PLATFORM.ca.toLowerCase();
