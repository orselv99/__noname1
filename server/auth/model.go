package main

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// User 모델 정의
type User struct {
	ID           string `gorm:"type:uuid;primary_key;"`
	Email        string `gorm:"type:varchar(100);uniqueIndex;not null"`
	PasswordHash string `gorm:"not null"`
	Salt         string `gorm:"default:'';not null"` // 암호화 키 파생용 소금
	Username     string `gorm:"type:varchar(50);not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
	DeletedAt    gorm.DeletedAt `gorm:"index"`
}

// BeforeCreate 훅: UUID 생성
func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return
}
