-- Rubrics (and through them their pieces) belong to a calendar: Robotti & Robotte or the writer profile.
ALTER TABLE "ContentRubric" ADD COLUMN "project" TEXT NOT NULL DEFAULT 'robotti';
ALTER TABLE "ContentRubric" ADD CONSTRAINT "ContentRubric_project_check" CHECK ("project" IN ('robotti', 'scrittore'));
CREATE INDEX "ContentRubric_project_idx" ON "ContentRubric"("project");

-- The writer profile publishes at 18:00.
ALTER TABLE "ContentPiece" DROP CONSTRAINT "ContentPiece_slot_check";
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_slot_check" CHECK ("slot" IN ('13:00', '18:00', '19:00'));

INSERT INTO "ContentRubric" ("value", "project", "name", "color", "position") VALUES
  ('notizia-ai-dal-loop', 'scrittore', 'Notizia AI dal Loop', '#2F80ED', 101),
  ('la-parola-della-settimana', 'scrittore', 'La parola della settimana', '#9B51E0', 102),
  ('l-intervista', 'scrittore', 'L''intervista', '#EB5757', 103),
  ('dal-mio-libro', 'scrittore', 'Dal mio libro', '#F2994A', 104),
  ('il-libro-dal-passato', 'scrittore', 'Il libro dal passato', '#8D6E63', 105),
  ('l-immagine-della-settimana', 'scrittore', 'L''immagine della settimana', '#27AE60', 106),
  ('dietro-le-quinte', 'scrittore', 'Dietro le quinte', '#56CCF2', 107)
ON CONFLICT ("value") DO NOTHING;
