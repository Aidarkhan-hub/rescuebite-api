-- CreateEnum
CREATE TYPE "Role" AS ENUM ('RECIPIENT', 'DONOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "FoodStatus" AS ENUM ('FRESH', 'DISCOUNTED', 'FREE', 'COMPOST');

-- CreateEnum
CREATE TYPE "Allergen" AS ENUM ('GLUTEN', 'CRUSTACEANS', 'EGGS', 'FISH', 'PEANUTS', 'SOY', 'DAIRY', 'NUTS', 'CELERY', 'MUSTARD', 'SESAME', 'SULPHITES', 'LUPIN', 'MOLLUSCS');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(72) NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECIPIENT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "refreshTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_allergen_exclusions" (
    "userId" UUID NOT NULL,
    "allergen" "Allergen" NOT NULL,

    CONSTRAINT "user_allergen_exclusions_pkey" PRIMARY KEY ("userId","allergen")
);

-- CreateTable
CREATE TABLE "food_bags" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "originalPriceCents" INTEGER NOT NULL,
    "currentPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "status" "FoodStatus" NOT NULL DEFAULT 'FRESH',
    "pickupDeadline" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "food_bags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_bag_allergens" (
    "foodBagId" UUID NOT NULL,
    "allergen" "Allergen" NOT NULL,

    CONSTRAINT "food_bag_allergens_pkey" PRIMARY KEY ("foodBagId","allergen")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "foodBagId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "pricePaidCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "user_allergen_exclusions" ADD CONSTRAINT "user_allergen_exclusions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_bag_allergens" ADD CONSTRAINT "food_bag_allergens_foodBagId_fkey" FOREIGN KEY ("foodBagId") REFERENCES "food_bags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_foodBagId_fkey" FOREIGN KEY ("foodBagId") REFERENCES "food_bags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
