package main

import (
	"time"

	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
	"gorm.io/gorm"
)

// Document 모델
type Document struct {
	ID        string          `gorm:"type:uuid;primary_key;"`
	Title     string          `gorm:"type:text;not null"`
	Summary   string          `gorm:"type:text;"`        // 암호화된 요약 (Base64)
	TagChunks string          `gorm:"type:text;"`        // 암호화된 JSON (Base64) - 기존 []TagChunk/TagChunks type 변경
	Embedding pgvector.Vector `gorm:"type:vector(1536)"` // 원문 전체 벡터
	OwnerID   string          `gorm:"type:uuid;index"`
	CreatedAt time.Time
	UpdatedAt time.Time
	DeletedAt gorm.DeletedAt `gorm:"index"`
}

// BeforeCreate: UUID 생성
func (d *Document) BeforeCreate(tx *gorm.DB) (err error) {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return
}
