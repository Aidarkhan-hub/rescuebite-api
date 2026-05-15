import { Resend } from "resend";
import { env } from "../config/env";

const resend = new Resend(env.RESEND_API_KEY);
const FROM = "RescueBite <onboarding@resend.dev>";

async function safeSend(payload: Parameters<typeof resend.emails.send>[0]): Promise<void> {
  try {
    await resend.emails.send(payload);
  } catch (err) {
    console.warn("[EmailService] Failed to send email (non-fatal):", (err as Error).message);
  }
}

export async function sendVerificationEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${env.APP_URL}/api/v1/auth/verify-email?token=${token}`;
  await safeSend({
    from: FROM,
    to,
    subject: "Verify your RescueBite account",
    html: `
      <h2>Welcome to RescueBite, ${name}!</h2>
      <p>Click the link below to verify your email address. The link expires in <strong>24 hours</strong>.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#22c55e;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
        Verify Email
      </a>
      <p>If you did not create an account, ignore this email.</p>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string
): Promise<void> {
  const link = `${env.APP_URL}/api/v1/auth/reset-password?token=${token}`;
  await safeSend({
    from: FROM,
    to,
    subject: "Reset your RescueBite password",
    html: `
      <h2>Password Reset Request</h2>
      <p>Hi ${name}, we received a request to reset your password.</p>
      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#ef4444;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
        Reset Password
      </a>
      <p>This link expires in <strong>15 minutes</strong>.</p>
      <p>If you did not request this, ignore this email — your password will not change.</p>
    `,
  });
}

export async function sendReservationConfirmationEmail(
  to: string,
  name: string,
  bagTitle: string,
  pricePaidCents: number,
  pickupDeadline: Date
): Promise<void> {
  const price = (pricePaidCents / 100).toFixed(2);
  const deadline = pickupDeadline.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  await safeSend({
    from: FROM,
    to,
    subject: `Reservation confirmed: ${bagTitle}`,
    html: `
      <h2>Your reservation is confirmed!</h2>
      <p>Hi ${name}, you have successfully reserved a food bag.</p>
      <table style="border-collapse:collapse;width:100%;max-width:400px">
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Item</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${bagTitle}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Price paid</strong></td><td style="padding:8px;border:1px solid #e5e7eb">$${price}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb"><strong>Pick up before</strong></td><td style="padding:8px;border:1px solid #e5e7eb">${deadline}</td></tr>
      </table>
      <p>Please pick up your order before the deadline — food cannot be held past this time.</p>
    `,
  });
}

export async function sendPickupReminderEmail(
  to: string,
  name: string,
  bagTitle: string,
  pickupDeadline: Date
): Promise<void> {
  const deadline = pickupDeadline.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
  await safeSend({
    from: FROM,
    to,
    subject: `Pickup reminder: ${bagTitle}`,
    html: `
      <h2>Don't forget your food bag!</h2>
      <p>Hi ${name}, your food bag <strong>${bagTitle}</strong> must be picked up by <strong>${deadline}</strong>.</p>
      <p>If you can no longer pick it up, please cancel your reservation so someone else can benefit.</p>
    `,
  });
}
