-- migration up
ALTER TABLE email_logs
ADD COLUMN recipient_count INTEGER NOT NULL DEFAULT 1;

-- Update existing rows to default recipient_count to 1
-- This ensures old logs (before this feature) are counted as 1 recipient each.
UPDATE email_logs
SET recipient_count = 1;