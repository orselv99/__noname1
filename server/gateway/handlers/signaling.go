package handlers

import (
	"context"
	"io"
	"log"
	"net/http"

	pb "server/.protos/signaling"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
	"google.golang.org/grpc/metadata"
)

type SignalingHandler struct {
	client pb.SignalingServiceClient
}

func NewSignalingHandler(conn *grpc.ClientConn) *SignalingHandler {
	client := pb.NewSignalingServiceClient(conn)
	return &SignalingHandler{client: client}
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // 개발 모드: 모든 Origin 허용
	},
}

func (h *SignalingHandler) HandleWebSocket(c *gin.Context) {
	// 1. AuthMiddleware에서 설정한 UserID 가져오기
	// WebSocket은 초기 핸드셰이크가 HTTP 요청이므로 Middleware가 동작함.
	// 하지만 "Authorization" 헤더를 WS 클라이언트가 보내기 힘듦.
	// Query Parameter "token"을 사용하는 것이 일반적.
	// 미들웨어가 Query Param도 지원하는지 확인 필요.
	// 현재 AuthMiddleware는 Header만 확인.
	// 여기서는 Context에서 UserID를 가져온다고 가정. (만약 미들웨어 통과 못하면 여기까지 안 옴)

	userID, exists := c.Get("user_id")
	if !exists {
		// 미들웨어 미적용 라우트이거나 토큰 없음
		// Query param check fallback?
		token := c.Query("token")
		if token != "" {
			// TODO: 수동 검증 로직 필요
			// 하지만 Gateway 구조상 미들웨어를 거치는 것이 좋음.
			// 미들웨어 수정이 필요할 수 있음.
			// 여기서는 일단 Context에 없으면 에러.
			c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// 2. WebSocket Upgrade
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade to websocket: %v", err)
		return
	}
	defer conn.Close()

	// 3. gRPC Stream 연결 (Metadata에 PeerID 전달)
	md := metadata.Pairs("x-user-id", userID.(string))
	ctx := metadata.NewOutgoingContext(context.Background(), md)

	// 스트림은 길게 유지되므로 Context Cancel 주의
	stream, err := h.client.StreamSignals(ctx)
	if err != nil {
		log.Printf("Failed to create stream: %v", err)
		conn.WriteMessage(websocket.CloseMessage, []byte{})
		return
	}

	done := make(chan struct{})

	// 4. Goroutine: gRPC -> WebSocket
	go func() {
		defer close(done)
		for {
			in, err := stream.Recv()
			if err == io.EOF {
				return
			}
			if err != nil {
				log.Printf("gRPC Recv failed: %v", err)
				return
			}

			// Protobuf -> JSON (WebSocket 사용 편의를 위해) -> Client
			// 아니면 그냥 필드별로 매핑해서 JSON 전송
			wsMsg := map[string]interface{}{
				"type":            in.Type,
				"source_peer_id":  in.SourcePeerId,
				"sdp":             in.Sdp,
				"ice_candidate":   in.IceCandidate,
				"presence_status": in.PresenceStatus,
			}

			if err := conn.WriteJSON(wsMsg); err != nil {
				log.Printf("WebSocket WriteJSON failed: %v", err)
				return
			}
		}
	}()

	// 5. Loop: WebSocket -> gRPC
	for {
		var msg struct {
			Type         pb.SignalType `json:"type"`
			TargetPeerId string        `json:"target_peer_id"`
			Sdp          string        `json:"sdp"`
			IceCandidate string        `json:"ice_candidate"`
		}

		if err := conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		err := stream.Send(&pb.SignalRequest{
			Type:         msg.Type,
			TargetPeerId: msg.TargetPeerId,
			Sdp:          msg.Sdp,
			IceCandidate: msg.IceCandidate,
		})
		if err != nil {
			log.Printf("gRPC Send failed: %v", err)
			break
		}
	}

	// 종료 처리
	stream.CloseSend()
	<-done
}
