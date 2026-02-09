-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "overrideReason" TEXT;

-- AlterTable
ALTER TABLE "Mission" ADD COLUMN     "emergencyJustification" TEXT,
ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ManualOverrideLog" (
    "id" SERIAL NOT NULL,
    "coordinatorId" INTEGER NOT NULL,
    "missionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualOverrideLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionFeedback" (
    "id" SERIAL NOT NULL,
    "missionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManualOverrideLog_coordinatorId_idx" ON "ManualOverrideLog"("coordinatorId");

-- CreateIndex
CREATE INDEX "ManualOverrideLog_missionId_idx" ON "ManualOverrideLog"("missionId");

-- CreateIndex
CREATE INDEX "MissionFeedback_missionId_idx" ON "MissionFeedback"("missionId");

-- CreateIndex
CREATE UNIQUE INDEX "MissionFeedback_userId_missionId_key" ON "MissionFeedback"("userId", "missionId");

-- AddForeignKey
ALTER TABLE "ManualOverrideLog" ADD CONSTRAINT "ManualOverrideLog_coordinatorId_fkey" FOREIGN KEY ("coordinatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverrideLog" ADD CONSTRAINT "ManualOverrideLog_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualOverrideLog" ADD CONSTRAINT "ManualOverrideLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionFeedback" ADD CONSTRAINT "MissionFeedback_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionFeedback" ADD CONSTRAINT "MissionFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
