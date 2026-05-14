-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED');

-- AlterTable: add email verification and password reset fields
ALTER TABLE "users"
  ADD COLUMN "isEmailVerified"        BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN "emailVerificationToken" VARCHAR(255),
  ADD COLUMN "passwordResetToken"     VARCHAR(255),
  ADD COLUMN "passwordResetExpiresAt" TIMESTAMP(3);

-- Existing users are already active, mark them verified so they don't get locked out
UPDATE "users" SET "isEmailVerified" = true;

-- AlterTable: migrate status from String to enum
-- Must drop default first, then cast type, then re-add default
ALTER TABLE "reservations" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "reservations"
  ALTER COLUMN "status" TYPE "ReservationStatus"
    USING "status"::"ReservationStatus";

ALTER TABLE "reservations"
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"ReservationStatus";