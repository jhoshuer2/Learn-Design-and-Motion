-- CreateTable
CREATE TABLE "BlockView" (
    "userId" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlockView_pkey" PRIMARY KEY ("userId","lessonId","blockIndex")
);
