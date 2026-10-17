// Hiking Buddy backend: issues short-lived ElevenLabs conversation tokens.
// Your ElevenLabs API key stays here, never in the app.
// Requires Node 18+ (built-in fetch).
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());

const API_KEY = process.env.ELEVENLABS_API_KEY;
const AGENTS = {
  young: process.env.AGENT_ID_YOUNG,
  adult: process.env.AGENT_ID_ADULT,
  senior: process.env.AGENT_ID_SENIOR,
};

if (!API_KEY) console.warn("Missing ELEVENLABS_API_KEY in .env");

app.get("/health", (_req, res) => res.json({ ok: true }));

// GET /api/session?persona=young|adult|senior
app.get("/api/session", async (req, res) => {
  const persona = String(req.query.persona || "adult");
  const agentId = AGENTS[persona];
  if (!agentId) {
    return res.status(400).json({ error: `Unknown or unconfigured persona: ${persona}` });
  }
  try {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
    const r = await fetch(url, { headers: { "xi-api-key": API_KEY } });
    if (!r.ok) {
      const text = await r.text();
      console.error("ElevenLabs error", r.status, text);
      return res.status(502).json({ error: "Could not get token from ElevenLabs" });
    }
    const data = await r.json();
    res.json({ token: data.token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

// ---- look_up tool: Claude + web search, called by the ElevenLabs webhook tool ----
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const LOOKUP_MODEL = process.env.LOOKUP_MODEL || "claude-haiku-5-5"; // fast model = low voice latency
const SEARCH_TOOL_TYPE = process.env.SEARCH_TOOL_TYPE || "web_search_20250305";
const LOOKUP_SECRET = process.env.LOOKUP_SECRET;

const LOOKUP_SYSTEM =
  "You answer questions for a voice assistant talking to a hiker on the trail. " +
  "Search the web when needed. Reply in 1 to 3 short spoken sentences: plain words, no lists, " +
  "no markdown, no URLs, no citations. Write numbers and units out in words. " +
  "If you are unsure or sources conflict, say so briefly. For trail conditions or closures, " +
  "mention that the hiker should confirm with the local park authority.";

app.use(express.json());

app.all("/api/lookup", async (req, res) => {
  if (LOOKUP_SECRET && req.get("x-lookup-secret") !== LOOKUP_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const src = req.method === "GET" ? req.query : req.body || {};
  const question = String(src.question || "").trim().slice(0, 500);
  const location = String(src.location || "").trim().slice(0, 100);
  if (!question) return res.status(400).json({ error: "Missing question" });
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY" });

  const messages = [
    { role: "user", content: location ? `${question}\n(Hiker location: ${location})` : question },
  ];

  try {
    let answer = "";
    // Search may pause the turn; continue up to 3 times.
    for (let i = 0; i < 3; i++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: LOOKUP_MODEL,
          max_tokens: 400,
          system: LOOKUP_SYSTEM,
          tools: [{ type: SEARCH_TOOL_TYPE, name: "web_search", max_uses: 3 }],
          messages,
        }),
      });
      if (!r.ok) {
        console.error("Anthropic error", r.status, await r.text());
        return res.status(502).json({ error: "Lookup failed" });
      }
      const data = await r.json();
      answer = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join(" ")
        .trim();
      if (data.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: data.content });
    }
    res.json({ answer: answer || "I couldn't find a clear answer to that." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Server error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Hiking Buddy backend on :${port}`));
