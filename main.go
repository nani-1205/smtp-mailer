package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"smtp-mailer/config"
	"smtp-mailer/database"
	"smtp-mailer/handlers"

	"github.com/gorilla/mux"
)

func main() {
	// Load configuration from .env
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Error loading configuration: %v", err)
	}

	// Initialize database connection
	db, err := database.InitDB(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Error connecting to database: %v", err)
	}
	defer db.Close()

	// Apply database migrations
	migrationsPath := filepath.Join(".", "database", "migrations")
	if err := database.ApplyMigrations(cfg.DatabaseURL, migrationsPath); err != nil {
		log.Fatalf("Error applying database migrations: %v", err)
	}
	log.Println("Database migrations applied successfully.")

	// Set up router
	r := mux.NewRouter()

	// API Routes
	r.HandleFunc("/api/send", handlers.SendMailHandler(db, cfg)).Methods("POST")
	r.HandleFunc("/api/logs", handlers.GetLogsHandler(db)).Methods("GET")
	r.HandleFunc("/api/limit", handlers.GetDailyLimitHandler(db, cfg.DailyMailLimit)).Methods("GET")

	// Dashboard Static Files
	// Serve the web/ directory as static files
	staticDir := "./web"
	r.PathPrefix("/").Handler(http.FileServer(http.Dir(staticDir)))

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port if not specified
	}
	log.Printf("Server starting on port %s...", port)
	log.Fatal(http.ListenAndServe(":"+port, r))
}