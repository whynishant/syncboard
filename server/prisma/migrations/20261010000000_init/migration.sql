CREATE TABLE "Room" (
  "id" TEXT NOT NULL, "code" VARCHAR(16) NOT NULL, "name" VARCHAR(120) NOT NULL DEFAULT 'Untitled board',
  "readOnly" BOOLEAN NOT NULL DEFAULT false, "snapshot" JSONB NOT NULL DEFAULT '{}', "revision" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Room_code_key" ON "Room"("code");
CREATE TABLE "BoardOperation" (
  "id" TEXT NOT NULL, "roomId" TEXT NOT NULL, "objectId" TEXT NOT NULL, "kind" VARCHAR(16) NOT NULL,
  "version" INTEGER NOT NULL, "payload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardOperation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BoardOperation_roomId_id_key" ON "BoardOperation"("roomId", "id");
CREATE INDEX "BoardOperation_roomId_createdAt_idx" ON "BoardOperation"("roomId", "createdAt");
ALTER TABLE "BoardOperation" ADD CONSTRAINT "BoardOperation_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
