CREATE TABLE IF NOT EXISTS email_logs (
    id SERIAL PRIMARY KEY,
    sent_to TEXT NOT NULL,
    subject TEXT,
    body_preview TEXT,
    status TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs (sent_at);