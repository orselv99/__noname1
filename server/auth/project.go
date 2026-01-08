package main

import (
	"context"
	"time"

	pb "server/.protos/auth"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CreateProject
func (s *server) CreateProject(ctx context.Context, req *pb.CreateProjectRequest) (*pb.CreateProjectResponse, error) {
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "project name is required")
	}

	var projID string
	if req.Id != "" {
		projID = req.Id
	} else {
		projID = uuid.New().String()
	}

	// Set default visibility to 1 if not specified
	visibility := int(req.DefaultVisibilityLevel)
	if visibility == 0 {
		visibility = 1
	}

	proj := Project{
		ID:                     projID,
		TenantID:               req.TenantId,
		Name:                   req.Name,
		Description:            req.Description,
		OwnerID:                stringPtr(req.OwnerId),
		MemberIDs:              req.MemberIds,
		ManagerID:              stringPtr(req.ManagerId),
		DefaultVisibilityLevel: visibility,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	}

	// Re-fetch with OwnerRel to populate return
	if err := s.db.Create(&proj).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create project: %v", err)
	}
	s.db.Preload("OwnerRel").First(&proj, "id = ?", proj.ID)

	return &pb.CreateProjectResponse{
		Project: convertProjectToPB(&proj),
	}, nil
}

// BatchCreateProjects
// BatchCreateProjects
func (s *server) BatchCreateProjects(ctx context.Context, req *pb.BatchCreateProjectsRequest) (*pb.BatchCreateProjectsResponse, error) {
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

	existingNames := make(map[string]bool)

	if importMode == "replace" {
		// Delete all existing projects for this tenant
		if err := tx.Where("tenant_id = ?", req.TenantId).Delete(&Project{}).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to clear existing projects: %v", err)
		}
	} else {
		// upsert mode: keep existing, skip duplicates
		var existingProjs []Project
		tx.Where("tenant_id = ?", req.TenantId).Find(&existingProjs)
		for _, p := range existingProjs {
			existingNames[p.Name] = true
		}
	}

	for _, projReq := range req.Requests {
		if projReq.Name == "" {
			failureReasons = append(failureReasons, "project name is required")
			continue
		}

		// Skip if already exists (upsert mode)
		if existingNames[projReq.Name] {
			continue
		}

		var projID string
		if projReq.Id != "" {
			projID = projReq.Id
		} else {
			projID = uuid.New().String()
		}

		visibility := int(projReq.DefaultVisibilityLevel)
		if visibility == 0 {
			visibility = 1
		}

		proj := Project{
			ID:                     projID,
			TenantID:               req.TenantId,
			Name:                   projReq.Name,
			Description:            projReq.Description,
			OwnerID:                stringPtr(projReq.OwnerId),
			MemberIDs:              projReq.MemberIds,
			ManagerID:              stringPtr(projReq.ManagerId),
			DefaultVisibilityLevel: visibility,
			CreatedAt:              time.Now(),
			UpdatedAt:              time.Now(),
		}

		if err := tx.Create(&proj).Error; err != nil {
			tx.Rollback()
			return &pb.BatchCreateProjectsResponse{
				SuccessCount:   0,
				FailureCount:   int32(len(req.Requests)),
				FailureReasons: []string{"Transaction failed: " + err.Error()},
			}, status.Errorf(codes.Internal, "transaction failed: %v", err)
		}

		// Update locally to prevent duplicates within the same batch
		existingNames[proj.Name] = true
		successCount++
	}

	if len(failureReasons) > 0 {
		tx.Rollback()
		return &pb.BatchCreateProjectsResponse{
			SuccessCount:   0,
			FailureCount:   int32(len(req.Requests)),
			FailureReasons: failureReasons,
		}, nil
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit transaction: %v", err)
	}

	return &pb.BatchCreateProjectsResponse{
		SuccessCount: successCount,
		FailureCount: 0,
	}, nil
}

// ListProjects
func (s *server) ListProjects(ctx context.Context, req *pb.ListProjectsRequest) (*pb.ListProjectsResponse, error) {
	var projs []Project
	query := s.db.Where("tenant_id = ?", req.TenantId)

	if req.SearchQuery != "" {
		query = query.Where("name ILIKE ?", "%"+req.SearchQuery+"%")
	}

	// Flat list order
	if err := query.Preload("OwnerRel").Order("sort_order asc, created_at desc").Find(&projs).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list projects: %v", err)
	}

	var pbProjs []*pb.Project
	for _, p := range projs {
		pbProjs = append(pbProjs, convertProjectToPB(&p))
	}

	return &pb.ListProjectsResponse{
		Projects: pbProjs,
	}, nil
}

// UpdateProject
func (s *server) UpdateProject(ctx context.Context, req *pb.UpdateProjectRequest) (*pb.UpdateProjectResponse, error) {
	var proj Project
	if err := s.db.First(&proj, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "project not found")
	}

	// Only update fields that are provided (non-empty values)
	if req.Name != "" {
		proj.Name = req.Name
	}
	if req.Description != "" {
		proj.Description = req.Description
	}
	if req.OwnerId != "" {
		proj.OwnerID = stringPtr(req.OwnerId)
	}
	if len(req.MemberIds) > 0 {
		proj.MemberIDs = req.MemberIds
	}
	if req.ManagerId != "" {
		proj.ManagerID = stringPtr(req.ManagerId)
	}
	if req.DefaultVisibilityLevel != 0 {
		proj.DefaultVisibilityLevel = int(req.DefaultVisibilityLevel)
	}
	proj.UpdatedAt = time.Now()

	if err := s.db.Save(&proj).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update project: %v", err)
	}
	s.db.Preload("OwnerRel").First(&proj, "id = ?", proj.ID)

	return &pb.UpdateProjectResponse{
		Project: convertProjectToPB(&proj),
	}, nil
}

// DeleteProject
func (s *server) DeleteProject(ctx context.Context, req *pb.DeleteProjectRequest) (*pb.DeleteProjectResponse, error) {
	if err := s.db.Delete(&Project{}, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete project: %v", err)
	}

	return &pb.DeleteProjectResponse{
		Success: true,
	}, nil
}

// GetProject
func (s *server) GetProject(ctx context.Context, req *pb.GetProjectRequest) (*pb.GetProjectResponse, error) {
	var proj Project
	if err := s.db.Preload("OwnerRel").First(&proj, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "project not found")
	}

	// Fetch Manager Details (Optional)
	var manager User
	var pbManager *pb.User
	if proj.ManagerID != nil && *proj.ManagerID != "" {
		if err := s.db.Select("id, username, email").First(&manager, "id = ?", *proj.ManagerID).Error; err == nil {
			pbManager = &pb.User{
				Id:       manager.ID,
				Username: manager.Username,
				Email:    manager.Email,
			}
		}
	}

	pbProj := convertProjectToPB(&proj)
	pbProj.Manager = pbManager

	return &pb.GetProjectResponse{
		Project: pbProj,
	}, nil
}

// ReorderProjects
func (s *server) ReorderProjects(ctx context.Context, req *pb.ReorderProjectsRequest) (*pb.ReorderProjectsResponse, error) {
	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	for _, item := range req.Items {
		updates := map[string]interface{}{
			"sort_order": item.SortOrder,
			"updated_at": time.Now(),
		}

		if err := tx.Model(&Project{}).Where("id = ?", item.Id).Updates(updates).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to reorder project: %v", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit reorder: %v", err)
	}

	return &pb.ReorderProjectsResponse{
		Success: true,
	}, nil
}

// Helper: Convert Model to PB
func convertProjectToPB(p *Project) *pb.Project {
	ownerName := ""
	if p.OwnerRel != nil {
		ownerName = p.OwnerRel.Username
	} else if p.OwnerName != "" { // Fallback if manually joined
		ownerName = p.OwnerName
	}

	return &pb.Project{
		Id:                     p.ID,
		OwnerName:              ownerName,
		Name:                   p.Name,
		Description:            p.Description,
		OwnerId:                ptrString(p.OwnerID),
		MemberIds:              p.MemberIDs,
		ManagerId:              ptrString(p.ManagerID),
		DefaultVisibilityLevel: pb.VisibilityLevel(p.DefaultVisibilityLevel),
		SortOrder:              int32(p.SortOrder),
		CreatedAt:              p.CreatedAt.String(),
		UpdatedAt:              p.UpdatedAt.String(),
	}
}
