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
