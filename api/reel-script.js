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
      model: "claude-opus-4-5",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `Generate a social media reel script ${langInstruction} for the following topic: "${description}".

The reel has ${numScenes} image scenes. Create exactly ${numScenes - 1} middle scene texts (for scenes 2 to ${numScenes}).

Rules:
- Each text MUST be under 10 words
- Hook must grab attention instantly
- CTA must be action-oriented
- No hashtags, no emojis in text
- All text must be short enough to read in 4 seconds

Return ONLY valid JSON with no other text, no markdown, no backticks:
{
  "hook": "attention-grabbing opening line",
  "scenes": ["scene 2 text", "scene 3 text"],
  "cta": "call to action line"
}

The "scenes" array must have exactly ${numScenes - 2} items.`
      }]
    });

    const raw = message.content[0]?.text || "";
    const clean = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (e) {
    console.error("reel-script error:", e);
    res.status(500).json({ error: "Generation failed" });
  }
};
