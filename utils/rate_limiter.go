package utils

import (
	"database/sql"
	"fmt"
	"time"
)

// GetDailyMailCount queries the database for the number of emails sent today.
func GetDailyMailCount(db *sql.DB) (int, error) {
	var count int
	// Using CURRENT_DATE and TIMESTAMPTZ ensures it works across timezones correctly
	// and resets at midnight UTC for consistency if not specified otherwise.
	// For most practical purposes, CURRENT_DATE aligned to the DB server's timezone (or UTC) works.
	query := `SELECT COUNT(*) FROM email_logs WHERE sent_at::date = CURRENT_DATE`
	err := db.QueryRow(query).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("failed to get daily mail count: %w", err)
	}
	return count, nil
}

// This function is not strictly needed for the current rate limiting
// as GetDailyMailCount is called on each request. It would be used
// if we had an in-memory counter that needed to reset.
func ShouldResetCounter() bool {
	now := time.Now()
	// Check if it's past midnight (e.g., 00:00:01 AM) and the last reset was not today.
	// This would typically involve storing the last reset date.
	// For DB-based counting (CURRENT_DATE), this logic is handled by the SQL query.
	return now.Hour() == 0 && now.Minute() == 0 && now.Second() < 5 // For a brief window around midnight
}