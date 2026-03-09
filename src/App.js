import { useState, useEffect } from "react";

// ─────────────────────────────────────────────────────────────
// 🔑 STRIPE SETUP INSTRUCTIONS (do this when ready to charge)
//
// 1. Create a free account at stripe.com
// 2. Go to: Developers → API Keys
// 3. Copy your "Publishable key" → paste below
// 4. Create a Product ($19/mo recurring) → copy the Price ID → paste below
// 5. Change STRIPE_CONFIGURED to true
// ─────────────────────────────────────────────────────────────
const STRIPE_PUBLISHABLE_KEY = "pk_live_YOUR_KEY_HERE";
const STRIPE_PRICE_ID = "price_YOUR_PRICE_ID_HERE";
const STRIPE_CONFIGURED = false; // ← set to true once you add real keys

const FREE_USES_LIMIT = 3;
const API_URL = "https://api.anthropic.com/v1/messages";

const SYSTEM_PROMPT = `You are an expert IELTS examiner with 20+ years of experience. You evaluate IELTS Academic and General Training Writing Task 2 essays with precision and fairness.

When given an essay and its question/topic, you must respond ONLY with a valid JSON object (no markdown, no backticks) in this exact structure:

{
  "overallBand": 6.5,
  "criteria": {
    "taskAchievement": { "band": 6.5, "feedback": "..." },
    "coherenceCohesion": { "band": 7.0, "feedback": "..." },
    "lexicalResource": { "band": 6.0, "feedback": "..." },
    "grammaticalRange": { "band": 6.5, "feedback": "..." }
  },
  "mistakes": [
    { "original": "exact phrase from essay", "correction": "corrected version", "explanation": "why this is wrong" }
  ],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "sampleEssay": "Full Band 8+ sample essay on the same topic...",
  "sampleEssayExplanation": {
    "introduction": "Explanation of why the intro is effective...",
    "bodyParagraphs": "Explanation of body paragraph structure...",
    "conclusion": "Explanation of conclusion technique...",
    "vocabularyHighlights": ["advanced word/phrase used", "another highlight"],
    "whyHighScore": "Overall explanation of why this essay would score Band 8+"
  }
}

Be thorough, constructive, and encouraging. Mistakes should quote EXACT text from the student's essay. Provide 3-6 mistakes maximum. The sample essay should be 250-300 words.`;

// ── Helpers ──────────────────────────────────────────────────
const bandColor = (b) => b >= 8 ? "#00c9a7" : b >= 7 ? "#4fc3f7" : b >= 6 ? "#ffb74d" : b >= 5 ? "#ff8a65" : "#ef5350";
const bandLabel = (b) => b >= 8.5 ? "Expert" : b >= 7.5 ? "Very Good" : b >= 6.5 ? "Competent" : b >= 5.5 ? "Modest" : "Limited";

// Usage stored in memory (resets on page refresh — replace with backend/DB for production)
let _uses = 0;
let _pro = false;
const getUses = () => _uses;
const addUse = () => { _uses += 1; };
const getIsPro = () => _pro;
const grantPro = () => { _pro = true; };

// ── Sub-components ───────────────────────────────────────────
const CriteriaCard = ({ label, data }) => (
  <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"16px 20px", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ color:"#b0b8c8", fontSize:13, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase", fontFamily:"system-ui" }}>{label}</span>
      <span style={{ background:bandColor(data.band), color:"#000", fontWeight:800, fontSize:14, borderRadius:8, padding:"3px 10px", fontFamily:"system-ui" }}>{data.band}</span>
    </div>
    <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.65, margin:0, fontFamily:"system-ui" }}>{data.feedback}</p>
  </div>
);

const MistakeCard = ({ mistake, i }) => (
  <div style={{ background:"rgba(239,83,80,0.07)", border:"1px solid rgba(239,83,80,0.2)", borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:6 }}>
    <div style={{ fontSize:12, color:"#ef9a9a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", fontFamily:"system-ui" }}>Mistake #{i+1}</div>
    <div style={{ display:"flex", gap:12, alignItems:"flex-start", flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:180 }}>
        <div style={{ fontSize:11, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>ORIGINAL</div>
        <div style={{ background:"rgba(239,83,80,0.15)", borderRadius:6, padding:"5px 10px", color:"#ffcdd2", fontSize:14, fontStyle:"italic" }}>"{mistake.original}"</div>
      </div>
      <div style={{ fontSize:18, color:"#555", alignSelf:"center" }}>→</div>
      <div style={{ flex:1, minWidth:180 }}>
        <div style={{ fontSize:11, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>CORRECTION</div>
        <div style={{ background:"rgba(0,201,167,0.12)", borderRadius:6, padding:"5px 10px", color:"#80cbc4", fontSize:14 }}>"{mistake.correction}"</div>
      </div>
    </div>
    <p style={{ color:"#aaa", fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {mistake.explanation}</p>
  </div>
);

const Tab = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{ background:active?"rgba(79,195,247,0.15)":"transparent", border:active?"1px solid rgba(79,195,247,0.4)":"1px solid transparent", color:active?"#4fc3f7":"#667", borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, fontWeight:600, transition:"all 0.2s", fontFamily:"system-ui" }}>
    {label}
  </button>
);

// ── Paywall Modal ─────────────────────────────────────────────
const PaywallModal = ({ onClose, onSuccess }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!STRIPE_CONFIGURED) {
      // Test mode — no real Stripe yet
      grantPro();
      onSuccess();
      return;
    }
    if (!email.trim()) { alert("Please enter your email to continue."); return; }
    setLoading(true);
    try {
      const { loadStripe } = await import("https://js.stripe.com/v3/");
      const stripe = await loadStripe(STRIPE_PUBLISHABLE_KEY);
      await stripe.redirectToCheckout({
        lineItems: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
        mode: "subscription",
        customerEmail: email,
        successUrl: window.location.href + "?pro=true",
        cancelUrl: window.location.href,
      });
    } catch (e) {
      alert("Payment error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(10px)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#13151a", border:"1px solid rgba(201,168,76,0.35)", borderRadius:20, padding:"40px 36px", maxWidth:460, width:"100%", position:"relative", boxShadow:"0 32px 80px rgba(0,0,0,0.7)" }}>

        <button onClick={onClose} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:"#555", fontSize:22, cursor:"pointer" }}>✕</button>

        {/* Badge */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ display:"inline-block", background:"rgba(201,168,76,0.1)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:100, padding:"6px 16px", fontSize:12, color:"#c9a84c", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:16, fontFamily:"system-ui" }}>
            🎓 {FREE_USES_LIMIT} Free Analyses Used
          </div>
          <h2 style={{ fontFamily:"Georgia,serif", color:"#f5f0e8", fontSize:26, lineHeight:1.2, marginBottom:10 }}>Unlock Unlimited Access</h2>
          <p style={{ color:"#6b6760", fontSize:14, lineHeight:1.7, fontFamily:"system-ui" }}>Keep practising with unlimited essays, mistake analysis, and Band 8+ model essays.</p>
        </div>

        {/* Price box */}
        <div style={{ background:"rgba(201,168,76,0.07)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:14, padding:"18px 24px", marginBottom:20, textAlign:"center" }}>
          <div style={{ fontFamily:"Georgia,serif", fontSize:52, fontWeight:900, color:"#f5f0e8", lineHeight:1 }}>
            <sup style={{ fontSize:22, verticalAlign:"super" }}>$</sup>19
            <sub style={{ fontSize:16, color:"#6b6760", verticalAlign:"baseline" }}>/month</sub>
          </div>
          <div style={{ color:"#6b6760", fontSize:12, marginTop:6, fontFamily:"system-ui" }}>Cancel anytime · No hidden fees</div>
        </div>

        {/* Feature list */}
        <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:9, marginBottom:24 }}>
          {["Unlimited essay analyses", "Full mistake breakdown with explanations", "Unlimited Band 8+ model essays", "Essay explanation & vocabulary notes", "Task 1 & Task 2 support"].map((f,i) => (
            <li key={i} style={{ display:"flex", gap:10, fontSize:14, color:"#d4cfc6", fontFamily:"system-ui" }}>
              <span style={{ color:"#00c9a7", fontWeight:700, flexShrink:0 }}>✓</span>{f}
            </li>
          ))}
        </ul>

        {/* Email — only show when Stripe is configured */}
        {STRIPE_CONFIGURED && (
          <input type="email" placeholder="Your email address" value={email} onChange={e => setEmail(e.target.value)}
            style={{ width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, color:"#f5f0e8", fontSize:15, padding:"12px 16px", marginBottom:12, outline:"none", fontFamily:"system-ui", boxSizing:"border-box" }}
          />
        )}

        {/* CTA */}
        <button onClick={handleUpgrade} disabled={loading}
          style={{ width:"100%", background:"linear-gradient(135deg,#c9a84c,#a87c30)", color:"#000", fontWeight:800, fontSize:16, padding:"16px", borderRadius:10, border:"none", cursor:loading?"not-allowed":"pointer", boxShadow:"0 8px 28px rgba(201,168,76,0.3)", fontFamily:"system-ui" }}>
          {loading ? "Redirecting..." : STRIPE_CONFIGURED ? "🔓 Start Pro — $19/month" : "🔓 Unlock Pro (Test Mode)"}
        </button>

        {!STRIPE_CONFIGURED && (
          <p style={{ textAlign:"center", color:"#555", fontSize:11, marginTop:12, fontFamily:"system-ui", fontStyle:"italic" }}>
            Stripe not configured yet — clicking above grants access for testing purposes.
          </p>
        )}
        {STRIPE_CONFIGURED && (
          <p style={{ textAlign:"center", color:"#555", fontSize:12, marginTop:12, fontFamily:"system-ui" }}>Secured by Stripe · Cancel anytime</p>
        )}
      </div>
    </div>
  );
};

// ── Main App ─────────────────────────────────────────────────
export default function IELTSBot() {
  const [topic, setTopic] = useState("");
  const [essay, setEssay] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("scores");
  const [showPaywall, setShowPaywall] = useState(false);
  const [usesLeft, setUsesLeft] = useState(FREE_USES_LIMIT);
  const [proUser, setProUser] = useState(false);

  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;

  const handleProSuccess = () => {
    grantPro();
    setProUser(true);
    setUsesLeft(999);
    setShowPaywall(false);
  };

  const analyze = async () => {
    if (!topic.trim() || !essay.trim()) { setError("Please provide both the essay topic and the essay."); return; }
    if (wordCount < 50) { setError("Essay seems too short. Please write at least 150 words."); return; }

    // Freemium gate
    if (!getIsPro() && getUses() >= FREE_USES_LIMIT) {
      setShowPaywall(true);
      return;
    }

    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `IELTS Writing Task 2 Question:\n"${topic}"\n\nStudent Essay:\n${essay}\n\nEvaluate and respond as JSON.` }]
        })
      });
      const data = await res.json();
      const text = data.content.map(b => b.text || "").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      if (!getIsPro()) {
        addUse();
        const remaining = FREE_USES_LIMIT - getUses();
        setUsesLeft(remaining);
      }

      setResult(parsed);
      setActiveTab("scores");
    } catch (e) {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const usagePillColor = proUser ? "rgba(0,201,167,0.1)" : usesLeft <= 1 ? "rgba(239,83,80,0.1)" : "rgba(201,168,76,0.08)";
  const usagePillBorder = proUser ? "rgba(0,201,167,0.3)" : usesLeft <= 1 ? "rgba(239,83,80,0.3)" : "rgba(201,168,76,0.2)";
  const usagePillText = proUser ? "#00c9a7" : usesLeft <= 1 ? "#ef9a9a" : "#c9a84c";

  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", fontFamily:"Georgia,'Times New Roman',serif", color:"#e0e6f0", paddingBottom:60 }}>

      {showPaywall && <PaywallModal onClose={() => setShowPaywall(false)} onSuccess={handleProSuccess} />}

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0d1117,#161b27)", borderBottom:"1px solid rgba(201,168,76,0.15)", padding:"32px 24px 28px", textAlign:"center" }}>
        <div style={{ fontSize:12, letterSpacing:"0.3em", color:"#c9a84c", fontFamily:"monospace", marginBottom:12, textTransform:"uppercase" }}>AI-Powered</div>
        <h1 style={{ margin:0, fontSize:"clamp(28px,5vw,48px)", fontWeight:900, background:"linear-gradient(90deg,#c9a84c,#00c9a7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          IELTS Writing Examiner
        </h1>
        <p style={{ color:"#667", marginTop:10, fontSize:15, fontFamily:"system-ui", maxWidth:480, margin:"10px auto 0" }}>
          Instant Band scores · Mistake analysis · Model Band 8+ essays
        </p>

        {/* Usage pill */}
        <div style={{ marginTop:16, display:"inline-flex", alignItems:"center", gap:8, background:usagePillColor, border:`1px solid ${usagePillBorder}`, borderRadius:100, padding:"6px 18px", fontSize:13, fontFamily:"system-ui", color:usagePillText, fontWeight:600 }}>
          {proUser
            ? "✓ Pro — Unlimited Access"
            : usesLeft > 0
              ? `${usesLeft} free ${usesLeft === 1 ? "analysis" : "analyses"} remaining`
              : "Free limit reached — upgrade to continue"
          }
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"32px 20px 0" }}>

        {/* Inputs */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <label style={{ display:"block", fontSize:12, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8, fontFamily:"monospace" }}>Essay Question / Topic</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Some people think universities should focus on job skills. Others believe the purpose of a university is to provide knowledge for its own sake. Discuss both views and give your opinion."
              rows={3}
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, color:"#e0e6f0", fontSize:14, padding:"14px 16px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box" }}
            />
          </div>

          <div>
            <label style={{ display:"block", fontSize:12, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8, fontFamily:"monospace" }}>
              Student's Essay
              <span style={{ color: wordCount >= 250 ? "#00c9a7" : wordCount >= 150 ? "#ffb74d" : "#ef5350", marginLeft:12, fontWeight:400, fontFamily:"system-ui" }}>
                {wordCount} words {wordCount >= 250 ? "✓" : "(min. 250 recommended)"}
              </span>
            </label>
            <textarea value={essay} onChange={e => setEssay(e.target.value)}
              placeholder="Paste the student's essay here..."
              rows={10}
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, color:"#e0e6f0", fontSize:14, padding:"14px 16px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.8, outline:"none", boxSizing:"border-box" }}
            />
          </div>

          {error && (
            <div style={{ background:"rgba(239,83,80,0.1)", border:"1px solid rgba(239,83,80,0.3)", borderRadius:10, padding:"12px 16px", color:"#ef9a9a", fontSize:14, fontFamily:"system-ui" }}>
              {error}
            </div>
          )}

          {/* Warning nudge on last free use */}
          {!proUser && usesLeft === 1 && (
            <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:10, padding:"12px 16px", fontSize:13, color:"#c9a84c", fontFamily:"system-ui", textAlign:"center" }}>
              ⚠️ This is your last free analysis.{" "}
              <button onClick={() => setShowPaywall(true)} style={{ background:"none", border:"none", color:"#e8c97a", fontWeight:700, cursor:"pointer", textDecoration:"underline", fontSize:13, fontFamily:"system-ui" }}>
                Upgrade to Pro
              </button>{" "}
              for unlimited access.
            </div>
          )}

          <button onClick={analyze} disabled={loading}
            style={{ background: loading ? "rgba(201,168,76,0.1)" : "linear-gradient(135deg,#c9a84c,#a87c30)", border:"none", borderRadius:12, color: loading ? "#c9a84c" : "#000", fontSize:16, fontWeight:800, padding:"16px 32px", cursor:loading?"not-allowed":"pointer", letterSpacing:"0.02em", transition:"all 0.3s", fontFamily:"system-ui", boxShadow: loading ? "none" : "0 8px 28px rgba(201,168,76,0.25)" }}>
            {loading ? "⏳ Examining essay..."
              : !proUser && usesLeft === 0 ? "🔓 Upgrade to Continue"
              : "🎓 Analyze Essay"}
          </button>
        </div>

        {/* Results */}
        {result && (
          <div style={{ marginTop:40 }}>

            {/* Overall band */}
            <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,0.1),rgba(0,201,167,0.1))", border:"1px solid rgba(201,168,76,0.25)", borderRadius:16, padding:"28px 32px", display:"flex", alignItems:"center", gap:28, marginBottom:24, flexWrap:"wrap" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:64, fontWeight:900, color:bandColor(result.overallBand), lineHeight:1, fontFamily:"Georgia,serif" }}>{result.overallBand}</div>
                <div style={{ fontSize:12, color:"#667", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:4 }}>Overall Band</div>
              </div>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:22, fontWeight:700, color:bandColor(result.overallBand), marginBottom:6, fontFamily:"Georgia,serif" }}>{bandLabel(result.overallBand)} User</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {result.strengths?.map((s,i) => (
                    <span key={i} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.25)", borderRadius:20, padding:"3px 12px", fontSize:12, color:"#80cbc4", fontFamily:"system-ui" }}>✓ {s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
              {[["scores","📊 Band Scores"],["mistakes","🔍 Mistakes"],["sample","✨ Sample Essay"]].map(([key,label]) => (
                <Tab key={key} label={label} active={activeTab===key} onClick={() => setActiveTab(key)} />
              ))}
            </div>

            {activeTab === "scores" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <CriteriaCard label="Task Achievement" data={result.criteria.taskAchievement} />
                <CriteriaCard label="Coherence & Cohesion" data={result.criteria.coherenceCohesion} />
                <CriteriaCard label="Lexical Resource" data={result.criteria.lexicalResource} />
                <CriteriaCard label="Grammatical Range & Accuracy" data={result.criteria.grammaticalRange} />
                {result.improvements?.length > 0 && (
                  <div style={{ background:"rgba(255,183,77,0.07)", border:"1px solid rgba(255,183,77,0.2)", borderRadius:12, padding:"16px 20px", marginTop:4 }}>
                    <div style={{ fontSize:12, color:"#ffb74d", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10, fontFamily:"system-ui" }}>Key Improvements Needed</div>
                    {result.improvements.map((imp,i) => (
                      <div key={i} style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.6, marginBottom:6, fontFamily:"system-ui" }}>→ {imp}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === "mistakes" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                {result.mistakes?.length === 0
                  ? <div style={{ color:"#00c9a7", textAlign:"center", padding:40, fontFamily:"system-ui" }}>No significant mistakes found — great work!</div>
                  : result.mistakes.map((m,i) => <MistakeCard key={i} mistake={m} i={i} />)
                }
              </div>
            )}

            {activeTab === "sample" && result.sampleEssay && (
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ background:"rgba(0,201,167,0.06)", border:"1px solid rgba(0,201,167,0.2)", borderRadius:14, padding:"20px 24px" }}>
                  <div style={{ fontSize:12, color:"#00c9a7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Band 8+ Model Essay</div>
                  <p style={{ color:"#dde5f0", fontSize:15, lineHeight:1.9, whiteSpace:"pre-wrap", margin:0 }}>{result.sampleEssay}</p>
                </div>
                {result.sampleEssayExplanation && (
                  <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:14, padding:"20px 24px" }}>
                    <div style={{ fontSize:12, color:"#4fc3f7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:16, fontFamily:"system-ui" }}>Why This Essay Scores High</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                      {[["Introduction", result.sampleEssayExplanation.introduction], ["Body Paragraphs", result.sampleEssayExplanation.bodyParagraphs], ["Conclusion", result.sampleEssayExplanation.conclusion]].map(([label,text]) => (
                        <div key={label}>
                          <div style={{ fontSize:12, color:"#ffb74d", fontWeight:700, marginBottom:5, fontFamily:"system-ui" }}>{label}</div>
                          <p style={{ color:"#b0b8c8", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{text}</p>
                        </div>
                      ))}
                      {result.sampleEssayExplanation.vocabularyHighlights?.length > 0 && (
                        <div>
                          <div style={{ fontSize:12, color:"#ffb74d", fontWeight:700, marginBottom:8, fontFamily:"system-ui" }}>Advanced Vocabulary Used</div>
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                            {result.sampleEssayExplanation.vocabularyHighlights.map((v,i) => (
                              <span key={i} style={{ background:"rgba(79,195,247,0.1)", border:"1px solid rgba(79,195,247,0.25)", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#4fc3f7", fontFamily:"system-ui" }}>{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ background:"rgba(0,201,167,0.08)", borderRadius:10, padding:"12px 16px" }}>
                        <p style={{ color:"#80cbc4", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>🏆 {result.sampleEssayExplanation.whyHighScore}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

