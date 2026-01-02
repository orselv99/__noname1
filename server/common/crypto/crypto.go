package crypto

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"io"

	"golang.org/x/crypto/hkdf"
)

// TODO: 실제 운영 환경에서는 환경변수나 Secret Manager에서 가져와야 함
const MasterKey = "fiery-horizon-super-secret-master-key-2026"

// DeriveKey는 MasterKey와 UserSalt를 조합하여 사용자별 고유 키를 생성합니다. (HKDF-SHA256)
func DeriveKey(userSalt string) ([]byte, error) {
	// HKDF의 Salt로 userSalt를 사용
	hkdf := hkdf.New(sha256.New, []byte(MasterKey), []byte(userSalt), nil)
	key := make([]byte, 32) // AES-256 requires 32 bytes
	if _, err := io.ReadFull(hkdf, key); err != nil {
		return nil, err
	}
	return key, nil
}

// Encrypt는 평문 데이터를 사용자 Salt로 파생된 키로 암호화하여 Base64 문자열로 반환합니다.
func Encrypt(plaintext string, userSalt string) (string, error) {
	key, err := DeriveKey(userSalt)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// Decrypt는 암호화된 Base64 문자열을 사용자 Salt로 파생된 키로 복호화하여 평문을 반환합니다.
func Decrypt(cryptoText string, userSalt string) (string, error) {
	key, err := DeriveKey(userSalt)
	if err != nil {
		return "", err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(cryptoText)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}
