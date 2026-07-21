-- Add tracking dates for removal and readmission
ALTER TABLE rm.publishers ADD COLUMN deactivated_at date;
ALTER TABLE rm.publishers ADD COLUMN readmitted_at date;

-- For existing removed publishers, use updated_at as a fallback for deactivated_at
UPDATE rm.publishers 
SET deactivated_at = updated_at::date 
WHERE is_congregated = false AND deactivated_at IS NULL;

-- Trigger function to automatically set deactivated_at and readmitted_at when is_congregated changes
CREATE OR REPLACE FUNCTION rm.trg_set_deactivation_dates()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_congregated = true AND NEW.is_congregated = false THEN
        NEW.deactivated_at = CURRENT_DATE;
    ELSIF OLD.is_congregated = false AND NEW.is_congregated = true THEN
        NEW.readmitted_at = CURRENT_DATE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_publishers_deactivation_dates
    BEFORE UPDATE OF is_congregated ON rm.publishers
    FOR EACH ROW
    EXECUTE FUNCTION rm.trg_set_deactivation_dates();
