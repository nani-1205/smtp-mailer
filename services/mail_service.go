package services

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"smtp-mailer/config"

	mail "gopkg.in/gomail.v2"
)

// Pre-compile the regular expression for efficiency.
var stripTagsRegex = regexp.MustCompile("<[^>]*>")

type MailService struct {
	config *config.Config
	db     *sql.DB
}

// NewMailService creates a new MailService instance
func NewMailService(cfg *config.Config, db *sql.DB) *MailService {
	return &MailService{
		config: cfg,
		db:     db,
	}
}

// SendEmailAndLog sends emails as HTML and logs a plain text preview.
// It now logs an entry for each recipient (TO, CC, BCC) to align with SES counting.
func (s *MailService) SendEmailAndLog(to string, cc []string, bcc []string, subject, body string) error {
	status := "Failed"
	var err error

	plainTextBody := stripTagsRegex.ReplaceAllString(body, "")
	bodyPreview := plainTextBody
	if len(bodyPreview) > 200 {
		bodyPreview = bodyPreview[:200] + "..."
	}
	
	// --- CRITICAL CHANGE: Calculate total recipient count ---
	// This count will determine how many rows are inserted into the logs.
	recipientCount := 1 // Always at least one for the 'To' recipient
	recipientCount += len(cc)
	recipientCount += len(bcc)
	// --- END CRITICAL CHANGE ---

	defer func() {
		// --- CRITICAL CHANGE: Insert `recipientCount` number of rows ---
		// This makes your app's internal daily mail count (which uses COUNT(*))
		// align with how AWS SES counts recipients.
		for i := 0; i < recipientCount; i++ {
			// We log the primary 'To' recipient for each entry.
			// More granular logging (e.g., individual CC/BCC addresses) would require
			// schema changes or more complex logic here.
			_, dbErr := s.db.Exec(
				"INSERT INTO email_logs (sent_to, subject, body_preview, status, sent_at) VALUES ($1, $2, $3, $4, $5)",
				to, subject, bodyPreview, status, time.Now(),
			)
			if dbErr != nil {
				log.Printf("CRITICAL: Failed to log email attempt to DB for recipient %d/%d: %v", i+1, recipientCount, dbErr)
				// Note: If DB logging is critical, consider more robust error handling
				// (e.g., retry, alert) for actual production systems.
			}
		}
	}()

	parts := strings.Split(s.config.MailHub, ":")
	if len(parts) != 2 {
		err = fmt.Errorf("invalid MAILHUB format: %s. Expected host:port", s.config.MailHub)
		return err
	}
	host := parts[0]
	port, parseErr := strconv.Atoi(parts[1])
	if parseErr != nil {
		err = fmt.Errorf("invalid port in MAILHUB: %v", parseErr)
		return err
	}
	
	m := mail.NewMessage()
	
	if s.config.FromEmail != "" {
		m.SetHeader("From", s.config.FromEmail)
	} else {
		m.SetHeader("From", s.config.AuthUser)
	}

	m.SetHeader("To", to)
	if len(cc) > 0 {
		m.SetHeader("Cc", cc...)
	}
	if len(bcc) > 0 {
		m.SetHeader("Bcc", bcc...)
	}
	m.SetHeader("Subject", subject)
	m.SetBody("text/html", body)

	d := mail.NewDialer(host, port, s.config.AuthUser, s.config.AuthPass)
	d.TLSConfig = &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: s.config.SkipTLSVerify,
	}

	if s.config.SkipTLSVerify {
		log.Println("WARNING: TLS certificate verification is DISABLED.")
	}
	
	if err = d.DialAndSend(m); err != nil {
		status = "Failed"
		return fmt.Errorf("could not send email: %w", err)
	}

	status = "Success"
	return nil
}

// sendEmailNoAuth is an illustrative function not used by the main logic.
func sendEmailNoAuth(host, port, from, to, subject, body string) error {
	msg := []byte("To: " + to + "\r\n" +
		"From: " + from + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"\r\n" +
		body + "\r\n")

	auth := smtp.PlainAuth("", "", "", host) // No authentication
	err := smtp.SendMail(fmt.Sprintf("%s:%s", host, port), auth, from, []string{to}, msg)
	if err != nil {
		return fmt.Errorf("error sending mail (no auth): %w", err)
	}
	return nil
}