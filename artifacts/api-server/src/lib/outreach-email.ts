// Resend integration — uses Replit connectors proxy for credentials
import { Resend } from "resend";
import { logger } from "./logger.js";

function getAppBaseUrl(): string {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) {
    const primary = domains.split(",")[0].trim();
    return `https://${primary}`;
  }
  return "https://dexpoky.replit.app";
}

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string }> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Resend is not connected. Add the Resend integration from the Integrations panel to enable outreach emails."
    );
  }

  const data = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((r) => r.json())
    .then((d: any) => d.items?.[0]);

  if (!data?.settings?.api_key) {
    throw new Error("Resend not connected — complete the Resend OAuth flow in the Integrations panel.");
  }

  const fromEmail: string =
    data.settings.from_email ??
    process.env.RESEND_FROM_EMAIL ??
    "DexPoky <invite@dexpoky.app>";

  return { apiKey: data.settings.api_key, fromEmail };
}

export interface CardEmailParams {
  toEmail: string;
  toName: string;
  subject: string;
  message: string;
  ctaUrl?: string;
  cardImageUrl?: string;
  stats: { listingCount: number; avgPriceDollars: number; userCount: number };
  fromDisplayName: string;
}

function buildCardHtml(params: CardEmailParams): string {
  const base = getAppBaseUrl();
  const cta = params.ctaUrl ?? base;
  const art = params.cardImageUrl
    ? `<img src="${params.cardImageUrl}" alt="Featured card" style="width:100%;height:200px;object-fit:cover;display:block;" />`
    : `<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:linear-gradient(135deg,#1a1a2e 0%,#16213e 40%,#0f3460 100%);height:200px;"><span style="font-size:64px;">&#x1F0CF;</span></td></tr></table>`;

  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(params.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#1a1a2e;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a2e;padding:32px 16px;">
  <tr><td align="center">
    <table width="380" cellpadding="0" cellspacing="0" style="max-width:380px;width:100%;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.6),0 0 0 2px #e5c100;">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#f5d020 0%,#e5a000 50%,#c87800 100%);padding:12px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:18px;font-weight:900;color:#1a0a00;letter-spacing:-0.5px;">&#x2B21; DexPoky</td>
          <td align="right" style="font-size:11px;font-weight:700;color:#5a2d00;letter-spacing:1px;text-transform:uppercase;">&#x2726; Rare Invite</td>
        </tr></table>
      </td></tr>
      <!-- Art -->
      <tr><td style="background:#0f0f23;padding:8px 12px 0;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:8px;overflow:hidden;border:2px solid #2a2a4a;">
          <tr><td>${art}</td></tr>
        </table>
      </td></tr>
      <!-- Name bar -->
      <tr><td style="background:linear-gradient(90deg,#e5a000,#c87800);padding:8px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:15px;font-weight:800;color:#1a0a00;">${esc(params.toName)}&apos;s Invite</td>
          <td align="right" style="font-size:12px;font-weight:700;color:#5a2d00;">HP &#x2726;</td>
        </tr></table>
      </td></tr>
      <!-- Stats -->
      <tr><td style="background:#0f0f23;padding:12px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td align="center" width="33%" style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 4px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:20px;font-weight:900;color:#f5d020;">${params.stats.listingCount}</div>
            <div style="font-size:9px;color:#8888aa;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Listings</div>
          </td>
          <td width="6"></td>
          <td align="center" width="33%" style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 4px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:20px;font-weight:900;color:#4ade80;">$${params.stats.avgPriceDollars}</div>
            <div style="font-size:9px;color:#8888aa;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Avg Value</div>
          </td>
          <td width="6"></td>
          <td align="center" width="33%" style="background:rgba(255,255,255,0.05);border-radius:8px;padding:10px 4px;border:1px solid rgba(255,255,255,0.1);">
            <div style="font-size:20px;font-weight:900;color:#60a5fa;">${params.stats.userCount}+</div>
            <div style="font-size:9px;color:#8888aa;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Collectors</div>
          </td>
        </tr></table>
      </td></tr>
      <!-- Flavor text -->
      <tr><td style="background:#0f0f23;padding:12px 16px 0;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid rgba(255,255,255,0.08);padding-top:12px;">
          <p style="font-size:13px;color:#ccccdd;font-style:italic;line-height:1.6;margin:0;">&ldquo;${esc(params.message)}&rdquo;</p>
        </td></tr></table>
      </td></tr>
      <!-- Type line -->
      <tr><td style="background:#0f0f23;padding:8px 16px;">
        <p style="font-size:10px;color:#555577;margin:0;font-weight:600;letter-spacing:0.5px;">Pok&eacute;mon TCG Collector &bull; Marketplace &bull; AI Deck Builder</p>
      </td></tr>
      <!-- CTA -->
      <tr><td style="background:#0f0f23;padding:12px 16px 16px;" align="center">
        <a href="${cta}" style="display:inline-block;background:linear-gradient(135deg,#f5d020,#e5a000);color:#1a0a00;font-size:14px;font-weight:800;text-decoration:none;padding:12px 28px;border-radius:50px;">
          Join DexPoky free &rarr;
        </a>
      </td></tr>
      <!-- Card footer -->
      <tr><td style="background:linear-gradient(135deg,#f5d020 0%,#c87800 100%);padding:6px 16px;">
        <p style="font-size:9px;color:#5a2d00;margin:0;text-align:center;">Illus. ${esc(params.fromDisplayName).slice(0, 40)} &bull; DexPoky TCG</p>
      </td></tr>
    </table>
    <!-- Legal footer -->
    <table width="380" cellpadding="0" cellspacing="0" style="max-width:380px;width:100%;margin-top:16px;">
      <tr><td style="text-align:center;padding:0 16px;">
        <p style="font-size:11px;color:#555577;margin:0;line-height:1.8;">
          You received this one-time invitation from a DexPoky member.<br />
          DexPoky does not share your address with third parties.<br />
          <a href="${base}" style="color:#8888aa;">Visit DexPoky</a>
          &nbsp;&bull;&nbsp;
          <a href="${base}/unsubscribe?email=${encodeURIComponent(params.toEmail)}" style="color:#8888aa;">Unsubscribe</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

export async function sendInviteEmail(params: CardEmailParams): Promise<void> {
  // WARNING: Never cache the client — tokens expire
  const { apiKey, fromEmail } = await getResendCredentials();
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: [params.toEmail],
    subject: params.subject,
    html: buildCardHtml(params),
  });

  if (error) {
    logger.warn({ error, toEmail: params.toEmail }, "Resend returned error for invite email");
    throw new Error(`Email delivery failed: ${error.message}`);
  }

  logger.info({ toEmail: params.toEmail }, "Outreach invite email sent via Resend");
}
