package main

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TODO: 환경 변수에서 로드
var jwtSecret = []byte("my_super_secure_secret_key_change_me")

type Claims struct {
	UserID string `json:"user_id"`
	Salt   string `json:"salt"` // 추가됨
	jwt.RegisteredClaims
}

// GenerateTokens는 AccessToken과 RefreshToken을 생성합니다.
func GenerateTokens(userID, email, salt string) (string, string, int64, error) {
	expirationTime := time.Now().Add(3 * time.Hour) // Access Token 3시간

	claims := jwt.MapClaims{
		"user_id": userID,
		"email":   email,
		"salt":    salt, // 추가됨
		"exp":     expirationTime.Unix(),
		"iat":     time.Now().Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	accessToken, err := token.SignedString(jwtSecret)
	if err != nil {
		return "", "", 0, err
	}

	// Refresh Token (단순히 길게 설정, 7일)
	refreshExpirationTime := time.Now().Add(7 * 24 * time.Hour)
	refreshClaims := &Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(refreshExpirationTime),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	refreshTokenObj := jwt.NewWithClaims(jwt.SigningMethodHS256, refreshClaims)
	refreshToken, err := refreshTokenObj.SignedString(jwtSecret)
	if err != nil {
		return "", "", 0, err
	}

	return accessToken, refreshToken, int64(time.Until(expirationTime).Seconds()), nil
}

// ValidateTokenString은 토큰을 검증하고 Claims를 반환합니다.
func ValidateTokenString(tokenStr string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if !token.Valid {
		return nil, errors.New("invalid token")
	}

	return claims, nil
}
