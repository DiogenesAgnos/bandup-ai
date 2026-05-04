// /api/analyze.js
// Accepts requests in Anthropic format from App.js
// Translates to Gemini format and returns Anthropic-shaped response
// App.js requires zero changes

// Model priority list — tried in order until one succeeds.
// gemini-2.0-flash: stable GA, no thinking tokens, fast.
// gemini-1.5-flash: ultra-stable fallback, always available.
const MODEL_PRIORITY = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

async function callGemini(apiKey, model, geminiBody) {
  return await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    }
  );
}

function extractText(geminiData) {
  const parts = geminiData?.candidates?.[0]?.content?.parts || [];
  const finishReason = geminiData?.candidates?.[0]?.finishReason;

  if (!parts.length) {
    console.warn("[analyze] Gemini returned no parts. finishReason:", finishReason);
    console.warn("[analyze] Full response:", JSON.stringify(geminiData).slice(0, 600));
  }

  // Filter thought tokens (only in 2.5 models with thinking enabled)
  const filtered = parts.filter((p) => !p.thought).map((p) => p.text || "").join("");

  // Fallback: if filter removed everything, take all text
  const text = filtered || parts.map((p) => p.text || "").join("");

  if (!text) {
    console.warn("[analyze] Empty text after extraction. finishReason:", finishReason);
  }

  return text;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
  }

  try {
    const { max_tokens, system, messages } = req.body;

    // Translate messages Anthropic -> Gemini format
    const rawContents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{
        text: typeof m.content === "string"
          ? m.content
          : m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
      }],
    }));

    // Gemini requires strictly alternating user/model roles
    // Merge consecutive same-role messages to avoid 400 errors
    const contents = [];
    for (const msg of rawContents) {
      const last = contents[contents.length - 1];
      if (last && last.role === msg.role) {
        last.parts[0].text += "\n" + msg.parts[0].text;
      } else {
        contents.push({ role: msg.role, parts: [{ text: msg.parts[0].text }] });
      }
    }

    // Must start with user role
    if (contents.length > 0 && contents[0].role === "model") {
      contents.unshift({ role: "user", parts: [{ text: "(start)" }] });
    }

    const geminiBody = {
      contents,
      generationConfig: {
        maxOutputTokens: max_tokens || 1000,
        temperature: 0.7,
      },
    };

    if (system) {
      geminiBody.systemInstruction = { parts: [{ text: system }] };
    }

    // Try models in priority order
    let geminiData = null;
    let usedModel = null;
    let lastStatus = 500;
    let lastErrText = "Unknown error";

    for (const model of MODEL_PRIORITY) {
      const geminiRes = await callGemini(GEMINI_API_KEY, model, geminiBody);

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error(`[analyze] ${model} failed ${geminiRes.status}:`, errText.slice(0, 300));
        lastStatus = geminiRes.status;
        lastErrText = errText;

        if (geminiRes.status === 429) {
          return res.status(429).json({
            error: "quota_exceeded",
            message: "Our AI is resting — please try again in a few minutes!",
          });
        }
        if (geminiRes.status === 400) {
          return res.status(400).json({ error: errText });
        }
        continue; // 404/500/503 -> try next model
      }

      geminiData = await geminiRes.json();
      usedModel = model;
      break;
    }

    if (!geminiData) {
      return res.status(lastStatus).json({ error: lastErrText });
    }

    const text = extractText(geminiData);

    return res.status(200).json({
      content: [{ type: "text", text }],
      model: usedModel,
      usage: {
        input_tokens: geminiData?.usageMetadata?.promptTokenCount || 0,
        output_tokens: geminiData?.usageMetadata?.candidatesTokenCount || 0,
      },
    });

  } catch (err) {
    console.error("[analyze] Handler error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
