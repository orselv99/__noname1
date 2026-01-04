package main

import (
	"context"
	"time"

	pb "server/.protos/auth"

	"github.com/google/uuid"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// CreateDocumentMetadata
func (s *server) CreateDocumentMetadata(ctx context.Context, req *pb.CreateDocumentMetadataRequest) (*pb.CreateDocumentMetadataResponse, error) {
	doc := DocumentMetadata{
		ID:                    req.Id,
		OwnerID:               req.OwnerId,
		DepartmentID:          req.DepartmentId,
		Title:                 req.Title,
		SearchVisibilityLevel: int(req.SearchVisibilityLevel),
		IsPrivate:             req.IsPrivate,
		ApprovalStatus:        "none",
		CreatedAt:             time.Now(),
		UpdatedAt:             time.Now(),
	}

	if doc.ID == "" {
		doc.ID = uuid.New().String()
	}

	if err := s.db.Create(&doc).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create document metadata: %v", err)
	}

	return &pb.CreateDocumentMetadataResponse{
		Document: convertDocumentToPB(&doc),
	}, nil
}

// GetDocumentMetadata
func (s *server) GetDocumentMetadata(ctx context.Context, req *pb.GetDocumentMetadataRequest) (*pb.GetDocumentMetadataResponse, error) {
	var doc DocumentMetadata
	if err := s.db.First(&doc, "id = ?", req.DocumentId).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "document not found")
	}

	return &pb.GetDocumentMetadataResponse{
		Document: convertDocumentToPB(&doc),
	}, nil
}

// UpdateDocumentVisibility
func (s *server) UpdateDocumentVisibility(ctx context.Context, req *pb.UpdateDocumentVisibilityRequest) (*pb.UpdateDocumentVisibilityResponse, error) {
	var doc DocumentMetadata
	if err := s.db.First(&doc, "id = ?", req.DocumentId).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "document not found")
	}

	// 1. If Private setting is changing, just update it (Owner only check should be done by caller or here)
	// Assuming caller verified ownership or we check strictly:
	if req.RequesterId != doc.OwnerID {
		// Strict check: Only Owner can change visibility
		return nil, status.Errorf(codes.PermissionDenied, "only owner can change visibility")
	}

	doc.IsPrivate = req.IsPrivate

	// 2. Check Visibility Level Elevation
	if int(req.NewVisibilityLevel) != doc.SearchVisibilityLevel {
		// Fetch Department Default
		var dept Department
		if err := s.db.First(&dept, "id = ?", doc.DepartmentID).Error; err != nil {
			// If dept not found, assume default is 0 (Hidden)
			dept.DefaultVisibilityLevel = 0
		}

		// Logic: If New Level > Dept Default -> Require Approval
		if int(req.NewVisibilityLevel) > dept.DefaultVisibilityLevel {
			// Create Approval Request
			approval := VisibilityApproval{
				ID:          uuid.New().String(),
				DocumentID:  doc.ID,
				RequesterID: req.RequesterId,
				ApproverID: func() string {
					if dept.ManagerID != nil {
						return *dept.ManagerID
					}
					return ""
				}(), // Assign to Dept Manager
				RequestedLevel: int(req.NewVisibilityLevel),
				Status:         "pending",
				CreatedAt:      time.Now(),
				UpdatedAt:      time.Now(),
			}

			if err := s.db.Create(&approval).Error; err != nil {
				return nil, status.Errorf(codes.Internal, "failed to create approval request: %v", err)
			}

			// Update Doc Status to 'pending' but NOT the level yet
			doc.ApprovalStatus = "pending"
			if err := s.db.Save(&doc).Error; err != nil {
				return nil, status.Errorf(codes.Internal, "failed to update doc status: %v", err)
			}

			return &pb.UpdateDocumentVisibilityResponse{
				Success:    true,
				Status:     "pending_approval",
				ApprovalId: approval.ID,
			}, nil
		}

		// If Valid (<= Default), update directly
		doc.SearchVisibilityLevel = int(req.NewVisibilityLevel)
		doc.ApprovalStatus = "approved" // Auto-approved
	}

	doc.UpdatedAt = time.Now()
	if err := s.db.Save(&doc).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to update document: %v", err)
	}

	return &pb.UpdateDocumentVisibilityResponse{
		Success: true,
		Status:  "applied",
	}, nil
}

func convertDocumentToPB(d *DocumentMetadata) *pb.DocumentMetadata {
	return &pb.DocumentMetadata{
		Id:                    d.ID,
		OwnerId:               d.OwnerID,
		DepartmentId:          d.DepartmentID,
		Title:                 d.Title,
		SearchVisibilityLevel: pb.VisibilityLevel(d.SearchVisibilityLevel),
		IsPrivate:             d.IsPrivate,
		ApprovalStatus:        d.ApprovalStatus,
		CreatedAt:             d.CreatedAt.String(),
		UpdatedAt:             d.UpdatedAt.String(),
	}
}
