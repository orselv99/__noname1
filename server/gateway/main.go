package main

import (
	"log"
	"os"
	"server/gateway/handlers"
	"server/gateway/middleware"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func main() {
	// AuthService gRPC 연결
	authAddr := os.Getenv("AUTH_SERVICE_ADDR")
	if authAddr == "" {
		authAddr = "localhost:50051"
	}
	authConn, err := grpc.NewClient(authAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect to auth service: %v", err)
	}
	defer authConn.Close()

	// IndexService gRPC 연결
	indexAddr := os.Getenv("INDEX_SERVICE_ADDR")
	if indexAddr == "" {
		indexAddr = "localhost:50052"
	}
	indexConn, err := grpc.NewClient(indexAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect to index service: %v", err)
	}
	defer indexConn.Close()

	// SignalingService gRPC 연결 (50053)
	signalingAddr := os.Getenv("SIGNALING_SERVICE_ADDR")
	if signalingAddr == "" {
		signalingAddr = "localhost:50053"
	}
	signalingConn, err := grpc.NewClient(signalingAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Fatalf("did not connect to signaling service: %v", err)
	}
	defer signalingConn.Close()

	authHandler := handlers.NewAuthHandler(authConn)
	indexHandler := handlers.NewIndexHandler(indexConn)
	signalingHandler := handlers.NewSignalingHandler(signalingConn)
	userHandler := handlers.NewUserHandler(authConn)
	tenantHandler := handlers.NewTenantHandler(authConn)
	aclHandler := handlers.NewACLHandler(authConn)
	deptHandler := handlers.NewDepartmentHandler(authConn)
	projectHandler := handlers.NewProjectHandler(authConn)
	positionHandler := handlers.NewPositionHandler(authConn)
	authMiddleware := middleware.NewAuthMiddleware(authConn)

	r := gin.Default()
	r.Use(middleware.CORSMiddleware())

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
			auth.POST("/login", authHandler.Login)
			// Password Change for authenticated users
			auth.POST("/change-password", authMiddleware.Handler(), authHandler.ChangePassword)
			auth.POST("/logout", authMiddleware.Handler(), authHandler.Logout)
		}

		// Public Tenant Routes
		api.GET("/tenants/validate", tenantHandler.ValidateTenant)

		protected := api.Group("") // This group will contain authenticated routes
		protected.Use(authMiddleware.Handler())
		{
			protected.POST("/docs", indexHandler.IndexDocument)         // POST /api/v1/docs
			protected.GET("/docs/search", indexHandler.SearchDocuments) // GET /api/v1/docs/search?query=...
			protected.GET("/ws/signaling", signalingHandler.HandleWebSocket)

			// User Management Routes
			protected.POST("/users", authHandler.CreateUser)
			protected.POST("/users/batch", userHandler.BatchCreateUsers)
			protected.GET("/users", userHandler.ListUsers)
			protected.PUT("/users/:id", userHandler.UpdateUser)
			protected.DELETE("/users/:id", userHandler.DeleteUser)
			protected.POST("/users/:id/reset-password", userHandler.ResetUserPassword)
			protected.POST("/users/batch/reset-password", userHandler.BatchResetUserPassword)

			// Tenant Management Routes (Super Only)
			protected.POST("/tenants", tenantHandler.CreateTenant)
			protected.GET("/tenants", tenantHandler.ListTenants)
			protected.GET("/tenants/:domain", tenantHandler.GetTenant)

			// ACL & Access Requests
			protected.POST("/access/check", aclHandler.CheckAccess)
			protected.POST("/access/request", aclHandler.RequestAccess)
			protected.POST("/access/grant", aclHandler.GrantAccess)
			protected.GET("/access/requests", aclHandler.ListAccessRequests)

			// Advanced ACL - Visibility & Approvals
			protected.POST("/documents/metadata", aclHandler.CreateDocumentMetadata)
			protected.PUT("/documents/visibility", aclHandler.UpdateDocumentVisibility)
			protected.GET("/access/approvals", aclHandler.ListVisibilityApprovals)
			protected.POST("/access/approvals/review", aclHandler.ApproveVisibilityChange)

			// Department Routes
			protected.POST("/departments", deptHandler.CreateDepartment)
			protected.POST("/departments/batch", deptHandler.BatchCreateDepartments)
			protected.POST("/departments/reorder", deptHandler.ReorderDepartments)
			protected.GET("/departments", deptHandler.ListDepartments)
			protected.PUT("/departments/:id", deptHandler.UpdateDepartment)
			protected.DELETE("/departments/:id", deptHandler.DeleteDepartment)
			protected.GET("/departments/:id", deptHandler.GetDepartment)

			// Project Routes
			protected.POST("/projects", projectHandler.CreateProject)
			protected.POST("/projects/batch", projectHandler.BatchCreateProjects)
			protected.POST("/projects/reorder", projectHandler.ReorderProjects)
			protected.GET("/projects", projectHandler.ListProjects)
			protected.PUT("/projects/:id", projectHandler.UpdateProject)
			protected.DELETE("/projects/:id", projectHandler.DeleteProject)
			protected.GET("/projects/:id", projectHandler.GetProject)

			// Position Routes
			protected.POST("/positions", positionHandler.CreatePosition)
			protected.POST("/positions/batch", positionHandler.BatchCreatePositions)
			protected.GET("/positions", positionHandler.ListPositions)
			protected.PUT("/positions/:id", positionHandler.UpdatePosition)
			protected.DELETE("/positions/:id", positionHandler.DeletePosition)
			protected.POST("/positions/reorder", positionHandler.ReorderPositions)

			// Job Routes

		}
	}

	log.Println("Gateway Service listening on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start gateway server:", err)
	}
}
