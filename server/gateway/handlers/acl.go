package handlers

import (
	"log"
	"net/http"

	pb "server/.protos/auth"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
)

// ACLHandler struct
type ACLHandler struct {
	client pb.AuthServiceClient
}

// NewACLHandler constructor
func NewACLHandler(conn *grpc.ClientConn) *ACLHandler {
	return &ACLHandler{
		client: pb.NewAuthServiceClient(conn),
	}
}

// CheckAccessHandler
func (h *ACLHandler) CheckAccess(c *gin.Context) {
	var req pb.CheckAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.client.CheckAccess(c, &req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// RequestAccessHandler
func (h *ACLHandler) RequestAccess(c *gin.Context) {
	var req pb.RequestAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.client.RequestAccess(c, &req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// GrantAccessHandler
func (h *ACLHandler) GrantAccess(c *gin.Context) {
	var req pb.GrantAccessRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.client.GrantAccess(c, &req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ListAccessRequestsHandler
func (h *ACLHandler) ListAccessRequests(c *gin.Context) {
	userId := c.Query("user_id")
	asReviewer := c.Query("as_reviewer") == "true"
	tenantId := c.GetHeader("X-Tenant-ID")

	req := &pb.ListAccessRequestsRequest{
		UserId:     userId,
		AsReviewer: asReviewer,
		TenantId:   tenantId,
	}

	resp, err := h.client.ListAccessRequests(c, req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// CreateDocumentMetadataHandler
func (h *ACLHandler) CreateDocumentMetadata(c *gin.Context) {
	var req pb.CreateDocumentMetadataRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.client.CreateDocumentMetadata(c, &req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// UpdateDocumentVisibilityHandler
func (h *ACLHandler) UpdateDocumentVisibility(c *gin.Context) {
	var req pb.UpdateDocumentVisibilityRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Ensure document ID from URL overrides body if needed, or rely on body.
	// Ideally URL /test/:id is better REST, but here we might accept body.
	// We'll stick to body for simplicity or hybrid.

	resp, err := h.client.UpdateDocumentVisibility(c, &req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ListVisibilityApprovalsHandler
func (h *ACLHandler) ListVisibilityApprovals(c *gin.Context) {
	approverId := c.Query("approver_id")
	deptId := c.Query("department_id")
	tenantId := c.GetHeader("X-Tenant-ID")

	req := &pb.ListVisibilityApprovalsRequest{
		ApproverId:   approverId,
		DepartmentId: deptId,
		TenantId:     tenantId,
	}

	resp, err := h.client.ListVisibilityApprovals(c, req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ApproveVisibilityChangeHandler
func (h *ACLHandler) ApproveVisibilityChange(c *gin.Context) {
	var req pb.ApproveVisibilityChangeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Assuming ApprovalID is in URL or Body. Using Body from Request struct.

	resp, err := h.client.ApproveVisibilityChange(c, &req)
	if err != nil {
		log.Printf("RPC failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "RPC failed"})
		return
	}

	c.JSON(http.StatusOK, resp)
}
