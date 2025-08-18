# Mailer Pro: SMTP Microservice & Monitoring Dashboard

## 📖 Table of Contents

* [About the Project](#about-the-project)
* [Features](#features)
* [Technologies Used](#technologies-used)
* [Getting Started](#getting-started)

  * [Prerequisites](#prerequisites)
  * [Installation](#installation)
  * [Configuration](#configuration-env)
  * [Running the Application](#running-the-application)
* [API Endpoints](#api-endpoints)
* [Dashboard Overview](#dashboard-overview)
* [Database](#database)
* [Troubleshooting Common Issues](#troubleshooting-common-issues)
* [Future Enhancements](#future-enhancements)
* [License](#license)
* [Contact](#contact)

---

## 1. About the Project

Mailer Pro is a robust, containerized **SMTP microservice** designed for seamless email sending, daily rate limiting, and comprehensive logging. It provides a clean **RESTful API** for integration and features a professional, interactive **dashboard** for monitoring email activity, limits, and statistics.

Built with **GoLang** for performance and concurrency, backed by **PostgreSQL** for reliable storage, and deployed with **Docker** for scalability.

---

## 2. Features

* 📧 **SMTP Email Sending** – Works with any SMTP server (Gmail, Outlook, etc.)
* 📊 **Daily Mail Limit** – Enforce limits (e.g., 2000 mails/day), resets daily (IST)
* 📝 **Comprehensive Logging** – Store all email attempts in PostgreSQL
* 🔌 **RESTful API** – Send emails, fetch logs, and check limits easily
* 📈 **Interactive Dashboard** – Charts, logs, search, filters, dark/light themes
* 🐳 **Dockerized Deployment** – Quick setup via `docker-compose`
* 🔑 **.env Configuration** – Secure, environment-based configuration

---

## 3. Technologies Used

* **Backend**: GoLang

  * gorilla/mux, godotenv, lib/pq, gomail.v2, golang-migrate
* **Database**: PostgreSQL
* **Containerization**: Docker, Docker Compose
* **Frontend**: HTML5, CSS3, JavaScript

  * Chart.js, Inter font

---

## 4. Getting Started

### Prerequisites

Make sure you have installed:

* [Git](https://git-scm.com/)
* [Docker](https://www.docker.com/)
* [Docker Compose](https://docs.docker.com/compose/)

### Installation

```bash
git clone https://github.com/your-username/smtp-mailer-pro.git
cd smtp-mailer-pro
```

### Configuration (.env)

Copy `.env.example` to `.env` and update:

```env
MAILHUB=smtp.gmail.com:587
AUTHUSER=your-email@gmail.com
AUTHPASS=your-gmail-app-password
DAILY_MAIL_LIMIT=2000
DATABASE_URL=postgres://user:password@db:5432/mailerdb?sslmode=disable
PORT=8080
```

⚠️ For Gmail, **App Passwords** are required.

### Running the Application

```bash
docker compose up --build -d
```

Check running containers:

```bash
docker ps
```

View logs:

```bash
docker compose logs -f
```

---

## 5. API Endpoints

Base URL: `http://localhost:8080`

### 1. Send Email

* **POST** `/api/send`

```json
{
  "to": "recipient@example.com",
  "subject": "Hello",
  "body": "This is a test email."
}
```

### 2. Get Email Logs

* **GET** `/api/logs?date=2025-08-14&limit=10`

### 3. Get Daily Limit Status

* **GET** `/api/limit`

### 4. Get Status Distribution

* **GET** `/api/stats/status-distribution`

### 5. Get Daily Sends Over Period

* **GET** `/api/stats/daily-sends?days=7`

---

## 6. Dashboard Overview

Access UI at: [http://localhost:8080](http://localhost:8080)

* Real-time stats and charts
* Compose and send emails
* Logs with filtering and search
* Light/Dark mode support

---

## 7. Database

**Table: `email_logs`**

* id (SERIAL PK)
* sent\_to (TEXT)
* subject (TEXT)
* body\_preview (TEXT)
* status (TEXT: Success/Failed)
* sent\_at (TIMESTAMPTZ)

Migrations handled via **golang-migrate** and applied on startup.

---

## 8. Troubleshooting Common Issues

* **`connection refused`** → DB may not be ready; check logs
* **500 Internal Error** → Check app logs
* **Gmail auth error** → Use App Password
* **x509 certificate error** → Missing CA certs; set `SKIP_TLS_VERIFY=YES` only for dev
* **DNS issues** → Configure Docker DNS in `/etc/docker/daemon.json`
* **UI not loading** → Check browser console, ensure containers are running

---

## 9. Future Enhancements

* 🔑 API Authentication & Keys
* 📡 Multiple SMTP Configurations
* 🔍 Advanced Log Filtering
* 📑 Email Templates
* 🔔 Webhook Notifications
* 🔄 Retry & Queueing Support
* 📊 Per-API Key Rate Limits

---