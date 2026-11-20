-- CreateEnum
CREATE TYPE "Presentation" AS ENUM ('BOARD_ONLY', 'WITH_PROJECTION');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "boardPoint" TEXT;

-- AlterTable
ALTER TABLE "ClassroomProfile" ADD COLUMN     "presentation" "Presentation" NOT NULL DEFAULT 'BOARD_ONLY';

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "lessonStyle" "LessonStyle" NOT NULL DEFAULT 'HANDOUT',
ADD COLUMN     "presentation" "Presentation" NOT NULL DEFAULT 'BOARD_ONLY';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
