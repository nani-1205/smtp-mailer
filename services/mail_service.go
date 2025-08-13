package services

import (
	"database/sql"
	"fmt"
	"log"
	"net/smtp" // Keep for sendEmailNoAuth
	"strconv"
	"strings"
	"time"
	"crypto/tls"

	"smtp-mailer/config"
	// "smtp-mailer/database" // <-- REMOVE THIS LINE, IT'S NOT USED DIRECTLY HERE

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
		// Note: database.EmailLog struct is defined in database/models.go but the
		// INSERT query here uses generic SQL string. The `database` package itself
		// is imported by main.go (for InitDB) and handlers/api_handlers.go (for EmailLog struct).
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
	if s.config.FromLineOverride == "YES" {
		// ... (logic remains same)
	}
	m.SetHeader("To", to)
	m.SetHeader("Subject", subject)
	m.SetBody("text/plain", body)

	// Set up dialer
	d := mail.NewDialer(host, port, s.config.AuthUser, s.config.AuthPass)

	// Configure TLS
	tlsConfig := &tls.Config{
		ServerName: host,
		InsecureSkipVerify: s.config.SkipTLSVerify,
	}
	d.TLSConfig = tlsConfig

	if s.config.SkipTLSVerify {
		log.Println("WARNING: TLS certificate verification is DISABLED. This is INSECURE and should not be used in production.")
	}

	if s.config.UseTLS {
		// ... (comments remain same)
	}

	if s.config.UseSTARTTLS {
		// ... (comments remain same)
	}

	// Send the email
	if err = d.DialAndSend(m); err != nil {
		status = "Failed"
		return fmt.Errorf("could not send email: %w", err)
	}

	status = "Success"
	return nil
}

// sendEmailNoAuth function remains same
func sendEmailNoAuth(host, port, from, to, subject, body string) error {
	msg := []byte("To: " + to + "\r\n" +
		"From: " + from + "\r\n" +
		"Subject: " + subject + "\r\n" +
		"\r\n" +
		body + "\r\n")

	auth := smtp.PlainAuth("", "", "", host)
	err := smtp.SendMail(fmt.Sprintf("%s:%s", host, port), auth, from, []string{to}, msg)
	if err != nil {
		return fmt.Errorf("error sending mail (no auth): %w", err)
	}
	return nil
}