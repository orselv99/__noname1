package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt" // Added missing import
	"io"
	"math"
	"net/http"
	"os"
	"regexp"

	pb "server/.protos/index"

	"github.com/pgvector/pgvector-go"
	"gorm.io/gorm"
)

type server struct {
	pb.UnimplementedIndexServiceServer
	db *gorm.DB
}

// TagEvidence 구조체 (JSON 변환용)
type TagEvidence struct {
	Tag      string `json:"tag"`
	Evidence string `json:"evidence"`
}

func (s *server) IndexDocument(ctx context.Context, req *pb.IndexDocumentRequest) (*pb.IndexDocumentResponse, error) {
	// Use provided embedding or generate it
	vectorData := req.Document.Embedding

	if len(vectorData) == 0 {
		// Embedding이 없으면 Content를 기반으로 생성
		if req.Document.Content == "" {
			return &pb.IndexDocumentResponse{Success: false, Message: "Content is required for embedding generation"}, nil
		}

		var err error
		vectorData, err = generateEmbedding(req.Document.Content)
		if err != nil {
			return &pb.IndexDocumentResponse{Success: false, Message: "Failed to generate embedding: " + err.Error()}, nil
		}
	} else if len(vectorData) != 768 {
		// 차원 확인 (768로 가정)
		return &pb.IndexDocumentResponse{Success: false, Message: "Invalid embedding dimension"}, nil
	}

	embeddingVector := pgvector.NewVector(vectorData)

	// Proto TagEvidences -> Struct TagEvidences
	var tagEvidences []TagEvidence
	for _, tc := range req.Document.TagEvidences {
		tagEvidences = append(tagEvidences, TagEvidence{
			Tag:      tc.Tag,
			Evidence: tc.Evidence,
		})
	}

	// 1. Encrypt Data
	// crypto.Encrypt expects (plaintext string, key string)

	// TagEvidences -> JSON -> Encrypt
	tagEvidencesJson, err := json.Marshal(tagEvidences)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to marshal tags"}, nil
	}
	// Client Side Encryption: 클라이언트가 이미 암호화해서 보냈으므로 그대로 저장
	encryptedTagEvidences := string(tagEvidencesJson)
	encryptedSummary := req.Document.Summary

	doc := Document{
		ID:           req.Document.Id,
		Title:        req.Document.Title,
		TagEvidences: encryptedTagEvidences,
		Summary:      encryptedSummary,
		OwnerID:      req.Document.OwnerId,
		GroupID:      req.Document.GroupId,
		GroupType:    req.Document.GroupType,
		CreatedAt:    req.Document.CreatedAt,
		UpdatedAt:    req.Document.UpdatedAt,
		Embedding:    embeddingVector,
	}

	// ID가 없으면 생성, 있으면 업데이트 (Upsert)
	result := s.db.Save(&doc)
	if result.Error != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: result.Error.Error()}, nil
	}

	return &pb.IndexDocumentResponse{
		Success:    true,
		Message:    "Document indexed successfully",
		DocumentId: doc.ID,
		Embedding:  vectorData, // 생성된(혹은 전달받은) 임베딩 반환
	}, nil
}

// 임베딩 생성 함수 (TODO: 실제 모델 연동)
// LLAMA_SERVER Response Structure
type EmbeddingResponse struct {
	Embedding []float32 `json:"embedding"`
}

// 임베딩 생성 함수 (Llama Server 연동)
// 임베딩 생성 함수 (Llama Server 연동)
func generateEmbedding(text string) ([]float32, error) {
	// 1. Remove Markdown Images/Media (![alt](url))
	// Regex: !\[.*?\]\(.*?\) with (?s) to match newlines
	re := regexp.MustCompile(`(?s)!\[.*?\]\(.*?\)`)
	cleanedText := re.ReplaceAllString(text, "")

	fmt.Printf("cleaned text: %s", cleanedText)

	// 2. Chunking (Thunking)
	// Context limit is capped at 2048 by model. Safe chunk size: 500 runes (~400 tokens) to fit in 512 batch.
	// We will process chunks and average the vectors.
	runes := []rune(cleanedText)
	chunkSize := 500
	var chunks []string

	if len(runes) == 0 {
		return nil, fmt.Errorf("text is empty after cleaning")
	}

	for i := 0; i < len(runes); i += chunkSize {
		end := i + chunkSize
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[i:end]))
	}

	llamaAddr := os.Getenv("LLAMA_EMBEDDING_ADDR")
	if llamaAddr == "" {
		llamaAddr = "http://llama-embedding:8080"
	}

	var embeddingSum []float32
	var count int

	for _, chunk := range chunks {
		payload := map[string]string{"content": chunk}
		jsonPayload, err := json.Marshal(payload)
		if err != nil {
			continue // Skip failed chunk? or return error?
		}

		resp, err := http.Post(llamaAddr+"/embedding", "application/json", bytes.NewBuffer(jsonPayload))
		if err != nil {
			fmt.Printf("Error requesting embedding for chunk: %v\n", err)
			continue
		}
		defer resp.Body.Close()

		bodyBytes, err := io.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("Error reading chunk response body: %v\n", err)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			fmt.Printf("Llama server error for chunk: %s - %s\n", resp.Status, string(bodyBytes))
			continue
		}

		var embedding []float32

		// Handle multiple formats:
		// 1. standard: {"embedding": [...]} (Old)
		// 2. batch/nested: {"embedding": [[...]]} (New/GPU)
		// 3. array: [...]
		// 4. openai: {"data": [{"embedding": ...}]}
		// 5. array of objects: [{"embedding": [[...]]}]

		// Try standard struct (single)
		type StandardResponse struct {
			Embedding []float32 `json:"embedding"`
		}
		var stdResp StandardResponse
		// Try standard struct (batch/nested)
		type StandardResponseBatch struct {
			Embedding [][]float32 `json:"embedding"`
		}
		var stdRespBatch StandardResponseBatch

		// Try Array of Objects (Batch Response)
		type BatchItemResponse struct {
			Embedding [][]float32 `json:"embedding"`
		}
		var batchItemResp []BatchItemResponse

		// Try decoding as batch first (most likely for GPU server)
		if err := json.Unmarshal(bodyBytes, &stdRespBatch); err == nil && len(stdRespBatch.Embedding) > 0 && len(stdRespBatch.Embedding[0]) > 0 {
			embedding = stdRespBatch.Embedding[0]
		} else if err := json.Unmarshal(bodyBytes, &stdResp); err == nil && len(stdResp.Embedding) > 0 {
			// Try single
			embedding = stdResp.Embedding
		} else if err := json.Unmarshal(bodyBytes, &batchItemResp); err == nil && len(batchItemResp) > 0 && len(batchItemResp[0].Embedding) > 0 && len(batchItemResp[0].Embedding[0]) > 0 {
			// Try array of objects
			embedding = batchItemResp[0].Embedding[0]
		} else {
			// Try raw array
			var arrResp []float32
			if err := json.Unmarshal(bodyBytes, &arrResp); err == nil && len(arrResp) > 0 {
				embedding = arrResp
			} else {
				// Try OpenAI style
				type OpenAIResponse struct {
					Data []struct {
						Embedding []float32 `json:"embedding"`
					} `json:"data"`
				}
				var oaResp OpenAIResponse
				if err := json.Unmarshal(bodyBytes, &oaResp); err == nil && len(oaResp.Data) > 0 {
					embedding = oaResp.Data[0].Embedding
				}
			}
		}

		if len(embedding) == 0 {
			fmt.Printf("Failed to decode embedding from response: %s\n", string(bodyBytes))
			continue
		}

		// Normalize current chunk embedding (L2)
		var dot float32
		for _, v := range embedding {
			dot += v * v
		}
		mag := float32(math.Sqrt(float64(dot)))
		if mag > 0 {
			for k := range embedding {
				embedding[k] /= mag
			}
		}

		// Initialize sum vector if first
		if embeddingSum == nil {
			embeddingSum = make([]float32, len(embedding))
		}

		if len(embedding) != len(embeddingSum) {
			// Mismatch ignored (skip chunk)
			continue
		}

		// Accumulate
		for k, v := range embedding {
			embeddingSum[k] += v
		}
		count++
	}

	if count == 0 {
		return nil, fmt.Errorf("failed to generate any embeddings from chunks")
	}

	// 3. Average
	avgVector := make([]float32, len(embeddingSum))
	for i, v := range embeddingSum {
		avgVector[i] = v / float32(count)
	}

	// 4. Final Normalize (L2)
	var finalDot float32
	for _, v := range avgVector {
		finalDot += v * v
	}
	finalMag := float32(math.Sqrt(float64(finalDot)))

	if finalMag > 0 {
		for i := range avgVector {
			avgVector[i] /= finalMag
		}
	}

	return avgVector, nil
}

func (s *server) SearchDocuments(ctx context.Context, req *pb.SearchDocumentsRequest) (*pb.SearchDocumentsResponse, error) {
	// req.Query를 AI Service에 보내 임베딩 벡터로 변환 (Query Embedding)
	vec, err := generateEmbedding(req.Query)
	if err != nil {
		// Log error?
		// Fallback to dummy?
		return nil, err
	}

	queryVector := pgvector.NewVector(vec)

	var docs []Document
	// L2 distance (<->) or Cosine distance (<=>)
	// pgvector-go documentation recommends specific syntax
	// s.db.Order("embedding <-> ?", queryVector).Limit(int(req.Limit)).Find(&docs)

	if err := s.db.Order(gorm.Expr("embedding <=> ?", queryVector)).Limit(int(req.Limit)).Find(&docs).Error; err != nil {
		return nil, err
	}

	var results []*pb.SearchResult

	for _, d := range docs {
		// Title, Summary는 암호화된 상태 그대로 반환
		decryptedTitle := d.Title
		decryptedSummary := d.Summary

		// TagEvidences: DB의 JSON 문자열을 파싱 (값은 암호화되어 있음)
		var tagEvidences []TagEvidence
		// 에러 처리 생략 (또는 로그)
		json.Unmarshal([]byte(d.TagEvidences), &tagEvidences)

		// Struct TagEvidences -> Proto TagEvidences
		var tagEvidencesProto []*pb.TagEvidence
		for _, tc := range tagEvidences {
			tagEvidencesProto = append(tagEvidencesProto, &pb.TagEvidence{
				Tag:      tc.Tag,
				Evidence: tc.Evidence,
			})
		}

		results = append(results, &pb.SearchResult{
			Document: &pb.Document{
				Id:           d.ID,
				Title:        decryptedTitle,
				TagEvidences: tagEvidencesProto,
				Summary:      decryptedSummary,
				UpdatedAt:    d.UpdatedAt,
				CreatedAt:    d.CreatedAt,
				OwnerId:      d.OwnerID,
			},
			Score: 0.0,
		})
	}

	return &pb.SearchDocumentsResponse{Results: results}, nil
}

// SyncDocuments는 스트리밍이므로 추후 구현
func (s *server) SyncDocuments(stream pb.IndexService_SyncDocumentsServer) error {
	return nil
}

func (s *server) GenerateEmbedding(ctx context.Context, req *pb.GenerateEmbeddingRequest) (*pb.GenerateEmbeddingResponse, error) {
	vec, err := generateEmbedding(req.Text)
	if err != nil {
		return nil, err
	}
	return &pb.GenerateEmbeddingResponse{Embedding: vec}, nil
}
