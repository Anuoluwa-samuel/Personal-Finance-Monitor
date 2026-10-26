import "server-only";
import { env } from "@/lib/env";

type Mail = { to: string; subject: string; text: string };

/**
 * Sends transactional email through Resend when RESEND_API_KEY is set.
 * Without a key, development logs the message to the console; production
 * refuses to send so a missing provider is never silently ignored.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (env.RESEND_API_KEY) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, ...mail }),
    });
    if (!res.ok) throw new Error(`Email provider rejected the message (${res.status})`);
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("RESEND_API_KEY is not configured; cannot send email");
  }
  console.info(`[dev mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
}
