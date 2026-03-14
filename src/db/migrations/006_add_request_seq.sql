-- Ensure request_id is TEXT with values like REQ-YYYY-10001, REQ-YYYY-10002, ...
-- Column name stays exactly: request_id
-- Also creates a sequence request_display_seq for the numeric suffix (10001, 10002, ...).
-- Run with: node src/db/runMigrations.js

------------------------------------------------------------
-- 1) Clean up any old numeric sequence/default on request_id
------------------------------------------------------------

-- Drop any old default on request_id (safe if none exists)
ALTER TABLE requests
  ALTER COLUMN request_id DROP DEFAULT;

-- Drop any old sequence named request_id (from earlier attempts), if present
DROP SEQUENCE IF EXISTS request_id;

------------------------------------------------------------
-- 2) Make sure request_id is TEXT
------------------------------------------------------------

-- If it was already TEXT, this is effectively a no-op; if it was numeric, cast to text.
ALTER TABLE requests
  ALTER COLUMN request_id TYPE TEXT
  USING request_id::text;

------------------------------------------------------------
-- 3) Create the new display sequence for suffix: 10001, 10002, ...
------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS request_display_seq
  START WITH 10001
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

------------------------------------------------------------
-- 4) Normalize ALL existing rows to REQ-YYYY-<seq>
--    We assign a unique running number per row: 10001, 10002, ...
------------------------------------------------------------

WITH numbered AS (
  SELECT
    id,
    (10000 + ROW_NUMBER() OVER (ORDER BY created_at, id))::BIGINT AS seq_num
  FROM requests
)
UPDATE requests r
SET request_id =
  'REQ-' ||
  EXTRACT(YEAR FROM r.created_at)::TEXT ||
  '-' ||
  numbered.seq_num::TEXT
FROM numbered
WHERE r.id = numbered.id;

------------------------------------------------------------
-- 5) Align request_display_seq to continue after the highest suffix
------------------------------------------------------------

-- Extract numeric suffix from current request_id and set sequence to next value.
-- If there are no rows, start from 10001.
SELECT
  setval(
    'request_display_seq',
    COALESCE(
      (
        SELECT MAX( (regexp_replace(request_id, '.*-([0-9]+)$', '\1'))::BIGINT )
        FROM requests
      ) + 1,
      10001
    )
  );
