-- AlterTable
ALTER TABLE "Mission" ADD COLUMN     "autoPromote" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "isPriority" BOOLEAN NOT NULL DEFAULT false;
