package utils

import (
	"database/sql"
	"fmt"
	"time"
	// "strings" // <-- REMOVED: This import is not used in this file
)

// GetDailyMailCount queries the database for the number of emails sent today.
// It counts emails based on the 'Asia/Kolkata' (IST) day boundary.
func GetDailyMailCount(db *sql.DB) (int, error) {
	var count int
	query := `
		SELECT COUNT(*) FROM email_logs
		WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
	`
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get daily mail count: %w", err)
	}
	return count, nil
}

// GetEmailStatusDistribution retrieves the count of emails by their status (Success/Failed) for the current IST day.
func GetEmailStatusDistribution(db *sql.DB) (map[string]int, error) {
	statusCounts := make(map[string]int)
	query := `
		SELECT status, COUNT(*) FROM email_logs
		WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
		GROUP BY status
	`
	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get email status distribution: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var status string
		var count int
		if err := rows.Scan(&status, &count); err != nil {
			return nil, fmt.Errorf("failed to scan status distribution row: %w", err)
		}
		statusCounts[status] = count
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating over status distribution rows: %w", err)
	}

	// Ensure both keys exist even if count is 0 for consistent JSON
	if _, ok := statusCounts["Success"]; !ok {
		statusCounts["Success"] = 0
	}
	if _, ok := statusCounts["Failed"]; !ok {
		statusCounts["Failed"] = 0
	}

	return statusCounts, nil
}

// GetDailySendsOverPeriod retrieves email counts for each of the last 'days' days, including today.
func GetDailySendsOverPeriod(db *sql.DB, days int) (map[string]int, error) {
	dailySends := make(map[string]int)

	// Generate date range
	todayIST := time.Now().In(time.FixedZone("IST", 5*3600+30*60)) // Get current time in IST
	for i := 0; i < days; i++ {
		date := todayIST.AddDate(0, 0, -i).Format("2006-01-02")
		dailySends[date] = 0 // Initialize with 0
	}

	query := fmt.Sprintf(`
		SELECT (sent_at AT TIME ZONE 'Asia/Kolkata')::date as log_date, COUNT(*)
		FROM email_logs
		WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '%d days'
		GROUP BY log_date
		ORDER BY log_date ASC
	`, days-1) // Use days-1 as interval to include today and (days-1) previous days

	rows, err := db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get daily sends over period: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var logDate time.Time
		var count int
		if err := rows.Scan(&logDate, &count); err != nil {
			return nil, fmt.Errorf("failed to scan daily sends row: %w", err)
		}
		dailySends[logDate.Format("2006-01-02")] = count
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating over daily sends rows: %w", err)
	}

	return dailySends, nil
}

// ShouldResetCounter is not actively used in this DB-centric rate limiting, kept for completeness.
func ShouldResetCounter() bool {
	return false // Logic is handled by SQL query for "today's" date
}