package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"time"

	pb "server/protos/auth"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type server struct {
	pb.UnimplementedAuthServiceServer
	db *gorm.DB
}

func (s *server) Register(ctx context.Context, req *pb.RegisterRequest) (*pb.RegisterResponse, error) {
	// 비밀번호 해싱
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	// Salt 생성 (32바이트 랜덤 문자열 -> Base64)
	saltBytes := make([]byte, 32)
	if _, err := rand.Read(saltBytes); err != nil {
		return nil, err
	}
	salt := base64.StdEncoding.EncodeToString(saltBytes)

	user := User{
		ID:           uuid.New().String(),
		Email:        req.Email,
		PasswordHash: string(hashedPassword),
		Salt:         salt,
		Username:     req.Username,
	}

	if result := s.db.Create(&user); result.Error != nil {
		return nil, result.Error
	}

	// JWT 토큰 생성 (Register에서 반환 안 함)
	// token, refreshToken, exp, err := GenerateTokens(user.ID, user.Email, user.Salt)
	// if err != nil { return nil, err }

	return &pb.RegisterResponse{
		UserId:  user.ID,
		Message: "User registered successfully",
	}, nil
}

func (s *server) Login(ctx context.Context, req *pb.LoginRequest) (*pb.LoginResponse, error) {
	var user User
	result := s.db.Where("email = ?", req.Email).First(&user)
	if result.Error != nil {
		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			return nil, errors.New("invalid email or password")
		}
		return nil, result.Error
	}

	// 비밀번호 검증
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return nil, errors.New("invalid credentials")
	}

	// JWT 토큰 생성
	token, refreshToken, exp, err := GenerateTokens(user.ID, user.Email, user.Salt)
	if err != nil {
		return nil, err
	}

	return &pb.LoginResponse{
		AccessToken:  token,
		RefreshToken: refreshToken,
		ExpiresIn:    int64(exp - time.Now().Unix()),
	}, nil
}

func (s *server) ValidateToken(ctx context.Context, req *pb.ValidateTokenRequest) (*pb.ValidateTokenResponse, error) {
	claims, err := ValidateTokenString(req.AccessToken)
	if err != nil {
		return &pb.ValidateTokenResponse{Valid: false}, nil
	}

	// Salt 조회
	salt := claims.Salt
	if salt == "" {
		// Claim에 없으면 DB 조회 (구버전 호환)
		var user User
		if result := s.db.First(&user, "id = ?", claims.UserID); result.Error == nil {
			salt = user.Salt
		}
	}

	return &pb.ValidateTokenResponse{
		Valid:    true,
		UserId:   claims.UserID,
		UserSalt: salt,
	}, nil
}

func (s *server) RefreshToken(ctx context.Context, req *pb.RefreshTokenRequest) (*pb.RefreshTokenResponse, error) {
	// 리프레시 토큰 검증
	claims, err := ValidateTokenString(req.RefreshToken)
	if err != nil {
		return nil, errors.New("invalid refresh token")
	}

	// 실제로는 DB에서 리프레시 토큰 화이트리스트/블랙리스트 검사를 해야 할 수 있음

	// User Salt 조회
	var user User
	result := s.db.First(&user, "id = ?", claims.UserID)
	if result.Error != nil {
		return nil, errors.New("user not found")
	}

	// 새 액세스 토큰 발급
	newAccess, newRefresh, _, err := GenerateTokens(user.ID, user.Email, user.Salt)
	if err != nil {
		return nil, err
	}

	return &pb.RefreshTokenResponse{
		AccessToken:  newAccess,
		RefreshToken: newRefresh, // Rotation
	}, nil
}
