import { logger } from "./logger.js";

export interface SmsParams {
  toPhone: string;
  message: string;
  ctaUrl?: string;
}

export async function sendInviteSms(params: SmsParams): Promise<void> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhone) {
    logger.warn(
      "TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER not set — skipping SMS"
    );
    throw new Error(
      "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in your environment secrets."
    );
  }

  const body = params.ctaUrl
    ? `${params.message}\n\n${params.ctaUrl}`
    : params.message;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const creds = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams();
  form.set("To", params.toPhone);
  form.set("From", fromPhone);
  form.set("Body", body.slice(0, 1600));

  try {
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
      logger.warn({ status: response.status, body: text }, "Twilio API returned non-OK");
      throw new Error(`Twilio error ${response.status}: ${text}`);
    }

    logger.info({ toPhone: params.toPhone }, "Outreach invite SMS sent");
  } catch (err) {
    logger.warn({ err }, "Failed to send outreach invite SMS");
    throw err;
  }
}
