-- Query events between 6 PM and 10 PM CST (which is UTC-6 during standard time)
-- Convert CST to UTC: 6 PM CST = 12 AM UTC next day, 10 PM CST = 4 AM UTC next day
-- Today is 10/11/2025 (based on your screenshot showing 10/11/2025, 10:09:52 PM)

SELECT 
  ts AT TIME ZONE 'America/Chicago' as local_time,
  type,
  url,
  dwell_ms,
  title
FROM events
WHERE user_id = '444fb749-c6d0-4d35-85b1-0e2cc247dc94'
  AND ts AT TIME ZONE 'America/Chicago' >= '2025-10-11 18:00:00'::timestamp
  AND ts AT TIME ZONE 'America/Chicago' < '2025-10-11 22:00:00'::timestamp
ORDER BY ts ASC
LIMIT 100;
