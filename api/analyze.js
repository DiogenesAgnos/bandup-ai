// /api/analyze.js
// Accepts requests in Anthropic format from App.js
// Translates to Gemini 2.5 Flash format and returns Anthropic-shaped response
// App.js requires zero changes

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

    // ── Model ──────────────────────────────────────────────────────────────
    const geminiModel = "gemini-2.5-flash";

    // ── Translate messages Anthropic → Gemini format ───────────────────────
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{
        text: typeof m.content === "string"
          ? m.content
          : m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
      }],
    }));

    // ── Build request body ─────────────────────────────────────────────────
    const geminiBody = {
      contents,
      generationConfig: {
        maxOutputTokens: max_tokens || 1000,
        temperature: 0.7,
        // thinkingConfig MUST be inside generationConfig for 2.5 Flash
        // Setting budget to 0 disables thinking — critical for Linda/Sarah
        // (thought tokens pollute the response text and break conversation parsing)
        thinkingConfig: { thinkingBudget: 0 },
      },
    };

    if (system) {
      geminiBody.systemInstruction = { parts: [{ text: system }] };
    }

    // ── Call Gemini ────────────────────────────────────────────────────────
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
      if (geminiRes.status === 429) {
        return res.status(429).json({
          error: "quota_exceeded",
          message: "Our AI is resting for a moment — please try again in a few hours!",
        });
      }
      return res.status(geminiRes.status).json({ error: errText });
    }

    const geminiData = await geminiRes.json();

    // ── Extract text — filter out thought parts (p.thought === true) ───────
    // Gemini 2.5 Flash includes thought tokens alongside the actual response.
    // If not filtered, thought content garbles Linda/Sarah conversation responses.
    const text =
      geminiData?.candidates?.[0]?.content?.parts
        ?.filter((p) => !p.thought)
        ?.map((p) => p.text || "")
        .join("") || "";

    // ── Return in Anthropic-compatible shape ───────────────────────────────
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
