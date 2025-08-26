package services

import (
	"crypto/tls"
	"database/sql"
	"encoding/json" // ADDED: To unmarshal JSON from the request
	"fmt"
	"io"
	"log"
	"mime/multipart" // ADDED: To handle the request directly
	"net/http"       // ADDED: To accept the http.Request object
	"regexp"
	"strconv"
	"strings"
	"time"

	"smtp-mailer/config"

	mail "gopkg.in/gomail.v2"
)

// SendMailRequest struct is now internal to the service package
type sendMailRequestData struct {
	To      string   `json:"to"`
	CC      []string `json:"cc,omitempty"`
	BCC     []string `json:"bcc,omitempty"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

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

// SendEmailAndLog now accepts the entire http.Request and handles parsing internally.
func (s *MailService) SendEmailAndLog(r *http.Request) error {
	status := "Failed"
	var err error

	// 1. Parse the multipart form from the request.
	// This logic is moved from the handler to the service.
	if err := r.ParseMultipartForm(10 << 20); err != nil {
		return fmt.Errorf("unable to parse form data, file might be too large: %w", err)
	}

	// 2. Get and unmarshal the JSON data from the "data" form field.
	dataField := r.FormValue("data")
	if dataField == "" {
		return fmt.Errorf("missing 'data' field in multipart form")
	}
	var reqData sendMailRequestData
	if err := json.Unmarshal([]byte(dataField), &reqData); err != nil {
		return fmt.Errorf("invalid JSON in 'data' field: %w", err)
	}

	// 3. Get the files from the form.
	files := r.MultipartForm.File["attachments"]

	// --- LOGGING AND DEFER SETUP ---
	// Create a clean log preview.
	plainTextBody := stripTagsRegex.ReplaceAllString(reqData.Body, "")
	bodyPreview := plainTextBody
	if len(bodyPreview) > 200 {
		bodyPreview = bodyPreview[:200] + "..."
	}
	
	defer func() {
		_, dbErr := s.db.Exec(
			"INSERT INTO email_logs (sent_to, subject, body_preview, status, sent_at) VALUES ($1, $2, $3, $4, $5)",
			reqData.To, reqData.Subject, bodyPreview, status, time.Now(),
		)
		if dbErr != nil {
			log.Printf("CRITICAL: Failed to log email attempt to DB: %v", dbErr)
		}
	}()

	// --- EMAIL CONSTRUCTION ---
	parts := strings.Split(s.config.MailHub, ":")
	if len(parts) != 2 {
		return fmt.Errorf("invalid MAILHUB format: %s. Expected host:port", s.config.MailHub)
	}
	host, portStr := parts[0], parts[1]
	port, _ := strconv.Atoi(portStr)

	m := mail.NewMessage()
	m.SetHeader("From", s.config.AuthUser)
	m.SetHeader("To", reqData.To)
	if len(reqData.CC) > 0 {
		m.SetHeader("Cc", reqData.CC...)
	}
	if len(reqData.BCC) > 0 {
		m.SetHeader("Bcc", reqData.BCC...)
	}
	m.SetHeader("Subject", reqData.Subject)
	m.SetBody("text/html", reqData.Body)

	// Attach files.
	for _, f := range files {
		log.Printf("Attaching file: %s", f.Filename)
		file, err := f.Open()
		if err != nil {
			log.Printf("Warning: could not open attachment %s: %v. Skipping file.", f.Filename, err)
			continue
		}
		m.Attach(f.Filename, mail.SetCopyFunc(func(w io.Writer) error {
			_, err := io.Copy(w, file)
			return err
		}))
		file.Close()
	}

	// --- DIAL AND SEND ---
	d := mail.NewDialer(host, port, s.config.AuthUser, s.config.AuthPass)
	d.TLSConfig = &tls.Config{
		ServerName:         host,
		InsecureSkipVerify: s.config.SkipTLSVerify,
	}

	if s.config.SkipTLSVerify {
		log.Println("WARNING: TLS certificate verification is DISABLED.")
	}
	
	if err = d.DialAndSend(m); err != nil {
		status = "Failed" // This will be caught by the defer function
		return fmt.Errorf("could not send email: %w", err)
	}

	status = "Success" // This will be caught by the defer function
	log.Printf("Email sent successfully to %s with %d attachments.", reqData.To, len(files))
	return nil
}