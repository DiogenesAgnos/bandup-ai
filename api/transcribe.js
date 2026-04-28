export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Deepgram API key not configured" });
  }

  try {
    // Read raw audio buffer from request
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    const contentType = req.headers["content-type"] || "audio/webm";

    // Call Deepgram Nova-3 — best model for accuracy
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-3&language=en&smart_format=true&punctuate=true",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${apiKey}`,
          "Content-Type": contentType,
        },
        body: audioBuffer,
      }
    );

    if (!dgRes.ok) {
      const err = await dgRes.text();
      console.error("Deepgram error:", err);
      return res.status(500).json({ error: "Deepgram transcription failed" });
    }

    const data = await dgRes.json();
    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

    return res.status(200).json({ transcript });
  } catch (err) {
    console.error("Transcribe error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
