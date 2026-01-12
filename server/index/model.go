package main

import (
	"github.com/google/uuid"
	"github.com/pgvector/pgvector-go"
	"gorm.io/gorm"
)

// Document 모델
type Document struct {
	ID           string          `gorm:"type:uuid;primary_key;"`
	Title        string          `gorm:"type:text;not null"`
	Summary      string          `gorm:"type:text;"`       // 암호화된 요약 (Base64)
	TagEvidences string          `gorm:"type:text;"`       // 암호화된 JSON (Base64) - 기존 TagChunks
	Embedding    pgvector.Vector `gorm:"type:vector(768)"` // 원문 전체 벡터 (로컬 모델 768 차원)
	OwnerID      string          `gorm:"type:uuid;index"`
	GroupID      string          `gorm:"type:uuid;index"`
	GroupType    int32           `gorm:"type:int"`
	CreatedAt    string          // 암호화된 생성 시간
	UpdatedAt    string          // 암호화된 수정 시간
	DeletedAt    gorm.DeletedAt  `gorm:"index"`
}

// BeforeCreate: UUID 생성
func (d *Document) BeforeCreate(tx *gorm.DB) (err error) {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return
}
