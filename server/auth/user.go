package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	pb "server/.protos/auth"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"gorm.io/gorm"
)

// ListUsers: 특정 Tenant의 사용자 목록 조회
func (s *server) ListUsers(ctx context.Context, req *pb.ListUsersRequest) (*pb.ListUsersResponse, error) {
	var users []User
	var total int64

	query := s.db.Model(&User{}).Preload("PositionRel").Preload("DepartmentRel")

	if req.TenantId != "" {
		query = query.Where("tenant_id = ?", req.TenantId)
	}
	// Exclude super and admin roles from listing
	query = query.Where("role NOT IN ?", []string{"super", "admin"})

	// Search query filtering
	if req.Query != "" {
		query = query.Where("username ILIKE ? OR email ILIKE ?", "%"+req.Query+"%", "%"+req.Query+"%")
	}

	query.Count(&total)

	// Default sort by CreatedAt DESC
	sortCol := "users.created_at"
	sortDesc := true

	if req.SortBy != "" {
		switch req.SortBy {
		case "name":
			sortCol = "users.username"
			sortDesc = false // Default ASC for name
		case "position":
			query = query.Joins("LEFT JOIN positions ON users.position_id = positions.id")
			sortCol = "positions.name"
			sortDesc = false
		case "department":
			query = query.Joins("LEFT JOIN departments ON users.department_id = departments.id")
			sortCol = "departments.name"
			sortDesc = false
		}
	}

	// Override sort direction if explicitly set
	// Note: req.SortDesc is bool. If user wants DESC, it is true.
	// If user provided SortBy, we set default sortDesc above.
	// We should strictly follow req.SortDesc if SortBy is present?
	// Let's assume req.SortDesc applies if SortBy is present.
	if req.SortBy != "" {
		sortDesc = req.SortDesc
	}

	orderClause := sortCol + " ASC"
	if sortDesc {
		orderClause = sortCol + " DESC"
	}
	query = query.Order(orderClause)

	// Restore offset
	offset := (req.Page - 1) * req.PageSize
	if req.Page < 1 {
		offset = 0
	}

	limit := int(req.PageSize)
	if limit < 1 {
		limit = 100
	} // Default limit

	result := query.Select("users.*").Offset(int(offset)).Limit(limit).Find(&users)
	if result.Error != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch users: %v", result.Error)
	}

	var pbUsers []*pb.User
	for _, u := range users {
		// Map DB string Role to Proto Enum
		// roleEnum is unused, removed.

		var posName string
		if u.PositionRel != nil {
			posName = u.PositionRel.Name
		}
		var deptName string
		if u.DepartmentRel != nil {
			deptName = u.DepartmentRel.Name
		}

		contact := strings.Join(u.PhoneNumbers, ", ")

		pbUsers = append(pbUsers, &pb.User{
			Id:                  u.ID,
			Email:               u.Email,
			Username:            u.Username,
			TenantId:            u.TenantID,
			Role:                pb.Role(pb.Role_value[strings.ToUpper("ROLE_"+u.Role)]), // Convert string role to enum
			DepartmentId:        ptrToStr(u.DepartmentID),
			CreatedAt:           u.CreatedAt.Format(time.RFC3339),
			UpdatedAt:           u.UpdatedAt.Format(time.RFC3339),
			Contact:             contact,
			Birthday:            u.Birthday,
			PhoneNumbers:        u.PhoneNumbers,
			PositionId:          ptrToStr(u.PositionID),
			PositionName:        posName,
			DepartmentName:      deptName,
			ForceChangePassword: u.ForceChangePassword,
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
		user.DepartmentID = strToPtr(req.DepartmentId)
	}

	// if req.FirstName != "" {
	// 	user.FirstName = req.FirstName
	// }
	// if req.LastName != "" {
	// 	user.LastName = req.LastName
	// }
	if req.Birthday != "" {
		user.Birthday = req.Birthday
	}
	if len(req.PhoneNumbers) > 0 {
		user.PhoneNumbers = req.PhoneNumbers
	}
	// PositionId can be empty string to unassign, so check if it is passed?
	// Proto default is empty string. If we want to allow unsetting, we might need a flag or assume empty means unset if explicitly provided.
	// However, existing logic uses != "" to update. Let's stick to that or use a better check if possible.
	// For now assuming we only set if provided. Use specific logic if clearing is needed.
	// Update Position
	if req.PositionId != "" {
		user.PositionID = strToPtr(req.PositionId)
	} else {
		// If explicit clear is needed, we need a flag or assume empty means clear if strictly implemented.
		// For now, assuming empty request means "do not change" for simple update,
		// BUT if we want to allow clearing, we might need a specific string like "EMPTY" or check presence.
		// Given Proto V3 defaults, empty string is default.
		// Let's assume if it is empty we DON'T update it, to preserve existing.
		// If user wants to clear, we might need a separate clear action or distinct value.
		// However, in the refactor, we can decide that empty string updates to empty string?
		// No, usually UPDATE ignores empty fields.
	}

	if err := s.db.Save(&user).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user: %v", err)
	}

	// Reload relations to get names
	s.db.Preload("PositionRel").Preload("DepartmentRel").First(&user, "id = ?", user.ID)

	var posName string
	if user.PositionRel != nil {
		posName = user.PositionRel.Name
	}
	var deptName string
	if user.DepartmentRel != nil {
		deptName = user.DepartmentRel.Name
	}

	contact := strings.Join(user.PhoneNumbers, ", ")

	return &pb.UpdateUserResponse{
		User: &pb.User{
			Id:                  user.ID,
			Email:               user.Email,
			Username:            user.Username,
			TenantId:            user.TenantID,
			Role:                req.Role,
			DepartmentId:        ptrToStr(user.DepartmentID),
			CreatedAt:           user.CreatedAt.Format(time.RFC3339),
			UpdatedAt:           user.UpdatedAt.Format(time.RFC3339),
			Contact:             contact,
			Birthday:            user.Birthday,
			PhoneNumbers:        user.PhoneNumbers,
			PositionId:          ptrToStr(user.PositionID),
			PositionName:        posName,
			DepartmentName:      deptName,
			ForceChangePassword: user.ForceChangePassword,
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
		DepartmentID: strToPtr(req.DepartmentId),
		Birthday:     req.Birthday,
		PhoneNumbers: req.PhoneNumbers,
		PositionID:   strToPtr(req.PositionId),
	}

	if result := s.db.Create(&user); result.Error != nil {
		return nil, result.Error
	}

	// Exemption: Super/Admin does not need forced password change upon creation
	if req.Role == pb.Role_ROLE_SUPER || req.Role == pb.Role_ROLE_ADMIN {
		if err := s.db.Model(&user).Update("force_change_password", false).Error; err != nil {
			return nil, status.Errorf(codes.Internal, "failed to set exemption: %v", err)
		}
		user.ForceChangePassword = false
	}

	contact := strings.Join(user.PhoneNumbers, ", ")

	resp := &pb.User{
		Id:                  user.ID,
		Email:               user.Email,
		Username:            user.Username,
		TenantId:            user.TenantID,
		Role:                req.Role,
		DepartmentId:        ptrToStr(user.DepartmentID),
		CreatedAt:           user.CreatedAt.Format(time.RFC3339),
		UpdatedAt:           user.UpdatedAt.Format(time.RFC3339),
		Contact:             contact,
		Birthday:            user.Birthday,
		PhoneNumbers:        user.PhoneNumbers,
		PositionId:          ptrToStr(user.PositionID),
		ForceChangePassword: user.ForceChangePassword,
	}
	return &pb.CreateUserResponse{
		User: resp,
	}, nil
}

// BatchCreateUsers: 일괄 사용자 생성 (Default Password: from req or zzzzzzzz)
func (s *server) BatchCreateUsers(ctx context.Context, req *pb.BatchCreateUsersRequest) (*pb.BatchCreateUsersResponse, error) {
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "Tenant ID is required")
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	importMode := req.ImportMode
	if importMode == "" {
		importMode = "upsert" // Default
	}

	// If Replace mode: Delete all users in tenant except 'super' (Global Admin)
	// We assume 'super' is Role="super" (1). 'admin' (2) is Tenant Admin.
	// We probably want to replace 'admin' too if it's a full sync?
	// But deleting the current user (likely admin) is risky.
	// However, standard replace logic wipes the slate.
	// We will preserve 'super' role users as a safety net.
	if importMode == "replace" {
		if err := tx.Where("tenant_id = ? AND role != ?", req.TenantId, "super").Delete(&User{}).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to clear existing users: %v", err)
		}
	}

	var successCount int32
	var failureCount int32
	var failureReasons []string

	// Cache existing users for Upsert optimization if not Replace
	existingUsers := make(map[string]User)
	if importMode == "upsert" {
		var users []User
		if err := tx.Where("tenant_id = ?", req.TenantId).Find(&users).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to fetch existing users: %v", err)
		}
		for _, u := range users {
			existingUsers[u.Email] = u
		}
	}

	for i, item := range req.Requests {
		// Prepare data
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

		// Check overlap in Upsert
		var existingID string
		if importMode == "upsert" {
			if u, ok := existingUsers[item.Email]; ok {
				existingID = u.ID
			}
		}

		// Create SavePoint
		spName := fmt.Sprintf("sp_%d", i)
		if err := tx.SavePoint(spName).Error; err != nil {
			failureCount++
			failureReasons = append(failureReasons, "Internal DB Error (SavePoint): "+err.Error())
			continue
		}

		if existingID != "" {
			// Update Existing User
			updates := map[string]interface{}{
				"username":      username,
				"role":          roleStr,
				"department_id": strToPtr(item.DepartmentId),
				"birthday":      item.Birthday,
				"position_id":   strToPtr(item.PositionId),
				"updated_at":    gorm.Expr("NOW()"),
			}
			if len(item.PhoneNumbers) > 0 {
				updates["phone_numbers"] = item.PhoneNumbers
			}

			if err := tx.Model(&User{}).Where("id = ?", existingID).Updates(updates).Error; err != nil {
				tx.RollbackTo(spName) // Rollback to SavePoint
				failureCount++
				failureReasons = append(failureReasons, "Failed to update "+item.Email+": "+err.Error())
				continue
			}
			successCount++

		} else {
			// Create New User
			password := item.Password
			if password == "" {
				password = "zzzzzzzz"
			}

			hashedPassword, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
			if err != nil {
				failureCount++
				failureReasons = append(failureReasons, "Hash failed for "+item.Email)
				continue
			}

			saltBytes := make([]byte, 32)
			if _, err := rand.Read(saltBytes); err != nil {
				failureCount++
				failureReasons = append(failureReasons, "Salt failed for "+item.Email)
				continue
			}
			salt := base64.StdEncoding.EncodeToString(saltBytes)

			user := User{
				ID:           uuid.New().String(),
				Email:        item.Email,
				PasswordHash: string(hashedPassword),
				Salt:         salt,
				Username:     username,
				TenantID:     req.TenantId,
				Role:         roleStr,
				DepartmentID: strToPtr(item.DepartmentId),
				Birthday:     item.Birthday,
				PhoneNumbers: item.PhoneNumbers,
				PositionID:   strToPtr(item.PositionId),
			}

			if err := tx.Create(&user).Error; err != nil {
				tx.RollbackTo(spName) // Rollback to SavePoint
				failureCount++
				failureReasons = append(failureReasons, "Create failed for "+item.Email+": "+err.Error())
				continue
			}

			// Exemption: Super/Admin
			if item.Role == pb.Role_ROLE_SUPER || item.Role == pb.Role_ROLE_ADMIN {
				if err := tx.Model(&user).Update("force_change_password", false).Error; err != nil {
					tx.RollbackTo(spName)
					failureCount++
					failureReasons = append(failureReasons, "Failed to set exemption for "+item.Email)
					continue
				}
			}
			successCount++
		}
	}

	if failureCount > 0 && importMode == "replace" {
		// If strict transactional replace is needed:
		// tx.Rollback()
		// return nil ...
		// But usually batch processes allow partial success if possible?
		// However, standard logic is often all-or-nothing for transactions.
		// "replace" was a single transaction. If we encounter errors, maybe we should fail all?
		// Dept modal did fail all.
		// I will fail all if any error.
		tx.Rollback()
		return &pb.BatchCreateUsersResponse{
			SuccessCount:   0,
			FailureCount:   failureCount,
			FailureReasons: failureReasons,
		}, nil
	} else if failureCount > 0 {
		// For Upsert, maybe partial success is allowed?
		// But current Proto response structure suggests valid counts.
		// Let's commit success ones and report failures?
		// But we wrapped in `tx`.
		// I'll rollback on ANY failure for safety and consistency with department logic.
		tx.Rollback()
		return &pb.BatchCreateUsersResponse{
			SuccessCount:   0,
			FailureCount:   failureCount,
			FailureReasons: failureReasons,
		}, nil
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit batch: %v", err)
	}

	return &pb.BatchCreateUsersResponse{
		SuccessCount:   successCount,
		FailureCount:   0,
		FailureReasons: nil,
	}, nil
}

// Helper functions for string pointers
func strToPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func ptrToStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ResetAndSendPassword: 비밀번호 재설정 및 이메일 전송
func (s *server) ResetAndSendPassword(ctx context.Context, req *pb.ResetAndSendPasswordRequest) (*pb.ResetAndSendPasswordResponse, error) {
	var user User
	result := s.db.Where("id = ? AND tenant_id = ?", req.UserId, req.TenantId).First(&user)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, status.Errorf(codes.NotFound, "user not found")
		}
		return nil, status.Errorf(codes.Internal, "db error: %v", result.Error)
	}

	// Generate New Password
	newPassword, err := generateRandomPassword(12)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate password: %v", err)
	}

	// Hash Password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to hash password: %v", err)
	}

	// Generate New Salt (Optional, but good practice to rotate)
	saltBytes := make([]byte, 32)
	if _, err := rand.Read(saltBytes); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to generate salt: %v", err)
	}
	salt := base64.StdEncoding.EncodeToString(saltBytes)

	// Update User
	updates := map[string]interface{}{
		"password_hash":         string(hashedPassword),
		"salt":                  salt,
		"force_change_password": true,
		"updated_at":            gorm.Expr("NOW()"),
	}

	if err := s.db.Model(&user).Updates(updates).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user: %v", err)
	}

	// Send Email
	if err := s.SendPasswordEmail(user.Email, newPassword); err != nil {
		return nil, status.Errorf(codes.Internal, "failed to send email: %v", err)
	}

	return &pb.ResetAndSendPasswordResponse{Success: true}, nil
}

func generateRandomPassword(length int) (string, error) {
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
	b := make([]byte, length)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = charset[int(b[i])%len(charset)]
	}
	return string(b), nil
}

// BatchResetPassword: Tenant 내 모든 일반 사용자(Super/Admin 제외)의 비밀번호 초기화 및 전송
func (s *server) BatchResetPassword(ctx context.Context, req *pb.BatchResetPasswordRequest) (*pb.BatchResetPasswordResponse, error) {
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "Tenant ID is required")
	}

	// 1. Fetch target users (Exclude Super/Admin for safety)
	var users []User
	if err := s.db.Where("tenant_id = ? AND role NOT IN ?", req.TenantId, []string{"super", "admin"}).Find(&users).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to fetch users: %v", err)
	}

	var successCount int32
	var failureCount int32

	// 2. Iterate and Reset
	for _, user := range users {
		// Generate New Password
		newPassword, err := generateRandomPassword(12)
		if err != nil {
			failureCount++
			continue
		}

		// Hash Password
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
		if err != nil {
			failureCount++
			continue
		}

		// Update DB
		updates := map[string]interface{}{
			"password_hash":         string(hashedPassword),
			"force_change_password": true,
			"updated_at":            gorm.Expr("NOW()"),
		}
		if err := s.db.Model(&user).Updates(updates).Error; err != nil {
			failureCount++
			continue
		}

		// Send Email (Best Effort)
		if err := s.SendPasswordEmail(user.Email, newPassword); err != nil {
			// Even if email fails, password is changed.
			// We might want to log this or consider it a "partial failure"?
			// For now, count as success
			// Send emails to mock sender (logged to console) or MailHog
			// ... (Emails are sent inside the loop now)

			fmt.Printf("Failed to send email to %s: %v\n", user.Email, err)
		}
		successCount++
	}

	return &pb.BatchResetPasswordResponse{
		SuccessCount: successCount,
		FailureCount: failureCount,
	}, nil
}

func (s *server) ChangePassword(ctx context.Context, req *pb.ChangePasswordRequest) (*pb.ChangePasswordResponse, error) {
	var user User
	result := s.db.Where("id = ? AND tenant_id = ?", req.UserId, req.TenantId).First(&user)
	if result.Error != nil {
		if result.Error == gorm.ErrRecordNotFound {
			return nil, status.Errorf(codes.NotFound, "user not found")
		}
		return nil, status.Errorf(codes.Internal, "db error: %v", result.Error)
	}

	// Verify current password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return nil, status.Errorf(codes.Unauthenticated, "invalid current password")
	}

	// Hash new password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "failed to hash password")
	}

	// Update user
	user.PasswordHash = string(hashedPassword)
	user.ForceChangePassword = false // Reset force flag

	if err := s.db.Save(&user).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update user")
	}

	return &pb.ChangePasswordResponse{Success: true}, nil
}
