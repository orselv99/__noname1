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

// User Model definition removed (duplicate)

// ListUsers: 특정 Tenant의 사용자 목록 조회
func (s *server) ListUsers(ctx context.Context, req *pb.ListUsersRequest) (*pb.ListUsersResponse, error) {
	var users []User
	var total int64

	query := s.db.Model(&User{})

	if req.TenantId != "" {
		query = query.Where("tenant_id = ?", req.TenantId)
	}

	query.Count(&total)

	offset := (req.Page - 1) * req.PageSize
	result := query.Offset(int(offset)).Limit(int(req.PageSize)).Find(&users)
	if result.Error != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch users: %v", result.Error)
	}

	var pbUsers []*pb.User
	for _, u := range users {
		// Map DB string Role to Proto Enum
		roleEnum := pb.Role_ROLE_USER // Default
		switch u.Role {
		case "super":
			roleEnum = pb.Role_ROLE_SUPER
		case "admin":
			roleEnum = pb.Role_ROLE_ADMIN
		case "viewer":
			roleEnum = pb.Role_ROLE_VIEWER
		case "user":
			roleEnum = pb.Role_ROLE_USER
		}

		pbUsers = append(pbUsers, &pb.User{
			Id:           u.ID,
			Email:        u.Email,
			Username:     u.Username,
			TenantId:     u.TenantID,
			Role:         roleEnum,
			DepartmentId: u.DepartmentID,
			CreatedAt:    u.CreatedAt.String(),
			FirstName:    u.FirstName,
			LastName:     u.LastName,
			Birthday:     u.Birthday,
			PhoneNumbers: u.PhoneNumbers,
			Position:     u.Position,
			Memo:         u.Memo,
		})
	}

	return &pb.ListUsersResponse{
		Users:      pbUsers,
		TotalCount: int32(total),
	}, nil
}

// UpdateUser: 사용자 정보 수정
func (s *server) UpdateUser(ctx context.Context, req *pb.UpdateUserRequest) (*pb.UpdateUserResponse, error) {
	var user User

	// TenantID 검증을 위해 함께 조회
	result := s.db.Where("id = ? AND tenant_id = ?", req.Id, req.TenantId).First(&user)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, status.Errorf(codes.NotFound, "user not found")
		}
		return nil, status.Errorf(codes.Internal, "db error: %v", result.Error)
	}

	if req.Username != "" {
		user.Username = req.Username
	}

	// Role Update (Enum -> String)
	if req.Role != pb.Role_ROLE_UNSPECIFIED {
		switch req.Role {
		case pb.Role_ROLE_SUPER:
			user.Role = "super"
		case pb.Role_ROLE_ADMIN:
			user.Role = "admin"
		case pb.Role_ROLE_VIEWER:
			user.Role = "viewer"
		case pb.Role_ROLE_USER:
			user.Role = "user"
		}
	}

	if req.DepartmentId != "" {
		user.DepartmentID = req.DepartmentId
	}

	// Update new fields
	if req.FirstName != "" {
		user.FirstName = req.FirstName
	}
	if req.LastName != "" {
		user.LastName = req.LastName
	}
	if req.Birthday != "" {
		user.Birthday = req.Birthday
	}
	if len(req.PhoneNumbers) > 0 {
		user.PhoneNumbers = req.PhoneNumbers
	}
	if req.Position != "" {
		user.Position = req.Position
	}
	if req.Memo != "" {
		user.Memo = req.Memo
	}

	if err := s.db.Save(&user).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user: %v", err)
	}

	return &pb.UpdateUserResponse{
		User: &pb.User{
			Id:           user.ID,
			Email:        user.Email,
			Username:     user.Username,
			TenantId:     user.TenantID,
			Role:         req.Role, // Return requested role as confirmation
			DepartmentId: user.DepartmentID,
			FirstName:    user.FirstName,
			LastName:     user.LastName,
			Birthday:     user.Birthday,
			PhoneNumbers: user.PhoneNumbers,
			Position:     user.Position,
			Memo:         user.Memo,
		},
	}, nil
}

// DeleteUser: 사용자 삭제 (Soft Delete)
func (s *server) DeleteUser(ctx context.Context, req *pb.DeleteUserRequest) (*pb.DeleteUserResponse, error) {
	result := s.db.Where("id = ? AND tenant_id = ?", req.Id, req.TenantId).Delete(&User{})
	if result.Error != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete user: %v", result.Error)
	}

	if result.RowsAffected == 0 {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}

	return &pb.DeleteUserResponse{Success: true}, nil
}

func (s *server) CreateUser(ctx context.Context, req *pb.CreateUserRequest) (*pb.CreateUserResponse, error) {
	// 비밀번호 해싱
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Salt 생성
	saltBytes := make([]byte, 32)
	if _, err := rand.Read(saltBytes); err != nil {
		return nil, err
	}
	salt := base64.StdEncoding.EncodeToString(saltBytes)

	// Map Proto Role Enum to DB String
	roleStr := "user"
	switch req.Role {
	case pb.Role_ROLE_SUPER:
		roleStr = "super"
	case pb.Role_ROLE_ADMIN:
		roleStr = "admin"
	case pb.Role_ROLE_VIEWER:
		roleStr = "viewer"
	case pb.Role_ROLE_USER:
		roleStr = "user"
	default:
		roleStr = "user"
	}

	username := req.Username
	if username == "" {
		// Basic fallback if username not provided
		username = req.Email
	}

	user := User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		Salt:         salt,
		Username:     username,
		TenantID:     req.TenantId,
		Role:         roleStr,
		DepartmentID: req.DepartmentId,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		Birthday:     req.Birthday,
		PhoneNumbers: req.PhoneNumbers,
		Position:     req.Position,
		Memo:         req.Memo,
	}

	if result := s.db.Create(&user); result.Error != nil {
		return nil, result.Error
	}

	return &pb.CreateUserResponse{
		User: &pb.User{
			Id:           user.ID,
			Email:        user.Email,
			Username:     user.Username,
			TenantId:     user.TenantID,
			Role:         req.Role,
			DepartmentId: user.DepartmentID,
			FirstName:    user.FirstName,
			LastName:     user.LastName,
			Birthday:     user.Birthday,
			PhoneNumbers: user.PhoneNumbers,
			Position:     user.Position,
			Memo:         user.Memo,
		},
	}, nil
}

// BatchCreateUsers: 일괄 사용자 생성 (Default Password: zzzzzzzz)
func (s *server) BatchCreateUsers(ctx context.Context, req *pb.BatchCreateUsersRequest) (*pb.BatchCreateUsersResponse, error) {
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "Tenant ID is required")
	}

	defaultPassword := "zzzzzzzz"
	var successCount int32
	var failureCount int32
	var failureReasons []string

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	for i, item := range req.Requests {
		// Hash Password per user
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(defaultPassword), bcrypt.DefaultCost)
		if err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to hash password for row %d: %v", i+1, err)
		}

		// Salt
		saltBytes := make([]byte, 32)
		if _, err := rand.Read(saltBytes); err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to generate salt for row %d: %v", i+1, err)
		}
		salt := base64.StdEncoding.EncodeToString(saltBytes)

		// Role mapping
		roleStr := "user"
		switch item.Role {
		case pb.Role_ROLE_SUPER:
			roleStr = "super"
		case pb.Role_ROLE_ADMIN:
			roleStr = "admin"
		case pb.Role_ROLE_VIEWER:
			roleStr = "viewer"
		case pb.Role_ROLE_USER:
			roleStr = "user"
		}

		username := item.Username
		if username == "" {
			username = item.Email
		}

		user := User{
			ID:           uuid.New().String(),
			Email:        item.Email,
			PasswordHash: string(hashedPassword),
			Salt:         salt,
			Username:     username,
			TenantID:     req.TenantId,
			Role:         roleStr,
			DepartmentID: item.DepartmentId,
			FirstName:    item.FirstName, // Map new fields
			LastName:     item.LastName,
			Birthday:     item.Birthday,
			PhoneNumbers: item.PhoneNumbers,
			Position:     item.Position,
			Memo:         item.Memo,
		}

		if err := tx.Create(&user).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to create user (row %d - %s): %v", i+1, item.Email, err)
		}
		successCount++
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit batch: %v", err)
	}

	return &pb.BatchCreateUsersResponse{
		SuccessCount:   successCount,
		FailureCount:   failureCount,
		FailureReasons: failureReasons,
	}, nil
}
