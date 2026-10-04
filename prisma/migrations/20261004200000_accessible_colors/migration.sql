-- Board and label colors updated for WCAG AA text contrast.
UPDATE "Board" SET "color" = CASE "color"
  WHEN '#d29034' THEN '#9b6b26'
  WHEN '#519839' THEN '#468331'
  WHEN '#cd5a91' THEN '#b85183'
  WHEN '#4bbf6b' THEN '#34844a'
  WHEN '#00aecc' THEN '#007f95'
  WHEN '#838c91' THEN '#6e767a'
  ELSE "color"
END;

UPDATE "Label" SET "color" = '#c9372c' WHERE "color" = '#eb5a46';
