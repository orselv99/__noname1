package handlers

import (
	"context"
	"net/http"
	"strconv"
	"time"

	pb "server/.protos/index"

	"github.com/gin-gonic/gin"
	"google.golang.org/grpc"
)

type IndexHandler struct {
	client pb.IndexServiceClient
}

func NewIndexHandler(conn *grpc.ClientConn) *IndexHandler {
	client := pb.NewIndexServiceClient(conn)
	return &IndexHandler{client: client}
}

type TagChunk struct {
	Tag   string `json:"tag"`
	Chunk string `json:"chunk"`
}

// IndexDocumentRequest: 문서 인덱싱 요청 바디
type IndexDocumentRequest struct {
	Title     string     `json:"title"`
	TagChunks []TagChunk `json:"tag_chunks"`
	Summary   string     `json:"summary"`
}

func (h *IndexHandler) IndexDocument(c *gin.Context) {
	var req IndexDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User ID not found in context"})
		return
	}

	// Salt 가져오기 (없을 수도 있음 - 구버전 토큰 등)
	userSalt, _ := c.Get("user_salt")
	saltStr, ok := userSalt.(string)
	if !ok {
		saltStr = "" // Fallback
	}

	// 변환
	var protoTagChunks []*pb.TagChunk
	for _, tc := range req.TagChunks {
		protoTagChunks = append(protoTagChunks, &pb.TagChunk{
			Tag:   tc.Tag,
			Chunk: tc.Chunk,
		})
	}

	resp, err := h.client.IndexDocument(ctx, &pb.IndexDocumentRequest{
		Document: &pb.Document{
			Title:     req.Title,
			TagChunks: protoTagChunks,
			Summary:   req.Summary,
			OwnerId:   userID.(string),
			UserSalt:  saltStr, // Proto 필드 사용
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *IndexHandler) SearchDocuments(c *gin.Context) {
	query := c.Query("query")
	limitStr := c.DefaultQuery("limit", "10")
	limit, _ := strconv.Atoi(limitStr)

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Salt 가져오기 (없을 수도 있음 - 구버전 토큰 등)
	userSalt, _ := c.Get("user_salt")
	saltStr, ok := userSalt.(string)
	if !ok {
		saltStr = "" // Fallback
	}

	resp, err := h.client.SearchDocuments(ctx, &pb.SearchDocumentsRequest{
		Query:    query,
		Limit:    int32(limit),
		UserSalt: saltStr, // Proto 필드 사용
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}
