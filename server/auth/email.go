package main

import (
	"fmt"
	"log"
	"net/smtp"
	"os"
)

// SendPasswordEmail sends the new password to the user's email.
func (s *server) SendPasswordEmail(email, password string) error {
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASSWORD")

	// Fallback to mock if SMTP config is missing
	if smtpHost == "" || smtpPort == "" {
		log.Printf("==============================================")
		log.Printf("[EMAIL MOCK] To: %s", email)
		log.Printf("[EMAIL MOCK] Subject: Your New Password")
		log.Printf("[EMAIL MOCK] Body: Your password has been reset. New Password: %s", password)
		log.Printf("==============================================")
		return nil
	}

	from := os.Getenv("SMTP_FROM")
	if from == "" {
		from = smtpUser
	}
	if from == "" {
		from = "noreply@fiery-horizon.local" // Default for anonymous
	}

	to := []string{email}
	subject := "Subject: Your New Password\n"
	mime := "MIME-version: 1.0;\nContent-Type: text/plain; charset=\"UTF-8\";\n\n"
	body := fmt.Sprintf("Hello,\n\nYour password has been reset.\nNew Password: %s\n\nPlease log in and change your password immediately.", password)
	msg := []byte(subject + mime + body)

	var auth smtp.Auth
	if smtpUser != "" {
		auth = smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	}

	addr := fmt.Sprintf("%s:%s", smtpHost, smtpPort)
	if err := smtp.SendMail(addr, auth, from, to, msg); err != nil {
		log.Printf("Failed to send email to %s: %v", email, err)
		return err
	}

	log.Printf("Sent password email to %s via SMTP [password: %s]", email, password)
	return nil
}
