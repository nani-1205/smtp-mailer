package utils

import (
	"database/sql"
	"fmt"
	"time"
)

// GetDailyMailCount queries the database for the total number of recipients
// for emails sent today, aligning with SES billing.
func GetDailyMailCount(db *sql.DB) (int, error) {
	var count int
	query := `
		SELECT COALESCE(SUM(recipient_count), 0) FROM email_logs
		WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date
	`
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get daily mail count: %w", err)
	}
	return count, nil
}

// GetEmailStatusDistribution retrieves the distribution of email statuses (Success/Failed)
// based on the sum of recipient counts for the current IST day.
func GetEmailStatusDistribution(db *sql.DB) (map[string]int, error) {
	statusCounts := make(map[string]int)
	query := `
		SELECT status, COALESCE(SUM(recipient_count), 0) FROM email_logs
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

// GetDailySendsOverPeriod retrieves the total recipient count for emails sent per day
// for the last 'days' days.
func GetDailySendsOverPeriod(db *sql.DB, days int) (map[string]int, error) {
	dailySends := make(map[string]int)

	todayIST := time.Now().In(time.FixedZone("IST", 5*3600+30*60))
	for i := 0; i < days; i++ {
		date := todayIST.AddDate(0, 0, -i).Format("2006-01-02")
		dailySends[date] = 0 // Initialize with 0
	}

	query := fmt.Sprintf(`
		SELECT (sent_at AT TIME ZONE 'Asia/Kolkata')::date as log_date, COALESCE(SUM(recipient_count), 0)
		FROM email_logs
		WHERE (sent_at AT TIME ZONE 'Asia/Kolkata')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '%d days'
		GROUP BY log_date
		ORDER BY log_date ASC
	`, days-1)

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
	return false
}