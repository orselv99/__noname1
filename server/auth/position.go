package main

import (
	"context"
	"time"

	pb "server/.protos/auth"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ---------- Positions ----------

func (s *server) CreatePosition(ctx context.Context, req *pb.CreatePositionRequest) (*pb.CreatePositionResponse, error) {
	if req.Name == "" {
		return nil, status.Error(codes.InvalidArgument, "name is required")
	}
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	// Auto-assign SortOrder (Max + 1)
	var maxOrder int
	// Use COALESCE to handle NULL (empty table) result as 0
	if err := s.db.Model(&Position{}).Where("tenant_id = ?", req.TenantId).Select("COALESCE(MAX(sort_order), 0)").Scan(&maxOrder).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to get max order: %v", err)
	}

	pos := Position{
		TenantID:  req.TenantId,
		Name:      req.Name,
		SortOrder: maxOrder + 1,
	}

	if err := s.db.Create(&pos).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create position: %v", err)
	}

	return &pb.CreatePositionResponse{
		Position: &pb.Position{
			Id:       pos.ID,
			TenantId: pos.TenantID,
			Name:     pos.Name,
			Order:    int32(pos.SortOrder),
		},
	}, nil
}

func (s *server) ListPositions(ctx context.Context, req *pb.ListPositionsRequest) (*pb.ListPositionsResponse, error) {
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	var positions []Position
	// Sort by SortOrder ASC
	if err := s.db.Where("tenant_id = ?", req.TenantId).Order("sort_order asc").Find(&positions).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list positions: %v", err)
	}

	var pbPositions []*pb.Position
	for _, p := range positions {
		pbPositions = append(pbPositions, &pb.Position{
			Id:       p.ID,
			TenantId: p.TenantID,
			Name:     p.Name,
			Order:    int32(p.SortOrder),
		})
	}

	return &pb.ListPositionsResponse{Positions: pbPositions}, nil
}

func (s *server) UpdatePosition(ctx context.Context, req *pb.UpdatePositionRequest) (*pb.UpdatePositionResponse, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	var pos Position
	if err := s.db.First(&pos, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "position not found")
	}

	if req.Name != "" {
		pos.Name = req.Name
	}
	// SortOrder is updated via ReorderPositions

	if err := s.db.Save(&pos).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update position: %v", err)
	}

	return &pb.UpdatePositionResponse{
		Position: &pb.Position{
			Id:       pos.ID,
			TenantId: pos.TenantID,
			Name:     pos.Name,
			Order:    int32(pos.SortOrder),
		},
	}, nil
}

func (s *server) DeletePosition(ctx context.Context, req *pb.DeletePositionRequest) (*pb.DeletePositionResponse, error) {
	if req.Id == "" {
		return nil, status.Error(codes.InvalidArgument, "id is required")
	}

	if err := s.db.Delete(&Position{}, "id = ?", req.Id).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to delete position: %v", err)
	}

	return &pb.DeletePositionResponse{Success: true}, nil
}

func (s *server) ReorderPositions(ctx context.Context, req *pb.ReorderPositionsRequest) (*pb.ReorderPositionsResponse, error) {
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	for _, item := range req.Items {
		updates := map[string]interface{}{
			"sort_order": item.Order,
			"updated_at": time.Now(),
		}
		if err := tx.Model(&Position{}).Where("id = ?", item.Id).Updates(updates).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to reorder position: %v", err)
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit reorder: %v", err)
	}

	return &pb.ReorderPositionsResponse{Success: true}, nil
}

func (s *server) BatchCreatePositions(ctx context.Context, req *pb.BatchCreatePositionsRequest) (*pb.BatchCreatePositionsResponse, error) {
	if req.TenantId == "" {
		return nil, status.Error(codes.InvalidArgument, "tenant_id is required")
	}

	successCount := 0
	failureCount := 0
	var failureReasons []string

	// Handle import_mode
	importMode := req.ImportMode
	if importMode == "" {
		importMode = "upsert" // Default mode
	}

	tx := s.db.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Map to track existing positions by name
	existingNames := make(map[string]bool)

	if importMode == "replace" {
		// Delete all existing positions for this tenant
		if err := tx.Where("tenant_id = ?", req.TenantId).Delete(&Position{}).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to clear existing positions: %v", err)
		}
	} else {
		// upsert mode: fetch existing positions to skip duplicates
		var existingPositions []Position
		tx.Where("tenant_id = ?", req.TenantId).Find(&existingPositions)
		for _, p := range existingPositions {
			existingNames[p.Name] = true
		}
	}

	// Get current max order (after potential delete)
	var maxOrder int
	if err := tx.Model(&Position{}).Where("tenant_id = ?", req.TenantId).Select("COALESCE(MAX(sort_order), 0)").Scan(&maxOrder).Error; err != nil {
		tx.Rollback()
		return nil, status.Errorf(codes.Internal, "failed to get max order: %v", err)
	}

	for _, item := range req.Requests {
		if item.Name == "" {
			failureCount++
			failureReasons = append(failureReasons, "name is required")
			continue
		}

		// Skip if already exists in upsert mode
		if existingNames[item.Name] {
			continue
		}

		maxOrder++
		pos := Position{
			TenantID:  req.TenantId,
			Name:      item.Name,
			SortOrder: maxOrder,
		}

		if err := tx.Create(&pos).Error; err != nil {
			failureCount++
			failureReasons = append(failureReasons, "failed to create position: "+item.Name)
		} else {
			successCount++
			existingNames[item.Name] = true // Track to skip duplicates in same batch
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to commit batch: %v", err)
	}

	return &pb.BatchCreatePositionsResponse{
		SuccessCount:   int32(successCount),
		FailureCount:   int32(failureCount),
		FailureReasons: failureReasons,
	}, nil
}

// ---------- Jobs ----------
