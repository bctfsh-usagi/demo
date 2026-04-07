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

// Artue.io works — manually curated from live site (Apr 2026)
// Each entry: title, artist, price, artueUrl, tags (for matching), imageHint (for picsum seed)
const ARTUE_WORKS = [
  { title: "The color of waves : Mint", artist: "Yeonhong Kim", price: "$870", tags: ["추상화","자연","컬러필드","물"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/waves-mint/400/300" },
  { title: "tipping point-形-20", artist: "Jaehyuk Han", price: "$25,710", tags: ["추상화","현대미술","한국"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/tipping-form/400/300" },
  { title: "The Transparent Visual Apparatus no.5", artist: "Goo Gijeong", price: "₩2,600,000", tags: ["현대미술","개념미술","설치"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/transparent-visual/400/300" },
  { title: "Human Behaviour", artist: "Matthew Stone", price: "$17,000", tags: ["인물화","현대미술","디지털"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/human-behaviour/400/300" },
  { title: "cresc.", artist: "YEWON SEO", price: "₩7,000,000", tags: ["추상화","현대미술","한국"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/cresc-seo/400/300" },
  { title: "With You", artist: "Young Jae", price: "₩960,000", tags: ["풍경화","자연","서정적"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/with-you-jae/400/300" },
  { title: "Flower", artist: "Yerang Hwang", price: "₩600,000", tags: ["꽃","자연","서정적","인상주의"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/flower-hwang/400/300" },
  { title: "Landscape Elements", artist: "Jina Jung", price: "$3,500", tags: ["풍경화","자연","추상화"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/landscape-jung/400/300" },
  { title: "Scenes", artist: "Moonhee Cho", price: "₩2,400,000", tags: ["풍경화","서정적","한국"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/scenes-cho/400/300" },
  { title: "Crow and Star", artist: "Yoo Suzy", price: "$470", tags: ["자연","새","서정적","밤"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/crow-star/400/300" },
  { title: "Behind the curtain: Venus 001", artist: "Wonmi Seo", price: "$3,150", tags: ["인물화","여성","현대미술","서정적"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/venus-wonmi/400/300" },
  { title: "Moon Gazing", artist: "Mina Lee", price: "$2,340", tags: ["자연","달","서정적","밤"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/moon-gazing/400/300" },
  { title: "A widening crack", artist: "Hansol Noh", price: "Available", tags: ["현대미술","개념미술","한국","추상화"], artueUrl: "https://artue.io/ko/artist/hansol-noh", img: "https://picsum.photos/seed/crack-noh/400/300" },
  { title: "Still life with Sphere and a floral crown", artist: "Hansol Noh", price: "Available", tags: ["정물화","꽃","현대미술"], artueUrl: "https://artue.io/ko/artist/hansol-noh", img: "https://picsum.photos/seed/sphere-noh/400/300" },
  { title: "ALICES", artist: "Hyeyoung Hwang", price: "$14,500", tags: ["인물화","현대미술","서사"], artueUrl: "https://artue.io/ko/works", img: "https://picsum.photos/seed/alices-hwang/400/300" },
];

function getArtueRecommendations(tags, style, n = 3) {
  // Score each work by tag overlap
  const scored = ARTUE_WORKS.map(work => {
    let score = 0;
    const allTags = [...tags, style].map(t => t.toLowerCase());
    for (const wTag of work.tags) {
      if (allTags.some(t => t.includes(wTag) || wTag.includes(t))) score++;
    }
    return { ...work, score };
  });
  scored.sort((a, b) => b.score - a.score || Math.random() - 0.5);
  return scored.slice(0, n);
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

    const prompt = `You are an expert art historian and curator. Analyze this image and respond ONLY with a valid JSON object. No markdown, no explanation, just raw JSON. ALL text fields must be in ENGLISH only.

If the image contains an artwork (painting, drawing, sculpture, print, digital art, etc.):
{
  "isArtwork": true,
  "title": "Artwork title in English",
  "artist": "Artist full name in English",
  "year": "Year or estimated period (e.g. 1889 or c. 1600s)",
  "style": "Art style in English (e.g. Impressionism, Baroque, Abstract)",
  "medium": "Medium in English (e.g. Oil on canvas, Watercolor)",
  "description": "2-3 sentences describing the artwork in English.",
  "priceRange": "Estimated print price range in USD (e.g. $500 ~ $2,000)",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "confidence": 92
}

If it's NOT an artwork:
{
  "isArtwork": false,
  "title": "Brief description of the image",
  "description": "This image does not appear to be an artwork. Description: ...",
  "tags": ["tag1", "tag2"],
  "palette": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"],
  "confidence": 60
}

Be accurate. For famous artworks use the real title and artist. For unknown works make educated estimates based on visible style and technique.`;

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

    // Replace similar works with actual Artue.io works (matched by style/tags)
    const artueRecs = getArtueRecommendations(result.tags || [], result.style || '');
    result.similar = artueRecs.map(w => ({
      title: w.title,
      artist: w.artist,
      style: w.tags[0] || result.style,
      price: w.price,
      image: w.img,
      artueUrl: w.artueUrl
    }));

    res.json(result);

  } catch (err) {
    console.error('Analysis error:', err);
    res.status(500).json({ error: 'Analysis failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3131;
app.listen(PORT, () => console.log(`ArtLens server running on http://localhost:${PORT}`));
