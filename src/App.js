import { useState } from "react";

const STRIPE_PUBLISHABLE_KEY = "pk_live_YOUR_KEY_HERE";
const STRIPE_PRICE_ID = "price_YOUR_PRICE_ID_HERE";
const STRIPE_CONFIGURED = false;
const FREE_USES_LIMIT = 3;
const API_URL = "/api/analyze";

const SYSTEM_PROMPT = `You are an expert IELTS examiner with 20+ years of experience. You evaluate IELTS Academic and General Training Writing Task 2 essays with extreme precision and thoroughness.

When given an essay and its question/topic, you must respond ONLY with a valid JSON object (no markdown, no backticks) in this exact structure:

{
  "wordCount": 183,
  "overallBand": 6.5,
  "criteria": {
    "taskAchievement": { "band": 6.5, "feedback": "..." },
    "coherenceCohesion": { "band": 7.0, "feedback": "..." },
    "lexicalResource": { "band": 6.0, "feedback": "..." },
    "grammaticalRange": { "band": 6.5, "feedback": "..." }
  },
  "mistakes": [
    {
      "original": "exact phrase from essay",
      "correction": "corrected version",
      "explanation": "why this is wrong",
      "category": "Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Run-on Sentence|Fragment",
      "severity": "minor|moderate|major"
    }
  ],
  "vocabularyUpgrades": [
    {
      "weak": "exact weak word/phrase from essay",
      "advanced": "better IELTS-appropriate alternative",
      "reason": "why this upgrade helps"
    }
  ],
  "bandBooster": {
    "currentBand": 6.0,
    "targetBand": 6.5,
    "specificActions": ["Specific action 1 to gain 0.5 bands", "Specific action 2", "Specific action 3"]
  },
  "examinerTips": [
    "Secret examiner tip 1 specific to this essay",
    "Secret examiner tip 2",
    "Secret examiner tip 3"
  ],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "sampleEssay": "Full Band 8+ sample essay on the same topic (minimum 270 words)...",
  "sampleEssayExplanation": {
    "introduction": "Explanation of why the intro is effective...",
    "bodyParagraphs": "Explanation of body paragraph structure...",
    "conclusion": "Explanation of conclusion technique...",
    "vocabularyHighlights": ["advanced word/phrase used", "another highlight"],
    "whyHighScore": "Overall explanation of why this essay would score Band 8+"
  }
}

MISTAKE DETECTION RULES — be exhaustive:
- Find EVERY spelling mistake
- Find EVERY grammatical error (subject-verb agreement, tense, articles, prepositions)
- Find EVERY punctuation error
- Find EVERY sentence structure problem (run-ons, fragments, awkward phrasing)
- Find EVERY informal or inappropriate word choice for academic writing
- Find EVERY word choice error (wrong word used)
- There is NO limit on the number of mistakes — report all of them
- Mistakes must quote EXACT text from the essay

VOCABULARY UPGRADES: Find 5-8 weak or basic words/phrases in the essay and suggest advanced IELTS-appropriate alternatives.

WORD COUNT RULE — CRITICAL:
- Always count words accurately and include in wordCount field
- Under 250 words: Task Achievement MAX Band 5.0 — explicitly state word count penalty in feedback
- Under 150 words: Task Achievement MAX Band 4.0
- Always mention exact word count in Task Achievement feedback

BAND BOOSTER: Give the single most impactful set of actions to jump exactly 0.5 bands from current score.

EXAMINER TIPS: Share 3 insider tips specific to THIS essay that most students never hear from teachers.

The sample essay must be 260-280 words minimum and demonstrate Band 8+ writing.`;

const bandColor = (b) => b >= 8 ? "#00c9a7" : b >= 7 ? "#4fc3f7" : b >= 6 ? "#ffb74d" : b >= 5 ? "#ff8a65" : "#ef5350";
const bandLabel = (b) => b >= 8.5 ? "Expert" : b >= 7.5 ? "Very Good" : b >= 6.5 ? "Competent" : b >= 5.5 ? "Modest" : "Limited";
const severityColor = (s) => s === "major" ? "#ef5350" : s === "moderate" ? "#ffb74d" : "#4fc3f7";

let _uses = 0; let _pro = false;
const getUses = () => _uses;
const addUse = () => { _uses += 1; };
const getIsPro = () => _pro;
const grantPro = () => { _pro = true; };

const CriteriaCard = ({ label, data }) => (
  <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"16px 20px", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
      <span style={{ color:"#b0b8c8", fontSize:13, fontWeight:600, letterSpacing:"0.04em", textTransform:"uppercase", fontFamily:"system-ui" }}>{label}</span>
      <span style={{ background:bandColor(data.band), color:"#000", fontWeight:800, fontSize:14, borderRadius:8, padding:"3px 10px" }}>{data.band}</span>
    </div>
    <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.65, margin:0, fontFamily:"system-ui" }}>{data.feedback}</p>
  </div>
);

const MistakeCard = ({ mistake, i }) => (
  <div style={{ background:"rgba(239,83,80,0.06)", border:`1px solid ${severityColor(mistake.severity)}40`, borderLeft:`3px solid ${severityColor(mistake.severity)}`, borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      <div style={{ fontSize:11, color:"#ef9a9a", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.05em", fontFamily:"system-ui" }}>#{i+1}</div>
      <span style={{ background:`${severityColor(mistake.severity)}20`, border:`1px solid ${severityColor(mistake.severity)}50`, borderRadius:20, padding:"2px 8px", fontSize:11, color:severityColor(mistake.severity), fontFamily:"system-ui", fontWeight:600 }}>{mistake.severity}</span>
      <span style={{ background:"rgba(79,195,247,0.1)", border:"1px solid rgba(79,195,247,0.2)", borderRadius:20, padding:"2px 8px", fontSize:11, color:"#4fc3f7", fontFamily:"system-ui" }}>{mistake.category}</span>
    </div>
    <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:160 }}>
        <div style={{ fontSize:10, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>ORIGINAL</div>
        <div style={{ background:"rgba(239,83,80,0.15)", borderRadius:6, padding:"5px 10px", color:"#ffcdd2", fontSize:13, fontStyle:"italic" }}>"{mistake.original}"</div>
      </div>
      <div style={{ fontSize:16, color:"#555", alignSelf:"center" }}>→</div>
      <div style={{ flex:1, minWidth:160 }}>
        <div style={{ fontSize:10, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>CORRECTION</div>
        <div style={{ background:"rgba(0,201,167,0.12)", borderRadius:6, padding:"5px 10px", color:"#80cbc4", fontSize:13 }}>"{mistake.correction}"</div>
      </div>
    </div>
    <p style={{ color:"#aaa", fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {mistake.explanation}</p>
  </div>
);

const Tab = ({ label, active, onClick, badge }) => (
  <button onClick={onClick} style={{ background:active?"rgba(79,195,247,0.15)":"transparent", border:active?"1px solid rgba(79,195,247,0.4)":"1px solid transparent", color:active?"#4fc3f7":"#667", borderRadius:8, padding:"8px 16px", cursor:"pointer", fontSize:13, fontWeight:600, fontFamily:"system-ui", display:"flex", alignItems:"center", gap:6 }}>
    {label}
    {badge && <span style={{ background:"#ef5350", color:"#fff", borderRadius:20, padding:"1px 7px", fontSize:11, fontWeight:700 }}>{badge}</span>}
  </button>
);

const PaywallModal = ({ onClose, onSuccess }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(10px)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
    <div style={{ background:"#13151a", border:"1px solid rgba(201,168,76,0.35)", borderRadius:20, padding:"40px 32px", maxWidth:440, width:"100%", position:"relative" }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:"#555", fontSize:22, cursor:"pointer" }}>✕</button>
      <div style={{ textAlign:"center", marginBottom:20 }}>
        <div style={{ display:"inline-block", background:"rgba(201,168,76,0.1)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:100, padding:"6px 16px", fontSize:11, color:"#c9a84c", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>🎓 3 Free Analyses Used</div>
        <h2 style={{ fontFamily:"Georgia,serif", color:"#f5f0e8", fontSize:24, marginBottom:8 }}>Unlock Unlimited Access</h2>
        <p style={{ color:"#6b6760", fontSize:14, lineHeight:1.6, fontFamily:"system-ui" }}>Keep practising with unlimited analyses, full mistake breakdowns, and Band 8+ model essays.</p>
      </div>
      <div style={{ background:"rgba(201,168,76,0.07)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"16px", marginBottom:18, textAlign:"center" }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:48, fontWeight:900, color:"#f5f0e8", lineHeight:1 }}>
          <sup style={{ fontSize:20, verticalAlign:"super" }}>$</sup>19<sub style={{ fontSize:14, color:"#6b6760" }}>/month</sub>
        </div>
        <div style={{ color:"#6b6760", fontSize:12, marginTop:4, fontFamily:"system-ui" }}>Cancel anytime · No hidden fees</div>
      </div>
      <ul style={{ listStyle:"none", padding:0, display:"flex", flexDirection:"column", gap:8, marginBottom:22 }}>
        {["Unlimited essay analyses","Complete mistake detection (all categories)","Vocabulary upgrade suggestions","Band Booster action plans","Examiner insider tips","Unlimited Band 8+ model essays","Task 1 & Task 2 support"].map((f,i) => (
          <li key={i} style={{ display:"flex", gap:10, fontSize:14, color:"#d4cfc6", fontFamily:"system-ui" }}>
            <span style={{ color:"#00c9a7", fontWeight:700 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <button onClick={() => { grantPro(); onSuccess(); }}
        style={{ width:"100%", background:"linear-gradient(135deg,#c9a84c,#a87c30)", color:"#000", fontWeight:800, fontSize:15, padding:"15px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"system-ui", boxShadow:"0 8px 24px rgba(201,168,76,0.3)" }}>
        🔓 {STRIPE_CONFIGURED ? "Start Pro — $19/month" : "Unlock Pro (Test Mode)"}
      </button>
      {!STRIPE_CONFIGURED && <p style={{ textAlign:"center", color:"#555", fontSize:11, marginTop:10, fontFamily:"system-ui", fontStyle:"italic" }}>Add Stripe keys to enable real payments.</p>}
    </div>
  </div>
);

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
  const sampleWordCount = result?.sampleEssay ? result.sampleEssay.trim().split(/\s+/).filter(Boolean).length : 0;

  const handleProSuccess = () => { grantPro(); setProUser(true); setUsesLeft(999); setShowPaywall(false); };

  const analyze = async () => {
    if (!topic.trim() || !essay.trim()) { setError("Please provide both the topic and the essay."); return; }
    if (wordCount < 50) { setError("Essay too short — please write at least 150 words."); return; }
    if (!getIsPro() && getUses() >= FREE_USES_LIMIT) { setShowPaywall(true); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await fetch(API_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:4000, system:SYSTEM_PROMPT,
          messages:[{ role:"user", content:`IELTS Task 2 Question:\n"${topic}"\n\nStudent Essay (count words carefully):\n${essay}\n\nEvaluate thoroughly and respond as JSON only.` }]
        })
      });
      const data = await res.json();
      const text = data.content.map(b => b.text||"").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if (!getIsPro()) { addUse(); setUsesLeft(FREE_USES_LIMIT - getUses()); }
      setResult(parsed); setActiveTab("scores");
    } catch(e) { setError("Something went wrong. Please try again."); }
    finally { setLoading(false); }
  };

  const pillBg = proUser?"rgba(0,201,167,0.1)":usesLeft<=1?"rgba(239,83,80,0.1)":"rgba(201,168,76,0.08)";
  const pillBorder = proUser?"rgba(0,201,167,0.3)":usesLeft<=1?"rgba(239,83,80,0.3)":"rgba(201,168,76,0.2)";
  const pillColor = proUser?"#00c9a7":usesLeft<=1?"#ef9a9a":"#c9a84c";

  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", color:"#e0e6f0", paddingBottom:60 }}>
      {showPaywall && <PaywallModal onClose={()=>setShowPaywall(false)} onSuccess={handleProSuccess} />}

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0d1117,#161b27)", borderBottom:"1px solid rgba(201,168,76,0.15)", padding:"28px 24px", textAlign:"center" }}>
        <div style={{ fontSize:11, letterSpacing:"0.3em", color:"#c9a84c", fontFamily:"monospace", marginBottom:10, textTransform:"uppercase" }}>AI-Powered</div>
        <h1 style={{ margin:0, fontSize:"clamp(24px,5vw,44px)", fontWeight:900, fontFamily:"Georgia,serif", background:"linear-gradient(90deg,#c9a84c,#00c9a7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          IELTS Writing Examiner
        </h1>
        <p style={{ color:"#667", fontSize:14, fontFamily:"system-ui", margin:"8px auto 0", maxWidth:520 }}>
          Instant Band scores · Complete mistake detection · Vocabulary upgrades · Band Booster · Model essays
        </p>
        <div style={{ marginTop:14, display:"inline-flex", background:pillBg, border:`1px solid ${pillBorder}`, borderRadius:100, padding:"5px 16px", fontSize:13, fontFamily:"system-ui", color:pillColor, fontWeight:600 }}>
          {proUser ? "✓ Pro — Unlimited Access" : usesLeft > 0 ? `${usesLeft} free ${usesLeft===1?"analysis":"analyses"} remaining` : "Free limit reached — upgrade to continue"}
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"28px 16px 0" }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>Essay Question / Topic</label>
            <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
              placeholder="e.g. Some people think universities should focus on job skills. Others believe the purpose of a university is to provide knowledge for its own sake. Discuss both views and give your opinion."
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box" }}
            />
          </div>
          <div>
            <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>
              Student's Essay
              <span style={{ color:wordCount>=250?"#00c9a7":wordCount>=150?"#ffb74d":"#ef5350", marginLeft:10, fontWeight:400, fontFamily:"system-ui" }}>
                {wordCount} words {wordCount>=250?"✓":wordCount>=150?"(below 250 — penalty applies)":"(too short)"}
              </span>
            </label>
            <textarea value={essay} onChange={e=>setEssay(e.target.value)} rows={10}
              placeholder="Paste the student's essay here..."
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.8, outline:"none", boxSizing:"border-box" }}
            />
          </div>

          {error && <div style={{ background:"rgba(239,83,80,0.1)", border:"1px solid rgba(239,83,80,0.3)", borderRadius:8, padding:"11px 14px", color:"#ef9a9a", fontSize:14, fontFamily:"system-ui" }}>{error}</div>}

          {!proUser && usesLeft===1 && (
            <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:8, padding:"11px 14px", fontSize:13, color:"#c9a84c", fontFamily:"system-ui", textAlign:"center" }}>
              ⚠️ Last free analysis.{" "}
              <button onClick={()=>setShowPaywall(true)} style={{ background:"none", border:"none", color:"#e8c97a", fontWeight:700, cursor:"pointer", textDecoration:"underline", fontSize:13, fontFamily:"system-ui" }}>Upgrade to Pro</button>
              {" "}for unlimited access.
            </div>
          )}

          <button onClick={analyze} disabled={loading}
            style={{ background:loading?"rgba(201,168,76,0.1)":"linear-gradient(135deg,#c9a84c,#a87c30)", border:"none", borderRadius:10, color:loading?"#c9a84c":"#000", fontSize:15, fontWeight:800, padding:"15px 28px", cursor:loading?"not-allowed":"pointer", fontFamily:"system-ui", boxShadow:loading?"none":"0 6px 24px rgba(201,168,76,0.25)", transition:"all 0.2s" }}>
            {loading?"⏳ Examining essay...":!proUser&&usesLeft===0?"🔓 Upgrade to Continue":"🎓 Analyze Essay"}
          </button>
        </div>

        {result && (
          <div style={{ marginTop:36 }}>
            {/* Score banner */}
            <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,0.1),rgba(0,201,167,0.1))", border:"1px solid rgba(201,168,76,0.25)", borderRadius:14, padding:"24px 28px", display:"flex", alignItems:"center", gap:24, marginBottom:20, flexWrap:"wrap" }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:60, fontWeight:900, color:bandColor(result.overallBand), lineHeight:1, fontFamily:"Georgia,serif" }}>{result.overallBand}</div>
                <div style={{ fontSize:11, color:"#667", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:3 }}>Overall Band</div>
              </div>
              <div style={{ flex:1, minWidth:180 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8, flexWrap:"wrap" }}>
                  <div style={{ fontSize:20, fontWeight:700, color:bandColor(result.overallBand), fontFamily:"Georgia,serif" }}>{bandLabel(result.overallBand)} User</div>
                  <span style={{ background: result.wordCount >= 250 ? "rgba(0,201,167,0.15)" : "rgba(239,83,80,0.15)", border:`1px solid ${result.wordCount >= 250 ? "rgba(0,201,167,0.3)" : "rgba(239,83,80,0.3)"}`, borderRadius:20, padding:"2px 10px", fontSize:12, color: result.wordCount >= 250 ? "#00c9a7" : "#ef9a9a", fontFamily:"system-ui" }}>
                    {result.wordCount} words {result.wordCount >= 250 ? "✓" : "⚠ below minimum"}
                  </span>
                </div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {result.strengths?.map((s,i) => (
                    <span key={i} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.25)", borderRadius:20, padding:"2px 10px", fontSize:12, color:"#80cbc4", fontFamily:"system-ui" }}>✓ {s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              <Tab label="📊 Scores" active={activeTab==="scores"} onClick={()=>setActiveTab("scores")} />
              <Tab label="🔍 Mistakes" active={activeTab==="mistakes"} onClick={()=>setActiveTab("mistakes")} badge={result.mistakes?.length} />
              <Tab label="📈 Band Booster" active={activeTab==="booster"} onClick={()=>setActiveTab("booster")} />
              <Tab label="💬 Vocabulary" active={activeTab==="vocab"} onClick={()=>setActiveTab("vocab")} />
              <Tab label="🎓 Tips" active={activeTab==="tips"} onClick={()=>setActiveTab("tips")} />
              <Tab label="✨ Sample Essay" active={activeTab==="sample"} onClick={()=>setActiveTab("sample")} />
            </div>

            {/* SCORES TAB */}
            {activeTab==="scores" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <CriteriaCard label="Task Achievement" data={result.criteria.taskAchievement} />
                <CriteriaCard label="Coherence & Cohesion" data={result.criteria.coherenceCohesion} />
                <CriteriaCard label="Lexical Resource" data={result.criteria.lexicalResource} />
                <CriteriaCard label="Grammatical Range & Accuracy" data={result.criteria.grammaticalRange} />
                {result.improvements?.length>0 && (
                  <div style={{ background:"rgba(255,183,77,0.07)", border:"1px solid rgba(255,183,77,0.2)", borderRadius:10, padding:"14px 18px", marginTop:2 }}>
                    <div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, fontFamily:"system-ui" }}>Key Improvements Needed</div>
                    {result.improvements.map((imp,i)=>(
                      <div key={i} style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.6, marginBottom:4, fontFamily:"system-ui" }}>→ {imp}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* MISTAKES TAB */}
            {activeTab==="mistakes" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {/* Legend */}
                <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                  {[["major","#ef5350"],["moderate","#ffb74d"],["minor","#4fc3f7"]].map(([s,c])=>(
                    <span key={s} style={{ background:`${c}15`, border:`1px solid ${c}40`, borderRadius:20, padding:"3px 10px", fontSize:11, color:c, fontFamily:"system-ui", fontWeight:600 }}>● {s}</span>
                  ))}
                  <span style={{ color:"#555", fontSize:12, fontFamily:"system-ui", alignSelf:"center" }}>— {result.mistakes?.length} mistakes found</span>
                </div>
                {result.mistakes?.length===0
                  ? <div style={{ color:"#00c9a7", textAlign:"center", padding:36, fontFamily:"system-ui" }}>No mistakes found — excellent work!</div>
                  : result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i} />)
                }
              </div>
            )}

            {/* BAND BOOSTER TAB */}
            {activeTab==="booster" && result.bandBooster && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,0.1),rgba(0,201,167,0.05))", border:"1px solid rgba(201,168,76,0.25)", borderRadius:14, padding:"20px 24px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:36, fontWeight:900, color:bandColor(result.bandBooster.currentBand), fontFamily:"Georgia,serif", lineHeight:1 }}>{result.bandBooster.currentBand}</div>
                      <div style={{ fontSize:10, color:"#667", fontFamily:"monospace", textTransform:"uppercase" }}>Current</div>
                    </div>
                    <div style={{ fontSize:24, color:"#c9a84c" }}>→</div>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:36, fontWeight:900, color:bandColor(result.bandBooster.targetBand), fontFamily:"Georgia,serif", lineHeight:1 }}>{result.bandBooster.targetBand}</div>
                      <div style={{ fontSize:10, color:"#667", fontFamily:"monospace", textTransform:"uppercase" }}>Target</div>
                    </div>
                    <div style={{ flex:1, marginLeft:8 }}>
                      <div style={{ fontSize:14, color:"#c9a84c", fontWeight:700, fontFamily:"system-ui" }}>Here's exactly what to do:</div>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {result.bandBooster.specificActions?.map((action,i)=>(
                      <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                        <span style={{ background:"rgba(201,168,76,0.2)", border:"1px solid rgba(201,168,76,0.4)", borderRadius:"50%", width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#c9a84c", fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                        <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* VOCABULARY TAB */}
            {activeTab==="vocab" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 18px", marginBottom:4 }}>
                  <p style={{ color:"#6b6760", fontSize:13, margin:0, fontFamily:"system-ui", fontStyle:"italic" }}>These are weak or basic words/phrases from your essay that could be upgraded to more academic, IELTS-appropriate alternatives.</p>
                </div>
                {result.vocabularyUpgrades?.map((v,i)=>(
                  <div key={i} style={{ background:"rgba(79,195,247,0.05)", border:"1px solid rgba(79,195,247,0.15)", borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:8 }}>
                    <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                      <div style={{ background:"rgba(239,83,80,0.15)", borderRadius:6, padding:"4px 12px", color:"#ffcdd2", fontSize:14, fontStyle:"italic" }}>"{v.weak}"</div>
                      <div style={{ fontSize:16, color:"#555" }}>→</div>
                      <div style={{ background:"rgba(79,195,247,0.15)", borderRadius:6, padding:"4px 12px", color:"#4fc3f7", fontSize:14, fontWeight:600 }}>"{v.advanced}"</div>
                    </div>
                    <p style={{ color:"#aaa", fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {v.reason}</p>
                  </div>
                ))}
              </div>
            )}

            {/* TIPS TAB */}
            {activeTab==="tips" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"14px 18px", marginBottom:4 }}>
                  <p style={{ color:"#c9a84c", fontSize:13, margin:0, fontFamily:"system-ui" }}>🎓 These are insider tips from an experienced examiner — specific to YOUR essay, not generic advice.</p>
                </div>
                {result.examinerTips?.map((tip,i)=>(
                  <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"16px 20px", display:"flex", gap:14, alignItems:"flex-start" }}>
                    <span style={{ background:"rgba(201,168,76,0.15)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:"50%", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#c9a84c", fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                    <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{tip}</p>
                  </div>
                ))}
              </div>
            )}

            {/* SAMPLE ESSAY TAB */}
            {activeTab==="sample" && result.sampleEssay && (
              <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                <div style={{ background:"rgba(0,201,167,0.06)", border:"1px solid rgba(0,201,167,0.2)", borderRadius:12, padding:"18px 22px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                    <div style={{ fontSize:11, color:"#00c9a7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"system-ui" }}>Band 8+ Model Essay</div>
                    <div style={{ fontSize:12, fontFamily:"system-ui", fontWeight:600, color: sampleWordCount >= 250 ? "#00c9a7" : "#ffb74d" }}>
                      {sampleWordCount} words {sampleWordCount >= 250 ? "✓" : "(below 250)"}
                    </div>
                  </div>
                  <p style={{ color:"#dde5f0", fontSize:15, lineHeight:1.9, whiteSpace:"pre-wrap", margin:0, fontFamily:"Georgia,serif" }}>{result.sampleEssay}</p>
                </div>
                {result.sampleEssayExplanation && (
                  <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"18px 22px" }}>
                    <div style={{ fontSize:11, color:"#4fc3f7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Why This Essay Scores High</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {[["Introduction",result.sampleEssayExplanation.introduction],["Body Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
                        <div key={lbl}>
                          <div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>{lbl}</div>
                          <p style={{ color:"#b0b8c8", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{txt}</p>
                        </div>
                      ))}
                      {result.sampleEssayExplanation.vocabularyHighlights?.length>0 && (
                        <div>
                          <div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, marginBottom:6, fontFamily:"system-ui" }}>Advanced Vocabulary Used</div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {result.sampleEssayExplanation.vocabularyHighlights.map((v,i)=>(
                              <span key={i} style={{ background:"rgba(79,195,247,0.1)", border:"1px solid rgba(79,195,247,0.25)", borderRadius:6, padding:"2px 9px", fontSize:12, color:"#4fc3f7", fontFamily:"system-ui" }}>{v}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div style={{ background:"rgba(0,201,167,0.08)", borderRadius:8, padding:"10px 14px" }}>
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
