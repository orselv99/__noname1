package main

import (
	"io"
	"log"
	"sync"

	pb "server/.protos/signaling"

	"google.golang.org/grpc/metadata"
)

type signalingServer struct {
	pb.UnimplementedSignalingServiceServer
	// PeerID -> Stream
	// 단순화를 위해 단일 스트림만 저장. 다중 디바이스 시 마지막 연결만 유효할 수 있음.
	peers sync.Map
}

func NewSignalingServer() *signalingServer {
	return &signalingServer{}
}

func (s *signalingServer) StreamSignals(stream pb.SignalingService_StreamSignalsServer) error {
	// 1. Metadata에서 PeerID(UserID) 추출 (Gateway에서 전달됨)
	var peerID string
	md, ok := metadata.FromIncomingContext(stream.Context())
	if ok {
		if ids := md.Get("x-user-id"); len(ids) > 0 {
			peerID = ids[0]
		}
	}

	if peerID == "" {
		log.Println("StreamSignals: connected without x-user-id")
		return nil // 또는 에러 반환
	}

	log.Printf("Peer connected: %s", peerID)

	// 2. Peer 등록
	s.peers.Store(peerID, stream)

	// 4. Send Initial Online List to New Peer
	s.peers.Range(func(key, value interface{}) bool {
		targetID := key.(string)
		if targetID == peerID {
			return true
		}

		// Send "targetID is online" to new peer
		err := stream.Send(&pb.SignalResponse{
			Type:           pb.SignalType_PRESENCE,
			SourcePeerId:   targetID,
			PresenceStatus: "online",
		})
		if err != nil {
			log.Printf("Failed to sync presence of %s to %s: %v", targetID, peerID, err)
		}
		return true
	})

	// Broadcast Online Status
	s.broadcastPresence(peerID, "online")

	defer func() {
		s.peers.Delete(peerID)
		log.Printf("Peer disconnected: %s", peerID)
		// Broadcast Offline Status
		s.broadcastPresence(peerID, "offline")
	}()

	// 3. 메시지 루프
	for {
		in, err := stream.Recv()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			log.Printf("Recv error from %s: %v", peerID, err)
			return err
		}

		log.Printf("Received signal from %s type=%v target=%s", peerID, in.Type, in.TargetPeerId)

		// 4. 메시지 처리 및 라우팅
		if in.TargetPeerId != "" {
			targetStreamAny, ok := s.peers.Load(in.TargetPeerId)
			if ok {
				targetStream := targetStreamAny.(pb.SignalingService_StreamSignalsServer)

				// 메시지 전송 (SourcePeerId 설정)
				err := targetStream.Send(&pb.SignalResponse{
					Type:         in.Type,
					SourcePeerId: peerID,
					Sdp:          in.Sdp,
					IceCandidate: in.IceCandidate,
				})
				if err != nil {
					log.Printf("Failed to send to target %s: %v", in.TargetPeerId, err)
					// 전송 실패 시 어떻게 처리할지? (연결 끊김으로 간주하고 루프 계속?)
				}
			} else {
				log.Printf("Target peer %s not found", in.TargetPeerId)
			}
		}
	}
}

func (s *signalingServer) broadcastPresence(peerID, status string) {
	s.peers.Range(func(key, value interface{}) bool {
		targetID := key.(string)
		if targetID == peerID {
			return true // Skip self
		}

		stream := value.(pb.SignalingService_StreamSignalsServer)
		err := stream.Send(&pb.SignalResponse{
			Type:           pb.SignalType_PRESENCE,
			SourcePeerId:   peerID,
			PresenceStatus: status,
		})
		if err != nil {
			log.Printf("Failed to send presence to %s: %v", targetID, err)
		}
		return true
	})
}
