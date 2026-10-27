-- KDP weeks now run Sunday to Saturday and are stored by their Sunday.
-- A task filed under Monday 5 October (week 5–11) moves to Sunday 4 October (week 4–10).
UPDATE "KdpTask" SET "week" = "week" - 1 WHERE EXTRACT(DOW FROM "week") = 1;
