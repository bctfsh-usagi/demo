const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const https = require('https');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ArtLens/1.0' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return fetchJson(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

async function getMetImage(title, artist) {
  try {
    const q = encodeURIComponent(`${title} ${artist}`.trim());
    const search = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${q}&hasImages=true`);
    if (search && search.objectIDs && search.objectIDs.length > 0) {
      for (const id of search.objectIDs.slice(0, 5)) {
        const obj = await fetchJson(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
        if (obj && obj.primaryImageSmall) {
          return {
            image: obj.primaryImageSmall,
            title: obj.title || title,
            artist: obj.artistDisplayName || artist,
            metUrl: obj.objectURL || ''
          };
        }
      }
    }
  } catch (e) {}

  // Fallback: Wikimedia Commons API
  try {
    const q = encodeURIComponent(title);
    const wiki = await fetchJson(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${q}&prop=pageimages&format=json&pithumbsize=400`
    );
    if (wiki && wiki.query && wiki.query.pages) {
      const pages = Object.values(wiki.query.pages);
      for (const page of pages) {
        if (page.thumbnail && page.thumbnail.source) {
          return {
            image: page.thumbnail.source,
            title: title,
            artist: artist,
            metUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`
          };
        }
      }
    }
  } catch (e) {}

  return null;
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.static(path.join(__dirname)));

app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image provided' });

    const imageBase64 = req.file.buffer.toString('base64');
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mediaType = allowed.includes(req.file.mimetype) ? req.file.mimetype : 'image/jpeg';

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
    {"title": "한국어 제목 · English Title", "artist": "한국어 작가명 · English Artist Name", "style": "양식", "price": "₩ 가격"},
    {"title": "한국어 제목 · English Title", "artist": "한국어 작가명 · English Artist Name", "style": "양식", "price": "₩ 가격"},
    {"title": "한국어 제목 · English Title", "artist": "한국어 작가명 · English Artist Name", "style": "양식", "price": "₩ 가격"}
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

Be specific and accurate. For well-known artworks, use the real title/artist. For unknown works, make educated estimates based on style.

IMPORTANT for "similar" works: You MUST choose artworks from this confirmed list of Metropolitan Museum of Art (New York) holdings, as we fetch real images from their API. Pick the 3 most stylistically relevant from:
- Vermeer: "Young Woman with a Water Pitcher", "Woman with a Lute", "A Maid Asleep"
- Rembrandt: "Self-Portrait", "Aristotle with a Bust of Homer", "Portrait of a Man"
- Van Gogh: "Wheat Field with Cypresses", "Self-Portrait with a Straw Hat", "Sunflowers"
- Monet: "Bridge over a Pond of Water Lilies", "Garden at Sainte-Adresse", "Haystacks"  
- Degas: "The Dancing Class", "At the Milliner's", "Woman with Chrysanthemums"
- Manet: "Boating", "The Dead Christ with Angels"
- Renoir: "Madame Georges Charpentier and Her Children", "By the Seashore"
- Cezanne: "The Card Players", "Mont Sainte-Victoire"
- Seurat: "Circus Sideshow"
- El Greco: "Portrait of a Cardinal", "View of Toledo"
- Caravaggio: "The Denial of Saint Peter"
- Raphael: "Madonna and Child Enthroned with Saints"
- Titian: "Venus and the Lute Player", "Portrait of a Man"
- Goya: "Manuel Osorio Manrique de Zuñiga", "Don Sebastian Martinez y Perez"
- Velazquez: "Juan de Pareja"`;

    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
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
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const result = JSON.parse(cleaned);

    // Enrich similar works with real images from Met Museum API
    // Use English title/artist (after ·) for better search results
    if (result.similar && result.similar.length > 0) {
      result.similar = await Promise.all(result.similar.map(async (item) => {
        const parts = (item.title || '').split('·');
        const titleEn = (parts[1] || parts[0] || '').trim();
        const artistParts = (item.artist || '').split('·');
        const artistEn = (artistParts[1] || artistParts[0] || '').trim();
        const met = await getMetImage(titleEn, artistEn);
        return {
          ...item,
          image: met ? met.image : null,
          metUrl: met ? met.metUrl : null
        };
      }));
    }

    res.json(result);

  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3131;
app.listen(PORT, () => console.log(`ArtLens server running on http://localhost:${PORT}`));
