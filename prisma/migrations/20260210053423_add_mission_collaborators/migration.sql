-- CreateTable
CREATE TABLE "_MissionCollaborators" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_MissionCollaborators_AB_unique" ON "_MissionCollaborators"("A", "B");

-- CreateIndex
CREATE INDEX "_MissionCollaborators_B_index" ON "_MissionCollaborators"("B");

-- AddForeignKey
ALTER TABLE "_MissionCollaborators" ADD CONSTRAINT "_MissionCollaborators_A_fkey" FOREIGN KEY ("A") REFERENCES "Mission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MissionCollaborators" ADD CONSTRAINT "_MissionCollaborators_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
