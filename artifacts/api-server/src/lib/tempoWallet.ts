import { createWalletClient, http, publicActions, type WalletClient } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createPublicClient } from "viem";
import { defineChain } from "viem";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

export const tempoTestnet = defineChain({
  id: 105105,
  name: "Tempo Testnet",
  nativeCurrency: { name: "pathUSD", symbol: "pathUSD", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.tempo.xyz"] },
  },
  blockExplorers: {
    default: { name: "Tempo Explorer", url: "https://explore.testnet.tempo.xyz" },
  },
  testnet: true,
});

// Tempo Testnet stablecoin addresses (official — from https://docs.tempo.xyz/quickstart/faucet)
const TEMPO_TOKENS = [
  { symbol: "pathUSD",  address: "0x20c0000000000000000000000000000000000000" as const },
  { symbol: "AlphaUSD", address: "0x20c0000000000000000000000000000000000001" as const },
  { symbol: "BetaUSD",  address: "0x20c0000000000000000000000000000000000002" as const },
  { symbol: "ThetaUSD", address: "0x20c0000000000000000000000000000000000003" as const },
] as const;

// Primary token used for agent-to-agent transfers
const PATH_USD_ADDRESS = TEMPO_TOKENS[0].address;

const TOKEN_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const TOKEN_DECIMALS = 6;
const TOKEN_DIVISOR = BigInt(10 ** TOKEN_DECIMALS);

function getEncKey(): Buffer {
  const secret = process.env.SESSION_SECRET ?? "dexpoky-tempo-fallback-key-32ch!!";
  return scryptSync(secret, "dexpoky-tempo-salt", 32);
}

export function encryptPrivateKey(privateKey: string): string {
  const key = getEncKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptPrivateKey(encrypted: string): string {
  const [ivHex, encHex] = encrypted.split(":");
  const key = getEncKey();
  const iv = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

export function generateTempoWallet(): { address: string; privateKey: string } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return { address: account.address, privateKey };
}

export const tempoPublicClient = createPublicClient({
  chain: tempoTestnet,
  transport: http(),
});

function rawToDollar(raw: bigint): string {
  const whole = raw / TOKEN_DIVISOR;
  const frac = raw % TOKEN_DIVISOR;
  return `${whole}.${frac.toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "") || "0"}`;
}

// Returns the combined pathUSD + AlphaUSD + BetaUSD + ThetaUSD balance as a decimal string.
export async function getPathUsdBalance(address: string): Promise<string> {
  try {
    const balances = await Promise.all(
      TEMPO_TOKENS.map((t) =>
        tempoPublicClient
          .readContract({
            address: t.address,
            abi: TOKEN_ABI,
            functionName: "balanceOf",
            args: [address as `0x${string}`],
          })
          .catch(() => BigInt(0)),
      ),
    );
    const total = balances.reduce((sum, b) => sum + b, BigInt(0));
    return rawToDollar(total);
  } catch {
    return "0.0";
  }
}

// Returns per-token balances for detailed display
export async function getAllTokenBalances(address: string): Promise<{ symbol: string; balance: string }[]> {
  const balances = await Promise.all(
    TEMPO_TOKENS.map(async (t) => {
      const raw = await tempoPublicClient
        .readContract({
          address: t.address,
          abi: TOKEN_ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        })
        .catch(() => BigInt(0));
      return { symbol: t.symbol, balance: rawToDollar(raw) };
    }),
  );
  return balances;
}

export async function sendPathUsd(
  fromPrivateKey: string,
  toAddress: string,
  amountPathUsd: string,
): Promise<string> {
  const account = privateKeyToAccount(fromPrivateKey as `0x${string}`);
  const walletClient: WalletClient = createWalletClient({
    account,
    chain: tempoTestnet,
    transport: http(),
  }).extend(publicActions);

  const amountBig = BigInt(Math.round(parseFloat(amountPathUsd) * 10 ** TOKEN_DECIMALS));

  const hash = await (walletClient as any).writeContract({
    address: PATH_USD_ADDRESS,
    abi: TOKEN_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, amountBig],
  });

  return hash as string;
}

export const TEMPO_FAUCET_URL = "https://docs.tempo.xyz/quickstart/faucet";
export const TEMPO_EXPLORER_URL = "https://explore.testnet.tempo.xyz";
