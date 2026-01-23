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

// 태그와 증거(근거 문장) 쌍
type TagEvidence struct {
	Tag      string `json:"tag"`
	Evidence string `json:"evidence"`
}

// IndexDocumentRequest: 문서 인덱싱 요청 바디
type IndexDocumentRequest struct {
	Title        string        `json:"title"`
	TagEvidences []TagEvidence `json:"tag_evidences"`
	Summary      string        `json:"summary"`
	Embedding    []float32     `json:"embedding"`
	Content      string        `json:"content"` // 원문 추가
	GroupId      string        `json:"group_id"`
	GroupType    int32         `json:"group_type"`
	CreatedAt    string        `json:"created_at"`
	UpdatedAt    string        `json:"updated_at"`
}

func (h *IndexHandler) IndexDocument(c *gin.Context) {
	var req IndexDocumentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second) // 임베딩 생성 시간 고려하여 타임아웃 증가
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

	// TagEvidences 변환
	var tagEvidencesProto []*pb.TagEvidence
	for _, tc := range req.TagEvidences {
		tagEvidencesProto = append(tagEvidencesProto, &pb.TagEvidence{
			Tag:      tc.Tag,
			Evidence: tc.Evidence,
		})
	}

	resp, err := h.client.IndexDocument(ctx, &pb.IndexDocumentRequest{
		Document: &pb.Document{
			Title:        req.Title,
			TagEvidences: tagEvidencesProto,
			Summary:      req.Summary,
			OwnerId:      userID.(string),
			UserSalt:     saltStr, // Proto 필드 사용
			Embedding:    req.Embedding,
			Content:      req.Content, // 원문 전달
			GroupId:      req.GroupId,
			GroupType:    req.GroupType,
			CreatedAt:    req.CreatedAt,
			UpdatedAt:    req.UpdatedAt,
		},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	if !resp.Success {
		c.JSON(http.StatusInternalServerError, gin.H{"error": resp.Message})
		return
	}

	// 응답에 document_id와 embedding 포함
	c.JSON(http.StatusOK, gin.H{
		"success":       resp.Success,
		"message":       resp.Message,
		"document_id":   resp.DocumentId,
		"embedding":     resp.Embedding,
		"summary":       resp.Summary,
		"tag_evidences": resp.TagEvidences,
	})
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

	// User ID 가져오기 (본인 문서 제외용)
	userID, _ := c.Get("user_id")
	userIDStr, ok := userID.(string)
	if !ok {
		userIDStr = ""
	}

	resp, err := h.client.SearchDocuments(ctx, &pb.SearchDocumentsRequest{
		Query:    query,
		Limit:    int32(limit),
		UserSalt: saltStr,   // Proto 필드 사용
		OwnerId:  userIDStr, // 요청자 ID 전달
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

// 임베딩 생성 요청 바디
type GenerateEmbeddingRequest struct {
	Text string `json:"text"`
}

func (h *IndexHandler) GenerateEmbedding(c *gin.Context) {
	var req GenerateEmbeddingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := h.client.GenerateEmbedding(ctx, &pb.GenerateEmbeddingRequest{
		Text: req.Text,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"embedding": resp.Embedding})
}
