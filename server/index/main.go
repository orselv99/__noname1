package main

import (
	"log"
	"net"
	"os"

	pb "server/protos/index"

	"google.golang.org/grpc"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// DB 연결 설정
	// DB 이름: fiery_index (기존 fiery_auth와 분리 권장)
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=postgres dbname=fiery_index port=5432 sslmode=disable"
		log.Println("DB_DSN not set, using default for local development. Ensure DB 'fiery_index' exists.")
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// pgvector 확장 활성화
	db.Exec("CREATE EXTENSION IF NOT EXISTS vector")

	// Auto Migration
	if err := db.AutoMigrate(&Document{}); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	// gRPC 서버 시작
	lis, err := net.Listen("tcp", ":50052")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterIndexServiceServer(s, &server{db: db})
	log.Printf("Index Service listening on :50052")

	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
