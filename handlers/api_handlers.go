package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings" // ADDED: For strings.Split
	"time"

	"smtp-mailer/config"
	"smtp-mailer/database"
	"smtp-mailer/services"
	"smtp-mailer/utils"
)

// SendMailRequest struct for parsing the JSON payload.
// This is used by GetLogs and other handlers, not directly by the current SendMailHandler.
type SendMailRequest struct {
	To      string   `json:"to"`
	CC      []string `json:"cc,omitempty"`
	BCC     []string `json:"bcc,omitempty"`
	Subject string   `json:"subject"`
	Body    string   `json:"body"`
}

// SendMailHandler is updated to parse 'to' field as comma-separated recipients.
func SendMailHandler(db *sql.DB, cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			errorResponse(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// Revert to decoding a JSON body from the request.
		var req SendMailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			errorResponse(w, "Invalid request payload", http.StatusBadRequest)
			return
		}

		// --- CRITICAL CHANGE: Split 'to' field by comma for multiple recipients ---
		toRecipients := strings.Split(req.To, ",")
		// Trim whitespace from each recipient and filter out empty strings
		for i := range toRecipients {
			toRecipients[i] = strings.TrimSpace(toRecipients[i])
		}
		toRecipients = filterEmptyStrings(toRecipients) // Helper to remove any empty strings from split
		
		if len(toRecipients) == 0 || req.Subject == "" || req.Body == "" { // Check if 'to' list is empty after split
			errorResponse(w, "Fields 'to', 'subject', and 'body' are required.", http.StatusBadRequest)
			return
		}
		// --- END CRITICAL CHANGE ---

		// Check daily mail limit.
		currentCount, err := utils.GetDailyMailCount(db)
		if err != nil {
			log.Printf("Error getting daily mail count: %v", err)
			errorResponse(w, "Internal server error checking mail limit", http.StatusInternalServerError)
			return
		}

		// Calculate total recipients for this send action.
		totalRecipients := len(toRecipients) + len(req.CC) + len(req.BCC)
		
		if (currentCount + totalRecipients) > cfg.DailyMailLimit { // Check if adding these recipients exceeds limit
			errorResponse(w, "Daily mail limit exceeded for this request.", http.StatusForbidden)
			return
		}

		// Call the email service, passing the split 'toRecipients'.
		emailService := services.NewMailService(cfg, db)
		err = emailService.SendEmailAndLog(toRecipients, req.CC, req.BCC, req.Subject, req.Body)

		if err != nil {
			log.Printf("Error sending email to %v: %v", toRecipients, err) // Log multiple recipients
			errorResponse(w, "Failed to send email: "+err.Error(), http.StatusInternalServerError)
			return
		}

		log.Printf("Email sent successfully to %v", toRecipients) // Log multiple recipients
		successResponse(w, "Email sent successfully", nil)
	}
}

// Helper function to remove empty strings from a slice of strings.
func filterEmptyStrings(s []string) []string {
    var r []string
    for _, str := range s {
        if str != "" {
            r = append(r, str)
        }
    }
    return r
}

// --- Other handlers (GetLogs, GetLimit, etc.) remain unchanged ---

func GetLogsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		queryDateStr := r.URL.Query().Get("date")
		limitStr := r.URL.Query().Get("limit")
		var query string
		var args []interface{}
		baseQuery := "SELECT id, sent_to, subject, body_preview, status, sent_at, recipient_count FROM email_logs" // ADDED recipient_count
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
			if err := rows.Scan(&logEntry.ID, &logEntry.SentTo, &logEntry.Subject, &logEntry.BodyPreview, &logEntry.Status, &logEntry.SentAt, &logEntry.RecipientCount); err != nil { // ADDED recipient_count
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