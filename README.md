# 🔥 AI-Powered Multi-tenant Collaboration Platform

조직의 업무 효율성을 극대화하기 위해 설계된 멀티테넌트(Multi-tenant) 기반의 엔터프라이즈 협업 플랫폼 프로토타입입니다. 시스템 관리자(Super Admin), 고객사 관리자(Tenant Admin), 일반 사용자를 위한 3-Tier 아키텍처를 갖추고 있으며, 외부 AI 추론 서버와 연동하여 고객사별 맞춤형 AI 인프라를 제공합니다.

## 🎯 Project Focus
- **AI Orchestration:** 특정 AI 모델에 종속되지 않고, Llama 3, Phi-3 등의 다양한 LLM과 Vector Embedding 모델을 독립된 AI 서빙 환경(Docker + llama.cpp, GPU 서버)에서 API로 연동 및 제어.
- **Full-Stack Execution:** TypeScript, Go, Rust를 유연하게 조합하여 백엔드 인프라부터 데스크톱 클라이언트까지 엔드투엔드(E2E) 서비스를 빠르게 프로토타이핑.
- **Scalable Architecture:** 서브도메인 기반의 테넌트 분리, 대규모 사용자 CSV 일괄 업로드 등 실제 B2B SaaS 프로덕트 레벨의 확장성 고려.

## ⚙️ Tech Stack
- **Frontend / Web Admin:** TypeScript, React, Next.js (관리자 대시보드 및 웹 UI)
- **Backend / Microservices:** Go (다중 테넌트 API 서버 및 비즈니스 로직 처리)
- **Desktop Client:** Rust (OS 네이티브 자원을 최적화한 고성능 데스크톱 클라이언트)
- **AI Infrastructure:** Docker, llama.cpp (홈 서버 자원을 활용한 독립적인 AI 추론 API 서버 구축)

## ✨ Key Features
1. **Super Admin Console**
   - 전체 테넌트(고객사) 생성 및 구독 관리
   - 가용 AI 모델(SLM, LLM, Embedding) 풀 관리 및 테넌트별 접근 권한 설정
2. **Tenant Admin Console**
   - CSV 파일 업로드 기반의 부서/직위/사용자 대량 일괄 등록 및 관리 (Upsert/Replace 지원)
   - 사내 프로젝트 및 문서 접근 권한 제어
3. **End-User Client Workspace**
   - Markdown 기반 지식 관리 문서 에디터 및 버전/퍼블리싱 관리
   - 전사 및 개인 일정 관리를 위한 캘린더 연동
   - 실시간 사내 커뮤니케이션을 위한 메신저(Chat) 연동

## 🏗 Architecture Overview
클라이언트(Rust)와 웹 브라우저(TypeScript)는 Go 기반의 API Gateway를 거쳐, Docker/GPU 서버에 배포된 AI 모델 및 DB와 빠르고 안정적으로 통신합니다.
