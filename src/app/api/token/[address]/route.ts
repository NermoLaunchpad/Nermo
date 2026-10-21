import { NextResponse } from "next/server";
import { decodeEventLog, getAddress, isAddress, pad, type Hex } from "viem";
import { serverClient } from "@/lib/chain";
import { curveAbi, factoryAbi, PONS } from "@/lib/pons";
import { launchedOnSite } from "@/lib/origin";

export const dynamic = "force-dynamic";
const BLOCKSCOUT = process.env.BLOCKSCOUT_URL || "https://robinhoodchain.blockscout.com";
const TOKEN_LAUNCHED = "0x8d4aad4953d0ca700d468f3753aa14432d1b35b43ec6409f051fb6aa43a89607";

/** Launch provenance for one token: launch tx, whether it used launch-and-buy, and the dev buy it made. */
export async function GET(_: Request, { params }: { params: { address: string } }) {
  if (!isAddress(params.address)) return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  const token = getAddress(params.address);
  const client = serverClient();
  try {
    const hit = await findLaunchTx(token, client);
    if (!hit) return NextResponse.json({ found: false });

    const blockNumber = hit.blockNumber;
    const [tx, curveLogs, liveForwarder] = await Promise.all([
      client.getTransaction({ hash: hit.hash }),
      (async () => {
        const rec = await client.getTransactionReceipt({ hash: hit.hash });
        return rec.logs;
      })(),
      client.readContract({ address: PONS.factory, abi: factoryAbi, functionName: "launchForwarder" }).catch(() => PONS.launchAndBuy),
    ]);
    const viaRouter = !!tx.to && (tx.to.toLowerCase() === liveForwarder.toLowerCase() || tx.to.toLowerCase() === PONS.launchAndBuy.toLowerCase());
    let devBuy: { quoteIn: string; tokensOut: string; buyer: string } | null = null;
    for (const log of curveLogs) {
      try {
        const ev = decodeEventLog({ abi: curveAbi, data: log.data, topics: log.topics });
        if (ev.eventName === "CurveBuy") {
          devBuy = { quoteIn: ev.args.quoteIn.toString(), tokensOut: ev.args.tokensOut.toString(), buyer: ev.args.recipient };
          break;
        }
      } catch {}
    }
    return NextResponse.json({
      found: true,
      blockNumber: blockNumber.toString(),
      txHash: hit.hash,
      timestamp: hit.timestamp,
      viaRouter,
      devBuy,
      viaSite: launchedOnSite(tx.input),
    });
  } catch (e) {
    return NextResponse.json({ found: false, error: (e as Error).message }, { status: 200 });
  }
}

type Client = ReturnType<typeof serverClient>;

/**
 * Finds the launch transaction three ways, most reliable first: the Blockscout v2 creation record,
 * the Blockscout logs API, then the Pons factory log in a narrow window around the creation block.
 */
async function findLaunchTx(token: `0x${string}`, client: Client): Promise<{ hash: Hex; blockNumber: bigint; timestamp: number } | null> {
  const withBlock = async (hash: Hex) => {
    const rec = await client.getTransactionReceipt({ hash });
    const block = await client.getBlock({ blockNumber: rec.blockNumber });
    return { hash, blockNumber: rec.blockNumber, timestamp: Number(block.timestamp) };
  };
  try {
    const res = await fetch(`${BLOCKSCOUT}/api/v2/addresses/${token}`, { cache: "no-store", headers: { accept: "application/json" } });
    if (res.ok) {
      const j = (await res.json()) as { creation_transaction_hash?: Hex; creation_tx_hash?: Hex };
      const h = j.creation_transaction_hash || j.creation_tx_hash;
      if (h) return await withBlock(h);
    }
  } catch {}
  try {
    const q = new URLSearchParams({
      module: "logs", action: "getLogs", address: PONS.factory, fromBlock: "0", toBlock: "latest",
      topic0: TOKEN_LAUNCHED, topic1: pad(token.toLowerCase() as Hex), topic0_1_opr: "and",
    });
    const res = await fetch(`${BLOCKSCOUT}/api?${q}`, { cache: "no-store" });
    const json = (await res.json()) as { result?: { blockNumber: string; transactionHash: Hex; timeStamp: string }[] };
    const hit = Array.isArray(json.result) ? json.result[0] : undefined;
    if (hit) return { hash: hit.transactionHash, blockNumber: BigInt(hit.blockNumber), timestamp: Number(BigInt(hit.timeStamp)) };
  } catch {}
  return null;
}
