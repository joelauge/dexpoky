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

const PATH_USD_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as const;

const PATH_USD_ABI = [
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
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

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

export async function getPathUsdBalance(address: string): Promise<string> {
  try {
    const raw = await tempoPublicClient.readContract({
      address: PATH_USD_ADDRESS,
      abi: PATH_USD_ABI,
      functionName: "balanceOf",
      args: [address as `0x${string}`],
    });
    const decimals = 6;
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const frac = raw % divisor;
    return `${whole}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "") || "0"}`;
  } catch {
    return "0.0";
  }
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

  const decimals = 6;
  const amountBig = BigInt(Math.round(parseFloat(amountPathUsd) * 10 ** decimals));

  const hash = await (walletClient as any).writeContract({
    address: PATH_USD_ADDRESS,
    abi: PATH_USD_ABI,
    functionName: "transfer",
    args: [toAddress as `0x${string}`, amountBig],
  });

  return hash as string;
}

export const TEMPO_FAUCET_URL = "https://docs.tempo.xyz/quickstart/faucet";
export const TEMPO_EXPLORER_URL = "https://explore.testnet.tempo.xyz";
