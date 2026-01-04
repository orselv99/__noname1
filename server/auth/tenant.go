package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"

	pb "server/.protos/auth"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

func (s *server) CreateTenant(ctx context.Context, req *pb.CreateTenantRequest) (*pb.CreateTenantResponse, error) {
	// Transaction
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	tenant := Tenant{
		ID:     uuid.New().String(),
		Domain: req.Domain,
		Name:   req.Name,
		Status: "active",
	}

	if err := tx.Create(&tenant).Error; err != nil {
		tx.Rollback()
		return nil, status.Errorf(codes.Internal, "failed to create tenant: %v", err)
	}

	// Create Admin User if provided
	if req.AdminEmail != "" && req.AdminPassword != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.AdminPassword), bcrypt.DefaultCost)
		if err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to hash password: %v", err)
		}

		// Generate Salt
		saltBytes := make([]byte, 32)
		if _, err := rand.Read(saltBytes); err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to generate salt: %v", err)
		}
		salt := base64.StdEncoding.EncodeToString(saltBytes)

		adminUser := User{
			ID:           uuid.New().String(),
			Email:        req.AdminEmail,
			Username:     req.AdminUsername,
			PasswordHash: string(hashedPassword),
			Salt:         salt,
			TenantID:     req.Domain, // TenantID is Domain
			Role:         "admin",    // Role: Admin
			DepartmentID: strToPtr(SUPER_DEPARTMENT_ID),
		}
		if adminUser.Username == "" {
			adminUser.Username = "Admin"
		}

		if err := tx.Create(&adminUser).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to create admin user: %v", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit transaction: %v", err)
	}

	return &pb.CreateTenantResponse{
		Tenant: &pb.Tenant{
			Id:        tenant.ID,
			Domain:    tenant.Domain,
			Name:      tenant.Name,
			Status:    tenant.Status,
			CreatedAt: tenant.CreatedAt.String(),
			UserCount: 1, // At least the admin
		},
	}, nil
}

func (s *server) ListTenants(ctx context.Context, req *pb.ListTenantsRequest) (*pb.ListTenantsResponse, error) {
	var tenants []Tenant
	var total int64

	query := s.db.Model(&Tenant{})
	query.Count(&total)

	offset := (req.Page - 1) * req.Limit
	if err := query.Offset(int(offset)).Limit(int(req.Limit)).Find(&tenants).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch tenants: %v", err)
	}

	var pbTenants []*pb.Tenant
	for _, t := range tenants {
		// Get User Count Aggregation
		var userCount int64
		s.db.Model(&User{}).Where("tenant_id = ?", t.Domain).Count(&userCount)

		pbTenants = append(pbTenants, &pb.Tenant{
			Id:        t.ID,
			Domain:    t.Domain,
			Name:      t.Name,
			Status:    t.Status,
			UserCount: int32(userCount),
			CreatedAt: t.CreatedAt.String(),
		})
	}

	return &pb.ListTenantsResponse{
		Tenants:    pbTenants,
		TotalCount: int32(total),
	}, nil
}

func (s *server) GetTenant(ctx context.Context, req *pb.GetTenantRequest) (*pb.GetTenantResponse, error) {
	var tenant Tenant
	if err := s.db.Where("domain = ?", req.Domain).First(&tenant).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, status.Errorf(codes.NotFound, "tenant not found")
		}
		return nil, status.Errorf(codes.Internal, "failed to query tenant: %v", err)
	}

	// Fetch Admin User
	var adminUser User
	// Assume the first admin user found is the main contact
	if err := s.db.Where("tenant_id = ? AND role = ?", req.Domain, "admin").First(&adminUser).Error; err != nil {
		// Log error but don't fail the request if admin is missing (though unusual)
		// Or assume no admin yet
	}

	// Fetch Subscription
	var sub Subscription
	if err := s.db.Where("tenant_id = ?", req.Domain).First(&sub).Error; err != nil {
		// Log error or assume no subscription (Free plan default effectively)
	}

	response := &pb.GetTenantResponse{
		Tenant: &pb.Tenant{
			Id:        tenant.ID,
			Domain:    tenant.Domain,
			Name:      tenant.Name,
			Status:    tenant.Status,
			CreatedAt: tenant.CreatedAt.String(),
		},
	}

	if adminUser.ID != "" {
		response.AdminUser = &pb.User{
			Id:        adminUser.ID,
			Email:     adminUser.Email,
			Username:  adminUser.Username,
			Contact:   adminUser.Contact,  // New field
			Role:      pb.Role_ROLE_ADMIN, // Just returning proto enum if possible, or mapping
			CreatedAt: adminUser.CreatedAt.String(),
		}
	}

	if sub.ID != "" {
		response.Subscription = &pb.Subscription{
			Id:              sub.ID,
			TenantId:        sub.TenantID,
			PlanName:        sub.PlanName,
			Status:          sub.Status,
			StartDate:       sub.StartDate.Format("2006-01-02"),
			EndDate:         sub.EndDate.Format("2006-01-02"),
			PaymentMethod:   sub.PaymentMethod,
			NextBillingDate: sub.NextBillingDate.Format("2006-01-02"),
		}
	} else {
		// Default to Free details if no subscription record
		response.Subscription = &pb.Subscription{
			PlanName: "Free",
			Status:   "active",
		}
	}

	return response, nil
}
