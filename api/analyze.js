// /api/analyze.js
// Accepts requests in Anthropic format from App.js
// Translates to Gemini 1.5 format and returns Anthropic-shaped response
// So App.js requires zero changes

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const { model, max_tokens, system, messages } = req.body;

    // ── Model mapping ──────────────────────────────────────────────────────
    // claude-opus-4-6   → gemini-1.5-pro   (essay analysis — highest quality)
    // claude-sonnet-4-6 → gemini-1.5-flash (conversation, Linda, practice — fast + free)
    const geminiModel =
      model === "claude-opus-4-6" ? "gemini-1.5-pro" : "gemini-1.5-flash";

    // ── Translate messages from Anthropic → Gemini format ─────────────────
    // Anthropic: [{role:"user"|"assistant", content:"..."}]
    // Gemini:    [{role:"user"|"model",     parts:[{text:"..."}]}]
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [
        {
          text:
            typeof m.content === "string"
              ? m.content
              : // Handle content arrays (e.g. image blocks — text only for now)
                m.content
                  .filter((b) => b.type === "text")
                  .map((b) => b.text)
                  .join("\n"),
        },
      ],
    }));

    // ── Build Gemini request body ──────────────────────────────────────────
    const geminiBody = {
      contents,
      generationConfig: {
        maxOutputTokens: max_tokens || 1000,
        temperature: 0.7,
      },
    };

    // Attach system instruction if provided
    if (system) {
      geminiBody.systemInstruction = {
        parts: [{ text: system }],
      };
    }

    // ── Call Gemini API ────────────────────────────────────────────────────
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API error:", geminiRes.status, errText);

      // Handle quota exceeded specifically so App.js can show a friendly message
      if (geminiRes.status === 429) {
        return res.status(429).json({
          error: "quota_exceeded",
          message: "Daily AI limit reached. Please try again tomorrow.",
        });
      }
      return res.status(geminiRes.status).json({ error: errText });
    }

    const geminiData = await geminiRes.json();

    // ── Extract text from Gemini response ─────────────────────────────────
    const text =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map((p) => p.text || "")
        .join("") || "";

    // ── Return in Anthropic-compatible shape so App.js needs no changes ───
    // App.js reads: data.content.map(b => b.text || "").join("")
    return res.status(200).json({
      content: [{ type: "text", text }],
      model: geminiModel,
      usage: {
        input_tokens: geminiData?.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiData?.usageMetadata?.candidatesTokenCount || 0,
      },
    });
  } catch (err) {
    console.error("analyze handler error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
