-- Fractional-indexing keys must sort by byte value; locale collations such as
-- en_US.UTF-8 would order "a0" before "Zz". Prisma cannot express column
-- collations, so they are set here.
ALTER TABLE "Board" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "List" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "Card" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "Checklist" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
ALTER TABLE "ChecklistItem" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
