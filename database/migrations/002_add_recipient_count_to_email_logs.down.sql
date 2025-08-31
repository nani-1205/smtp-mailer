-- migration down
ALTER TABLE email_logs
DROP COLUMN recipient_count;