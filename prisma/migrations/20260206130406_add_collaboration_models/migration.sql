-- CreateTable
CREATE TABLE "MissionComment" (
    "id" SERIAL NOT NULL,
    "missionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionChecklistItem" (
    "id" SERIAL NOT NULL,
    "missionId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MissionComment_missionId_idx" ON "MissionComment"("missionId");

-- CreateIndex
CREATE INDEX "MissionChecklistItem_missionId_idx" ON "MissionChecklistItem"("missionId");

-- AddForeignKey
ALTER TABLE "MissionComment" ADD CONSTRAINT "MissionComment_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionComment" ADD CONSTRAINT "MissionComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionChecklistItem" ADD CONSTRAINT "MissionChecklistItem_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
