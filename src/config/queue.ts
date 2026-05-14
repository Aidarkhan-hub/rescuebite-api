import { Queue, Worker, Job } from "bullmq";
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendReservationConfirmationEmail,
  sendPickupReminderEmail,
} from "../services/emailService";

// ─── Connection ───────────────────────────────────────────────────────────────
// BullMQ needs host/port, not a URL string
const connection = {
  host: process.env.REDIS_HOST ?? "localhost",
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

// ─── Job payload types ────────────────────────────────────────────────────────
export type EmailJobName =
  | "send-verification"
  | "send-password-reset"
  | "send-reservation-confirmation"
  | "send-pickup-reminder";

export interface VerificationEmailPayload {
  to: string;
  name: string;
  token: string;
}
export interface PasswordResetEmailPayload {
  to: string;
  name: string;
  token: string;
}
export interface ReservationConfirmationPayload {
  to: string;
  name: string;
  bagTitle: string;
  pricePaidCents: number;
  pickupDeadline: string; // ISO string — Date is not JSON-serializable
}
export interface PickupReminderPayload {
  to: string;
  name: string;
  bagTitle: string;
  pickupDeadline: string;
}

export type EmailJobPayload =
  | VerificationEmailPayload
  | PasswordResetEmailPayload
  | ReservationConfirmationPayload
  | PickupReminderPayload;

// ─── Queue ────────────────────────────────────────────────────────────────────
export const emailQueue = new Queue<EmailJobPayload, void, EmailJobName>("email", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 }, // retry: 5s, 10s, 20s
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ─── Worker ───────────────────────────────────────────────────────────────────
export function startEmailWorker(): Worker {
  const worker = new Worker<EmailJobPayload, void, EmailJobName>(
    "email",
    async (job: Job<EmailJobPayload, void, EmailJobName>) => {
      switch (job.name) {
        case "send-verification": {
          const d = job.data as VerificationEmailPayload;
          await sendVerificationEmail(d.to, d.name, d.token);
          break;
        }
        case "send-password-reset": {
          const d = job.data as PasswordResetEmailPayload;
          await sendPasswordResetEmail(d.to, d.name, d.token);
          break;
        }
        case "send-reservation-confirmation": {
          const d = job.data as ReservationConfirmationPayload;
          await sendReservationConfirmationEmail(
            d.to, d.name, d.bagTitle, d.pricePaidCents, new Date(d.pickupDeadline)
          );
          break;
        }
        case "send-pickup-reminder": {
          const d = job.data as PickupReminderPayload;
          await sendPickupReminderEmail(d.to, d.name, d.bagTitle, new Date(d.pickupDeadline));
          break;
        }
        default:
          throw new Error(`Unknown email job: ${job.name}`);
      }
    },
    { connection, concurrency: 5 }
  );

  worker.on("completed", (job) =>
    console.log(`[EmailWorker]  ${job.id} (${job.name}) done`)
  );
  worker.on("failed", (job, err) =>
    console.error(`[EmailWorker]  ${job?.id} (${job?.name}) failed: ${err.message}`)
  );

  return worker;
}

// ─── Enqueue helpers ──────────────────────────────────────────────────────────
export const enqueueVerificationEmail = (p: VerificationEmailPayload) =>
  emailQueue.add("send-verification", p);

export const enqueuePasswordResetEmail = (p: PasswordResetEmailPayload) =>
  emailQueue.add("send-password-reset", p);

export const enqueueReservationConfirmation = (p: ReservationConfirmationPayload) =>
  emailQueue.add("send-reservation-confirmation", p);

export const enqueuePickupReminder = (p: PickupReminderPayload) =>
  emailQueue.add("send-pickup-reminder", p);