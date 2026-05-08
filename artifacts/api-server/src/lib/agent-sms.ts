import { logger } from "./logger.js";

interface ApprovalSmsParams {
  toPhone: string;
  agentName: string;
  cardName: string;
  pricePathUsd: string;
}

interface AutoBuySmsParams {
  toPhone: string;
  agentName: string;
  cardName: string;
  pricePathUsd: string;
}

async function sendSms(toPhone: string, body: string): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    logger.warn("Twilio env vars not set — skipping agent SMS");
    return;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const creds = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const form = new URLSearchParams();
  form.set("To", toPhone);
  form.set("From", fromPhone);
  form.set("Body", body.slice(0, 1600));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    logger.warn({ status: response.status, body: text }, "Twilio agent SMS error");
    throw new Error(`Twilio error ${response.status}: ${text}`);
  }

  logger.info({ toPhone }, "Agent SMS sent");
}

export async function sendAgentApprovalSms(params: ApprovalSmsParams): Promise<void> {
  const { toPhone, agentName, cardName, pricePathUsd } = params;
  const msg =
    `DexPoky DexAgent "${agentName}" found your card!\n\n` +
    `${cardName} — ${pricePathUsd} pathUSD\n\n` +
    `Reply YES to purchase or NO to skip.\n` +
    `(Offer expires in 24 hours)`;
  await sendSms(toPhone, msg);
}

interface ExternalFindSmsParams {
  toPhone: string;
  agentName: string;
  cardName: string;
  site: string;
  priceUsd: string;
  listingTitle: string;
  listingUrl: string;
}

export async function sendAgentExternalFindSms(params: ExternalFindSmsParams): Promise<void> {
  const { toPhone, agentName, cardName, site, priceUsd, listingTitle, listingUrl } = params;
  const msg =
    `DexPoky DexAgent "${agentName}" found ${cardName} on ${site}!\n\n` +
    `"${listingTitle.slice(0, 80)}"\n` +
    `$${priceUsd}\n\n` +
    `${listingUrl}\n\n` +
    `Reply YES to save to your DexPoky inbox, or NO to dismiss.\n` +
    `(Expires in 24 hours)`;
  await sendSms(toPhone, msg);
}

export async function sendAgentAutoBuySms(params: AutoBuySmsParams): Promise<void> {
  const { toPhone, agentName, cardName, pricePathUsd } = params;
  const msg =
    `DexPoky DexAgent "${agentName}" auto-purchased ${cardName} for ${pricePathUsd} pathUSD.\n\n` +
    `The card has been added to your collection. To require approval before future purchases, ` +
    `enable "Require SMS approval" on your agent settings.`;
  await sendSms(toPhone, msg);
}
