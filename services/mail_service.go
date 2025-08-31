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

// SendEmailAndLog now accepts 'to' as a slice of strings and stores the recipient count.
func (s *MailService) SendEmailAndLog(to []string, cc []string, bcc []string, subject, body string) error { // CRITICAL: 'to' changed to []string
	status := "Failed"
	var err error

	plainTextBody := stripTagsRegex.ReplaceAllString(body, "")
	bodyPreview := plainTextBody
	if len(bodyPreview) > 200 {
		bodyPreview = bodyPreview[:200] + "..."
	}
	
	// --- CRITICAL CHANGE: Calculate total recipient count ---
	// This count will be stored in the `recipient_count` column.
	recipientCount := len(to) // Count all 'To' recipients
	recipientCount += len(cc)
	recipientCount += len(bcc)
	// --- END CRITICAL CHANGE ---

	defer func() {
		// Insert ONE row per send action, storing the calculated `recipient_count`.
		// The 'sent_to' column will now store the first 'to' recipient, or a summary.
		// For simplicity, we'll store the first 'to' recipient in the logs.
		logTo := ""
		if len(to) > 0 {
			logTo = to[0]
			if len(to) > 1 || len(cc) > 0 || len(bcc) > 0 {
				logTo += fmt.Sprintf(" (+%d others)", recipientCount-1) // Indicate multiple recipients
			}
		}

		_, dbErr := s.db.Exec(
			"INSERT INTO email_logs (sent_to, subject, body_preview, status, recipient_count, sent_at) VALUES ($1, $2, $3, $4, $5, $6)",
			logTo, subject, bodyPreview, status, recipientCount, time.Now(), // recipient_count is now stored
		)
		if dbErr != nil {
			log.Printf("CRITICAL: Failed to log email attempt to DB: %v", dbErr)
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

	m.SetHeader("To", to...) // CRITICAL: Unpack 'to' slice for gomail
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
func sendEmailNoAuth(host, port, from string, to []string, subject, body string) error { // CRITICAL: 'to' changed to []string
	// NOTE: net/smtp.SendMail expects a []string for 'to', not 'from' or 'auth'.
	// It's usually `func SendMail(addr string, a Auth, from string, to []string, msg []byte) error`
	// The 'from' param in SendMail is the sender address, separate from the 'From' header.
	// So this function would need a bit more refactoring if it were actively used.
	// For simplicity, we'll make its signature match the main one for now, but its body
	// isn't fully adapted for multi-to or cc/bcc without more complex headers.

	// This function is illustrative and not actively used.
	log.Printf("Warning: sendEmailNoAuth called, but it does not fully support multiple recipients as implemented.")
	return fmt.Errorf("sendEmailNoAuth not fully implemented for multiple recipients")
}