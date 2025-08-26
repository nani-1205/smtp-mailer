module smtp-mailer

go 1.20

require (
	github.com/golang-migrate/migrate/v4 v4.16.2
	github.com/gorilla/mux v1.8.0
	github.com/joho/godotenv v1.5.1
	github.com/lib/pq v1.1.1
	gopkg.in/gomail.v2 v2.0.0-20160411212932-81ebce5c23df
	// The 'sanitize' and 'bluemonday' libraries are no longer needed.
)

require (
	github.com/hashicorp/errwrap v1.1.0 // indirect
	github.com/hashicorp/go-multierror v1.1.1 // indirect
	go.uber.org/atomic v1.7.0 // indirect
)