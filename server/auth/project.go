package main

import (
	"context"
	"time"

	pb "server/.protos/auth"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Project struct (GORM model)
type Project struct {
	ID                     string  `gorm:"type:uuid;primary_key;"`
	TenantID               string  `gorm:"type:varchar(50);index;not null"`
	Name                   string  `gorm:"type:varchar(100);not null"`
	Description            string  `gorm:"type:string"`
	ManagerID              *string `gorm:"type:uuid"`
	DefaultVisibilityLevel int     `gorm:"default:1"`
	SortOrder              int     `gorm:"default:0"`
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

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
		ManagerID:              stringPtr(req.ManagerId),
		DefaultVisibilityLevel: visibility,
		CreatedAt:              time.Now(),
		UpdatedAt:              time.Now(),
	}

	if err := s.db.Create(&proj).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create project: %v", err)
	}

	return &pb.CreateProjectResponse{
		Project: convertProjectToPB(&proj),
	}, nil
}

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

	for _, projReq := range req.Requests {
		if projReq.Name == "" {
			failureReasons = append(failureReasons, "project name is required")
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
	if err := query.Order("sort_order asc, created_at desc").Find(&projs).Error; err != nil {
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

	proj.Name = req.Name
	proj.Description = req.Description
	proj.ManagerID = stringPtr(req.ManagerId)
	proj.DefaultVisibilityLevel = int(req.DefaultVisibilityLevel)
	proj.UpdatedAt = time.Now()

	if err := s.db.Save(&proj).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update project: %v", err)
	}

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
	if err := s.db.First(&proj, "id = ?", req.Id).Error; err != nil {
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
	return &pb.Project{
		Id:                     p.ID,
		Name:                   p.Name,
		Description:            p.Description,
		ManagerId:              ptrString(p.ManagerID),
		DefaultVisibilityLevel: pb.VisibilityLevel(p.DefaultVisibilityLevel),
		SortOrder:              int32(p.SortOrder),
		CreatedAt:              p.CreatedAt.String(),
		UpdatedAt:              p.UpdatedAt.String(),
	}
}
