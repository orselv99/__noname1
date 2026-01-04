package handlers

import (
	"context"
	"net/http"
	"time"

	pb "server/.protos/auth"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type DepartmentHandler struct {
	client pb.AuthServiceClient
}

func NewDepartmentHandler(conn *grpc.ClientConn) *DepartmentHandler {
	client := pb.NewAuthServiceClient(conn)
	return &DepartmentHandler{client: client}
}

// CreateDepartment
func (h *DepartmentHandler) CreateDepartment(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	var req pb.CreateDepartmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.TenantId = tenantID

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.CreateDepartment(ctx, &req)
	if err != nil {
		st, _ := status.FromError(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

// BatchCreateDepartments
func (h *DepartmentHandler) BatchCreateDepartments(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	// Accept wrapper object with requests and import_mode
	var body struct {
		Requests   []pb.CreateDepartmentRequest `json:"requests"`
		ImportMode string                       `json:"import_mode"` // "replace" or "upsert"
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var pbRequests []*pb.CreateDepartmentRequest
	for _, item := range body.Requests {
		val := item
		val.TenantId = tenantID
		pbRequests = append(pbRequests, &val)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := h.client.BatchCreateDepartments(ctx, &pb.BatchCreateDepartmentsRequest{
		TenantId:   tenantID,
		Requests:   pbRequests,
		ImportMode: body.ImportMode,
	})

	if err != nil {
		st, _ := status.FromError(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ListDepartments
func (h *DepartmentHandler) ListDepartments(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}
	searchQuery := c.Query("search")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.ListDepartments(ctx, &pb.ListDepartmentsRequest{
		TenantId:    tenantID,
		SearchQuery: searchQuery,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, resp)
}

// UpdateDepartment
func (h *DepartmentHandler) UpdateDepartment(c *gin.Context) {
	id := c.Param("id")
	var req pb.UpdateDepartmentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.Id = id

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.UpdateDepartment(ctx, &req)
	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.NotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Department not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		}
		return
	}
	c.JSON(http.StatusOK, resp)
}

// DeleteDepartment
func (h *DepartmentHandler) DeleteDepartment(c *gin.Context) {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := h.client.DeleteDepartment(ctx, &pb.DeleteDepartmentRequest{Id: id})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetDepartment
func (h *DepartmentHandler) GetDepartment(c *gin.Context) {
	id := c.Param("id")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GetDepartment(ctx, &pb.GetDepartmentRequest{Id: id})
	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.NotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Department not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		}
		return
	}
	c.JSON(http.StatusOK, resp)
}

// ReorderDepartments - Drag & Drop ordering
func (h *DepartmentHandler) ReorderDepartments(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	var items []*pb.DepartmentOrderItem
	if err := c.ShouldBindJSON(&items); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resp, err := h.client.ReorderDepartments(ctx, &pb.ReorderDepartmentsRequest{
		TenantId: tenantID,
		Items:    items,
	})
	if err != nil {
		st, _ := status.FromError(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		return
	}

	c.JSON(http.StatusOK, resp)
}
