// /api/analyze.js
// Anthropic Claude API proxy.
//
// Frontend already sends payloads in Anthropic shape:
//   { model, max_tokens, system, messages: [{role, content}] }
// and expects Anthropic-shape responses:
//   { content: [{type:"text", text:"..."}], usage: {...} }
//
// This file is a thin proxy with safety guards:
//   - Model whitelist (rejects anything else — protects cost)
//   - max_tokens hard cap (2000 — full IELTS analysis in ~22s vs ~50s at 4000)
//   - Message normalisation (merge consecutive same-role, drop leading non-user)
//   - 70s timeout (safely under 90s maxDuration)
//   - Proper 429 (rate limit) and 529 (overloaded) signalling so the frontend's
//     existing retry logic in Sarah/Linda/Mock kicks in correctly.

// Vercel function config — Hobby plan default is 10s which kills writing analysis.
// 60s is the Hobby max; covers Sonnet comfortably, tight but usable for Opus.
export const config = { maxDuration: 90 };

// Models the frontend uses today + the latest Opus for future writing-analysis upgrade.
const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
]);
const FALLBACK_MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 2000; // 2000 tokens keeps Sonnet response ~22s vs ~50s at 4000
const REQUEST_TIMEOUT_MS = 70000; // 70s abort, safely under 90s maxDuration

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("[analyze] ANTHROPIC_API_KEY not configured");
    return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured" });
  }

  try {
    const { model, max_tokens, system, messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    // Whitelist model — any unknown string falls back to Sonnet (cost guard).
    const useModel = ALLOWED_MODELS.has(model) ? model : FALLBACK_MODEL;

    // Cap max_tokens. Frontend asks for up to 4000 (writing analysis).
    const requested = parseInt(max_tokens, 10);
    const useMax = Math.min(
      Math.max(Number.isFinite(requested) ? requested : 1024, 1),
      MAX_OUTPUT_TOKENS
    );

    // Normalise messages so Claude API accepts them.
    // Rules: messages must alternate user/assistant. First message must be "user".
    // Frontend already tries to enforce this, but defend in depth.
    const cleanMsgs = [];
    for (const m of messages) {
      if (!m || !m.role) continue;
      const role = m.role === "assistant" ? "assistant" : "user";
      // content may be a string OR an array of blocks (image+text for OCR / Task 1).
      // Pass arrays through as-is so multimodal still works.
      const content = m.content;
      if (content == null) continue;

      const last = cleanMsgs[cleanMsgs.length - 1];
      if (last && last.role === role) {
        // Merge consecutive same-role messages.
        // For string-on-string just concatenate. If either side is an array
        // (multimodal), normalise to an array of blocks.
        if (typeof last.content === "string" && typeof content === "string") {
          last.content = last.content + "\n" + content;
        } else {
          const lastBlocks = Array.isArray(last.content)
            ? last.content
            : [{ type: "text", text: String(last.content) }];
          const newBlocks = Array.isArray(content)
            ? content
            : [{ type: "text", text: String(content) }];
          last.content = lastBlocks.concat(newBlocks);
        }
      } else {
        cleanMsgs.push({ role, content });
      }
    }

    // Drop leading non-user messages (Claude requires first to be user)
    while (cleanMsgs.length && cleanMsgs[0].role !== "user") cleanMsgs.shift();
    if (cleanMsgs.length === 0) {
      return res.status(400).json({ error: "no valid user message in conversation" });
    }

    const body = {
      model: useModel,
      max_tokens: useMax,
      messages: cleanMsgs,
    };
    if (typeof system === "string" && system.trim()) {
      body.system = system;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let claudeRes;
    try {
      claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      console.error("[analyze] Claude error", claudeRes.status, errText.slice(0, 400));

      // Pass through 429 so frontend retry logic kicks in (Sarah/Linda/Mock all handle 429).
      if (claudeRes.status === 429) {
        return res.status(429).json({
          error: "rate_limited",
          message: "Please wait a moment and try again.",
        });
      }
      // 529 = Anthropic overloaded. Translate to 503 so it's clearly transient.
      if (claudeRes.status === 529) {
        return res.status(503).json({
          error: "overloaded",
          message: "Claude is busy — try again in a moment.",
        });
      }
      // 401/403 = our key is bad. Don't leak the message body to client.
      if (claudeRes.status === 401 || claudeRes.status === 403) {
        return res.status(500).json({ error: "auth_error" });
      }

      return res.status(claudeRes.status).json({
        error: errText.slice(0, 400) || `claude_error_${claudeRes.status}`,
      });
    }

    const data = await claudeRes.json();
    // Pass-through. Anthropic shape is what App.js expects.
    return res.status(200).json(data);

  } catch (err) {
    if (err && err.name === "AbortError") {
      console.error("[analyze] Timeout after", REQUEST_TIMEOUT_MS, "ms");
      return res.status(504).json({ error: "timeout" });
    }
    console.error("[analyze] Handler error:", err);
    return res.status(500).json({ error: err?.message || "Internal server error" });
  }
}
