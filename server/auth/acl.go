package main

import (
	"context"
	"errors"
	"time"

	pb "server/.protos/auth"

	"gorm.io/gorm"

	"github.com/google/uuid"

	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ACL & Access Control Stubs
// CheckAccess: 정책 엔진 로직 구현
func (s *server) CheckAccess(ctx context.Context, req *pb.CheckAccessRequest) (*pb.CheckAccessResponse, error) {
	// 1. Fetch User Role & Info (if not fully provided, but we assume req has context)
	// For robust implementation, we might fetch User from DB using req.UserId
	var user User
	if err := s.db.First(&user, "id = ?", req.UserId).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "user not found")
	}

	// 2. Super Admin: Always Allow Full Access
	if user.Role == "super" {
		return &pb.CheckAccessResponse{
			Allowed:        true,
			MaxAccessLevel: pb.AccessLevel_ACCESS_LEVEL_FULL,
			Reason:         "Super Admin access",
		}, nil
	}

	// 3. Owner Check: Always Allow Full Access
	if req.DocumentOwnerId != "" && req.DocumentOwnerId == req.UserId {
		return &pb.CheckAccessResponse{
			Allowed:        true,
			MaxAccessLevel: pb.AccessLevel_ACCESS_LEVEL_FULL,
			Reason:         "Document Owner",
		}, nil
	}

	// 4. Check Explicit Permissions (permissions table)
	var perm Permission
	err := s.db.Where("document_id = ? AND user_id = ?", req.DocumentId, req.UserId).First(&perm).Error
	if err == nil {
		// Found explicit permission
		return &pb.CheckAccessResponse{
			Allowed:        true,
			MaxAccessLevel: pb.AccessLevel(perm.AccessLevel),
			Reason:         "Explicit permission granted",
		}, nil
	}

	// 5. Default ACL (Attribute-based) Logic
	// Rule: Same Department + Published State -> Full Access (Simplification for now)
	// Rule: Same Department + Draft/Feedback -> Deny (unless Owner or Explicit Permission)

	if req.DocumentState == pb.DocumentState_DOCUMENT_STATE_PUBLISHED {
		// Department Check
		// If User has no DepartmentID or Document has no DepartmentID, we fall back to strict mode (Deny)
		// Or if they match, we allow.
		if user.DepartmentID != "" && req.DocumentDepartmentId != "" && user.DepartmentID == req.DocumentDepartmentId {
			// **Role-specific refinement could go here**
			// e.g. Viewers get Full, Users get Full (or Read-Only)
			return &pb.CheckAccessResponse{
				Allowed:        true,
				MaxAccessLevel: pb.AccessLevel_ACCESS_LEVEL_FULL,
				Reason:         "Department match (Published)",
			}, nil
		}
	}

	// 6. Discovery Mode (Metadata Only)
	// If everything else fails, we might allow Metadata access (Summary) so search shows it exists
	// But strictly speaking, CheckAccess returns what is allowed.

	// Default: Deny
	return &pb.CheckAccessResponse{
		Allowed:        false,
		MaxAccessLevel: pb.AccessLevel_ACCESS_LEVEL_UNSPECIFIED,
		Reason:         "No matching policy found",
	}, nil
}

func (s *server) RequestAccess(ctx context.Context, req *pb.RequestAccessRequest) (*pb.RequestAccessResponse, error) {
	// 1. Check for existing pending request
	var existing AccessRequest
	err := s.db.Where("requester_id = ? AND document_id = ? AND status = ?", req.RequesterId, req.DocumentId, pb.AccessRequestStatus_ACCESS_REQUEST_STATUS_PENDING).First(&existing).Error
	if err == nil {
		return nil, status.Errorf(codes.AlreadyExists, "pending request already exists")
	}

	// 2. Check if user already has permission (Optional, but good UX)
	// We can skip this if we assume UI handles it, or check permissions table.
	var perm Permission
	if err := s.db.Where("user_id = ? AND document_id = ?", req.RequesterId, req.DocumentId).First(&perm).Error; err == nil {
		if pb.AccessLevel(perm.AccessLevel) >= req.RequestedLevel {
			return nil, status.Errorf(codes.AlreadyExists, "user already has sufficient permission")
		}
	}

	// 3. Create Access Request
	ar := AccessRequest{
		ID:             uuid.New().String(),
		RequesterID:    req.RequesterId,
		DocumentID:     req.DocumentId,
		RequestedLevel: int(req.RequestedLevel),
		Status:         int(pb.AccessRequestStatus_ACCESS_REQUEST_STATUS_PENDING),
		OwnerID:        req.OwnerId, // Must be provided by caller (Gateway knows logic)
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := s.db.Create(&ar).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to create access request: %v", err)
	}

	return &pb.RequestAccessResponse{
		RequestId: ar.ID,
		Status:    pb.AccessRequestStatus_ACCESS_REQUEST_STATUS_PENDING,
	}, nil
}

func (s *server) GrantAccess(ctx context.Context, req *pb.GrantAccessRequest) (*pb.GrantAccessResponse, error) {
	// 1. Find the Access Request
	var ar AccessRequest
	if err := s.db.First(&ar, "id = ?", req.RequestId).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "access request not found")
	}

	// 2. Validate Reviewer (Must be the OwnerID stored in AccessRequest)
	// In a real scenario, we might allow Super Admins to approve too.
	if ar.OwnerID != req.ReviewerId {
		return nil, status.Errorf(codes.PermissionDenied, "only the document owner can manage this request")
	}

	// 3. Update Status
	ar.Status = int(req.Status)
	ar.UpdatedAt = time.Now()

	tx := s.db.Begin()

	if err := tx.Save(&ar).Error; err != nil {
		tx.Rollback()
		return nil, status.Errorf(codes.Internal, "failed to update request status: %v", err)
	}

	// 4. If Approved, Grant Permission
	var grantedPermission *pb.Permission
	if req.Status == pb.AccessRequestStatus_ACCESS_REQUEST_STATUS_APPROVED {
		// Insert or Update Permission
		var perm Permission
		err := tx.Where("user_id = ? AND document_id = ?", ar.RequesterID, ar.DocumentID).First(&perm).Error

		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				// Create new
				perm = Permission{
					ID:          uuid.New().String(),
					UserID:      ar.RequesterID,
					DocumentID:  ar.DocumentID,
					AccessLevel: int(req.GrantedLevel),
					GrantedAt:   time.Now(),
					GrantedBy:   req.ReviewerId,
				}
				if err := tx.Create(&perm).Error; err != nil {
					tx.Rollback()
					return nil, status.Errorf(codes.Internal, "failed to grant permission: %v", err)
				}
			} else {
				tx.Rollback()
				return nil, status.Errorf(codes.Internal, "db error: %v", err)
			}
		} else {
			// Update existing
			perm.AccessLevel = int(req.GrantedLevel)
			perm.GrantedAt = time.Now()
			perm.GrantedBy = req.ReviewerId
			if err := tx.Save(&perm).Error; err != nil {
				tx.Rollback()
				return nil, status.Errorf(codes.Internal, "failed to update permission: %v", err)
			}
		}

		grantedPermission = &pb.Permission{
			Id:          perm.ID,
			DocumentId:  perm.DocumentID,
			UserId:      perm.UserID,
			AccessLevel: pb.AccessLevel(perm.AccessLevel),
			GrantedAt:   perm.GrantedAt.String(),
			GrantedBy:   perm.GrantedBy,
		}
	}

	tx.Commit()

	return &pb.GrantAccessResponse{
		Success:    true,
		Permission: grantedPermission,
	}, nil
}

func (s *server) ListAccessRequests(ctx context.Context, req *pb.ListAccessRequestsRequest) (*pb.ListAccessRequestsResponse, error) {
	var requests []AccessRequest
	query := s.db.Model(&AccessRequest{})

	if req.AsReviewer {
		// List requests where I am the owner (to approve)
		query = query.Where("owner_id = ?", req.UserId)
	} else {
		// List requests I made
		query = query.Where("requester_id = ?", req.UserId)
	}

	// Optional: Filter by Tenant if needed (AccessRequest doesn't have TenantId yet, but assumes context isolation or ID uniqueness)

	if err := query.Order("created_at desc").Find(&requests).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list requests: %v", err)
	}

	var pbRequests []*pb.AccessRequest
	for _, r := range requests {
		// Load Requester Info for UI display
		var requester User
		s.db.Select("id, email, username").First(&requester, "id = ?", r.RequesterID)

		pbRequests = append(pbRequests, &pb.AccessRequest{
			Id:             r.ID,
			RequesterId:    r.RequesterID,
			DocumentId:     r.DocumentID,
			RequestedLevel: pb.AccessLevel(r.RequestedLevel),
			Status:         pb.AccessRequestStatus(r.Status),
			OwnerId:        r.OwnerID,
			CreatedAt:      r.CreatedAt.String(),
			Requester: &pb.User{
				Id:       requester.ID,
				Email:    requester.Email,
				Username: requester.Username,
			},
		})
	}

	return &pb.ListAccessRequestsResponse{
		Requests: pbRequests,
	}, nil
}

// ListVisibilityApprovals
func (s *server) ListVisibilityApprovals(ctx context.Context, req *pb.ListVisibilityApprovalsRequest) (*pb.ListVisibilityApprovalsResponse, error) {
	var approvals []VisibilityApproval
	query := s.db.Model(&VisibilityApproval{})

	if req.ApproverId != "" {
		query = query.Where("approver_id = ?", req.ApproverId)
	}

	// Pending logic usually
	query = query.Where("status = ?", "pending")

	if err := query.Order("created_at desc").Find(&approvals).Error; err != nil {
		return nil, status.Errorf(codes.Internal, "failed to list approvals: %v", err)
	}

	var pbApprovals []*pb.VisibilityApproval
	for _, a := range approvals {
		pbApprovals = append(pbApprovals, &pb.VisibilityApproval{
			Id:             a.ID,
			DocumentId:     a.DocumentID,
			RequesterId:    a.RequesterID,
			ApproverId:     a.ApproverID,
			RequestedLevel: int32(a.RequestedLevel),
			Status:         a.Status,
			CreatedAt:      a.CreatedAt.String(),
			UpdatedAt:      a.UpdatedAt.String(),
		})
	}

	return &pb.ListVisibilityApprovalsResponse{
		Approvals: pbApprovals,
	}, nil
}

// ApproveVisibilityChange
func (s *server) ApproveVisibilityChange(ctx context.Context, req *pb.ApproveVisibilityChangeRequest) (*pb.ApproveVisibilityChangeResponse, error) {
	var approval VisibilityApproval
	if err := s.db.First(&approval, "id = ?", req.ApprovalId).Error; err != nil {
		return nil, status.Errorf(codes.NotFound, "approval request not found")
	}

	// Validate Approver
	if approval.ApproverID != req.ApproverId {
		return nil, status.Errorf(codes.PermissionDenied, "not authorized to approve this request")
	}

	tx := s.db.Begin()

	// Update Approval Status
	approval.Status = req.Status // "approved" or "rejected"
	approval.UpdatedAt = time.Now()
	if err := tx.Save(&approval).Error; err != nil {
		tx.Rollback()
		return nil, status.Errorf(codes.Internal, "failed to update approval: %v", err)
	}

	// If Approved, Update Document
	if req.Status == "approved" {
		var doc DocumentMetadata
		if err := tx.First(&doc, "id = ?", approval.DocumentID).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to find associated document: %v", err)
		}

		doc.SearchVisibilityLevel = approval.RequestedLevel
		doc.ApprovalStatus = "approved"
		doc.UpdatedAt = time.Now()

		if err := tx.Save(&doc).Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to update document visibility: %v", err)
		}
	} else if req.Status == "rejected" {
		// Update Doc Status back to none or rejected?
		// "rejected" lets user know.
		if err := tx.Model(&DocumentMetadata{}).Where("id = ?", approval.DocumentID).Update("approval_status", "rejected").Error; err != nil {
			tx.Rollback()
			return nil, status.Errorf(codes.Internal, "failed to update doc status: %v", err)
		}
	}

	tx.Commit()

	return &pb.ApproveVisibilityChangeResponse{
		Success: true,
	}, nil
}
