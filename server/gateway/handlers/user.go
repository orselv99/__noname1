package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	pb "server/.protos/auth"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type UserHandler struct {
	authClient pb.AuthServiceClient
}

func NewUserHandler(conn *grpc.ClientConn) *UserHandler {
	return &UserHandler{
		authClient: pb.NewAuthServiceClient(conn),
	}
}

// GetUser: 사용자 정보 조회
func (h *UserHandler) GetUser(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	userID := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := h.authClient.GetUser(ctx, &pb.GetUserRequest{
		Id:       userID,
		TenantId: tenantID,
	})

	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.NotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		}
		return
	}

	c.JSON(http.StatusOK, res.User)
}

// ListUsers: 사용자 목록 조회
func (h *UserHandler) ListUsers(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := h.authClient.ListUsers(ctx, &pb.ListUsersRequest{
		TenantId: tenantID,
		Page:     int32(page),
		PageSize: int32(limit),
	})

	if err != nil {
		st, ok := status.FromError(err)
		if ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		}
		return
	}

	c.JSON(http.StatusOK, res)
}

// UpdateUser: 사용자 정보 수정
func (h *UserHandler) UpdateUser(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	userID := c.Param("id")
	var req struct {
		Username     string `json:"username"`
		Role         int32  `json:"role"` // Changed to int32 to receive Enum value
		DepartmentID string `json:"department_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := h.authClient.UpdateUser(ctx, &pb.UpdateUserRequest{
		Id:           userID,
		TenantId:     tenantID,
		Username:     req.Username,
		Role:         pb.Role(req.Role),
		DepartmentId: req.DepartmentID,
	})

	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.NotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		}
		return
	}

	c.JSON(http.StatusOK, res.User)
}

// DeleteUser: 사용자 삭제
func (h *UserHandler) DeleteUser(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	userID := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := h.authClient.DeleteUser(ctx, &pb.DeleteUserRequest{
		Id:       userID,
		TenantId: tenantID,
	})

	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.NotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		}
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// BatchCreateUsers: 일괄 사용자 생성
func (h *UserHandler) BatchCreateUsers(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	var items []*pb.CreateUserRequestItem
	if err := c.ShouldBindJSON(&items); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req := &pb.BatchCreateUsersRequest{
		TenantId: tenantID,
		Requests: items,
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	res, err := h.authClient.BatchCreateUsers(ctx, req)
	if err != nil {
		st, _ := status.FromError(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		return
	}

	c.JSON(http.StatusOK, res)
}
