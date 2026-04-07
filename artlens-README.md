# ArtLens 🎨

> AI 기반 미술 작품 인식 서비스  
> 이미지를 업로드하거나 카메라로 촬영하면 Claude Vision AI가 작품 정보를 실시간 분석합니다.

## 실행 방법

### 1. 의존성 설치
```bash
npm install
```

### 2. 환경변수 설정
```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

### 3. 서버 실행
```bash
node server.js
```

브라우저에서 `http://localhost:3131` 접속

## 기능
- 📷 카메라 촬영 (모바일 후면 카메라 자동 선택)
- 🖼️ 이미지 업로드 (드래그 & 드롭)
- 🤖 Claude Vision AI 실제 분석
  - 작품명, 작가, 연도, 양식, 재료
  - 작품 설명, 추정 가격
  - 색상 팔레트, 신뢰도 점수
  - 유사 작품 3개 추천
- 🛒 ARTUE 구매 연결

## Tech Stack
- Frontend: Vanilla HTML/CSS/JS
- Backend: Node.js + Express
- AI: Anthropic Claude (claude-opus-4-5 Vision)
