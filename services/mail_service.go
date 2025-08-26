package services

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"log"
	"net/smtp"
	"strconv"
	"strings"
	"time"

	"smtp-mailer/config"

	"github.com/microcosm-cc/bluemonday" // ADDED for HTML stripping
	mail "gopkg.in/gomail.v2"
)

// MailService handles sending emails and logging to DB
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

// SendEmailAndLog now sends emails as HTML and logs a plain text preview.
func (s *MailService) SendEmailAndLog(to string, cc []string, bcc []string, subject, body string) error {
	status := "Failed"
	var err error

	// --- LOGGING ENHANCEMENT ---
	// Create a policy that strips all HTML tags for a clean log preview.
	p := bluemonday.StripTagsPolicy()
	plainTextBody := p.Sanitize(body)
	
	// Truncate the PLAIN TEXT preview for the log.
	bodyPreview := plainTextBody
	if len(bodyPreview) > 200 {
		bodyPreview = bodyPreview[:200] + "..."
	}
	// --- END ENHANCEMENT ---

	// Defer logging the email attempt
	defer func() {
		// The log entry uses the clean, plain-text preview.
		_, dbErr := s.db.Exec(
			"INSERT INTO email_logs (sent_to, subject, body_preview, status, sent_at) VALUES ($1, $2, $3, $4, $5)",
			to, subject, bodyPreview, status, time.Now(),
		)
		if dbErr != nil {
			log.Printf("CRITICAL: Failed to log email attempt to DB: %v", dbErr)
		}
	}()

	// Parse mail hub for host and port
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

	// Create a new message
	m := mail.NewMessage()
	m.SetHeader("From", s.config.AuthUser)
	m.SetHeader("To", to)
	if len(cc) > 0 {
		m.SetHeader("Cc", cc...)
	}
	if len(bcc) > 0 {
		m.SetHeader("Bcc", bcc...)
	}
	m.SetHeader("Subject", subject)

	// --- CRITICAL CHANGE FOR HTML SUPPORT ---
	// Set the body content type to "text/html" instead of "text/plain".
	m.SetBody("text/html", body)
	// --- END CRITICAL CHANGE ---

	// Set up dialer
	d := mail.NewDialer(host, port, s.config.AuthUser, s.config.AuthPass)
	d.TLSConfig = &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: s.config.SkipTLSVerify,
	}

	if s.config.SkipTLSVerify {
		log.Println("WARNING: TLS certificate verification is DISABLED. This is INSECURE and should not be used in production.")
	}

	// Send the email
	if err = d.DialAndSend(m); err != nil {
		status = "Failed"
		return fmt.Errorf("could not send email: %w", err)
	}

	status = "Success"
	return nil
}

// sendEmailNoAuth function remains the same for illustrative purposes.
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