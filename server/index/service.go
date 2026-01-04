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

// TagChunk 구조체 (JSON 변환용)
type TagChunk struct {
	Tag   string `json:"tag"`
	Chunk string `json:"chunk"`
}

func (s *server) IndexDocument(ctx context.Context, req *pb.IndexDocumentRequest) (*pb.IndexDocumentResponse, error) {
	// TODO: 실제로는 여기서 AI Service를 호출해서 req.Document.Content에 대한 임베딩을 얻어와야 함
	// 현재는 더미 벡터(1536차원)로 저장
	vec := make([]float32, 1536)
	// 테스트를 위해 일부 값 설정 (선택 사항)
	vec[0] = 0.1
	vec[1] = 0.2
	vec[2] = 0.3
	dummyVector := pgvector.NewVector(vec)

	// Proto TagChunks -> Struct TagChunks
	var tagChunks []TagChunk
	for _, tc := range req.Document.TagChunks {
		tagChunks = append(tagChunks, TagChunk{
			Tag:   tc.Tag,
			Chunk: tc.Chunk,
		})
	}

	// JSON Marshalling
	tagChunksJson, err := json.Marshal(tagChunks)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to marshal tag chunks"}, nil
	}

	// Metadata에서 Salt 추출 (Removed)
	userSalt := req.Document.UserSalt

	// Encrypt TagChunks using UserSalt
	encryptedTagChunks, err := crypto.Encrypt(string(tagChunksJson), userSalt)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to encrypt tag chunks: " + err.Error()}, nil
	}

	// Encrypt Summary using UserSalt
	encryptedSummary, err := crypto.Encrypt(req.Document.Summary, userSalt)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to encrypt summary: " + err.Error()}, nil
	}

	// Encrypt Title using UserSalt
	encryptedTitle, err := crypto.Encrypt(req.Document.Title, userSalt)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to encrypt title: " + err.Error()}, nil
	}

	doc := Document{
		ID:        req.Document.Id,
		Title:     encryptedTitle,     // 암호화된 문자열 저장
		TagChunks: encryptedTagChunks, // 암호화된 문자열 저장
		Summary:   encryptedSummary,   // 암호화된 문자열 저장
		OwnerID:   req.Document.OwnerId,
		Embedding: dummyVector,
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

	// Metadata에서 Salt 추출 (Removed)
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

		// Decrypt TagChunks
		decryptedTagChunksJson, err := crypto.Decrypt(d.TagChunks, userSalt)
		var tagChunks []TagChunk
		if err == nil {
			json.Unmarshal([]byte(decryptedTagChunksJson), &tagChunks)
		}

		// Struct TagChunks -> Proto TagChunks
		var protoTagChunks []*pb.TagChunk
		for _, tc := range tagChunks {
			protoTagChunks = append(protoTagChunks, &pb.TagChunk{
				Tag:   tc.Tag,
				Chunk: tc.Chunk,
			})
		}

		results = append(results, &pb.SearchResult{
			Document: &pb.Document{
				Id:        d.ID,
				Title:     decryptedTitle,
				TagChunks: protoTagChunks,
				Summary:   decryptedSummary,
				UpdatedAt: d.UpdatedAt.Unix(),
				OwnerId:   d.OwnerID,
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
