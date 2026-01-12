package main

import (
	"context"
	"encoding/json"

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
	// Use provided embedding
	vectorData := req.Document.Embedding
	if len(vectorData) != 768 {
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
	}, nil
}

func (s *server) SearchDocuments(ctx context.Context, req *pb.SearchDocumentsRequest) (*pb.SearchDocumentsResponse, error) {
	// TODO: req.Query를 AI Service에 보내 임베딩 벡터로 변환 (Query Embedding)
	vec := make([]float32, 768)
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
