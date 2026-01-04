package main

import (
	"context"
	"strings"
	"time"

	pb "server/.protos/auth"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Helper: Convert string to *string, returns nil if empty
func stringPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// Helper: Convert *string to string, returns "" if nil
func ptrString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// CreateDepartment
func (s *server) CreateDepartment(ctx context.Context, req *pb.CreateDepartmentRequest) (*pb.CreateDepartmentResponse, error) {
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "department name is required")
	}

	var deptID string
	if req.Id != "" {
		deptID = req.Id
	} else {
		deptID = uuid.New().String()
	}

	// Set default visibility to 1 if not specified
	visibility := int(req.DefaultVisibilityLevel)
	if visibility == 0 {
		visibility = 1
	}

	dept := Department{
		ID:                     deptID,
		TenantID:               req.TenantId,
		Name:                   req.Name,
		ManagerID:              stringPtr(req.ManagerId),
		ParentDepartmentID:     stringPtr(req.ParentDepartmentId),
		DefaultVisibilityLevel: visibility,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	}

	if err := s.db.Create(&dept).Error; err != nil {
		// Check for duplicate key error
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "idx_tenant_dept_name") {
			return nil, status.Errorf(codes.AlreadyExists, "department with name '%s' already exists", req.Name)
		}
		return nil, status.Errorf(codes.Internal, "failed to create department: %v", err)
	}

	return &pb.CreateDepartmentResponse{
		Department: convertDepartmentToPB(&dept),
	}, nil
}

// BatchCreateDepartments
func (s *server) BatchCreateDepartments(ctx context.Context, req *pb.BatchCreateDepartmentsRequest) (*pb.BatchCreateDepartmentsResponse, error) {
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	var failureReasons []string
	var successCount int32

	// Handle import_mode
	importMode := req.ImportMode
	if importMode == "" {
		importMode = "upsert" // Default mode
	}

	// Map to store created departments by name for parent lookup
	createdDepts := make(map[string]string) // name -> ID
	existingNames := make(map[string]bool)  // For duplicate check in upsert mode

	// Fetch existing departments
	var existingDepts []Department
	tx.Where("tenant_id = ?", req.TenantId).Find(&existingDepts)

	if importMode == "replace" {
		// Delete all existing departments for this tenant
		if err := tx.Where("tenant_id = ?", req.TenantId).Delete(&Department{}).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to clear existing departments: %v", err)
		}
		// createdDepts stays empty, no existing departments anymore
	} else {
		// upsert mode: keep existing, skip duplicates
		for _, d := range existingDepts {
			createdDepts[d.Name] = d.ID
			existingNames[d.Name] = true
		}
	}

	// Two-phase processing:
	// Phase 1: Create root departments (no parent_name)
	// Phase 2: Create child departments (with parent_name)

	// Phase 1: Root departments
	for _, deptReq := range req.Requests {
		if deptReq.ParentName != "" || deptReq.ParentDepartmentId != "" {
			continue // Skip child departments in phase 1
		}

		if deptReq.Name == "" {
			failureReasons = append(failureReasons, "department name is required")
			continue
		}

		// Skip if already exists (upsert mode)
		if existingNames[deptReq.Name] {
			continue
		}

		var deptID string
		if deptReq.Id != "" {
			deptID = deptReq.Id
		} else {
			deptID = uuid.New().String()
		}

		visibility := int(deptReq.DefaultVisibilityLevel)
		if visibility == 0 {
			visibility = 1
		}

		dept := Department{
			ID:                     deptID,
			TenantID:               req.TenantId,
			Name:                   deptReq.Name,
			ManagerID:              stringPtr(deptReq.ManagerId),
			ParentDepartmentID:     nil, // Root department
			DefaultVisibilityLevel: visibility,
			CreatedAt:              time.Now(),
			UpdatedAt:              time.Now(),
		}

		if err := tx.Create(&dept).Error; err != nil {
			tx.Rollback()
			return &pb.BatchCreateDepartmentsResponse{
				SuccessCount:   0,
				FailureCount:   int32(len(req.Requests)),
				FailureReasons: []string{"Transaction failed: " + err.Error()},
			}, status.Errorf(codes.Internal, "transaction failed: %v", err)
		}

		createdDepts[deptReq.Name] = deptID
		successCount++
	}

	// Phase 2: Child departments
	for _, deptReq := range req.Requests {
		if deptReq.ParentName == "" && deptReq.ParentDepartmentId == "" {
			continue // Skip root departments (already processed)
		}

		if deptReq.Name == "" {
			failureReasons = append(failureReasons, "department name is required")
			continue
		}

		// Skip if already exists (upsert mode)
		if existingNames[deptReq.Name] {
			continue
		}

		var deptID string
		if deptReq.Id != "" {
			deptID = deptReq.Id
		} else {
			deptID = uuid.New().String()
		}

		visibility := int(deptReq.DefaultVisibilityLevel)
		if visibility == 0 {
			visibility = 1
		}

		// Resolve parent ID
		var parentID *string
		if deptReq.ParentDepartmentId != "" {
			parentID = stringPtr(deptReq.ParentDepartmentId)
		} else if deptReq.ParentName != "" {
			// Lookup by parent name
			if pid, ok := createdDepts[deptReq.ParentName]; ok {
				parentID = &pid
			} else {
				failureReasons = append(failureReasons, "parent department '"+deptReq.ParentName+"' not found for '"+deptReq.Name+"'")
				continue
			}
		}

		dept := Department{
			ID:                     deptID,
			TenantID:               req.TenantId,
			Name:                   deptReq.Name,
			ManagerID:              stringPtr(deptReq.ManagerId),
			ParentDepartmentID:     parentID,
			DefaultVisibilityLevel: visibility,
			CreatedAt:              time.Now(),
			UpdatedAt:              time.Now(),
		}

		if err := tx.Create(&dept).Error; err != nil {
			tx.Rollback()
			return &pb.BatchCreateDepartmentsResponse{
				SuccessCount:   0,
				FailureCount:   int32(len(req.Requests)),
				FailureReasons: []string{"Transaction failed: " + err.Error()},
			}, status.Errorf(codes.Internal, "transaction failed: %v", err)
		}

		createdDepts[deptReq.Name] = deptID
		successCount++
	}

	if len(failureReasons) > 0 {
		tx.Rollback()
		return &pb.BatchCreateDepartmentsResponse{
			SuccessCount:   0,
			FailureCount:   int32(len(req.Requests)),
			FailureReasons: failureReasons,
		}, nil
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit transaction: %v", err)
	}

	return &pb.BatchCreateDepartmentsResponse{
		SuccessCount: successCount,
		FailureCount: 0,
	}, nil
}

// ListDepartments
func (s *server) ListDepartments(ctx context.Context, req *pb.ListDepartmentsRequest) (*pb.ListDepartmentsResponse, error) {
	var depts []Department
	query := s.db.Where("tenant_id = ?", req.TenantId)

	if req.SearchQuery != "" {
		query = query.Where("name ILIKE ?", "%"+req.SearchQuery+"%")
	}

	if err := query.Order("sort_order asc, created_at desc").Find(&depts).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list departments: %v", err)
	}

	var pbDepts []*pb.Department
	for _, d := range depts {
		pbDepts = append(pbDepts, convertDepartmentToPB(&d))
	}

	return &pb.ListDepartmentsResponse{
		Departments: pbDepts,
	}, nil
}

// UpdateDepartment
func (s *server) UpdateDepartment(ctx context.Context, req *pb.UpdateDepartmentRequest) (*pb.UpdateDepartmentResponse, error) {
	var dept Department
	if err := s.db.First(&dept, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "department not found")
	}

	dept.Name = req.Name
	dept.ManagerID = stringPtr(req.ManagerId)
	dept.ParentDepartmentID = stringPtr(req.ParentDepartmentId)
	dept.DefaultVisibilityLevel = int(req.DefaultVisibilityLevel)
	dept.UpdatedAt = time.Now()

	if err := s.db.Save(&dept).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update department: %v", err)
	}

	return &pb.UpdateDepartmentResponse{
		Department: convertDepartmentToPB(&dept),
	}, nil
}

// DeleteDepartment
func (s *server) DeleteDepartment(ctx context.Context, req *pb.DeleteDepartmentRequest) (*pb.DeleteDepartmentResponse, error) {
	if err := s.db.Delete(&Department{}, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete department: %v", err)
	}

	return &pb.DeleteDepartmentResponse{
		Success: true,
	}, nil
}

// GetDepartment
func (s *server) GetDepartment(ctx context.Context, req *pb.GetDepartmentRequest) (*pb.GetDepartmentResponse, error) {
	var dept Department
	if err := s.db.First(&dept, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "department not found")
	}

	// Fetch Manager Details (Optional)
	var manager User
	var pbManager *pb.User
	if dept.ManagerID != nil && *dept.ManagerID != "" {
		if err := s.db.Select("id, username, email").First(&manager, "id = ?", *dept.ManagerID).Error; err == nil {
			pbManager = &pb.User{
				Id:       manager.ID,
				Username: manager.Username,
				Email:    manager.Email,
			}
		}
	}

	pbDept := convertDepartmentToPB(&dept)
	pbDept.Manager = pbManager

	return &pb.GetDepartmentResponse{
		Department: pbDept,
	}, nil
}

// Helper: Convert Model to PB
func convertDepartmentToPB(d *Department) *pb.Department {
	return &pb.Department{
		Id:                     d.ID,
		Name:                   d.Name,
		ManagerId:              ptrString(d.ManagerID),
		ParentDepartmentId:     ptrString(d.ParentDepartmentID),
		DefaultVisibilityLevel: pb.VisibilityLevel(d.DefaultVisibilityLevel),
		SortOrder:              int32(d.SortOrder),
		CreatedAt:              d.CreatedAt.String(),
		UpdatedAt:              d.UpdatedAt.String(),
	}
}

// ReorderDepartments - Update sort order and parent for drag-drop
func (s *server) ReorderDepartments(ctx context.Context, req *pb.ReorderDepartmentsRequest) (*pb.ReorderDepartmentsResponse, error) {
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	for _, item := range req.Items {
		updates := map[string]interface{}{
			"sort_order":           item.SortOrder,
			"parent_department_id": stringPtr(item.ParentDepartmentId),
			"updated_at":           time.Now(),
		}

		if err := tx.Model(&Department{}).Where("id = ?", item.Id).Updates(updates).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to reorder department: %v", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit reorder: %v", err)
	}

	return &pb.ReorderDepartmentsResponse{
		Success: true,
	}, nil
}
