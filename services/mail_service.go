package services

import (
	"database/sql"
	"fmt"
	"log"
	"net/smtp" // Keep this import for the illustrative sendEmailNoAuth function
	"strconv"
	"strings"
	"time"
	"crypto/tls" // Needed for tls.Config

	"smtp-mailer/config"
	"smtp-mailer/database"

	mail "gopkg.in/gomail.v2" // <-- IMPORTANT: Change this import back to gopkg.in
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

// SendEmailAndLog sends an email and records the attempt in the database.
func (s *MailService) SendEmailAndLog(to, subject, body string) error {
	status := "Failed"
	var err error

	// Shorten body for preview in logs
	bodyPreview := body
	if len(bodyPreview) > 200 {
		bodyPreview = bodyPreview[:200] + "..."
	}

	// Defer logging the email attempt regardless of success or failure
	defer func() {
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
	m.SetHeader("From", s.config.AuthUser) // Default From header
	if s.config.FromLineOverride == "YES" {
		// If FromLineOverride is YES, the "From" header can potentially be modified by the SMTP server
		// Or if we were allowing an API client to specify a "From" address, this is where it would go.
		// For this simple case, we just use AuthUser as the actual sender.
	}
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/plain", body) // Can also be "text/html"

	// Set up dialer
	d := mail.NewDialer(host, port, s.config.AuthUser, s.config.AuthPass)

	// Configure TLS: Always set ServerName for proper certificate validation.
	// Conditionally set InsecureSkipVerify based on config.
	tlsConfig := &tls.Config{
		ServerName: host,
		// InsecureSkipVerify should ONLY be set to true for debugging or specific non-production environments.
		// It makes the connection vulnerable to man-in-the-middle attacks.
		InsecureSkipVerify: s.config.SkipTLSVerify,
	}
	d.TLSConfig = tlsConfig

	if s.config.SkipTLSVerify {
		log.Println("WARNING: TLS certificate verification is DISABLED. This is INSECURE and should not be used in production.")
	}

	if s.config.UseTLS {
		// This flag might indicate implicit TLS (SMTPS, usually port 465).
		// Gomail typically handles implicit TLS if the port is 465 or `d.SSL = true` is set.
		// For typical 587 + STARTTLS, just the TLSConfig above is sufficient.
	}

	if s.config.UseSTARTTLS {
		// gomail enables STARTTLS by default if the server supports it on typical ports (e.g., 587)
		// No specific configuration needed here unless you want to *force* it off or specify a policy.
	}

	// Send the email
	if err = d.DialAndSend(m); err != nil {
		status = "Failed" // Update status for defer function
		return fmt.Errorf("could not send email: %w", err)
	}

	status = "Success" // Update status for defer function
	return nil
}

// This function is illustrative if you needed a simple non-authenticated connection
// It's not used by the main SendEmailAndLog logic.
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