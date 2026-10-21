import { decodeFunctionData, toHex, type Hex } from "viem";
import { charityLaunchpadAbi } from "./charity";
import { factoryAbi, routerAbi } from "./pons";

/**
 * Launches made on Nermo are recognised by their CREATE2 salt, not by anything in the
 * token's description. The salt starts with the bytes of "NERMO" followed by 27 random bytes.
 * It is visible in the launch transaction's input, so anyone can verify it on Blockscout.
 */
export const SALT_MARKER = "0x4e45524d4f"; // "NERMO"

export function makeSalt(): Hex {
  const rand = crypto.getRandomValues(new Uint8Array(27));
  return (SALT_MARKER + toHex(rand).slice(2)) as Hex;
}

export const hasMarker = (salt?: string) => !!salt && salt.toLowerCase().startsWith(SALT_MARKER);

const ABIS = [factoryAbi, routerAbi, charityLaunchpadAbi] as const;

/** Reads the salt out of any supported launch call: factory, launch-and-buy router or Pons Charity. */
export function saltFromInput(input?: Hex): Hex | undefined {
  if (!input || input.length < 10) return undefined;
  for (const abi of ABIS) {
    try {
      const { args } = decodeFunctionData({ abi, data: input });
      const params = (args as readonly unknown[] | undefined)?.[0] as { salt?: Hex } | undefined;
      if (params?.salt) return params.salt;
    } catch {}
  }
  return undefined;
}

export const launchedOnSite = (input?: Hex) => hasMarker(saltFromInput(input));
