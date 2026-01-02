package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	pb "server/protos/auth"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
)

type AuthMiddleware struct {
	client pb.AuthServiceClient
}

func NewAuthMiddleware(conn *grpc.ClientConn) *AuthMiddleware {
	client := pb.NewAuthServiceClient(conn)
	return &AuthMiddleware{client: client}
}

// Handler는 JWT 토큰을 검증하고 UserID를 Context에 설정하는 Gin 미들웨어입니다.
func (m *AuthMiddleware) Handler() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := ""
		authHeader := c.GetHeader("Authorization")
		if authHeader != "" {
			parts := strings.Split(authHeader, " ")
			if len(parts) == 2 && parts[0] == "Bearer" {
				token = parts[1]
			}
		}

		// Header에 없으면 Query Param 확인 (WebSocket 등)
		if token == "" {
			token = c.Query("token")
		}

		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Authorization required"})
			return
		}

		// gRPC를 통해 토큰 검증
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		resp, err := m.client.ValidateToken(ctx, &pb.ValidateTokenRequest{AccessToken: token})
		if err != nil || !resp.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "Invalid or expired token"})
			return
		}

		// UserID를 Context에 저장 (키: "user_id")
		c.Set("user_id", resp.UserId)

		// UserSalt를 Context에 저장 (키: "user_salt")
		if resp.UserSalt != "" {
			c.Set("user_salt", resp.UserSalt)
		}

		c.Next()

	}
}
