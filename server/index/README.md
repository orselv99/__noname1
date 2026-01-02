# Index Service 구현 계획

## 기능
문서의 저장, 임베딩(Vector) 생성/저장, 그리고 유사도 검색(RAG)을 담당하는 서비스입니다.

## 기술 스택
- **Database**: PostgreSQL + `pgvector` Extension
- **ORM**: GORM (with pgvector support)
- **Vector Dimension**: 1536 (OpenAI 등 일반적인 모델 기준, 추후 설정 가능)

## 주요 구성 요소
1. **Model (`model.go`)**
    - `Document`: ID, Title, Content, Vector(`vector(1536)`), Tags, OwnerID
2. **Service (`service.go`)**
    - `IndexDocument`: 문서를 저장하고 (추후 AI 모델을 통해) 벡터를 업데이트
    - `SearchDocuments`: `pgvector`의 코사인 유사도 연산(`<->`, `<=>`)을 사용해 검색
3. **Main (`main.go`)**
    - DB 연결 및 `pgvector` 확장 활성화

## 데이터베이스
`fiery_index` 데이터베이스를 사용합니다.
(Postgres 컨테이너에 접속해 `CREATE DATABASE fiery_index;` 가 필요할 수 있습니다.)
