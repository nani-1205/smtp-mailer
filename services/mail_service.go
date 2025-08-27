package services

import (
	"crypto/tls"
	"database/sql"
	"fmt"
	"io"             // ADDED: Required for copying file data
	"log"
	"mime/multipart" // ADDED: Required for the FileHeader type
	"regexp"
	"strconv"
	"strings"
	"time"

	"smtp-mailer/config"

	mail "gopkg.in/gomail.v2"
)

var stripTagsRegex = regexp.MustCompile("<[^>]*>")

type MailService struct {
	config *config.Config
	db     *sql.DB
}

func NewMailService(cfg *config.Config, db *sql.DB) *MailService {
	return &MailService{
		config: cfg,
		db:     db,
	}
}

// SendEmailAndLog now accepts a slice of *multipart.FileHeader for attachments.
func (s *MailService) SendEmailAndLog(to string, cc []string, bcc []string, subject, body string, files []*multipart.FileHeader) error {
	status := "Failed"
	var err error

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

	parts := strings.Split(s.config.MailHub, ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid MAILHUB format: %s. Expected host:port", s.config.MailHub)
	}
	host := parts[0]
	port, _ := strconv.Atoi(parts[1])
	
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

	// --- ATTACHMENT LOGIC ---
	for _, f := range files {
		log.Printf("Attaching file: %s (%d bytes)", f.Filename, f.Size)
		
		file, err := f.Open()
		if err != nil {
			log.Printf("Error opening attached file %s: %v", f.Filename, err)
			return err
		}
		
		m.Attach(f.Filename, mail.SetCopyFunc(func(w io.Writer) error {
			_, err := io.Copy(w, file)
			return err
		}))

		file.Close()
	}
	// --- END ATTACHMENT LOGIC ---

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