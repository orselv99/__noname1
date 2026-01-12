package main

import (
	"context"
	"encoding/json"

	pb "server/.protos/index"
	"server/common/crypto"

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
	// Use provided embedding
	vectorData := req.Document.Embedding
	if len(vectorData) != 1536 {
		// Fallback or Error?
		// For now, if empty, we might want to error, or leave it as check constraints.
		// If client sends empty, we can't search.
		if len(vectorData) == 0 {
			return &pb.IndexDocumentResponse{Success: false, Message: "Embedding is empty"}, nil
		}
		// If dimension mismatch, pgvector might complain on save if column is typed.
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
	encryptedTagEvidences, err := crypto.Encrypt(string(tagEvidencesJson), req.Document.UserSalt)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to encrypt tags"}, nil
	}

	encryptedSummary, err := crypto.Encrypt(req.Document.Summary, req.Document.UserSalt)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to encrypt summary"}, nil
	}

	doc := Document{
		ID:           req.Document.Id,
		Title:        req.Document.Title,
		TagEvidences: encryptedTagEvidences,
		Summary:      encryptedSummary,
		OwnerID:      req.Document.OwnerId,
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
	}, nil
}

func (s *server) SearchDocuments(ctx context.Context, req *pb.SearchDocumentsRequest) (*pb.SearchDocumentsResponse, error) {
	// TODO: req.Query를 AI Service에 보내 임베딩 벡터로 변환 (Query Embedding)
	vec := make([]float32, 1536)
	// 테스트 매칭을 위해 IndexDocument와 동일한 더미 값 설정
	vec[0] = 0.1
	vec[1] = 0.2
	vec[2] = 0.3
	queryVector := pgvector.NewVector(vec)

	var docs []Document
	// L2 distance (<->) or Cosine distance (<=>)
	// pgvector-go documentation recommends specific syntax
	// s.db.Order("embedding <-> ?", queryVector).Limit(int(req.Limit)).Find(&docs)

	if err := s.db.Order(gorm.Expr("embedding <=> ?", queryVector)).Limit(int(req.Limit)).Find(&docs).Error; err != nil {
		return nil, err
	}

	var results []*pb.SearchResult

	userSalt := req.UserSalt

	for _, d := range docs {
		// Decrypt Title
		decryptedTitle, err := crypto.Decrypt(d.Title, userSalt)
		if err != nil {
			decryptedTitle = "[Decryption Failed]"
		}

		// Decrypt Summary
		decryptedSummary, err := crypto.Decrypt(d.Summary, userSalt)
		if err != nil {
			// 복호화 실패 시 로그 남기고 건너뛰거나 에러 처리 (여기서는 에러 문자열로 대체)
			decryptedSummary = "[Decryption Failed]"
		}

		// Decrypt TagEvidences
		decryptedTagEvidencesJson, err := crypto.Decrypt(d.TagEvidences, userSalt)
		var tagEvidences []TagEvidence
		if err == nil {
			json.Unmarshal([]byte(decryptedTagEvidencesJson), &tagEvidences)
		}

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
				UpdatedAt:    d.UpdatedAt.Unix(),
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
