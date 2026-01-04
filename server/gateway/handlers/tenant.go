package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	pb "server/.protos/auth"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
)

type TenantHandler struct {
	client pb.AuthServiceClient
}

func NewTenantHandler(conn *grpc.ClientConn) *TenantHandler {
	client := pb.NewAuthServiceClient(conn)
	return &TenantHandler{client: client}
}

type CreateTenantRequest struct {
	Domain        string `json:"domain" binding:"required"`
	Name          string `json:"name" binding:"required"`
	AdminEmail    string `json:"admin_email"`
	AdminPassword string `json:"admin_password"`
	AdminUsername string `json:"admin_username"`
}

func (h *TenantHandler) CreateTenant(c *gin.Context) {
	var req CreateTenantRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// TODO: Auth Check (Super only) via Middleware or Context

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.CreateTenant(ctx, &pb.CreateTenantRequest{
		Domain:        req.Domain,
		Name:          req.Name,
		AdminEmail:    req.AdminEmail,
		AdminPassword: req.AdminPassword,
		AdminUsername: req.AdminUsername,
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, resp)
}

func (h *TenantHandler) ListTenants(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "10"))

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.ListTenants(ctx, &pb.ListTenantsRequest{
		Page:  int32(page),
		Limit: int32(limit),
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *TenantHandler) ValidateTenant(c *gin.Context) {
	domain := c.Query("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := h.client.GetTenant(ctx, &pb.GetTenantRequest{Domain: domain})
	if err != nil {
		// Just return 404 or specific valid: false
		c.JSON(http.StatusNotFound, gin.H{"valid": false, "error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"valid": true})
}

func (h *TenantHandler) GetTenant(c *gin.Context) {
	domain := c.Param("domain")
	if domain == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "domain is required"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GetTenant(ctx, &pb.GetTenantRequest{Domain: domain})
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}
