package main

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const (
	SUPER_TENANT_ID     = "a831330a-84f8-4712-9704-71bc8b92c682"
	SUPER_TENANT_DOMAIN = "super"
	SUPER_TENANT_NAME   = "Super Admin Console"
	SUPER_DEPARTMENT_ID = "2f060282-6540-48fb-a273-71f8024a6076"
)

func seedSuperUsers(db *gorm.DB) error {
	superUsers := []struct {
		Email    string
		Username string
		Password string
		TenantID string
		Role     string
	}{
		{"super1@wizvera.com", "Super User 1", "password", SUPER_TENANT_DOMAIN, "super"},
	}

	// Ensure 'super' tenant exists
	if err := ensureTenant(db, SUPER_TENANT_ID, SUPER_TENANT_DOMAIN, SUPER_TENANT_NAME); err != nil {
		return err
	}
	// Ensure 'wizvera' tenant exists
	// if err := ensureTenant(db, "w-1", "wizvera", "Wizvera Inc."); err != nil {
	// 	return err
	// }

	// Ensure 'super' departement exists
	var superDept Department
	if err := db.Where("tenant_id = ?", SUPER_TENANT_DOMAIN).First(&superDept).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("Creating super department...")
			superDept = Department{
				ID:                 SUPER_DEPARTMENT_ID,
				TenantID:           SUPER_TENANT_DOMAIN,
				Name:               SUPER_TENANT_NAME,
				Description:        SUPER_TENANT_NAME,
				ManagerID:          nil,
				ParentDepartmentID: nil,
				CreatedAt:          time.Now(),
				UpdatedAt:          time.Now(),
			}
			if err := db.Create(&superDept).Error; err != nil {
				return fmt.Errorf("failed to create super department: %w", err)
			}
		} else {
			return fmt.Errorf("failed to query super department: %w", err)
		}
	}

	for _, u := range superUsers {
		// Hashing
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
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
			TenantID:     u.TenantID,
			Role:         u.Role,
		}

		// Link to dept only for super
		if u.TenantID == SUPER_TENANT_DOMAIN {
			user.DepartmentID = strToPtr(SUPER_DEPARTMENT_ID)
		}

		// Upsert (Update if exists) based on Email
		var existing User
		if err := db.Where("email = ?", u.Email).First(&existing).Error; err == nil {
			// Update existing
			log.Printf("Updating user %s...", u.Email)
			existing.PasswordHash = string(hashedPassword)
			existing.Salt = salt
			existing.TenantID = u.TenantID
			existing.Role = u.Role
			// Explicitly set ForceChangePassword to false (Update handles zero values)
			existing.ForceChangePassword = false
			// Re-save
			if err := db.Save(&existing).Error; err != nil {
				return fmt.Errorf("failed to update user %s: %w", u.Email, err)
			}
		} else {
			// Create new
			log.Printf("Creating user %s...", u.Email)
			if err := db.Create(&user).Error; err != nil {
				return fmt.Errorf("failed to create user %s: %w", u.Email, err)
			}
			// FORCE Update to false (because Create ignores zero value 'false' when default is 'true')
			if err := db.Model(&user).Update("force_change_password", false).Error; err != nil {
				return fmt.Errorf("failed to set force_change_password for %s: %w", u.Email, err)
			}
		}
		log.Printf("User %s seeded successfully.", u.Email)
	}

	return nil
}

func ensureTenant(db *gorm.DB, id, domain, name string) error {
	var t Tenant
	if err := db.Where("domain = ?", domain).First(&t).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			log.Printf("Creating tenant %s...", domain)
			t = Tenant{
				ID:     id,
				Domain: domain,
				Name:   name,
				Status: "active",
			}
			if err := db.Create(&t).Error; err != nil {
				return fmt.Errorf("failed to create tenant %s: %w", domain, err)
			}
		} else {
			return fmt.Errorf("failed to query tenant %s: %w", domain, err)
		}
	}
	return nil
}
