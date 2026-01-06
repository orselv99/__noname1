package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"gopkg.in/gomail.v2"
)

// SendPasswordEmail sends the new password to the user's email.
// Supports SSL/TLS (port 465) via gomail.
func (s *server) SendPasswordEmail(email, password string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPortStr := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASSWORD")
	smtpSSL := os.Getenv("SMTP_SSL") // "true" or "false"

	// Fallback to mock if SMTP config is missing
	if smtpHost == "" || smtpPortStr == "" {
		log.Printf("==============================================")
		log.Printf("[EMAIL MOCK] To: %s", email)
		log.Printf("[EMAIL MOCK] Subject: Your New Password")
		log.Printf("[EMAIL MOCK] Body: Your password has been reset. New Password: %s", password)
		log.Printf("==============================================")
		return nil
	}

	smtpPort, err := strconv.Atoi(smtpPortStr)
	if err != nil {
		return fmt.Errorf("invalid SMTP_PORT: %v", err)
	}

	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = smtpUser
	}
	if from == "" {
		from = "noreply@fiery-horizon.local"
	}

	// Build email message
	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", email)
	m.SetHeader("Subject", "Your New Password")
	m.SetBody("text/plain", fmt.Sprintf(
		"Hello,\n\nYour password has been reset.\nNew Password: %s\n\nPlease log in and change your password immediately.",
		password,
	))

	// Create dialer
	d := gomail.NewDialer(smtpHost, smtpPort, smtpUser, smtpPass)

	// Enable SSL for port 465 (implicit TLS)
	if smtpSSL == "true" || smtpPort == 465 {
		d.SSL = true
	}

	// Send email
	if err := d.DialAndSend(m); err != nil {
		log.Printf("Failed to send email to %s: %v", email, err)
		return err
	}

	log.Printf("Sent password email to %s via SMTP (SSL=%v)", email, d.SSL)
	return nil
}
