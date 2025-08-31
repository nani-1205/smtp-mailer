package database

import "time"

// EmailLog represents a row in the email_logs table
type EmailLog struct {
	ID            int       `json:"id"`
	SentTo        string    `json:"sent_to"`
	Subject       string    `json:"subject"`
	BodyPreview   string    `json:"body_preview"` // Storing a preview of the body
	Status        string    `json:"status"`       // "Success", "Failed"
	SentAt        time.Time `json:"sent_at"`
	RecipientCount int       `json:"recipient_count"` // Count of TO + CC + BCC recipients
}