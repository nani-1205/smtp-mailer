package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"mime/multipart" // Added for file handling
	"net/http"
	"strconv"
	"time"

	"smtp-mailer/config"
	"smtp-mailer/database"
	"smtp-mailer/services"
	"smtp-mailer/utils"
)

// SendMailRequest struct remains the same, as we'll unmarshal it from a form field.
type SendMailRequest struct {
	To      string   `json:"to"`
	CC      []string `json:"cc,omitempty"`
	BCC     []string `json:"bcc,omitempty"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

// SendMailHandler is updated to handle multipart/form-data for file uploads.
func SendMailHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// Set a max size for the form data to prevent abuse (e.g., 10MB total).
		// 10 << 20 is 10 * 2^20, which equals 10MB.
		if err := r.ParseMultipartForm(10 << 20); err != nil {
			errorResponse(w, "Unable to parse form data, file might be too large: "+err.Error(), http.StatusBadRequest)
			return
		}

		// 1. Get the email details from the "data" form field.
		dataField := r.FormValue("data")
		if dataField == "" {
			errorResponse(w, "Missing 'data' field in multipart form.", http.StatusBadRequest)
			return
		}

		// 2. Unmarshal the JSON data string into our struct.
		var req SendMailRequest
		if err := json.Unmarshal([]byte(dataField), &req); err != nil {
			errorResponse(w, "Invalid JSON in 'data' field: "+err.Error(), http.StatusBadRequest)
			return
		}

		// 3. Validate the unmarshaled data.
		if req.To == "" || req.Subject == "" || req.Body == "" {
			errorResponse(w, "Fields 'to', 'subject', and 'body' are required in JSON data.", http.StatusBadRequest)
			return
		}
		
		// 4. Check the daily mail limit (same logic as before).
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
		
		// 5. Get the files from the form.
		// "attachments" is the name of our file input field in the HTML.
		files := r.MultipartForm.File["attachments"]

		// 6. Send the email and log it, now passing the files to the service.
		emailService := services.NewMailService(cfg, db)
		err = emailService.SendEmailAndLog(req.To, req.CC, req.BCC, req.Subject, req.Body, files)

		if err != nil {
			log.Printf("Error sending email to %s: %v", req.To, err)
			errorResponse(w, "Failed to send email: "+err.Error(), http.StatusInternalServerError)
			return
		}

		log.Printf("Email sent successfully to %s with %d attachments.", req.To, len(files))
		successResponse(w, "Email sent successfully", nil)
	}
}

// GetLogsHandler retrieves a list of email logs.
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
				parsedLimit, err := strconv.Atoi(limitStr)
				if err == nil && parsedLimit > 0 {
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
				parsedLimit, err := strconv.Atoi(limitStr)
				if err == nil && parsedLimit > 0 {
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
		successResponse(w, "Email logs retrieved successfully", logs)
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
		successResponse(w, "Daily mail limit status retrieved", data)
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
		successResponse(w, "Email status distribution retrieved", statusCounts)
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
		successResponse(w, "Daily sends over period retrieved", dailySends)
	}
}