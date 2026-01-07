package main

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"gorm.io/gorm"
)

// User 모델 정의
type User struct {
	ID                  string         `gorm:"type:uuid;primary_key;"`
	Email               string         `gorm:"type:varchar(100);uniqueIndex:idx_tenant_email,priority:2;not null"`
	PasswordHash        string         `gorm:"not null"`
	Salt                string         `gorm:"default:'';not null"` // 암호화 키 파생용 소금
	Username            string         `gorm:"type:varchar(50);not null"`
	TenantID            string         `gorm:"type:varchar(50);uniqueIndex:idx_tenant_email,priority:1;index;not null"` // 멀티테넌트 식별자
	Role                string         `gorm:"type:varchar(20);default:'user';not null"`                                // 권한 (admin, user 등)
	PositionID          *string        `gorm:"type:uuid;index"`
	PositionRel         *Position      `gorm:"foreignKey:PositionID;references:ID"`
	PositionName        string         `gorm:"-"`                      // Join
	DepartmentID        *string        `gorm:"type:varchar(50);index"` // 부서 식별자 (Optional)
	DepartmentRel       *Department    `gorm:"foreignKey:DepartmentID;references:ID"`
	DepartmentName      string         `gorm:"-"`                 // Join
	Contact             string         `gorm:"type:varchar(100)"` // 연락처
	Birthday            string         `gorm:"type:varchar(20)"`
	PhoneNumbers        pq.StringArray `gorm:"type:text[]"`
	CreatedAt           time.Time
	UpdatedAt           time.Time
	LastLoginAt         *time.Time
	ForceChangePassword bool `gorm:"default:true"`
}

// Subscription 모델 정의
type Subscription struct {
	ID              string `gorm:"type:uuid;primary_key;"`
	TenantID        string `gorm:"type:varchar(100);index;not null"`
	PlanName        string `gorm:"type:varchar(50);default:'Free'"`
	Status          string `gorm:"type:varchar(20);default:'active'"` // active, expired, cancelled
	StartDate       time.Time
	EndDate         time.Time
	PaymentMethod   string `gorm:"type:varchar(100)"` // Simple description for now
	NextBillingDate time.Time
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// Tenant 모델 정의
type Tenant struct {
	ID        string `gorm:"type:uuid;primary_key;"`
	Domain    string `gorm:"type:varchar(100);uniqueIndex;not null"` // subdomain (e.g., 'wizvera')
	Name      string `gorm:"type:varchar(100);not null"`             // Display Name
	Status    string `gorm:"type:varchar(20);default:'active'"`      // active, suspended
	CreatedAt time.Time
	UpdatedAt time.Time
}

// BeforeCreate 훅: UUID 생성
func (t *Tenant) BeforeCreate(tx *gorm.DB) (err error) {
	if t.ID == "" {
		t.ID = uuid.New().String()
	}
	return
}

// BeforeCreate 훅: UUID 생성
func (s *Subscription) BeforeCreate(tx *gorm.DB) (err error) {
	if s.ID == "" {
		s.ID = uuid.New().String()
	}
	return
}

// BeforeCreate 훅: UUID 생성
func (u *User) BeforeCreate(tx *gorm.DB) (err error) {
	if u.ID == "" {
		u.ID = uuid.New().String()
	}
	return
}

// Permission Model (ACL)
type Permission struct {
	ID          string `gorm:"type:uuid;primaryKey"`
	TenantID    string `gorm:"type:varchar(50);not null;index"` // Tenant Isolation
	DocumentID  string `gorm:"type:uuid;not null;index"`        // Resource ID
	UserID      string `gorm:"type:uuid;not null;index"`
	AccessLevel int    `gorm:"not null"` // 1: Summary, 2: Partial, 3: Full
	GrantedAt   time.Time
	GrantedBy   string `gorm:"type:uuid"`
}

func (p *Permission) BeforeCreate(tx *gorm.DB) (err error) {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return
}

// AccessRequest Model (Access Control)
type AccessRequest struct {
	ID             string `gorm:"type:uuid;primaryKey"`
	TenantID       string `gorm:"type:varchar(50);not null;index"` // Tenant Isolation
	RequesterID    string `gorm:"type:uuid;not null;index"`
	DocumentID     string `gorm:"type:uuid;not null;index"`
	RequestedLevel int    `gorm:"not null"`
	Status         int    `gorm:"not null;default:1"` // 1: Pending, 2: Approved, 3: Rejected
	OwnerID        string `gorm:"type:uuid;index"`    // Denormalized for query perfo
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (ar *AccessRequest) BeforeCreate(tx *gorm.DB) (err error) {
	if ar.ID == "" {
		ar.ID = uuid.New().String()
	}
	return
}

// Department Model
type Department struct {
	ID                     string  `gorm:"type:uuid;primaryKey"`
	TenantID               string  `gorm:"type:varchar(50);not null;uniqueIndex:idx_tenant_dept_name,priority:1"`
	Name                   string  `gorm:"type:varchar(100);not null;uniqueIndex:idx_tenant_dept_name,priority:2"`
	Description            string  `gorm:"type:text"`
	ManagerID              *string `gorm:"type:uuid;index"`    // User ID of the manager (nullable)
	ParentDepartmentID     *string `gorm:"type:uuid;index"`    // Parent department (nullable for root)
	SortOrder              int     `gorm:"default:0;not null"` // For drag-drop ordering
	DefaultVisibilityLevel int     `gorm:"default:1;not null"` // 1: Hidden, 2: Metadata, 3: Snippet, 4: Public
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

func (d *Department) BeforeCreate(tx *gorm.DB) (err error) {
	if d.ID == "" {
		d.ID = uuid.New().String()
	}
	return
}

// DocumentMetadata Model (ACL)
// Stores metadata and visibility settings for documents (Content is in Vector DB)
type DocumentMetadata struct {
	ID                    string `gorm:"type:uuid;primaryKey"`
	TenantID              string `gorm:"type:varchar(50);not null;index"` // Tenant Isolation
	OwnerID               string `gorm:"type:uuid;index;not null"`
	DepartmentID          string `gorm:"type:uuid;index;not null"`
	Title                 string `gorm:"type:varchar(255);not null"`
	SearchVisibilityLevel int    `gorm:"default:0;not null"`              // 0: Dept Only, 1: Metadata, 2: Snippet, 3: Public
	IsPrivate             bool   `gorm:"default:false;not null"`          // If true, only visible to Owner (overrides Level)
	ApprovalStatus        string `gorm:"type:varchar(20);default:'none'"` // none, pending, approved, rejected
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

func (dm *DocumentMetadata) BeforeCreate(tx *gorm.DB) (err error) {
	if dm.ID == "" {
		dm.ID = uuid.New().String()
	}
	return
}

// VisiblityApproval Model
type VisibilityApproval struct {
	ID             string `gorm:"type:uuid;primaryKey"`
	TenantID       string `gorm:"type:varchar(50);not null;index"` // Tenant Isolation
	DocumentID     string `gorm:"type:uuid;index;not null"`
	RequesterID    string `gorm:"type:uuid;index;not null"`
	ApproverID     string `gorm:"type:uuid;index"`
	RequestedLevel int    `gorm:"not null"`
	Status         string `gorm:"type:varchar(20);default:'pending'"` // pending, approved, rejected
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (va *VisibilityApproval) BeforeCreate(tx *gorm.DB) (err error) {
	if va.ID == "" {
		va.ID = uuid.New().String()
	}
	return
}

// Position Model
type Position struct {
	ID        string `gorm:"type:uuid;primaryKey"`
	TenantID  string `gorm:"type:varchar(50);not null;index"`
	Name      string `gorm:"type:varchar(100);not null"`
	SortOrder int    `gorm:"default:0"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (p *Position) BeforeCreate(tx *gorm.DB) (err error) {
	if p.ID == "" {
		p.ID = uuid.New().String()
	}
	return
}

// Project Model (no parent, flat list)
type Project struct {
	ID                     string         `gorm:"type:uuid;primaryKey"`
	TenantID               string         `gorm:"type:varchar(50);not null;index"`
	Name                   string         `gorm:"type:varchar(100);not null"`
	Description            string         `gorm:"type:text"`
	OwnerID                *string        `gorm:"type:uuid;index"` // Project owner
	OwnerRel               *User          `gorm:"foreignKey:OwnerID;references:ID"`
	OwnerName              string         `gorm:"-"`               // Join
	MemberIDs              pq.StringArray `gorm:"type:text[]"`     // Array of member UUIDs
	ManagerID              *string        `gorm:"type:uuid;index"` // Deprecated: use OwnerID
	SortOrder              int            `gorm:"default:0;not null"`
	DefaultVisibilityLevel int            `gorm:"default:1;not null"` // 1: Hidden (default)
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

func (proj *Project) BeforeCreate(tx *gorm.DB) (err error) {
	if proj.ID == "" {
		proj.ID = uuid.New().String()
	}
	return
}
