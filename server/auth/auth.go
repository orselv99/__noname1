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
	query := s.db.Where("email = ?", req.Email)
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

	// Get position_id and department_id as strings
	var positionId, departmentId string
	if user.PositionID != nil {
		positionId = *user.PositionID
	}
	if user.DepartmentID != nil {
		departmentId = *user.DepartmentID
	}

	// Convert phone numbers to string slice
	phoneNumbers := []string(user.PhoneNumbers)

	return &pb.LoginResponse{
		AccessToken:         token,
		RefreshToken:        refreshToken,
		ExpiresIn:           int64(exp - time.Now().Unix()),
		Role:                user.Role,
		ForceChangePassword: user.ForceChangePassword,
		TenantId:            user.TenantID,
		// User info for offline caching
		UserId:       user.ID,
		Username:     user.Username,
		PositionId:   positionId,
		DepartmentId: departmentId,
		PhoneNumbers: phoneNumbers,
		Contact:      user.Contact,
		CreatedAt:    user.CreatedAt.Format(time.RFC3339),
		UpdatedAt:    user.UpdatedAt.Format(time.RFC3339),
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
