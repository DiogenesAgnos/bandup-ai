// /api/analyze.js
// Uses Groq API — free tier, high limits, fast inference.
// Groq response format matches Anthropic's shape so App.js needs zero changes.

// Model routing:
// - Short turns (Sarah/Linda chat): llama-3.1-8b-instant — extremely fast
// - Long tasks (mock test scoring): llama-3.3-70b-versatile — better reasoning
const SHORT_MODEL  = "llama-3.1-8b-instant";
const LONG_MODEL   = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    const { max_tokens, system, messages } = req.body;

    const model = (max_tokens && max_tokens > 300) ? LONG_MODEL : SHORT_MODEL;

    // Build Groq messages — same format as OpenAI / Anthropic
    const groqMessages = [];
    if (system) {
      groqMessages.push({ role: "system", content: system });
    }

    for (const m of messages) {
      const content = typeof m.content === "string"
        ? m.content
        : m.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      groqMessages.push({ role: m.role === "assistant" ? "assistant" : "user", content });
    }

    // Groq requires strictly alternating user/assistant after system.
    // Merge consecutive same-role messages.
    const merged = [];
    for (const m of groqMessages) {
      if (m.role === "system") { merged.push(m); continue; }
      const last = merged[merged.length - 1];
      if (last && last.role === m.role && last.role !== "system") {
        last.content += "\n" + m.content;
      } else {
        merged.push({ ...m });
      }
    }

    // Must start with user after system
    const nonSystem = merged.filter(m => m.role !== "system");
    if (nonSystem.length > 0 && nonSystem[0].role !== "user") {
      const sysIdx = merged.findIndex(m => m.role === "system");
      merged.splice(sysIdx + 1, 0, { role: "user", content: "(start)" });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: max_tokens || 1024,
        temperature: 0.7,
        messages: merged,
      }),
    });

    if (!groqRes.ok) {
      const errText = await groqRes.text();
      console.error("[analyze] Groq error:", groqRes.status, errText.slice(0, 400));
      if (groqRes.status === 429) {
        return res.status(429).json({ error: "rate_limited", message: "Please wait a moment and try again." });
      }
      return res.status(groqRes.status).json({ error: errText });
    }

    const data = await groqRes.json();

    // Convert OpenAI-style response → Anthropic shape that App.js expects
    const text = data?.choices?.[0]?.message?.content || "";

    return res.status(200).json({
      content: [{ type: "text", text }],
      model,
      usage: {
        input_tokens:  data?.usage?.prompt_tokens     || 0,
        output_tokens: data?.usage?.completion_tokens || 0,
      },
    });

  } catch (err) {
    console.error("[analyze] Handler error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
