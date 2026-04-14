const Anthropic = require("@anthropic-ai/sdk");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();

  const { description, language, numScenes } = req.body || {};
  if (!description || !numScenes) return res.status(400).json({ error: "Missing fields" });

  const langInstruction =
    language === "ar" ? "in Arabic (Modern Standard Arabic, MSA)" :
    language === "en" ? "in English" :
    "alternating Arabic and English — one line Arabic, next line English";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Generate a social media reel script ${langInstruction} for: "${description}".

The reel has ${numScenes} image scenes. Create exactly ${Math.max(numScenes - 2, 0)} middle scene texts.

Rules:
- Each text MUST be under 10 words
- Hook must grab attention instantly
- CTA must be action-oriented
- No hashtags, no emojis
- Short enough to read in 4 seconds

Return ONLY valid JSON, no markdown, no backticks, nothing else:
{"hook":"opening line","scenes":["scene 2","scene 3"],"cta":"call to action"}

The "scenes" array must have exactly ${Math.max(numScenes - 2, 0)} items.`
      }]
    });

    const raw = message.content[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    console.error("reel-script error:", e?.message || e);
    res.status(500).json({ error: "Generation failed" });
  }
};
