package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http" // <-- This is what 'ńst' should have been!
	"smtp-mailer/config"
	"smtp-mailer/database"
	"smtp-mailer/services"
	"smtp-mailer/utils"
	// "strings" // <-- REMOVED: Not used in this file
	// "time"    // <-- REMOVED: Not used in this file
)

// SendMailRequest struct for parsing incoming JSON request
type SendMailRequest struct {
	To      string `json:"to"`
	Subject string `json:"subject"`
	Body    string `json:"body"`
}

// SendMailHandler handles the API request to send an email
func SendMailHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { // <-- CORRECTED: Changed 'ńst' to 'http'
		if r.Method != http.MethodPost {
			errorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req SendMailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorResponse(w, "Invalid request payload", http.StatusBadRequest)
			return
		}

		if req.To == "" || req.Subject == "" || req.Body == "" {
			errorResponse(w, "Fields 'to', 'subject', and 'body' are required.", http.StatusBadRequest)
			return
		}

		// Check daily mail limit
		currentCount, err := utils.GetDailyMailCount(db)
		if err != nil {
			log.Printf("Error getting daily mail count: %v", err)
			errorResponse(w, "Internal server error checking mail limit", http.StatusInternalServerError)
			return
		}

		if currentCount >= cfg.DailyMailLimit {
			errorResponse(w, "Daily mail limit exceeded. Try again tomorrow after 12:00 AM.", http.StatusForbidden)
			return
		}

		// Send the email and log it
		emailService := services.NewMailService(cfg, db)
		err = emailService.SendEmailAndLog(req.To, req.Subject, req.Body)

		// Status is handled within SendEmailAndLog's defer, so we just check err here
		if err != nil {
			log.Printf("Error sending email to %s: %v", req.To, err)
			errorResponse(w, "Failed to send email: "+err.Error(), http.StatusInternalServerError)
			return
		}

		log.Printf("Email sent successfully to %s", req.To)
		successResponse(w, "Email sent successfully", nil)
	}
}

// GetLogsHandler retrieves a list of email logs
func GetLogsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { // <-- CORRECTED: Changed 'ńst' to 'http'
		rows, err := db.Query("SELECT id, sent_to, subject, body_preview, status, sent_at FROM email_logs ORDER BY sent_at DESC LIMIT 50")
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

// GetDailyLimitHandler retrieves the current daily mail count and limit
func GetDailyLimitHandler(db *sql.DB, dailyLimit int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { // <-- CORRECTED: Changed 'ńst' to 'http'
		currentCount, err := utils.GetDailyMailCount(db)
		if err != nil {
			log.Printf("Error getting daily mail count for dashboard: %v", err)
			errorResponse(w, "Internal server error getting daily limit", http.StatusInternalServerError)
			return
		}

		data := map[string]interface{}{
			"current_count": currentCount,
			"limit":         dailyLimit,
			"remaining":     dailyLimit - currentCount,
		}
		successResponse(w, "Daily mail limit status retrieved", data)
	}
}