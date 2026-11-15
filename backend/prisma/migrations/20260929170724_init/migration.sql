-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('STUDENT', 'ISSUER', 'ADMIN');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'STUDENT',
    "institutionName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "issuerUserId" TEXT,
    "originalFileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extractedData" JSONB,
    "reviewedData" JSONB,
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractionMessage" TEXT,
    "status" "CertificateStatus" NOT NULL DEFAULT 'DRAFT',
    "decisionReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "blockchainTxHash" TEXT,
    "blockchainHash" TEXT,
    "blockchainChainId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_publicId_key" ON "Certificate"("publicId");

-- CreateIndex
CREATE INDEX "Certificate_studentId_createdAt_idx" ON "Certificate"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "Certificate_status_submittedAt_idx" ON "Certificate"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "Certificate_issuerUserId_idx" ON "Certificate"("issuerUserId");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_issuerUserId_fkey" FOREIGN KEY ("issuerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
