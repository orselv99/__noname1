package main

import (
	"context"
	"errors"
	"log"
	"time"

	pb "server/.protos/auth"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type server struct {
	pb.UnimplementedAuthServiceServer
	db *gorm.DB
}

func (s *server) Login(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error) {
	// 비밀번호 검색 및 디버깅 로그
	log.Printf("[DEBUG] Login attempt - Email: %s, TenantID: %s", req.Email, req.TenantId)

	var user User
	// Add tenant_id filter for tenant isolation
	query := s.db.Where("email = ?", req.Email).Preload("DepartmentRel").Preload("PositionRel")
	if req.TenantId != "" {
		query = query.Where("tenant_id = ?", req.TenantId)
	}
	result := query.First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			log.Printf("[DEBUG] User not found: %s in tenant: %s", req.Email, req.TenantId)
			return nil, errors.New("invalid email or password")
		}
		log.Printf("[DEBUG] DB Error: %v", result.Error)
		return nil, result.Error
	}

	// 비밀번호 검증
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		log.Printf("[DEBUG] Password mismatch for %s", req.Email)
		return nil, errors.New("invalid credentials")
	}

	log.Printf("[DEBUG] Login successful for %s", req.Email)

	// JWT 토큰 생성
	token, refreshToken, exp, err := GenerateTokens(user.ID, user.Email, user.Salt)
	if err != nil {
		return nil, err
	}

	// Update LastLoginAt
	now := time.Now()
	s.db.Model(&user).Update("last_login_at", &now)

	// Exemption: Super/Admin never forced to change password
	if user.Role == "super" || user.Role == "admin" {
		user.ForceChangePassword = false
	}

	// Get position_id
	var positionId string
	if user.PositionID != nil {
		positionId = *user.PositionID
	}

	// Convert phone numbers to string slice
	phoneNumbers := []string(user.PhoneNumbers)

	if user.PositionRel != nil {
		user.PositionName = user.PositionRel.Name
	}

	// Fetch Joined Projects
	// Find projects where user is owner OR member
	if err := s.db.Where("tenant_id = ? AND (owner_id = ? OR ? = ANY(member_ids))", user.TenantID, user.ID, user.ID).Find(&user.JoinedProjects).Error; err != nil {
		log.Printf("[WARN] Failed to fetch joined projects for user %s: %v", user.ID, err)
	}

	// Joined Projects with Visibility
	var pbJoinedProjects []*pb.Project
	for _, p := range user.JoinedProjects {
		pbJoinedProjects = append(pbJoinedProjects, &pb.Project{
			Id:                     p.ID,
			Name:                   p.Name,
			DefaultVisibilityLevel: pb.VisibilityLevel(p.DefaultVisibilityLevel),
		})
	}

	// Department Object
	var pbDepartment *pb.Department
	if user.DepartmentRel != nil {
		pbDepartment = &pb.Department{
			Id:                     user.DepartmentRel.ID,
			Name:                   user.DepartmentRel.Name,
			DefaultVisibilityLevel: pb.VisibilityLevel(user.DepartmentRel.DefaultVisibilityLevel),
		}
	}

	return &pb.LoginResponse{
		AccessToken:         token,
		RefreshToken:        refreshToken,
		ExpiresIn:           int64(exp - time.Now().Unix()),
		Role:                user.Role,
		ForceChangePassword: user.ForceChangePassword,
		TenantId:            user.TenantID,
		// User info for offline caching
		UserId:         user.ID,
		Username:       user.Username,
		PositionId:     positionId,
		PhoneNumbers:   phoneNumbers,
		Contact:        user.Contact,
		CreatedAt:      user.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      user.UpdatedAt.Format(time.RFC3339),
		PositionName:   user.PositionName,
		JoinedProjects: pbJoinedProjects,
		Department:     pbDepartment,
	}, nil
}

func (s *server) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	claims, err := ValidateTokenString(req.AccessToken)
	if err != nil {
		return &pb.ValidateTokenResponse{Valid: false}, nil
	}

	// Salt 조회
	salt := claims.Salt
	if salt == "" {
		// Claim에 없으면 DB 조회 (구버전 호환)
		var user User
		if result := s.db.First(&user, "id = ?", claims.UserID); result.Error == nil {
			salt = user.Salt
		}
	}

	return &pb.ValidateTokenResponse{
		Valid:    true,
		UserId:   claims.UserID,
		UserSalt: salt,
	}, nil
}

func (s *server) RefreshToken(ctx context.Context, req *pb.RefreshTokenRequest) (*pb.RefreshTokenResponse, error) {
	// 리프레시 토큰 검증
	claims, err := ValidateTokenString(req.RefreshToken)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}

	// 실제로는 DB에서 리프레시 토큰 화이트리스트/블랙리스트 검사를 해야 할 수 있음

	// User Salt 조회
	var user User
	result := s.db.First(&user, "id = ?", claims.UserID)
	if result.Error != nil {
		return nil, errors.New("user not found")
	}

	// 새 액세스 토큰 발급
	newAccess, newRefresh, _, err := GenerateTokens(user.ID, user.Email, user.Salt)
	if err != nil {
		return nil, err
	}

	return &pb.RefreshTokenResponse{
		AccessToken:  newAccess,
		RefreshToken: newRefresh, // Rotation
	}, nil
}

func (s *server) Logout(ctx context.Context, req *pb.LogoutRequest) (*pb.LogoutResponse, error) {
	// In a real implementation, we should blacklist the refresh token here.
	// For now, we just log the logout event.
	log.Printf("[INFO] User logged out. AccessToken: %s...", req.AccessToken[:10])
	return &pb.LogoutResponse{Success: true}, nil
}

// LookupTenantByEmail finds tenant(s) associated with an email address.
// Used by client apps (like Tauri desktop) that don't have subdomain-based tenant identification.
func (s *server) LookupTenantByEmail(ctx context.Context, req *pb.LookupTenantByEmailRequest) (*pb.LookupTenantByEmailResponse, error) {
	log.Printf("[DEBUG] LookupTenantByEmail - Email: %s", req.Email)

	// Find all users with this email across all tenants
	var users []User
	if err := s.db.Where("email = ?", req.Email).Find(&users).Error; err != nil {
		log.Printf("[ERROR] LookupTenantByEmail DB error: %v", err)
		return nil, err
	}

	if len(users) == 0 {
		log.Printf("[DEBUG] No users found for email: %s", req.Email)
		return &pb.LookupTenantByEmailResponse{Tenants: []*pb.TenantInfo{}}, nil
	}

	// Get unique tenant IDs
	tenantIDs := make(map[string]struct{})
	for _, user := range users {
		tenantIDs[user.TenantID] = struct{}{}
	}

	// Fetch tenant details
	var tenants []*pb.TenantInfo
	for tenantID := range tenantIDs {
		var tenant Tenant
		if err := s.db.Where("id = ?", tenantID).First(&tenant).Error; err != nil {
			// If tenant not found, use tenant ID as name
			tenants = append(tenants, &pb.TenantInfo{
				TenantId: tenantID,
				Name:     tenantID,
			})
		} else {
			tenants = append(tenants, &pb.TenantInfo{
				TenantId: tenant.ID,
				Name:     tenant.Name,
			})
		}
	}

	log.Printf("[DEBUG] Found %d tenant(s) for email: %s", len(tenants), req.Email)
	return &pb.LookupTenantByEmailResponse{Tenants: tenants}, nil
}
