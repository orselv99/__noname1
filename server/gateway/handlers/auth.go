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

	// Get tenant ID from header
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "X-Tenant-ID header is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.Login(ctx, &pb.LoginRequest{
		Email:    req.Email,
		Password: req.Password,
		TenantId: tenantID,
	})
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()}) // 보통 로그인 실패는 401
		return
	}

	c.JSON(http.StatusOK, resp)
}

// LookupTenant looks up tenant(s) by email for client apps without subdomain.
func (h *AuthHandler) LookupTenant(c *gin.Context) {
	email := c.Query("email")
	if email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email query parameter is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.LookupTenantByEmail(ctx, &pb.LookupTenantByEmailRequest{
		Email: email,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// ChangePasswordRequest는 비밀번호 변경 요청 구조체입니다.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password" binding:"required"`
	NewPassword     string `json:"new_password" binding:"required"`
}

// ChangePassword는 사용자 비밀번호를 변경합니다.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	var req ChangePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userId, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	tenantId, exists := c.Get("tenant_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "tenant_id context missing"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := h.client.ChangePassword(ctx, &pb.ChangePasswordRequest{
		UserId:          userId.(string),
		TenantId:        tenantId.(string),
		CurrentPassword: req.CurrentPassword,
		NewPassword:     req.NewPassword,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// RefreshToken refreshes the access token using a refresh token.
func (h *AuthHandler) RefreshToken(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.RefreshToken(ctx, &pb.RefreshTokenRequest{
		RefreshToken: req.RefreshToken,
	})
	if err != nil {
		// If refresh fails (expired, invalid), return 401 so client can logout
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// Logout은 로그아웃을 처리합니다.
func (h *AuthHandler) Logout(c *gin.Context) {
	authHeader := c.GetHeader("Authorization")
	token := ""
	if len(authHeader) > 7 && authHeader[:7] == "Bearer " {
		token = authHeader[7:]
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := h.client.Logout(ctx, &pb.LogoutRequest{
		AccessToken: token,
	})
	if err != nil {
		// 로그아웃 실패는 치명적이지 않으므로 경고만 로그에 남기고 성공 처리할 수도 있음
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
