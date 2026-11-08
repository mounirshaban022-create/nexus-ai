-- ==================================================================
-- NEXUS production schema (Supabase Postgres) — FULL, IDEMPOTENT
-- Auto-generated from prisma/schema.prisma (2026-11-08).
-- Safe to re-run: tables/indexes use IF NOT EXISTS, missing columns are
-- added with ADD COLUMN IF NOT EXISTS, constraint "already exists"
-- errors are treated as benign skips by /api/admin/migrate.
-- ==================================================================

CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatSession" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New conversation',
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "agentSlug" TEXT,
    "agentPinned" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "thinking" TEXT,
    "toolName" TEXT,
    "toolData" TEXT,
    "attachments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GeneratedImage" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'nexus',
    "data" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "filename" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'txt',
    "size" INTEGER NOT NULL DEFAULT 0,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "filename" TEXT NOT NULL;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "title" TEXT NOT NULL;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "format" TEXT NOT NULL DEFAULT 'txt';
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "size" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "chunkCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "error" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE IF NOT EXISTS "KnowledgeChunk" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "KnowledgeChunk_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "docId" TEXT NOT NULL;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "idx" INTEGER NOT NULL;
ALTER TABLE "KnowledgeChunk" ADD COLUMN IF NOT EXISTS "content" TEXT NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "GeneratedVideo" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "scenes" INTEGER NOT NULL DEFAULT 4,
    "voice" TEXT NOT NULL DEFAULT 'en-US-AriaNeural',
    "style" TEXT NOT NULL DEFAULT 'cinematic',
    "url" TEXT,
    "jobId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "error" TEXT,
    "data" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedVideo_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GeneratedVideo" ADD COLUMN IF NOT EXISTS "error" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "GeneratedDocument" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'docx',
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "downloadUrl" TEXT NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "data" TEXT,
    "mimeType" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedDocument_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "data" TEXT;
ALTER TABLE "GeneratedDocument" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "interests" TEXT NOT NULL DEFAULT '[]',
    "commStyle" TEXT NOT NULL DEFAULT 'balanced',
    "avatarUrl" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "timezone" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "jobTitle" TEXT,
    "website" TEXT,
    "notifications" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "EmailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fromName" TEXT NOT NULL DEFAULT '',
    "imapHost" TEXT NOT NULL,
    "imapPort" INTEGER NOT NULL DEFAULT 993,
    "smtpHost" TEXT NOT NULL,
    "smtpPort" INTEGER NOT NULL DEFAULT 465,
    "smtpSecure" BOOLEAN NOT NULL DEFAULT true,
    "username" TEXT NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "statusMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "EmailAccount" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AiProvider" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "providerId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiKeyEnc" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "defaultModel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unverified',
    "statusMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiProvider_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "AiProvider" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "UserMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceSessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'amber',
    "customInstructions" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProjectFile" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'text/plain',
    "size" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "WhatsAppAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "label" TEXT NOT NULL DEFAULT 'WhatsApp Business',
    "businessName" TEXT NOT NULL DEFAULT 'NEXUS Assistant',
    "phoneNumberId" TEXT NOT NULL,
    "displayPhone" TEXT NOT NULL DEFAULT '',
    "accessTokenEnc" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusMessage" TEXT NOT NULL DEFAULT '',
    "autoReply" BOOLEAN NOT NULL DEFAULT true,
    "agentPrompt" TEXT NOT NULL DEFAULT '',
    "allowList" TEXT NOT NULL DEFAULT '[]',
    "webhookVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppAccount_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "WhatsAppAccount" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "AppConfig" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppConfig_pkey" PRIMARY KEY ("key")
);
ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "key" TEXT NOT NULL;
ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "value" TEXT NOT NULL;
ALTER TABLE "AppConfig" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "WhatsAppMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fromNumber" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "waMessageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "platform" TEXT NOT NULL,
    "displayName" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "accessTokenEnc" TEXT NOT NULL DEFAULT '',
    "meta" TEXT NOT NULL DEFAULT '{}',
    "autopilot" BOOLEAN NOT NULL DEFAULT false,
    "autopilotTopic" TEXT NOT NULL DEFAULT '',
    "autopilotCadenceMinutes" INTEGER NOT NULL DEFAULT 1440,
    "lastAutoPostAt" TIMESTAMP(3),
    "pageNiche" TEXT NOT NULL DEFAULT '',
    "pageAudience" TEXT NOT NULL DEFAULT '',
    "pageTone" TEXT NOT NULL DEFAULT '',
    "pageGoal" TEXT NOT NULL DEFAULT '',
    "pageLanguage" TEXT NOT NULL DEFAULT '',
    "pageStrategy" TEXT NOT NULL DEFAULT '',
    "trendBrain" TEXT NOT NULL DEFAULT '',
    "trendAt" TIMESTAMP(3),
    "autoReply" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "statusMessage" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "displayName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "externalId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "accessTokenEnc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "meta" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "autopilot" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "autopilotTopic" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "autopilotCadenceMinutes" INTEGER NOT NULL DEFAULT 1440;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastAutoPostAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageNiche" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageAudience" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageTone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageGoal" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageLanguage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "pageStrategy" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "trendBrain" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "trendAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "autoReply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "statusMessage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "mediaUrls" TEXT NOT NULL DEFAULT '[]',
    "mediaKind" TEXT NOT NULL DEFAULT 'image',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "scheduledFor" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "result" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "accountId" TEXT NOT NULL;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "caption" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "mediaUrls" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "mediaKind" TEXT NOT NULL DEFAULT 'image';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "scheduledFor" TIMESTAMP(3);
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "publishedAt" TIMESTAMP(3);
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "result" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "externalId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "error" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SocialPost" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialActivity_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialActivity" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "SocialActivity" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SocialActivity" ADD COLUMN IF NOT EXISTS "accountId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialActivity" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL;
ALTER TABLE "SocialActivity" ADD COLUMN IF NOT EXISTS "message" TEXT NOT NULL;
ALTER TABLE "SocialActivity" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE IF NOT EXISTS "SocialComment" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "author" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL DEFAULT 'neutral',
    "aiReply" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "replyNote" TEXT NOT NULL DEFAULT '',
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialComment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "id" TEXT NOT NULL;
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "accountId" TEXT NOT NULL;
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "platform" TEXT NOT NULL;
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "author" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "text" TEXT NOT NULL;
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "sentiment" TEXT NOT NULL DEFAULT 'neutral';
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "aiReply" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "replyNote" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3);
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SocialComment" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeDoc_userId_createdAt_idx" ON "KnowledgeDoc"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KnowledgeChunk_docId_idx_idx" ON "KnowledgeChunk"("docId", "idx");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedVideo_jobId_key" ON "GeneratedVideo"("jobId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GeneratedDocument_userId_createdAt_idx" ON "GeneratedDocument"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "EmailAccount_userId_createdAt_idx" ON "EmailAccount"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AiProvider_userId_createdAt_idx" ON "AiProvider"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "AiProvider_providerId_userId_key" ON "AiProvider"("providerId", "userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "UserMemory_userId_createdAt_idx" ON "UserMemory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Project_userId_updatedAt_idx" ON "Project"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ProjectFile_projectId_createdAt_idx" ON "ProjectFile"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppAccount_userId_createdAt_idx" ON "WhatsAppAccount"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppAccount_createdAt_idx" ON "WhatsAppAccount"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_accountId_createdAt_idx" ON "WhatsAppMessage"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "WhatsAppMessage_fromNumber_createdAt_idx" ON "WhatsAppMessage"("fromNumber", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "WhatsAppMessage_waMessageId_direction_key" ON "WhatsAppMessage"("waMessageId", "direction");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_userId_createdAt_idx" ON "SocialAccount"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialAccount_autopilot_lastAutoPostAt_idx" ON "SocialAccount"("autopilot", "lastAutoPostAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_userId_createdAt_idx" ON "SocialPost"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_accountId_status_idx" ON "SocialPost"("accountId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialPost_status_scheduledFor_idx" ON "SocialPost"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialActivity_userId_createdAt_idx" ON "SocialActivity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialComment_accountId_status_idx" ON "SocialComment"("accountId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SocialComment_userId_createdAt_idx" ON "SocialComment"("userId", "createdAt");

