/*
  Warnings:

  - A unique constraint covering the columns `[lessonId,position]` on the table `Activity` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "Device" AS ENUM ('ONE_PER_STUDENT_SCHOOL', 'ONE_PER_STUDENT_PERSONAL', 'PHONE_ONLY', 'ONE_PER_GROUP', 'NO_DEVICE', 'OTHER');

-- AlterEnum
ALTER TYPE "LessonStatus" ADD VALUE 'GENERATING';

-- DropIndex
DROP INDEX "Activity_lessonId_idx";

-- AlterTable
ALTER TABLE "Issue" ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "advancedTask" TEXT,
ADD COLUMN     "device" "Device",
ADD COLUMN     "deviceNote" TEXT,
ADD COLUMN     "minimumLine" TEXT,
ADD COLUMN     "studentContext" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Activity_lessonId_position_key" ON "Activity"("lessonId", "position");
