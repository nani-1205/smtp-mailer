package handlers

import (
	"database/sql"
	"encoding/json"   // Used by errorResponse and successResponse
	"log"
	"mime/multipart" // Used by r.ParseMultipartForm and r.MultipartForm.File
	"net/http"
	"strconv"
	"time"

	"smtp-mailer/config"
	"smtp-mailer/database"
	"smtp-mailer/services"
	"smtp-mailer/utils"
)

// SendMailRequest struct for JSON handling (used by other handlers, and good for consistency)
type SendMailRequest struct {
	To      string   `json:"to"`
	CC      []string `json:"cc,omitempty"`
	BCC     []string `json:"bcc,omitempty"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

// SendMailHandler is correctly written to handle multipart/form-data requests.
func SendMailHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Use mime/multipart.ParseMultipartForm to parse the incoming request.
		// This is the explicit usage of "mime/multipart".
		if err := r.ParseMultipartForm(10 << 20); err != nil { // 10 MB limit
			errorResponse(w, "Unable to parse form. Check file size (limit 10MB).", http.StatusBadRequest)
			return
		}

		// Read text fields from the parsed form.
		to := r.FormValue("to")
		subject := r.FormValue("subject")
		body := r.FormValue("body")
		
		// Read potentially multiple values for CC and BCC.
		cc := r.Form["cc"]
		bcc := r.Form["bcc"]

		if to == "" || subject == "" || body == "" {
			errorResponse(w, "Fields 'to', 'subject', and 'body' are required.", http.StatusBadRequest)
			return
		}

		// Get file headers from the form. This also uses "mime/multipart".
		files := r.MultipartForm.File["attachments"]

		// Check daily mail limit.
		currentCount, err := utils.GetDailyMailCount(db)
		if err != nil {
			log.Printf("Error getting daily mail count: %v", err)
			errorResponse(w, "Internal server error checking mail limit", http.StatusInternalServerError)
			return
		}

		if currentCount >= cfg.DailyMailLimit {
			errorResponse(w, "Daily mail limit exceeded.", http.StatusForbidden)
			return
		}

		// Call the email service, passing the files.
		emailService := services.NewMailService(cfg, db)
		err = emailService.SendEmailAndLog(to, cc, bcc, subject, body, files)

		if err != nil {
			log.Printf("Error sending email to %s: %v", to, err)
			errorResponse(w, "Failed to send email: "+err.Error(), http.StatusInternalServerError)
			return
		}

		log.Printf("Email sent successfully to %s with %d attachments", to, len(files))
		// successResponse implicitly uses "encoding/json".
		successResponse(w, "Email sent successfully", nil)
	}
}

// GetLogsHandler remains the same.
func GetLogsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		queryDateStr := r.URL.Query().Get("date")
		limitStr := r.URL.Query().Get("limit")
		var query string
		var args []interface{}
		baseQuery := "SELECT id, sent_to, subject, body_preview, status, sent_at FROM email_logs"
		orderBy := "ORDER BY sent_at DESC"
		defaultLimit := 50
		if queryDateStr != "" {
			_, err := time.Parse("2006-01-02", queryDateStr)
			if err != nil {
				errorResponse(w, "Invalid date format. Use YYYY-MM-DD.", http.StatusBadRequest)
				return
			}
			query = baseQuery + " WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date " + orderBy
			args = append(args, queryDateStr)
			if limitStr != "" {
				if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
					query += " LIMIT $" + strconv.Itoa(len(args)+1)
					args = append(args, parsedLimit)
				}
			} else {
				query += " LIMIT $" + strconv.Itoa(len(args)+1)
					args = append(args, defaultLimit)
			}
		} else {
			todayIST := time.Now().In(time.FixedZone("IST", 5*3600+30*60)).Format("2006-01-02")
			query = baseQuery + " WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date " + orderBy
			args = append(args, todayIST)
			currentDayLimit := 5
			if limitStr != "" {
				if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
					currentDayLimit = parsedLimit
				}
			}
			query += " LIMIT $" + strconv.Itoa(len(args)+1)
			args = append(args, currentDayLimit)
		}
		rows, err := db.Query(query, args...)
		if err != nil {
			log.Printf("Error querying email logs: %v", err)
			errorResponse(w, "Internal server error fetching logs", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		var logs []database.EmailLog
		for rows.Next() {
			var logEntry database.EmailLog
			if err := rows.Scan(&logEntry.ID, &logEntry.SentTo, &logEntry.Subject, &logEntry.BodyPreview, &logEntry.Status, &logEntry.SentAt); err != nil {
				log.Printf("Error scanning email log row: %v", err)
				continue
			}
			logs = append(logs, logEntry)
		}
		if err = rows.Err(); err != nil {
			log.Printf("Error iterating over email logs rows: %v", err)
			errorResponse(w, "Internal server error fetching logs", http.StatusInternalServerError)
			return
		}
		successResponse(w, "Email logs retrieved successfully", logs) // Uses encoding/json
	}
}

// GetDailyLimitHandler remains the same.
func GetDailyLimitHandler(db *sql.DB, dailyLimit int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		currentCount, err := utils.GetDailyMailCount(db)
		if err != nil {
			errorResponse(w, "Internal server error getting daily limit", http.StatusInternalServerError)
			return
		}
		data := map[string]interface{}{"current_count": currentCount, "limit": dailyLimit, "remaining": dailyLimit - currentCount}
		successResponse(w, "Daily mail limit status retrieved", data) // Uses encoding/json
	}
}

// GetEmailStatsHandler remains the same.
func GetEmailStatsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		statusCounts, err := utils.GetEmailStatusDistribution(db)
		if err != nil {
			errorResponse(w, "Internal server error fetching email stats", http.StatusInternalServerError)
			return
		}
		successResponse(w, "Email status distribution retrieved", statusCounts) // Uses encoding/json
	}
}

// GetDailySendsHandler remains the same.
func GetDailySendsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		daysStr := r.URL.Query().Get("days")
		days := 7
		if daysStr != "" {
			if parsedDays, err := strconv.Atoi(daysStr); err == nil && parsedDays > 0 {
				days = parsedDays
			}
		}
		dailySends, err := utils.GetDailySendsOverPeriod(db, days)
		if err != nil {
			errorResponse(w, "Internal server error fetching daily sends", http.StatusInternalServerError)
			return
		}
		successResponse(w, "Daily sends over period retrieved", dailySends) // Uses encoding/json
	}
}