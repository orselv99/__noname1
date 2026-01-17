package main

import (
	"fmt"
	"log"
	"os"
	"strconv"

	"gopkg.in/gomail.v2"
)

// getPasswordEmailHTML generates a modern HTML email template for password reset
func getPasswordEmailHTML(password string) string {
	appName := os.Getenv("APP_NAME")
	if appName == "" {
		appName = "Fiery Horizon"
	}

	downloadURL := os.Getenv("APP_DOWNLOAD_URL")
	if downloadURL == "" {
		downloadURL = "https://fiery-horizon.com/download"
	}

	year := "2026"

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>비밀번호 변경 안내</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 50%%, #a855f7 100%%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                🔥 %s
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px 0; color: #18181b; font-size: 22px; font-weight: 600;">
                비밀번호가 변경되었습니다
              </h2>
              <p style="margin: 0 0 24px 0; color: #52525b; font-size: 15px; line-height: 1.6;">
                관리자에 의해 비밀번호가 초기화되었습니다<br>
                아래 임시 비밀번호로 로그인한 후, 반드시 새로운 비밀번호로 변경해 주세요.
              </p>
              
              <!-- Password Box -->
              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="background-color: #fafafa; border: 1px solid #e4e4e7; border-radius: 12px; padding: 24px; text-align: center;">
                    <p style="margin: 0 0 8px 0; color: #71717a; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">
                      임시 비밀번호
                    </p>
                    <p style="margin: 0; color: #18181b; font-size: 28px; font-weight: 700; font-family: 'Monaco', 'Consolas', monospace; letter-spacing: 2px;">
                      %s
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Warning -->
              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="margin-bottom: 32px;">
                <tr>
                  <td style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 16px;">
                    <p style="margin: 0; color: #92400e; font-size: 14px;">
                      ⚠️ 보안을 위해 로그인 후 <strong>즉시 비밀번호를 변경</strong>해 주세요.
                    </p>
                  </td>
                </tr>
              </table>
              
              <!-- Download Button -->
              <table role="presentation" width="100%%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <a href="%s" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%%, #8b5cf6 100%%); color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 600; padding: 14px 32px; border-radius: 10px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);">
                      프로그램 다운로드
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #fafafa; border-top: 1px solid #e4e4e7; padding: 24px 40px; text-align: center;">
              <p style="margin: 0 0 8px 0; color: #a1a1aa; font-size: 13px;">
                본 메일은 발신 전용입니다. 문의사항은 관리자에게 연락해 주세요.
              </p>
              <p style="margin: 0; color: #d4d4d8; font-size: 12px;">
                © %s %s. All rights reserved.
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`, appName, password, downloadURL, year, appName)
}

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
		log.Printf("[EMAIL MOCK] Subject: 비밀번호 변경 안내")
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

	// Build email message with HTML
	m := gomail.NewMessage()
	m.SetHeader("From", from)
	m.SetHeader("To", email)
	m.SetHeader("Subject", "[Fiery Horizon] 비밀번호 변경 안내")
	m.SetBody("text/html", getPasswordEmailHTML(password))

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
