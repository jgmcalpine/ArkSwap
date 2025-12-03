-- CreateTable
CREATE TABLE "asp_definitions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "poolAddress" TEXT NOT NULL,
    "isProduction" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "asp_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scanned_blocks" (
    "height" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scanned_blocks_pkey" PRIMARY KEY ("height")
);

-- CreateTable
CREATE TABLE "ark_rounds" (
    "txid" TEXT NOT NULL,
    "aspId" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "inputAmount" BIGINT NOT NULL,
    "outputAmount" BIGINT NOT NULL,
    "vtxoCount" INTEGER NOT NULL,
    "treeDepth" INTEGER,

    CONSTRAINT "ark_rounds_pkey" PRIMARY KEY ("txid")
);

-- CreateTable
CREATE TABLE "ark_transactions" (
    "txid" TEXT NOT NULL,
    "aspId" TEXT NOT NULL,
    "blockHeight" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "amount" BIGINT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "ark_transactions_pkey" PRIMARY KEY ("txid")
);

-- CreateIndex
CREATE INDEX "ark_transactions_aspId_timestamp_idx" ON "ark_transactions"("aspId", "timestamp");

-- CreateIndex
CREATE INDEX "ark_transactions_type_timestamp_idx" ON "ark_transactions"("type", "timestamp");

-- AddForeignKey
ALTER TABLE "ark_rounds" ADD CONSTRAINT "ark_rounds_aspId_fkey" FOREIGN KEY ("aspId") REFERENCES "asp_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ark_transactions" ADD CONSTRAINT "ark_transactions_aspId_fkey" FOREIGN KEY ("aspId") REFERENCES "asp_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
