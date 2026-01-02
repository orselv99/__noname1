package main

import (
	"log"
	"server/gateway/handlers"
	"server/gateway/middleware"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	// AuthService gRPC 연결
	// 현재는 로컬호스트 50051 포트로 가정
	authConn, err := grpc.NewClient("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect to auth service: %v", err)
	}
	defer authConn.Close()

	// IndexService gRPC 연결 (50052)
	indexConn, err := grpc.NewClient("localhost:50052", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect to index service: %v", err)
	}
	defer indexConn.Close()

	// Signaling Service gRPC 연결 (50053)
	signalingConn, err := grpc.NewClient("localhost:50053", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect to signaling service: %v", err)
	}
	defer signalingConn.Close()

	authHandler := handlers.NewAuthHandler(authConn)
	indexHandler := handlers.NewIndexHandler(indexConn)
	signalingHandler := handlers.NewSignalingHandler(signalingConn)
	authMiddleware := middleware.NewAuthMiddleware(authConn)

	r := gin.Default()

	// CORS 설정 제거됨: Tauri Rust Main Process에서 통신하므로 불필요

	// 헬스 체크 엔드포인트
	r.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"status":  "up",
			"service": "gateway",
			"message": "Gateway Service is running",
		})
	})

	// API 라우팅 그룹
	api := r.Group("/api/v1")
	{
		auth := api.Group("/auth")
		{
			auth.POST("/register", authHandler.Register)
			auth.POST("/login", authHandler.Login)
		}

		protected := api.Group("") // This group will contain authenticated routes
		protected.Use(authMiddleware.Handler())
		{
			protected.POST("/docs", indexHandler.IndexDocument)         // POST /api/v1/docs
			protected.GET("/docs/search", indexHandler.SearchDocuments) // GET /api/v1/docs/search?query=...
			protected.GET("/ws/signaling", signalingHandler.HandleWebSocket)
		}
	}

	log.Println("Gateway Service listening on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start gateway server:", err)
	}
}
