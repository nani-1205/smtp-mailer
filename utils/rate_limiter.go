package utils

import (
	"database/sql"
	"fmt"
	"time"
)

// GetDailyMailCount queries the database for the number of emails sent today.
// It counts emails based on the 'Asia/Kolkata' (IST) day boundary.
func GetDailyMailCount(db *sql.DB) (int, error) {
	var count int
	// Convert sent_at and CURRENT_TIMESTAMP to 'Asia/Kolkata' timezone,
	// then extract the date for comparison.
	// This ensures the daily count consistently resets at IST midnight.
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

// This function is not strictly needed for the current rate limiting
// as GetDailyMailCount is called on each request. It would be used
// if we had an in-memory counter that needed to reset.
func ShouldResetCounter() bool {
	now := time.Now()
	// This logic is primarily for in-memory counters. For DB-based counting,
	// the SQL query handles the reset implicitly based on the date comparison.
	return now.Hour() == 0 && now.Minute() == 0 && now.Second() < 5 // For a brief window around midnight
}