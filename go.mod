module smtp-mailer

go 1.20

require (
	github.com/golang-migrate/migrate/v4 v4.16.2
	github.com/gorilla/mux v1.8.0
	github.com/joho/godotenv v1.5.1
	github.com/lib/pq v1.1.1
	gopkg.in/gomail.v2 v2.0.0-20160411212932-81ebce5c23df
)

// No indirect dependencies should be here initially. go mod tidy will add them.