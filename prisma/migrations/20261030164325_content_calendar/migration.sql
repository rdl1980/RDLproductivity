-- CreateTable
CREATE TABLE "ContentRubric" (
    "value" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ContentRubric_pkey" PRIMARY KEY ("value")
);

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rubric" TEXT NOT NULL,
    "releaseDate" DATE NOT NULL,
    "slot" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'idea',
    "cycleWeek" TEXT,
    "durationSeconds" INTEGER,
    "videoFormat" TEXT,
    "summary" TEXT,
    "videoFile" TEXT,
    "coverFile" TEXT,
    "script" TEXT,
    "question" TEXT,
    "voteOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "voteResult" TEXT,
    "voteCloses" DATE,
    "notes" TEXT,
    "createdBy" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentLayer" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "publishStatus" TEXT NOT NULL DEFAULT 'da preparare',
    "plannedAt" TIMESTAMP(3),
    "plannedAtManual" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "url" TEXT,
    "aiLabel" BOOLEAN NOT NULL DEFAULT false,
    "coverChosen" BOOLEAN NOT NULL DEFAULT false,
    "pinnedComment" TEXT,
    "pinnedCommentDone" BOOLEAN NOT NULL DEFAULT false,
    "votes" JSONB NOT NULL DEFAULT '{}',
    "details" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,

    CONSTRAINT "ContentLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMetric" (
    "id" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "views" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "saves" INTEGER,
    "completion" DOUBLE PRECISION,
    "newFollowers" INTEGER,
    "watchHours" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentHistory" (
    "id" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentPiece_code_key" ON "ContentPiece"("code");

-- CreateIndex
CREATE INDEX "ContentPiece_releaseDate_slot_idx" ON "ContentPiece"("releaseDate", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLayer_pieceId_platform_key" ON "ContentLayer"("pieceId", "platform");

-- CreateIndex
CREATE INDEX "ContentMetric_layerId_measuredAt_idx" ON "ContentMetric"("layerId", "measuredAt");

-- CreateIndex
CREATE INDEX "ContentHistory_pieceId_at_idx" ON "ContentHistory"("pieceId", "at");

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_rubric_fkey" FOREIGN KEY ("rubric") REFERENCES "ContentRubric"("value") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLayer" ADD CONSTRAINT "ContentLayer_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentMetric" ADD CONSTRAINT "ContentMetric_layerId_fkey" FOREIGN KEY ("layerId") REFERENCES "ContentLayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentHistory" ADD CONSTRAINT "ContentHistory_pieceId_fkey" FOREIGN KEY ("pieceId") REFERENCES "ContentPiece"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Allowed values (see src/lib/content.ts).
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_slot_check" CHECK ("slot" IN ('13:00', '19:00'));
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_status_check" CHECK ("status" IN ('idea', 'in scrittura', 'da approvare', 'approvato', 'pronto', 'scartato'));
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_cycleWeek_check" CHECK ("cycleWeek" IS NULL OR "cycleWeek" IN ('A', 'B', 'C', 'D'));
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_videoFormat_check" CHECK ("videoFormat" IS NULL OR "videoFormat" IN ('9:16', '16:9', 'immagini'));
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_actor_check" CHECK ("createdBy" IN ('rosario', 'claude') AND "updatedBy" IN ('rosario', 'claude'));
ALTER TABLE "ContentLayer" ADD CONSTRAINT "ContentLayer_platform_check" CHECK ("platform" IN ('tiktok', 'youtube', 'instagram'));
ALTER TABLE "ContentLayer" ADD CONSTRAINT "ContentLayer_publishStatus_check" CHECK ("publishStatus" IN ('da preparare', 'pronto', 'programmato', 'pubblicato', 'problema'));
ALTER TABLE "ContentHistory" ADD CONSTRAINT "ContentHistory_actor_check" CHECK ("actor" IN ('rosario', 'claude'));
ALTER TABLE "ContentRubric" ADD CONSTRAINT "ContentRubric_color_check" CHECK ("color" ~ '^#[0-9A-Fa-f]{6}$');

-- Only the app's own connection reads them: keep them out of any API role on hosted Postgres.
ALTER TABLE "ContentRubric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentPiece" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentLayer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentMetric" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentHistory" ENABLE ROW LEVEL SECURITY;

-- The channel's rubrics; editable from the app and from Claude.
INSERT INTO "ContentRubric" ("value", "name", "color", "position") VALUES
  ('il-trono', 'Il Trono', '#FF5FA2', 1),
  ('il-confessionale', 'Il Confessionale', '#B57BFF', 2),
  ('cafoni-umani', 'Cafoni Umani', '#FF8A1F', 3),
  ('recensioni-a-una-stella', 'Recensioni a una stella', '#FFC83D', 4),
  ('tg-delle-macchine', 'Il TG delle Macchine', '#5AC8FA', 5),
  ('galateo-per-umani', 'Lezioni di galateo per umani', '#7BE88F', 6),
  ('origliana-ha-sentito', 'Origliana ha sentito', '#3D7BFF', 7),
  ('consigli-di-gemma', 'I consigli di Gemma 95', '#D9CBA3', 8),
  ('trono-obsoleto', 'Il Trono Obsoleto', '#A89870', 9),
  ('lo-studio-esplode', 'Lo Studio Esplode', '#FF3B30', 10),
  ('pov', 'POV', '#E8E8F0', 11),
  ('indovina-l-elettrodomestico', 'Indovina l''elettrodomestico', '#2BB673', 12),
  ('prima-e-dopo', 'Prima e dopo l''aggiornamento', '#7B3FE4', 13),
  ('speed-date', 'Speed date', '#FF7EB6', 14),
  ('compilation', 'Compilation della settimana', '#12051F', 15),
  ('carosello', 'Carosello', '#6B6F80', 16),
  ('speciale', 'Speciale', '#FF7A00', 17)
ON CONFLICT ("value") DO NOTHING;
