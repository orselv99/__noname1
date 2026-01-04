package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func seedSuperUsers(db *gorm.DB) error {
	superUsers := []struct {
		Email    string
		Username string
	}{
		{"super1@wizvera.com", "Super User 1"},
	}

	// Password and Tenant for all
	password := "password"
	tenantID := "super"
	role := "super"

	// Ensure 'super' tenant exists
	var superTenant Tenant
	if err := db.Where("domain = ?", tenantID).First(&superTenant).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("Creating super tenant...")
			superTenant = Tenant{
				ID:     uuid.New().String(),
				Domain: tenantID,
				Name:   "Super Admin Console",
				Status: "active",
			}
			if err := db.Create(&superTenant).Error; err != nil {
				return fmt.Errorf("failed to create super tenant: %w", err)
			}
		} else {
			return fmt.Errorf("failed to query super tenant: %w", err)
		}
	} else {
		log.Printf("Super tenant already exists.")
	}

	for _, u := range superUsers {
		// Hashing
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("failed to hash password: %w", err)
		}

		// Salt
		saltBytes := make([]byte, 32)
		if _, err := rand.Read(saltBytes); err != nil {
			return fmt.Errorf("failed to generate salt: %w", err)
		}
		salt := base64.StdEncoding.EncodeToString(saltBytes)

		user := User{
			ID:           uuid.New().String(),
			Email:        u.Email,
			Username:     u.Username,
			PasswordHash: string(hashedPassword),
			Salt:         salt,
			TenantID:     tenantID,
			Role:         role,
			DepartmentID: "Management",
		}

		// Upsert (Update if exists) based on Email
		var existing User
		if err := db.Where("email = ?", u.Email).First(&existing).Error; err == nil {
			// Update existing
			log.Printf("Updating super user %s...", u.Email)
			existing.PasswordHash = string(hashedPassword)
			existing.Salt = salt
			// Re-save
			if err := db.Save(&existing).Error; err != nil {
				return fmt.Errorf("failed to update super user %s: %w", u.Email, err)
			}
		} else {
			// Create new
			log.Printf("Creating super user %s...", u.Email)
			if err := db.Create(&user).Error; err != nil {
				return fmt.Errorf("failed to create super user %s: %w", u.Email, err)
			}
		}
		log.Printf("Super user %s seeded successfully.", u.Email)
	}

	return nil
}
