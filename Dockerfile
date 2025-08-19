# Stage 1: Build the Go application
FROM golang:1.20-alpine AS builder

WORKDIR /app

# Install git and tzdata for timezone support
RUN apk add --no-cache git tzdata

# Set the timezone for the builder stage (for consistent timestamps during build if needed)
ENV TZ Asia/Kolkata

# Set GOPROXY to direct to avoid issues with Go module proxy cache/resolution
ENV GOPROXY=direct

# Copy all application source code, including go.mod.
COPY . .

# Run go mod tidy to download dependencies and generate/update go.sum inside the container.
RUN go mod tidy

# Build the Go application
ENV CGO_ENABLED=0
ENV GOOS=linux
RUN go build -o /app/smtp-mailer ./main.go

# Stage 2: Create the final lean image
FROM alpine:latest

WORKDIR /app

# Install ca-certificates, tzdata, AND postgresql-client for runtime support.
# postgresql-client is needed for the `pg_isready` healthcheck command.
RUN apk add --no-cache ca-certificates tzdata postgresql-client

# Set the timezone for the runtime container
ENV TZ Asia/Kolkata

# Copy the built Go binary from the builder stage
COPY --from=builder /app/smtp-mailer .

# Copy the web assets and migrations
COPY web ./web
COPY database/migrations ./database/migrations

# Expose the port the application will listen on
EXPOSE 8080

# Command to run the executable
CMD ["/app/smtp-mailer"]