const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.static(path.join(__dirname)));

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const imageBase64 = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype || 'image/jpeg';

    const prompt = `You are an expert art historian and curator. Analyze this image and respond ONLY with a valid JSON object (no markdown, no explanation, just raw JSON).

If the image contains an artwork (painting, drawing, sculpture, print, digital art, etc.):
{
  "isArtwork": true,
  "title": "작품 제목 (한국어 · English)",
  "artist": "작가명 (한국어 · English)",
  "year": "제작연도 또는 추정 연도",
  "style": "미술 양식 (한국어)",
  "styleEn": "Art style (English)",
  "medium": "재료/기법 (한국어)",
  "description": "작품에 대한 설명 2-3문장 (한국어)",
  "priceRange": "₩ 추정 가격대 (프린트 기준, 예: ₩ 500,000 ~ ₩ 2,000,000)",
  "tags": ["태그1", "태그2", "태그3", "태그4"],
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "confidence": 숫자(0-100),
  "similar": [
    {"title": "유사작품1 제목", "artist": "작가명", "style": "양식", "price": "₩ 가격"},
    {"title": "유사작품2 제목", "artist": "작가명", "style": "양식", "price": "₩ 가격"},
    {"title": "유사작품3 제목", "artist": "작가명", "style": "양식", "price": "₩ 가격"}
  ]
}

If it's NOT an artwork (regular photo, selfie, food, etc.):
{
  "isArtwork": false,
  "title": "이미지 내용 간단 설명",
  "description": "이 이미지는 미술 작품이 아닙니다. 설명: ...",
  "tags": ["태그1", "태그2"],
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "confidence": 숫자(0-100),
  "similar": []
}

Be specific and accurate. For well-known artworks, use the real title/artist. For unknown works, make educated estimates based on style.`;

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text', text: prompt }
        ]
      }]
    });

    const raw = response.content[0].text.trim();
    // Strip markdown code blocks if present
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const result = JSON.parse(cleaned);
    res.json(result);

  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3131;
app.listen(PORT, () => console.log(`ArtLens server running on http://localhost:${PORT}`));
