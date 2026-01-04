package handlers

import (
	"context"
	"net/http"
	"time"

	pb "server/.protos/auth"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
)

// AuthHandler는 인증 관련 HTTP 요청을 처리합니다.
type AuthHandler struct {
	client pb.AuthServiceClient
}

// NewAuthHandler는 새로운 AuthHandler 인스턴스를 생성합니다.
func NewAuthHandler(conn *grpc.ClientConn) *AuthHandler {
	client := pb.NewAuthServiceClient(conn)
	return &AuthHandler{client: client}
}

// CreateUserRequest는 사용자 생성 JSON 바디 구조체입니다.
// CreateUserRequest는 사용자 생성 JSON 바디 구조체입니다.
type CreateUserRequest struct {
	Email        string `json:"email" binding:"required,email"`
	Password     string `json:"password" binding:"required,min=6"`
	Username     string `json:"username" binding:"required"`
	Role         int32  `json:"role"`          // Enum Value (1: Super, 2: Admin, 3: Viewer, 4: User)
	DepartmentID string `json:"department_id"` // Optional
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
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// LoginRequest는 로그인 JSON 바디 구조체입니다.
type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

// Login은 사용자 로그인을 처리합니다.
func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.Login(ctx, &pb.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
	})
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()}) // 보통 로그인 실패는 401
		return
	}

	c.JSON(http.StatusOK, resp)
}
