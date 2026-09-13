-- CreateTable
CREATE TABLE "UserPageLayout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "layout" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPageLayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserPageLayout_userId_pageKey_key" ON "UserPageLayout"("userId", "pageKey");

-- AddForeignKey
ALTER TABLE "UserPageLayout" ADD CONSTRAINT "UserPageLayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
