export async function sendWhatsAppSummary({ to, message }: { to: string; message: string }) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const toNumber = to.trim() || process.env.WHATSAPP_TO_NUMBER || "";

  if (!accountSid || !authToken) {
    return {
      sent: false,
      reason: "Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in apps/api/.env.",
      preview: message,
    };
  }

  if (!toNumber) {
    return {
      sent: false,
      reason: "Recipient number is missing. Set WHATSAPP_TO_NUMBER in apps/api/.env or enter a number in the UI.",
      preview: message,
    };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const body = new URLSearchParams({
    From: "whatsapp:+14155238886",
    To: `whatsapp:${toNumber}`,
    Body: message,
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp send failed: ${errorText}`);
  }

  const data = await response.json();
  return { sent: true, data };
}
