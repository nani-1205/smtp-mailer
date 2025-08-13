# Stage 1: Build the Go application
FROM golang:1.20-alpine AS builder

WORKDIR /app

# Install git, which is required by `go mod tidy` for some modules (e.g., those from gopkg.in or direct Git repos)
RUN apk add --no-cache git

# Copy all application source code, including go.mod.
# This ensures `go mod tidy` sees all import statements.
COPY . .

# Run go mod tidy to download dependencies and generate/update go.sum inside the container.
# This command needs to see all .go files to correctly determine dependencies.
RUN go mod tidy

# Build the Go application
# CGO_ENABLED=0 is important for static binaries in Alpine
ENV CGO_ENABLED=0
ENV GOOS=linux
RUN go build -o /app/smtp-mailer ./main.go

# Stage 2: Create the final lean image
FROM alpine:latest

WORKDIR /app

# Install ca-certificates for HTTPS/TLS connections (needed for TLS connections to SMTP servers)
RUN apk add --no-cache ca-certificates

# Copy the built Go binary from the builder stage
COPY --from=builder /app/smtp-mailer .

# Copy the web assets and migrations
COPY web ./web
COPY database/migrations ./database/migrations

# Expose the port the application will listen on
EXPOSE 8080

# Command to run the executable
CMD ["/app/smtp-mailer"]