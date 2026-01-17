package main

import (
	"log"
	"net"
	"os"
	"time"

	pb "server/.protos/auth"

	"google.golang.org/grpc"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// DB 연결 설정
	// 기본값: "host=localhost user=postgres password=secret dbname=fiery_auth port=5432 sslmode=disable"
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=zzzzzzzz1! dbname=fiery_auth port=5432 sslmode=disable"
		log.Println("DB_DSN not set, using default for local development. Please ensure Postgres contains this DB/User.")
	}

	var db *gorm.DB
	var err error

	// Retry connection loop
	for i := 0; i < 30; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("failed to connect database (attempt %d/30): %v", i+1, err)
		time.Sleep(1 * time.Second)
	}

	if err != nil {
		log.Fatalf("failed to connect database after retries: %v", err)
	}

	// Auto Migration
	// Database Migration
	if err := db.AutoMigrate(
		&User{}, &Subscription{}, &Tenant{}, &Position{},
		&Department{},
		&Project{},
		&Permission{}, &AccessRequest{}, // Legacy ACL
		&DocumentMetadata{}, &VisibilityApproval{}, // Advanced ACL
	); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	// Seed Super Users
	if err := seedSuperUsers(db); err != nil {
		log.Printf("failed to seed super users: %v", err)
	}

	// gRPC 서버 시작
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("failed to listen: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterAuthServiceServer(s, &server{db: db})
	log.Printf("Auth Service listening on :50051")

	if err := s.Serve(lis); err != nil {
		log.Fatalf("failed to serve: %v", err)
	}
}
