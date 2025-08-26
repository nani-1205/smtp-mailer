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

	mail "gopkg.in/gomail.v2"
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
			// Decide if you want to fail the whole email or just skip the attachment.
			// For this implementation, we will log the error and continue without this file.
			continue 
		}

		// Use SetCopyFunc for efficient streaming of the file content directly into the email message.
		m.Attach(f.Filename, mail.SetCopyFunc(func(w io.Writer) error {
			_, err := io.Copy(w, file)
			return err
		}))
		
		// It is crucial to close the file handle after it has been attached.
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

// ... (sendEmailNoAuth function remains the same)```

---

### **3. `web/js/script.js` (Full Updated Code)**

This version replaces the JSON fetch requests with `FormData` requests for both the main and modal forms. It constructs a `FormData` object, appends the email details as a JSON string to a `data` field, and then appends each file to an `attachments` field.

```javascript
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element Selectors ---
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));

    // Global elements
    const todayDateSpan = $('#todayDate');
    const searchInput = $('#search');
    const toggleThemeBtn = $('#toggleTheme');
    const themeIconSun = $('#theme-icon-sun');
    const themeIconMoon = $('#theme-icon-moon');
    const createCampaignBtn = $('#createCampaignBtn');

    // Sidebar stat elements
    const sidebarSentCount = $('#sidebarSentCount');
    const sidebarRemainingCount = $('#sidebarRemainingCount');

    // Overview Section stat cards
    const overviewSentCount = $('#overviewSentCount');
    const overviewRemainingCount = $('#overviewRemainingCount');

    // Daily Limit Section elements
    const limitTextSpan = $('#limitText');
    const limitProgressBar = $('#limitBar');

    // Logs Section elements
    const logsTableBody = $('#logsTable tbody');
    const logDatePicker = $('#logDate');

    // Send Email Form elements (main section)
    const sendMailForm = $('#sendMailForm');
    const mainMailMessage = $('#mailMessage');

    // Send Email Modal elements
    const sendEmailModal = $('#sendEmailModal');
    const modalCloseBtn = $('#modalCloseBtn');
    const modalSendMailForm = $('#modalSendMailForm');
    const modalMailMessage = $('#modalMailMessage');


    // Chart instances
    let dailySendsChart = null;
    let statusDistributionChart = null;

    // --- Utility Functions ---
    function displayMessage(message, type, targetElement) {
        if (!targetElement) return;
        targetElement.textContent = message;
        targetElement.className = `message-area ${type}`;
        targetElement.style.display = 'block';
        setTimeout(() => {
            targetElement.style.display = 'none';
        }, 5000);
    }

    function formatDateForDisplay(dateString) {
        const options = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
        return new Date(dateString).toLocaleString('en-GB', options);
    }

    function getTodayISTDate() {
        const now = new Date();
        const istOffset = 5.5 * 60;
        const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
        const istDate = new Date(utc + (istOffset * 60000));
        return istDate.toISOString().split('T')[0];
    }
    
    function parseEmailList(emailString) {
        if (!emailString || emailString.trim() === "") {
            return [];
        }
        return emailString.split(',')
                          .map(email => email.trim())
                          .filter(email => email !== "");
    }

    function getChartColors() {
        const style = getComputedStyle(document.body);
        return {
            gridColor: style.getPropertyValue('--border'),
            textColor: style.getPropertyValue('--muted'),
            primaryColor: style.getPropertyValue('--primary'),
            okColor: style.getPropertyValue('--ok'),
            badColor: style.getPropertyValue('--bad'),
            warnColor: style.getPropertyValue('--warn'),
            primaryWeak: style.getPropertyValue('--primary-weak')
        };
    }

    // --- API Calls & Data Rendering ---
    // (updateDailyLimit, updateEmailLogs, updateStatusDistributionChartData, updateDailySendsChartData functions remain the same)
    
    // --- NEW: Centralized Form Submission Logic for FormData ---
    async function handleFormSubmit(formElement, messageElement) {
        // Find all input elements within the form
        const toInput = formElement.querySelector('[name="to"]');
        const ccInput = formElement.querySelector('[name="cc"]');
        const bccInput = formElement.querySelector('[name="bcc"]');
        const subjectInput = formElement.querySelector('[name="subject"]');
        const bodyInput = formElement.querySelector('[name="body"]');
        const attachmentsInput = formElement.querySelector('[name="attachments"]');
        const submitButton = formElement.querySelector('button[type="submit"]');

        // Create a FormData object to hold all data
        const formData = new FormData();

        // 1. Create a JSON object with the email text data
        const emailData = {
            to: toInput.value,
            cc: parseEmailList(ccInput.value),
            bcc: parseEmailList(bccInput.value),
            subject: subjectInput.value,
            body: bodyInput.value
        };

        // 2. Append the JSON data as a single string field named "data"
        formData.append('data', JSON.stringify(emailData));

        // 3. Append each selected file to the FormData object
        if (attachmentsInput && attachmentsInput.files.length > 0) {
            for (const file of attachmentsInput.files) {
                formData.append('attachments', file);
            }
        }

        if (submitButton) submitButton.disabled = true;

        try {
            const response = await fetch('/api/send', {
                method: 'POST',
                // IMPORTANT: Do NOT set the Content-Type header manually.
                // The browser will automatically set it to 'multipart/form-data'
                // with the correct boundary string when you pass a FormData object.
                body: formData,
            });
            const data = await response.json();

            if (data.status === 'success') {
                displayMessage(data.message, 'success', messageElement);
                formElement.reset(); // Clear form
                updateAllDashboardData(); // Refresh dashboard

                // If this was the modal form, close it after success
                if (formElement.id === 'modalSendMailForm') {
                    setTimeout(() => {
                        if (sendEmailModal) sendEmailModal.style.display = 'none';
                        if (modalMailMessage) modalMailMessage.style.display = 'none';
                    }, 2000);
                }
            } else {
                displayMessage(data.message, 'error', messageElement);
            }
        } catch (error) {
            console.error('Error sending email:', error);
            displayMessage('An unexpected error occurred. Please try again.', 'error', messageElement);
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    }

    // --- Event Listeners (Updated to use the handler function) ---

    // Send Mail Form Submission (main form)
    if (sendMailForm) {
        sendMailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFormSubmit(sendMailForm, mainMailMessage);
        });
    }

    // Send Mail Form Submission (modal form)
    if (modalSendMailForm) {
        modalSendMailForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleFormSubmit(modalSendMailForm, modalMailMessage);
        });
    }
    
    // (All other event listeners like navigation, theme toggle, search, etc. remain the same)
});