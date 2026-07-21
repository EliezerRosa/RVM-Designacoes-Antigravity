-- Insert closed month_control records for any historical month that has reports but no month_control record
INSERT INTO rm.month_control (congregation_id, reference_year, reference_month, is_open, closed_at)
SELECT DISTINCT 
    r.congregation_id, 
    r.reference_year, 
    r.reference_month, 
    false, 
    now()
FROM rm.monthly_reports r
WHERE r.congregation_id IS NOT NULL
  AND NOT EXISTS (
      SELECT 1 FROM rm.month_control mc 
      WHERE mc.congregation_id = r.congregation_id 
        AND mc.reference_year = r.reference_year 
        AND mc.reference_month = r.reference_month
  );
