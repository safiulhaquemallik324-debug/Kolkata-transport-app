// Backend/server.js

import dotenv from "dotenv";
dotenv.config(); // ← এই line টা add করো, এখানেই


import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { nodes } from './data/nodes.js';
import { buildNormalizedLookup } from './Utils/normalize.js';
import { calculateDistance } from './Utils/distanceHelper.js';
import { scoreNodeMatch } from './Utils/normalize.js';
import routeApi from './Routes/routeApi.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static frontend from 'public' directory
app.use(express.static(path.join(__dirname, "../Frontend/public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/public/index.html"));
});

// Build normalized lookup once
const normalizedLookup = buildNormalizedLookup(nodes);

// Infer transit types for a node
function inferTransitTypes(key, node) {
  const types = ["bus", "auto", "cab"];
  if (/station|railway/i.test(node.name || "")) types.push("rail");
  if (/ferry/i.test(node.desc || "")) types.push("ferry");
  return [...new Set(types)];
}

// API-facing node map
const NODES = Object.fromEntries(
  Object.entries(nodes).map(([id, node]) => [
    id,
    {
      name: node.name,
      lat: node.lat,
      lng: node.lon,
      type: inferTransitTypes(id, node),
      aliases: node.aliases || [],
      desc: node.desc || ""
    }
  ])
);

// ---- ROUTES ----

app.post('/api/route-test', (req, res) => {
  res.json({ ok: true });
});

// Main routing API
// app.use('/api/route', routeApi);

app.use('/api/route', routeApi); // comment out koro


// Autocomplete suggestions
app.get('/api/suggest', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);

  if (!q || q.length < 2) return res.json([]);

  let results = Object.entries(NODES)
    .map(([id, node]) => ({
      id,
      name: node.name,
      lat: node.lat,
      lng: node.lng,
      type: node.type,
      score: scoreNodeMatch(node, q)
    }))
    .filter(node => node.score > 0);

  if (!isNaN(lat) && !isNaN(lng)) {
    results = results.map(node => ({
      ...node,
      distance: Math.round(
        calculateDistance(lat, lng, node.lat, node.lng) * 10
      ) / 10
    }));
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distance !== undefined && b.distance !== undefined) {
      return a.distance - b.distance;
    }
    return a.name.localeCompare(b.name);
  });

  res.json(
    results.slice(0, 12).map(({ id, name, lat, lng, type, distance }) => ({
      id, name, lat, lng, type,
      ...(distance !== undefined ? { distance } : {})
    }))
  );
});

// Nearby stops
app.get('/api/nearby', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  const radius = parseFloat(req.query.radius) || 1.5;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: "Valid lat/lng required" });
  }

  const results = [];

  for (const [id, node] of Object.entries(NODES)) {
    const dist = calculateDistance(lat, lng, node.lat, node.lng);
    if (dist <= radius) {
      results.push({
        id,
        name: node.name,
        lat: node.lat,
        lng: node.lng,
        type: node.type,
        distance: dist,
        desc: node.desc || ""
      });
    }
  }

  results.sort((a, b) => a.distance - b.distance);
  res.json(results.slice(0, 8));
});

// AI brief summary (optional)
app.post('/api/brief', async (req, res) => {
  const from = String(req.body?.from || "").trim();
  const to = String(req.body?.to || "").trim();
  const mode = String(req.body?.mode || "").trim();
  const time = Number(req.body?.time);
  const price = Number(req.body?.price);
  const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];

  const parts = [
    `${from} → ${to}`,
    mode || null,
    Number.isFinite(time) ? `${time} min` : null,
    Number.isFinite(price) ? `₹${price}` : null
  ].filter(Boolean);

  const fallback = `${parts.join(" • ")}. ${steps[0] || ""}`.trim();

  const aiUrl = process.env.AI_BRIEF_URL;
  const aiKey = process.env.AI_BRIEF_KEY;

  if (!aiUrl) return res.json({ status: "fallback", summary: fallback });

  try {
    const aiRes = await fetch(aiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(aiKey ? { Authorization: `Bearer ${aiKey}` } : {})
      },
      body: JSON.stringify({ from, to, mode, time, price, steps })
    });

    if (!aiRes.ok) return res.json({ status: "fallback", summary: fallback });

    const data = await aiRes.json().catch(() => null);
    const summary = String(data?.summary || data?.text || "").trim();
    return res.json({ status: summary ? "ai" : "fallback", summary: summary || fallback });
  } catch {
    return res.json({ status: "fallback", summary: fallback });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Kolkata AI Transit server running on http://localhost:${PORT}`);
});