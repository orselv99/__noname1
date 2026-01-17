package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"regexp"
	"strings"

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

// AI Completion 응답 구조체
type AiAnalysisItem struct {
	Tag      string `json:"tag"`
	Evidence string `json:"evidence"`
}

type AiJsonResult struct {
	Summary  string           `json:"summary"`
	Analysis []AiAnalysisItem `json:"analysis"`
}

type CompletionResponse struct {
	Content string `json:"content"`
}

// generateCompletion calls llama-server /completion to generate summary and tags
func generateCompletion(content string) (string, []TagEvidence, error) {
	llamaAddr := os.Getenv("LLAMA_SERVER_ADDR")
	if llamaAddr == "" {
		llamaAddr = "http://llama-server:8080"
	}

	// Clean input text (remove markdown, HTML, etc.)
	cleanedText := cleanInputText(content)

	// Limit text length
	if len([]rune(cleanedText)) > 3000 {
		cleanedText = string([]rune(cleanedText)[:3000])
	}

	// Gemma 2 prompt format
	prompt := fmt.Sprintf(`<start_of_turn>user
You are a professional document analyzer specializing in high-density information extraction.
Your task is to identify the core identity of the provided text and summarize it precisely in Korean.
Follow these instructions strictly:
1. Summary: Write a concise one-sentence summary that captures the "core intent" or "main conclusion" of the text. 
   - Format: "이 문서는 [subject]에 대해 설명합니다."
2. Tags (Semantic Keywords): Identify exactly 3 essential keywords.
   - Do NOT use generic category names (e.g., 개요, 특징, 결론).
   - DO select keywords that represent the "Unique Value Proposition" or "Core Concept" that distinguishes this document from others.
   - Each tag should be a high-density noun or a short phrase (e.g., "자연선택적 진화" instead of "진화").
3. Evidences (Contextual Justification): For each tag, extract the most "definition-heavy" verbatim sentence.
   - The sentence must clearly explain the significance or the reason why the tag was chosen.
   - Do not truncate or modify the sentence; it must be 100%% verbatim.
JSON format:{"summary":"...", "analysis":[{"tag":"...", "evidence":"..."}, ...]}

Document:
%s<end_of_turn>
<start_of_turn>model
`, cleanedText)

	// Prepare request body with JSON schema
	reqBody := map[string]interface{}{
		"prompt":      prompt,
		"n_predict":   1024,
		"temperature": 0.1,
		"top_k":       40,
		"top_p":       0.9,
		"stop":        []string{"<end_of_turn>", "\n\n\n"},
		"json_schema": map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"summary": map[string]string{"type": "string"},
				"analysis": map[string]interface{}{
					"type": "array",
					"items": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"tag":      map[string]string{"type": "string"},
							"evidence": map[string]string{"type": "string"},
						},
						"required": []string{"tag", "evidence"},
					},
					"minItems": 3,
					"maxItems": 3,
				},
			},
			"required": []string{"summary", "analysis"},
		},
	}

	jsonPayload, err := json.Marshal(reqBody)
	if err != nil {
		return "", nil, fmt.Errorf("failed to marshal completion request: %w", err)
	}

	fmt.Println("DEBUG: Sending completion request to", llamaAddr)

	resp, err := http.Post(llamaAddr+"/completion", "application/json", bytes.NewBuffer(jsonPayload))
	if err != nil {
		return "", nil, fmt.Errorf("completion request failed: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, fmt.Errorf("failed to read completion response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", nil, fmt.Errorf("llama server error: %s - %s", resp.Status, string(bodyBytes))
	}

	// Parse response
	var completionResp CompletionResponse
	if err := json.Unmarshal(bodyBytes, &completionResp); err != nil {
		return "", nil, fmt.Errorf("failed to parse completion response: %w", err)
	}

	fmt.Printf("DEBUG: Completion response (%d chars): %s\n", len(completionResp.Content), completionResp.Content)

	// Parse AI JSON result
	summary, tags := parseAiResponse(completionResp.Content)

	return summary, tags, nil
}

// cleanInputText removes HTML, markdown syntax for cleaner AI input
func cleanInputText(input string) string {
	// 1. Remove HTML tags
	re := regexp.MustCompile(`<[^>]*>`)
	s := re.ReplaceAllString(input, "")

	// 2. Remove markdown code blocks
	s = strings.ReplaceAll(s, "```", " ")

	// 3. Remove markdown symbols
	s = strings.ReplaceAll(s, "**", "")
	s = strings.ReplaceAll(s, "__", "")
	s = strings.ReplaceAll(s, "~~", "")
	s = strings.ReplaceAll(s, "==", "")

	// 4. Remove * # ` characters
	var result strings.Builder
	for _, c := range s {
		if c != '*' && c != '#' && c != '`' {
			result.WriteRune(c)
		}
	}
	s = result.String()

	// 5. Collapse whitespace
	re = regexp.MustCompile(`\s+`)
	s = re.ReplaceAllString(s, " ")

	return strings.TrimSpace(s)
}

// parseAiResponse extracts summary and tags from AI JSON response
func parseAiResponse(content string) (string, []TagEvidence) {
	// Try to find JSON in content
	jsonStr := content

	// Check for markdown code block
	if idx := strings.Index(content, "```"); idx != -1 {
		start := idx + 3
		if strings.HasPrefix(content[start:], "json") {
			start += 4
		}
		if endIdx := strings.Index(content[start:], "```"); endIdx != -1 {
			jsonStr = content[start : start+endIdx]
		}
	} else if startIdx := strings.Index(content, "{"); startIdx != -1 {
		if endIdx := strings.LastIndex(content, "}"); endIdx != -1 {
			jsonStr = content[startIdx : endIdx+1]
		}
	}

	jsonStr = strings.TrimSpace(jsonStr)

	var result AiJsonResult
	if err := json.Unmarshal([]byte(jsonStr), &result); err != nil {
		fmt.Printf("DEBUG: Failed to parse AI JSON: %v\n", err)
		return "", nil
	}

	var tags []TagEvidence
	for _, item := range result.Analysis {
		tags = append(tags, TagEvidence{
			Tag:      item.Tag,
			Evidence: item.Evidence,
		})
	}

	return result.Summary, tags
}

func (s *server) IndexDocument(ctx context.Context, req *pb.IndexDocumentRequest) (*pb.IndexDocumentResponse, error) {
	// Content is required
	if req.Document.Content == "" {
		return &pb.IndexDocumentResponse{Success: false, Message: "Content is required"}, nil
	}

	// Variables for AI-generated data
	var generatedSummary string
	var generatedTags []TagEvidence

	// Check if summary/tags need to be generated
	needsAiGeneration := req.Document.Summary == "" || len(req.Document.TagEvidences) == 0

	if needsAiGeneration {
		fmt.Println("DEBUG: Generating AI summary/tags for document")
		summary, tags, err := generateCompletion(req.Document.Content)
		if err != nil {
			fmt.Printf("DEBUG: AI generation failed (continuing without): %v\n", err)
			// Continue without AI data - not a fatal error
		} else {
			generatedSummary = summary
			generatedTags = tags
			fmt.Printf("DEBUG: AI generated summary (%d chars), %d tags\n", len(summary), len(tags))
		}
	}

	// Use provided or generated summary
	finalSummary := req.Document.Summary
	if finalSummary == "" && generatedSummary != "" {
		finalSummary = generatedSummary
	}

	// Use provided or generated tags
	var tagEvidences []TagEvidence
	if len(req.Document.TagEvidences) > 0 {
		for _, tc := range req.Document.TagEvidences {
			tagEvidences = append(tagEvidences, TagEvidence{
				Tag:      tc.Tag,
				Evidence: tc.Evidence,
			})
		}
	} else if len(generatedTags) > 0 {
		tagEvidences = generatedTags
	}

	// Generate embedding
	// Strategy: Prepend summary + tags to content for better RAG
	contentForEmbedding := req.Document.Content
	if finalSummary != "" || len(tagEvidences) > 0 {
		var enrichedParts []string
		if finalSummary != "" {
			enrichedParts = append(enrichedParts, "Summary: "+finalSummary)
		}
		if len(tagEvidences) > 0 {
			var tagStrings []string
			for _, t := range tagEvidences {
				tagStrings = append(tagStrings, t.Tag)
			}
			enrichedParts = append(enrichedParts, "Keywords: "+strings.Join(tagStrings, ", "))
		}
		if len(enrichedParts) > 0 {
			contentForEmbedding = strings.Join(enrichedParts, "\n") + "\n\n" + req.Document.Content
		}
	}

	vectorData := req.Document.Embedding
	if len(vectorData) == 0 {
		var err error
		vectorData, err = generateEmbedding(contentForEmbedding)
		if err != nil {
			return &pb.IndexDocumentResponse{Success: false, Message: "Failed to generate embedding: " + err.Error()}, nil
		}
		fmt.Printf("DEBUG: Generated embedding with enriched content (%d chars)\n", len(contentForEmbedding))
	} else if len(vectorData) != 768 {
		return &pb.IndexDocumentResponse{Success: false, Message: "Invalid embedding dimension"}, nil
	}

	embeddingVector := pgvector.NewVector(vectorData)

	// TagEvidences -> JSON
	tagEvidencesJson, err := json.Marshal(tagEvidences)
	if err != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: "Failed to marshal tags"}, nil
	}

	doc := Document{
		ID:           req.Document.Id,
		Title:        req.Document.Title,
		TagEvidences: string(tagEvidencesJson),
		Summary:      finalSummary,
		OwnerID:      req.Document.OwnerId,
		GroupID:      req.Document.GroupId,
		GroupType:    req.Document.GroupType,
		CreatedAt:    req.Document.CreatedAt,
		UpdatedAt:    req.Document.UpdatedAt,
		Embedding:    embeddingVector,
	}

	// Upsert
	result := s.db.Save(&doc)
	if result.Error != nil {
		return &pb.IndexDocumentResponse{Success: false, Message: result.Error.Error()}, nil
	}

	// Build response tags
	var responseTagEvidences []*pb.TagEvidence
	for _, t := range tagEvidences {
		responseTagEvidences = append(responseTagEvidences, &pb.TagEvidence{
			Tag:      t.Tag,
			Evidence: t.Evidence,
		})
	}

	fmt.Printf("DEBUG: Document indexed: id=%s, summary=%d chars, tags=%d\n", doc.ID, len(finalSummary), len(tagEvidences))

	return &pb.IndexDocumentResponse{
		Success:      true,
		Message:      "Document indexed successfully",
		DocumentId:   doc.ID,
		Embedding:    vectorData,
		Summary:      finalSummary,
		TagEvidences: responseTagEvidences,
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
		return nil, err
	}

	queryVector := pgvector.NewVector(vec)

	// Use raw SQL to get both document data AND distance score
	type DocWithDistance struct {
		Document
		Distance float32 `gorm:"column:distance"`
	}

	var docsWithDist []DocWithDistance

	// Raw SQL with cosine distance calculation
	// <=> is cosine distance operator in pgvector
	sql := `
		SELECT 
			id, title, summary, tag_evidences, updated_at, created_at, owner_id, group_id, group_type,
			(embedding <=> ?) as distance
		FROM documents 
		ORDER BY embedding <=> ?
		LIMIT ?
	`

	if err := s.db.Raw(sql, queryVector, queryVector, req.Limit).Scan(&docsWithDist).Error; err != nil {
		return nil, err
	}

	var results []*pb.SearchResult

	for _, d := range docsWithDist {
		// Title, Summary는 암호화된 상태 그대로 반환
		decryptedTitle := d.Title
		decryptedSummary := d.Summary

		// TagEvidences: DB의 JSON 문자열을 파싱 (값은 암호화되어 있음)
		var tagEvidences []TagEvidence
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
			Score: d.Distance, // Actual cosine distance from pgvector
		})
	}

	fmt.Printf("DEBUG: Server SearchDocuments found %d results for query '%s'\n", len(results), req.Query)

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
