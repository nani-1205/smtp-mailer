package services

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"io" // ADDED: Needed for io.Copy to stream file content
	"log"
	"mime/multipart" // ADDED: Needed to handle file headers from the request
	"net/smtp"
	"regexp"
	"strconv"
	"strings"
	"time"

	"smtp-mailer/config"

	mail "gop.in/gomail.v2"
)

var stripTagsRegex = regexp.MustCompile("<[^>]*>")

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

// SendEmailAndLog now accepts a slice of file headers for attachments.
func (s *MailService) SendEmailAndLog(to string, cc []string, bcc []string, subject, body string, files []*multipart.FileHeader) error {
	status := "Failed"
	var err error

	// Log preview logic remains the same.
	plainTextBody := stripTagsRegex.ReplaceAllString(body, "")
	bodyPreview := plainTextBody
	if len(bodyPreview) > 200 {
		bodyPreview = bodyPreview[:200] + "..."
	}
	
	defer func() {
		_, dbErr := s.db.Exec(
			"INSERT INTO email_logs (sent_to, subject, body_preview, status, sent_at) VALUES ($1, $2, $3, $4, $5)",
			to, subject, bodyPreview, status, time.Now(),
		)
		if dbErr != nil {
			log.Printf("CRITICAL: Failed to log email attempt to DB: %v", dbErr)
		}
	}()

	// SMTP connection logic remains the same.
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
	
	// Create a new message and set headers.
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
	m.SetBody("text/html", body)

	// --- ATTACHMENT HANDLING ---
	// Iterate through the slice of file headers received from the handler.
	for _, f := range files {
		log.Printf("Attaching file: %s (Size: %d bytes)", f.Filename, f.Size)
		
		// Open the uploaded file.
		file, err := f.Open()
		if err != nil {
			log.Printf("Error opening attachment %s: %v", f.Filename, err)
			continue 
		}

		// Use SetCopyFunc for efficient streaming of the file content directly into the email message.
		m.Attach(f.Filename, mail.SetCopyFunc(func(w io.Writer) error {
			_, err := io.Copy(w, file)
			return err
		}))
		
		file.Close()
	}
	// --- END ATTACHMENT HANDLING ---

	// Set up dialer
	d := mail.NewDialer(host, port, s.config.AuthUser, s.config.AuthPass)
	d.TLSConfig = &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: s.config.SkipTLSVerify,
	}

	if s.config.SkipTLSVerify {
		log.Println("WARNING: TLS certificate verification is DISABLED.")
	}
	
	// Send the email
	if err = d.DialAndSend(m); err != nil {
		status = "Failed"
		return fmt.Errorf("could not send email: %w", err)
	}

	status = "Success"
	return nil
}

// ... (sendEmailNoAuth function remains the same)