package handlers

import (
	"context"
	"net/http"
	"strconv"
	"strings"
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
	limit, _ := strconv.Atoi(c.DefaultQuery("page_size", "10"))
	departmentID := c.Query("department_id")
	query := c.Query("search")
	sortBy := c.Query("sort_by")
	sortDesc := c.Query("sort_desc") == "true"

	idsStr := c.Query("ids")
	var ids []string
	if idsStr != "" {
		ids = strings.Split(idsStr, ",")
	}

	includeAllRoles := c.Query("include_all_roles") == "true"

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	res, err := h.authClient.ListUsers(ctx, &pb.ListUsersRequest{
		TenantId:        tenantID,
		Page:            int32(page),
		PageSize:        int32(limit),
		DepartmentId:    departmentID,
		Query:           query,
		SortBy:          sortBy,
		SortDesc:        sortDesc,
		Ids:             ids,
		IncludeAllRoles: includeAllRoles,
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

// CreateUserRequest는 사용자 생성 JSON 바디 구조체입니다.
type CreateUserRequest struct {
	Email        string `json:"email" binding:"required,email"`
	Password     string `json:"password" binding:"required,min=6"`
	Username     string `json:"username" binding:"required"`
	Role         int32  `json:"role"`          // Enum Value
	DepartmentID string `json:"department_id"` // Optional

	Birthday     string   `json:"birthday"`
	PhoneNumbers []string `json:"phone_numbers"`
	PositionID   string   `json:"position_id"`

	Memo string `json:"memo"`
}

// CreateUser는 사용자 생성을 처리합니다.
func (h *AuthHandler) CreateUser(c *gin.Context) {
	var req CreateUserRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Tenant Context Extraction
	tenantID := c.GetHeader("X-Tenant-ID")

	// gRPC 요청 생성 (타임아웃 설정)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.CreateUser(ctx, &pb.CreateUserRequest{
		Email:        req.Email,
		Password:     req.Password,
		Username:     req.Username,
		TenantId:     tenantID,
		Role:         pb.Role(req.Role), // Enum Mapping
		DepartmentId: req.DepartmentID,

		Birthday:     req.Birthday,
		PhoneNumbers: req.PhoneNumbers,
		PositionId:   req.PositionID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// UpdateUserRequest defines the structure for updating user information
type UpdateUserRequest struct {
	Username     string `json:"username"`
	Role         int32  `json:"role"`
	DepartmentID string `json:"department_id"`

	Birthday     string   `json:"birthday"`
	PhoneNumbers []string `json:"phone_numbers"`
	PositionID   string   `json:"position_id"`
}

// UpdateUser: 사용자 정보 수정
func (h *UserHandler) UpdateUser(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	userID := c.Param("id")
	var req UpdateUserRequest

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

		Birthday:     req.Birthday,
		PhoneNumbers: req.PhoneNumbers,
		PositionId:   req.PositionID,
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

	var req pb.BatchCreateUsersRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	req.TenantId = tenantID

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	res, err := h.authClient.BatchCreateUsers(ctx, &req)
	if err != nil {
		st, _ := status.FromError(err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		return
	}

	c.JSON(http.StatusOK, res)
}

// ResetUserPassword: 사용자 비밀번호 재설정 및 전송 (Admin Only)
func (h *UserHandler) ResetUserPassword(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	userID := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_, err := h.authClient.ResetAndSendPassword(ctx, &pb.ResetAndSendPasswordRequest{
		UserId:   userID,
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

// BatchResetPassword: Tenant 내 모든 사용자 비밀번호 일괄 초기화
func (h *UserHandler) BatchResetUserPassword(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second) // Longer timeout for batch
	defer cancel()

	res, err := h.authClient.BatchResetPassword(ctx, &pb.BatchResetPasswordRequest{
		TenantId: tenantID,
	})

	if err != nil {
		st, ok := status.FromError(err)
		if ok {
			c.JSON(http.StatusInternalServerError, gin.H{"error": st.Message()})
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to batch reset passwords"})
		}
		return
	}

	c.JSON(http.StatusOK, res)
}
