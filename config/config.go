package config

import (
	"log"
	"os"
	"strconv"

	"github.com/joho/godotenv"
)

// Config holds all application configurations
type Config struct {
	MailHub           string
	AuthUser          string
	AuthPass          string
	FromLineOverride  string
	UseTLS            bool
	UseSTARTTLS       bool
	DailyMailLimit    int
	DatabaseURL       string
	SkipTLSVerify     bool
	FromEmail         string // ADDED: Field for the specific 'From' email address
}

// LoadConfig reads configuration from .env file
func LoadConfig() (*Config, error) {
	err := godotenv.Load()
	if err != nil {
		log.Println("No .env file found, using environment variables directly.")
	}

	dailyLimitStr := os.Getenv("DAILY_MAIL_LIMIT")
	dailyLimit, err := strconv.Atoi(dailyLimitStr)
	if err != nil || dailyLimit == 0 {
		dailyLimit = 2000 // Default limit
		log.Printf("DAILY_MAIL_LIMIT not set or invalid, defaulting to %d", dailyLimit)
	}

	return &Config{
		MailHub:           os.Getenv("MAILHUB"),
		AuthUser:          os.Getenv("AUTHUSER"),
		AuthPass:          os.Getenv("AUTHPASS"),
		FromEmail:         os.Getenv("FROM_EMAIL"), // ADDED: Load FROM_EMAIL from environment
		FromLineOverride:  os.Getenv("FROMLINEOVERRIDE"),
		UseTLS:            os.Getenv("USETLS") == "YES",
		UseSTARTTLS:       os.Getenv("USESTARTTLS") == "YES",
		DailyMailLimit:    dailyLimit,
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		SkipTLSVerify:     os.Getenv("SKIP_TLS_VERIFY") == "YES",
	}, nil
}