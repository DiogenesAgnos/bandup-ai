import { useState, useRef, useEffect, useCallback } from "react";

// ── Config ────────────────────────────────────
const STRIPE_CONFIGURED = false;
const FREE_USES_LIMIT = 2;
const STORAGE_KEY = "bandup_uses";
const API_URL = "/api/analyze";

const TASK_TYPES = {
  task2: { label: "Task 2 — Essay", description: "Academic & General Training", minWords: 250, icon: "✍️" },
  task1academic: { label: "Task 1 — Academic", description: "Graph / Chart / Diagram", minWords: 150, icon: "📊" },
  task1general: { label: "Task 1 — General", description: "Formal / Informal Letter", minWords: 150, icon: "✉️" }
};

// ── Persistent storage ────────────────────────
const getStoredUses = () => {
  try { return parseInt(localStorage.getItem(STORAGE_KEY) || "0"); } catch { return 0; }
};
const saveUses = (n) => {
  try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {}
};
const getStoredPro = () => {
  try { return localStorage.getItem("bandup_pro") === "true"; } catch { return false; }
};
const savePro = () => {
  try { localStorage.setItem("bandup_pro", "true"); } catch {}
};

// ── Joker lines ───────────────────────────────
const JOKER_LINES = {
  idle: [
    "Why so serious? Start writing already! 🃏",
    "An empty essay box... how delightfully tragic.",
    "I've seen better writing on the walls of Arkham. But no pressure.",
    "The cursor blinks. Your future blinks. Coincidence? 🃏",
    "Waiting for you to type something... anything... please."
  ],
  typing: [
    "Ooh you're actually trying. How adorably ambitious. 🃏",
    "Keep going... I'm watching every word. EVERY. WORD.",
    "Not bad. For someone who clearly didn't study. 😄",
    "I see some potential here. Don't ruin it.",
    "You know what's funny? Your sentence structure. 🃏"
  ],
  mistake_grammar: [
    "Subject-verb agreement? Never heard of her? 🃏",
    "Ah yes, the classic grammatical disaster. My favourite.",
    "I've seen this error so many times it's become... beautiful. In a horrible way.",
    "Your grammar called. It's in tears. 🃏",
    "You know what this grammatical error needs? A good PENCIL. Through it."
  ],
  mistake_spelling: [
    "That's not how you spell that. Or is it? No. No it's not. 🃏",
    "Spell-check exists for a reason. Just saying.",
    "I used to have a spelling mistake like that once. I burned it.",
    "The examiner's face when they see this spelling... 🃏 chef's kiss.",
    "Autocorrect tried to help you. You rejected it. Tragic."
  ],
  wordCount: [
    "Under 250 words? The examiner will LOVE this. Oh wait, no they won't. 🃏",
    "Quantity AND quality, darling. This isn't a tweet.",
    "Short essays are like short jokes. They usually don't land.",
    "You stopped writing? We were just getting started! 🃏"
  ],
  analyzing: [
    "Calculating the damage... 🃏",
    "Reading this carefully so the examiner doesn't have to suffer alone...",
    "Processing... preparing my most disappointed face...",
    "Almost done. Brace yourself. 🃏"
  ],
  scoreHigh: [
    "Well well well... turns out you CAN write. I'm almost disappointed. 🃏",
    "Band 7+? I was NOT expecting that. Genuinely impressed. Don't tell anyone.",
    "Hm. This is actually good. I had a whole speech prepared. 🃏"
  ],
  scoreMid: [
    "Band 6. The Switzerland of IELTS scores. Neutral. Inoffensive. Forgettable. 🃏",
    "Could be worse. Could also be much, much better. Just saying.",
    "Band 6 is like a participation trophy. Nice, but not what you came for. 🃏"
  ],
  scoreLow: [
    "Band 5. You know what that stands for? Needs work. Significant work. 🃏",
    "I've seen worse. Okay, I haven't. But I'm being KIND.",
    "The good news: there's nowhere to go but up! The bad news: you have a LOT of going up to do. 🃏"
  ],
  practice: [
    "Practice mode! Let's see what you can do when no one's judging you. Oh wait, I am. 🃏",
    "Write freely! I'll interrupt with sarcastic feedback every few seconds!",
    "Time to practice! Remember: the only bad essay is the one you didn't write. And yours. Sometimes. 🃏"
  ]
};

const getJokerLine = (type) => {
  const lines = JOKER_LINES[type] || JOKER_LINES.idle;
  return lines[Math.floor(Math.random() * lines.length)];
};

// ── Practice questions by topic ───────────────
const PRACTICE_QUESTIONS = {
  "Education": [
    "Some people believe that universities should focus on providing students with the practical skills needed in the workplace. Others argue that universities should prioritise academic knowledge. Discuss both views and give your opinion.",
    "In some countries, children start formal education at a very early age. Some people think this is beneficial while others believe it is harmful. Discuss both views and give your own opinion.",
    "Some people think that the government should pay for higher education. Others believe students should pay for it themselves. Discuss both views and give your opinion."
  ],
  "Technology": [
    "The increasing use of technology in the workplace has led to concerns about job losses. To what extent do you agree or disagree?",
    "Social media has had a largely negative impact on society. To what extent do you agree or disagree?",
    "Some people think that technology is making people less sociable. Others disagree. Discuss both views and give your own opinion."
  ],
  "Environment": [
    "Many people believe that the most important way to protect the environment is to reduce the amount of energy used. To what extent do you agree or disagree?",
    "Some people think governments should focus on reducing environmental pollution rather than individuals. To what extent do you agree or disagree?",
    "Climate change is the most serious issue facing the world today. To what extent do you agree or disagree?"
  ],
  "Crime & Society": [
    "Some people think that the best way to reduce crime is to give longer prison sentences. Others believe there are better alternative ways of reducing crime. Discuss both views and give your own opinion.",
    "Some people believe that prison is the best form of punishment. Others feel that other methods are more effective. Discuss both views and give your opinion.",
    "The best way to reduce youth crime is to educate parents. To what extent do you agree or disagree?"
  ],
  "Health": [
    "In many countries, obesity is becoming a serious problem. What are the causes and what measures could be taken to address it?",
    "Some people think the government should ban fast food. Others disagree. Discuss both views and give your own opinion.",
    "Healthcare should be funded entirely by governments rather than by private companies. To what extent do you agree or disagree?"
  ]
};

// ── System prompts ────────────────────────────
const getSystemPrompt = (taskType) => `You are an expert IELTS examiner with 20+ years of experience.

${taskType === "task2" ? "Evaluating IELTS Task 2. Under 250 words = Task Achievement MAX Band 5.0." : taskType === "task1academic" ? "Evaluating IELTS Task 1 Academic. Check: overview? key trends? data accuracy? no opinion?" : "Evaluating IELTS Task 1 General letter. Check: bullet points addressed? correct register?"}

SCORING: Band 9=flawless, Band 8=very good minor errors, Band 7=good some errors, Band 6=competent noticeable errors, Band 5=frequent errors. Task 1 with clear overview+accurate data+comparisons = 7.5-8.0 minimum. Do NOT undermark.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "wordCount": 201,
  "overallBand": 7.5,
  "criteria": {
    "taskAchievement": { "band": 7.0, "feedback": "..." },
    "coherenceCohesion": { "band": 7.5, "feedback": "..." },
    "lexicalResource": { "band": 7.0, "feedback": "..." },
    "grammaticalRange": { "band": 7.5, "feedback": "..." }
  },
  "mistakes": [{ "original": "exact phrase", "correction": "corrected version", "explanation": "why this is wrong", "category": "Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Register", "severity": "minor|moderate|major" }],
  "vocabularyUpgrades": [{ "weak": "exact weak phrase from essay", "advanced": "better alternative", "reason": "why" }],
  "bandBooster": { "currentBand": 7.0, "targetBand": 7.5, "specificActions": ["action 1", "action 2", "action 3"] },
  "examinerTips": ["tip 1 specific to this essay", "tip 2", "tip 3"],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "sampleEssay": "Full Band 8+ response minimum 270 words Task 2 / 185 words Task 1",
  "sampleEssayExplanation": { "introduction": "...", "bodyParagraphs": "...", "conclusion": "...", "vocabularyHighlights": ["word 1", "word 2"], "whyHighScore": "..." }
}
Find ALL mistakes — no limit. Vocabulary upgrades: 5-8 from essay. Sample: MINIMUM 270 Task 2 / 185 Task 1.`;

const PRACTICE_SYSTEM = `You are a friendly but sarcastic IELTS writing coach reviewing an essay in progress.
Give SHORT, specific, actionable feedback. Be a little funny and direct.
Respond ONLY with valid JSON (no markdown):
{
  "tips": ["specific tip 1 with example", "specific tip 2", "specific tip 3"],
  "quickFix": "The single most important thing to fix RIGHT NOW in one sentence",
  "encouragement": "One short sarcastic-but-kind comment",
  "estimatedBand": 6.0,
  "spotError": "Quote one actual error from the text and correct it, or null if none found"
}`;

// ── Toolkit Data ──────────────────────────────
const TOOLKIT = {
  linkingWords: [
    { category: "Adding Information", color: "#4fc3f7", words: ["Furthermore", "Moreover", "In addition", "Additionally", "What is more", "Besides this"] },
    { category: "Contrasting", color: "#ffb74d", words: ["However", "Nevertheless", "Nonetheless", "On the other hand", "In contrast", "Conversely", "Although", "Whereas"] },
    { category: "Cause & Effect", color: "#00c9a7", words: ["Therefore", "Consequently", "As a result", "Hence", "Thus", "For this reason", "This leads to"] },
    { category: "Examples", color: "#c9a84c", words: ["For instance", "For example", "To illustrate", "Such as", "A case in point is", "This is exemplified by"] },
    { category: "Conclusion", color: "#ff8a65", words: ["In conclusion", "To conclude", "In summary", "Overall", "All things considered", "Taking everything into account"] },
    { category: "Task 1 Sequencing", color: "#80cbc4", words: ["Initially", "Subsequently", "Following this", "Meanwhile", "Over the period shown", "By contrast"] }
  ],
  vocabulary: [
    { topic: "Education", words: [["learn", "acquire knowledge"], ["school", "educational institution"], ["important", "crucial / paramount"], ["students", "learners / pupils"], ["helpful", "beneficial / advantageous"]] },
    { topic: "Crime", words: [["crime", "criminal activity / antisocial behaviour"], ["punish", "penalise / impose sanctions"], ["prison", "incarceration"], ["reduce", "curb / alleviate / diminish"], ["rise", "surge / escalate / proliferate"]] },
    { topic: "Technology", words: [["use", "utilise / harness / leverage"], ["change", "transform / revolutionise"], ["new", "cutting-edge / innovative"], ["problem", "drawback / pitfall"], ["spread", "proliferate / permeate"]] },
    { topic: "Graph Language", words: [["went up", "rose / increased / surged / climbed"], ["went down", "fell / declined / dropped / plummeted"], ["same", "remained stable / plateaued / levelled off"], ["big", "dramatic / sharp / significant / marked"], ["small", "slight / marginal / modest"]] }
  ],
  grammarRules: [
    { rule: "Subject-Verb Agreement", tip: "Collective nouns = singular: 'The government IS...' Uncountable = singular: 'Information IS...'" },
    { rule: "Article Usage", tip: "Use 'the' for specific things. Use 'a/an' for first mention. Omit with general plurals: 'Children need education' not 'The children need the education'." },
    { rule: "Avoid Contractions", tip: "NEVER: don't → do not, can't → cannot, it's → it is. Contractions instantly lower your Lexical Resource score." },
    { rule: "Passive Voice", tip: "'It is widely believed...' / 'It has been argued...' / 'This can be attributed to...' Use passive for academic formality." },
    { rule: "Uncountable Nouns", tip: "Never add 's' to: advice, information, knowledge, research, evidence, equipment, furniture, traffic, behaviour, progress." }
  ],
  petPeeves: [
    { peeve: "Starting with 'Nowadays'", fix: "Examiners see this in 80% of essays. Use: 'In contemporary society...' / 'In the modern era...' / 'Over recent decades...'" },
    { peeve: "'In my opinion, I think...'", fix: "Redundant. Use: 'I firmly contend that...' / 'It is my view that...' / 'I am convinced that...'" },
    { peeve: "Vague examples", fix: "Name the country/data: 'Finland's education system...' / 'Norway's recidivism rate of 20%...' Specific = higher Task Achievement." },
    { peeve: "One-sentence paragraphs", fix: "Minimum 3 sentences per body paragraph: Topic sentence → Explanation → Example/Result." },
    { peeve: "Copying words from the question", fix: "Paraphrase the introduction. If the question says 'reduce crime', write 'address criminal activity'." }
  ],
  templates: [
    { type: "Task 2 Introduction", template: "In contemporary society, [topic] has become an increasingly [debated/contentious] issue. While some argue that [view 1], others contend that [view 2]. This essay will examine both perspectives before arguing that [your position]." },
    { type: "Body Paragraph", template: "[Topic sentence]. This is because [explanation]. For instance, [specific example with data/country]. Consequently, [result/implication]." },
    { type: "Concession + Rebuttal", template: "Admittedly, [opposing view]. However, [counter-argument]. While [opponent's point] may hold some merit, the evidence overwhelmingly suggests that [your point]." },
    { type: "Task 2 Conclusion", template: "In conclusion, while [opposing view] has some validity, I firmly maintain that [your position] is the more effective approach. Governments and individuals must [action] in order to [outcome]." },
    { type: "Task 1 Overview", template: "Overall, it is clear that [main trend 1], while [main trend 2]. [Category] experienced the most significant [increase/decrease], whereas [other] remained comparatively [stable/low]." }
  ]
};

// ── Components ────────────────────────────────
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
  <div style={{ background:"rgba(239,83,80,0.06)", borderLeft:`3px solid ${severityColor(mistake.severity)}`, borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      <span style={{ background:`${severityColor(mistake.severity)}20`, border:`1px solid ${severityColor(mistake.severity)}50`, borderRadius:20, padding:"2px 8px", fontSize:11, color:severityColor(mistake.severity), fontFamily:"system-ui", fontWeight:600 }}>{mistake.severity}</span>
      <span style={{ background:"rgba(79,195,247,0.1)", borderRadius:20, padding:"2px 8px", fontSize:11, color:"#4fc3f7", fontFamily:"system-ui" }}>{mistake.category}</span>
    </div>
    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:140 }}>
        <div style={{ fontSize:10, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>ORIGINAL</div>
        <div style={{ background:"rgba(239,83,80,0.15)", borderRadius:6, padding:"5px 10px", color:"#ffcdd2", fontSize:13, fontStyle:"italic" }}>"{mistake.original}"</div>
      </div>
      <div style={{ fontSize:16, color:"#555", alignSelf:"center" }}>→</div>
      <div style={{ flex:1, minWidth:140 }}>
        <div style={{ fontSize:10, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>CORRECTION</div>
        <div style={{ background:"rgba(0,201,167,0.12)", borderRadius:6, padding:"5px 10px", color:"#80cbc4", fontSize:13 }}>"{mistake.correction}"</div>
      </div>
    </div>
    <p style={{ color:"#aaa", fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {mistake.explanation}</p>
  </div>
);

const TabBtn = ({ label, active, onClick, badge }) => (
  <button onClick={onClick} style={{ background:active?"rgba(79,195,247,0.15)":"transparent", border:active?"1px solid rgba(79,195,247,0.4)":"1px solid transparent", color:active?"#4fc3f7":"#667", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"system-ui", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
  {label}{badge && <span style={{ background:"#ef5350", color:"#fff", borderRadius:20, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{badge}</span>}
  </button>
);

const MainTab = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{ flex:1, background:active?"rgba(201,168,76,0.12)":"rgba(255,255,255,0.03)", border:active?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", color:active?"#c9a84c":"#667", borderRadius:10, padding:"12px 8px", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"system-ui", transition:"all 0.2s" }}>
    {label}
  </button>
);

// ── THE JOKER ─────────────────────────────────
const Joker = ({ message, mood }) => {
  const [visible, setVisible] = useState(true);
  const [laugh, setLaugh] = useState(false);

  useEffect(() => {
    setLaugh(true);
    const t = setTimeout(() => setLaugh(false), 500);
    return () => clearTimeout(t);
  }, [message]);

  const moodEyes = {
    idle: "😐", happy: "😄", thinking: "🤔", concerned: "😒", excited: "🤩", analyzing: "👁️"
  };

  return (
    <div style={{ position:"fixed", top:80, left:16, zIndex:400, display:"flex", flexDirection:"column", alignItems:"flex-start", gap:8, maxWidth:220 }}>
      {/* Joker face */}
      <div onClick={() => setVisible(v => !v)}
        style={{ cursor:"pointer", transition:"transform 0.3s", transform:laugh?"scale(1.1)":"scale(1)" }}>
        <svg width="72" height="80" viewBox="0 0 72 80" xmlns="http://www.w3.org/2000/svg">
          {/* Green hair */}
          <ellipse cx="36" cy="12" rx="28" ry="14" fill="#2d7a2d"/>
          <rect x="8" y="8" width="8" height="20" rx="4" fill="#2d7a2d"/>
          <rect x="56" y="8" width="8" height="20" rx="4" fill="#2d7a2d"/>
          <rect x="20" y="4" width="6" height="18" rx="3" fill="#3a9a3a"/>
          <rect x="46" y="4" width="6" height="18" rx="3" fill="#3a9a3a"/>
          <rect x="33" y="2" width="6" height="16" rx="3" fill="#2d7a2d"/>
          {/* White face */}
          <ellipse cx="36" cy="48" rx="26" ry="30" fill="#f0f0e8"/>
          {/* Purple suit collar */}
          <path d="M10 72 Q36 65 62 72 L62 80 L10 80 Z" fill="#4a148c"/>
          <path d="M28 72 L36 78 L44 72 L36 65 Z" fill="#6a1ab0"/>
          {/* Eyes */}
          <ellipse cx="24" cy="44" rx="7" ry="8" fill="white"/>
          <ellipse cx="48" cy="44" rx="7" ry="8" fill="white"/>
          <ellipse cx="24" cy="45" rx="4" ry="5" fill="#1a1a2e"/>
          <ellipse cx="48" cy="45" rx="4" ry="5" fill="#1a1a2e"/>
          <ellipse cx="25" cy="43" rx="1.5" ry="1.5" fill="white"/>
          <ellipse cx="49" cy="43" rx="1.5" ry="1.5" fill="white"/>
          {/* Scar lines */}
          <path d="M10 52 Q15 48 18 52" stroke="#cc0000" strokeWidth="1.5" fill="none"/>
          <path d="M54 52 Q57 48 62 52" stroke="#cc0000" strokeWidth="1.5" fill="none"/>
          {/* Big red smile */}
          <path d="M14 60 Q24 72 36 74 Q48 72 58 60" stroke="#cc0000" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M14 60 Q24 70 36 72 Q48 70 58 60 Q48 64 36 65 Q24 64 14 60 Z" fill="#cc0000" opacity="0.3"/>
          {/* Teeth */}
          <path d="M22 64 Q36 70 50 64 Q36 68 22 64 Z" fill="white"/>
          {/* Eyebrows — arched menacingly */}
          <path d="M17 36 Q24 32 31 36" stroke="#2d7a2d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M41 36 Q48 32 55 36" stroke="#2d7a2d" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          {/* Purple hat hint */}
          <rect x="16" y="18" width="40" height="6" rx="2" fill="#4a148c" opacity="0.6"/>
        </svg>
      </div>

      {/* Speech bubble */}
      {visible && message && (
        <div style={{
          background:"#1a0a2e",
          border:"1px solid rgba(106,26,176,0.6)",
          borderRadius:12,
          padding:"10px 14px",
          position:"relative",
          boxShadow:"0 4px 20px rgba(106,26,176,0.3)",
          animation:"slideIn 0.3s ease"
        }}>
          <div style={{ position:"absolute", top:10, left:-8, width:0, height:0, borderTop:"6px solid transparent", borderBottom:"6px solid transparent", borderRight:"8px solid #1a0a2e" }} />
          <p style={{ color:"#e8d5ff", fontSize:12, margin:0, lineHeight:1.5, fontFamily:"system-ui", fontStyle:"italic" }}>
            {message}
          </p>
        </div>
      )}
    </div>
  );
};

// ── Paywall ───────────────────────────────────
const PaywallModal = ({ onClose, onSuccess }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(10px)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
    <div style={{ background:"#13151a", border:"1px solid rgba(201,168,76,0.35)", borderRadius:20, padding:"40px 32px", maxWidth:440, width:"100%", position:"relative" }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:"#555", fontSize:22, cursor:"pointer" }}>✕</button>
      <div style={{ textAlign:"center", marginBottom:20 }}>
        <div style={{ fontSize:32, marginBottom:8 }}>🃏</div>
        <div style={{ display:"inline-block", background:"rgba(201,168,76,0.1)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:100, padding:"6px 16px", fontSize:11, color:"#c9a84c", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Free analyses used up</div>
        <h2 style={{ fontFamily:"Georgia,serif", color:"#f5f0e8", fontSize:24, marginBottom:8 }}>Unlock Unlimited Access</h2>
        <p style={{ color:"#6b6760", fontSize:14, lineHeight:1.6, fontFamily:"system-ui" }}>Full IELTS Writing coverage — Task 1 & 2, Academic & General Training.</p>
      </div>
      <div style={{ background:"rgba(201,168,76,0.07)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"16px", marginBottom:18, textAlign:"center" }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:48, fontWeight:900, color:"#f5f0e8", lineHeight:1 }}>
          <sup style={{ fontSize:20, verticalAlign:"super" }}>$</sup>19<sub style={{ fontSize:14, color:"#6b6760" }}>/month</sub>
        </div>
        <div style={{ color:"#6b6760", fontSize:12, marginTop:4, fontFamily:"system-ui" }}>Cancel anytime · No hidden fees</div>
      </div>
      <ul style={{ listStyle:"none", padding:0, display:"flex", flexDirection:"column", gap:8, marginBottom:22 }}>
        {["Unlimited essay analyses","Complete mistake detection","Band Booster + Vocabulary upgrades","Full IELTS Toolkit (Grammar, Templates, Pet Peeves)","Practice Mode with live AI feedback","Graph image upload for Task 1 Academic","Unlimited Band 8+ model responses"].map((f,i) => (
          <li key={i} style={{ display:"flex", gap:10, fontSize:13, color:"#d4cfc6", fontFamily:"system-ui" }}>
            <span style={{ color:"#00c9a7", fontWeight:700, flexShrink:0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <button onClick={() => { savePro(); onSuccess(); }}
        style={{ width:"100%", background:"linear-gradient(135deg,#c9a84c,#a87c30)", color:"#000", fontWeight:800, fontSize:15, padding:"15px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"system-ui", boxShadow:"0 8px 24px rgba(201,168,76,0.3)" }}>
        🔓 {STRIPE_CONFIGURED ? "Start Pro — $19/month" : "Unlock Pro (Test Mode)"}
      </button>
      {!STRIPE_CONFIGURED && <p style={{ textAlign:"center", color:"#555", fontSize:11, marginTop:10, fontFamily:"system-ui", fontStyle:"italic" }}>Add Stripe keys to enable real payments.</p>}
    </div>
  </div>
);

// ── Toolkit ───────────────────────────────────
const ToolkitContent = ({ isPro, onUpgrade }) => {
  const [section, setSection] = useState("linking");
  const sections = [
    { key:"linking", label:"🔗 Linking Words", free: true },
    { key:"vocab", label:"📚 Vocabulary", free: false },
    { key:"grammar", label:"📐 Grammar Rules", free: false },
    { key:"peeves", label:"⚠️ Pet Peeves", free: false },
    { key:"templates", label:"📝 Templates", free: false }
  ];

  const LockedOverlay = () => (
    <div style={{ position:"relative" }}>
      <div style={{ filter:"blur(4px)", pointerEvents:"none", userSelect:"none", opacity:0.4 }}>
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 18px", marginBottom:10 }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#c9a84c", marginBottom:6, fontFamily:"system-ui" }}>Example content...</div>
          <p style={{ color:"#cdd5e0", fontSize:13, margin:0, fontFamily:"system-ui" }}>This valuable content is locked. Upgrade to Pro to access all grammar rules, vocabulary upgrades, examiner pet peeves and essay templates.</p>
        </div>
        <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 18px" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#4fc3f7", marginBottom:6, fontFamily:"system-ui" }}>More locked content...</div>
          <p style={{ color:"#cdd5e0", fontSize:13, margin:0, fontFamily:"system-ui" }}>Unlock all sections including band 7-8 vocabulary lists, grammar rules with examples, and ready-to-use essay templates.</p>
        </div>
      </div>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
        <div style={{ fontSize:40 }}>🔒</div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:"#f5f0e8", fontWeight:700, fontSize:16, fontFamily:"system-ui", marginBottom:6 }}>Pro Feature</div>
          <div style={{ color:"#6b6760", fontSize:13, fontFamily:"system-ui", marginBottom:16 }}>Unlock Grammar Rules, Vocabulary, Pet Peeves & Templates</div>
          <button onClick={onUpgrade} style={{ background:"linear-gradient(135deg,#c9a84c,#a87c30)", color:"#000", fontWeight:800, fontSize:14, padding:"10px 24px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"system-ui" }}>
            Upgrade to Pro — $19/mo
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"12px 16px", marginBottom:16 }}>
        <p style={{ color:"#c9a84c", fontSize:13, margin:0, fontFamily:"system-ui" }}>🎓 Your personal IELTS reference guide — use these in every essay to boost your band score. {!isPro && <span style={{ color:"#667" }}>Linking Words are free. Upgrade for full access.</span>}</p>
      </div>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{ background:section===s.key?"rgba(201,168,76,0.15)":"rgba(255,255,255,0.03)", border:section===s.key?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", color:section===s.key?"#c9a84c":"#667", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"system-ui", display:"flex", alignItems:"center", gap:6 }}>
            {s.label} {!s.free && !isPro && <span style={{ fontSize:10 }}>🔒</span>}
          </button>
        ))}
      </div>

      {section === "linking" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {TOOLKIT.linkingWords.map((cat, i) => (
            <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:cat.color, marginBottom:10, fontFamily:"system-ui", textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat.category}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {cat.words.map((w, j) => (
                  <span key={j} style={{ background:`${cat.color}15`, border:`1px solid ${cat.color}30`, borderRadius:8, padding:"4px 12px", fontSize:13, color:cat.color, fontFamily:"system-ui" }}>{w}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {section === "vocab" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {TOOLKIT.vocabulary.map((topic, i) => (
            <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#c9a84c", marginBottom:10, fontFamily:"system-ui", textTransform:"uppercase" }}>{topic.topic}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {topic.words.map((pair, j) => (
                  <div key={j} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ background:"rgba(239,83,80,0.1)", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#ffcdd2", fontFamily:"system-ui" }}>✗ {pair[0]}</span>
                    <span style={{ color:"#555" }}>→</span>
                    <span style={{ background:"rgba(0,201,167,0.1)", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#80cbc4", fontFamily:"system-ui" }}>✓ {pair[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : <LockedOverlay />)}

      {section === "grammar" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.grammarRules.map((item, i) => (
            <div key={i} style={{ background:"rgba(79,195,247,0.05)", border:"1px solid rgba(79,195,247,0.15)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#4fc3f7", marginBottom:6, fontFamily:"system-ui" }}>📐 {item.rule}</div>
              <p style={{ color:"#cdd5e0", fontSize:13, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{item.tip}</p>
            </div>
          ))}
        </div>
      ) : <LockedOverlay />)}

      {section === "peeves" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.petPeeves.map((item, i) => (
            <div key={i} style={{ background:"rgba(239,83,80,0.05)", border:"1px solid rgba(239,83,80,0.15)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#ef9a9a", marginBottom:6, fontFamily:"system-ui" }}>⚠️ {item.peeve}</div>
              <p style={{ color:"#cdd5e0", fontSize:13, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>✅ {item.fix}</p>
            </div>
          ))}
        </div>
      ) : <LockedOverlay />)}

      {section === "templates" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.templates.map((item, i) => (
            <div key={i} style={{ background:"rgba(201,168,76,0.05)", border:"1px solid rgba(201,168,76,0.15)", borderRadius:12, padding:"16px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#c9a84c", marginBottom:8, fontFamily:"system-ui", textTransform:"uppercase" }}>📝 {item.type}</div>
              <p style={{ color:"#dde5f0", fontSize:13, lineHeight:1.8, margin:0, fontFamily:"Georgia,serif", fontStyle:"italic", background:"rgba(255,255,255,0.03)", padding:"10px 14px", borderRadius:8, whiteSpace:"pre-wrap" }}>{item.template}</p>
            </div>
          ))}
        </div>
      ) : <LockedOverlay />)}
    </div>
  );
};

// ── Practice Mode ─────────────────────────────
const PracticeMode = ({ isPro, onUpgrade, setJokerMessage, setJokerMood }) => {
  const [questionMode, setQuestionMode] = useState("choose"); // choose | custom
  const [selectedTopic, setSelectedTopic] = useState("Education");
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [practiceEssay, setPracticeEssay] = useState("");
  const [liveFeedback, setLiveFeedback] = useState(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [started, setStarted] = useState(false);
  const timerRef = useRef(null);
  const wordCount = practiceEssay.trim().split(/\s+/).filter(Boolean).length;

  const fetchLiveFeedback = useCallback(async (text) => {
    if (text.trim().split(/\s+/).length < 30) return;
    setLoadingFeedback(true);
    try {
      const res = await fetch(API_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:800,
          system: PRACTICE_SYSTEM,
          messages:[{ role:"user", content:`Question: "${selectedQuestion || customQuestion}"\n\nEssay so far:\n${text}\n\nGive quick coaching feedback.` }]
        })
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text||"").join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setLiveFeedback(parsed);
      if (parsed.spotError) {
        setJokerMessage(getJokerLine("mistake_grammar"));
        setJokerMood("concerned");
      } else if (parsed.estimatedBand >= 7) {
        setJokerMessage(getJokerLine("scoreHigh"));
        setJokerMood("happy");
      } else {
        setJokerMessage(getJokerLine("typing"));
        setJokerMood("thinking");
      }
    } catch(e) { console.error(e); }
    finally { setLoadingFeedback(false); }
  }, [selectedQuestion, customQuestion, setJokerMessage, setJokerMood]);

  const handleEssayChange = (e) => {
    const val = e.target.value;
    setPracticeEssay(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchLiveFeedback(val), 3000);
  };

  const question = selectedQuestion || customQuestion;

  return (
    <div>
      <div style={{ background:"rgba(79,195,247,0.06)", border:"1px solid rgba(79,195,247,0.2)", borderRadius:12, padding:"14px 18px", marginBottom:20 }}>
        <p style={{ color:"#4fc3f7", fontSize:13, margin:0, fontFamily:"system-ui" }}>🎯 <strong>Practice Mode</strong> — Write freely and get live AI coaching every few seconds as you type. No final score — just real-time improvement tips.</p>
      </div>

      {!started ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Question source */}
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>setQuestionMode("choose")} style={{ flex:1, background:questionMode==="choose"?"rgba(201,168,76,0.12)":"rgba(255,255,255,0.03)", border:questionMode==="choose"?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"10px", cursor:"pointer", color:questionMode==="choose"?"#c9a84c":"#667", fontSize:13, fontWeight:600, fontFamily:"system-ui" }}>
              📋 Choose a Question
            </button>
            <button onClick={()=>setQuestionMode("custom")} style={{ flex:1, background:questionMode==="custom"?"rgba(201,168,76,0.12)":"rgba(255,255,255,0.03)", border:questionMode==="custom"?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"10px", cursor:"pointer", color:questionMode==="custom"?"#c9a84c":"#667", fontSize:13, fontWeight:600, fontFamily:"system-ui" }}>
              ✏️ Write My Own
            </button>
          </div>

          {questionMode === "choose" && (
            <div>
              <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, fontFamily:"monospace" }}>Choose Topic</label>
              <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
                {Object.keys(PRACTICE_QUESTIONS).map(topic => (
                  <button key={topic} onClick={()=>{ setSelectedTopic(topic); setSelectedQuestion(""); }}
                    style={{ background:selectedTopic===topic?"rgba(201,168,76,0.15)":"rgba(255,255,255,0.03)", border:selectedTopic===topic?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", borderRadius:8, padding:"6px 14px", cursor:"pointer", color:selectedTopic===topic?"#c9a84c":"#667", fontSize:12, fontWeight:600, fontFamily:"system-ui" }}>
                    {topic}
                  </button>
                ))}
              </div>
              <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, fontFamily:"monospace" }}>Choose Question</label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {PRACTICE_QUESTIONS[selectedTopic].map((q, i) => (
                  <div key={i} onClick={()=>setSelectedQuestion(q)}
                    style={{ background:selectedQuestion===q?"rgba(79,195,247,0.1)":"rgba(255,255,255,0.03)", border:selectedQuestion===q?"1px solid rgba(79,195,247,0.4)":"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"12px 16px", cursor:"pointer", color:selectedQuestion===q?"#4fc3f7":"#b0b8c8", fontSize:13, fontFamily:"system-ui", lineHeight:1.6, transition:"all 0.2s" }}>
                    {i+1}. {q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {questionMode === "custom" && (
            <div>
              <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8, fontFamily:"monospace" }}>Your Question</label>
              <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} rows={3}
                placeholder="Paste or type your own IELTS question here..."
                style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box" }}
              />
            </div>
          )}

          <button
            onClick={() => { if (question) { setStarted(true); setJokerMessage(getJokerLine("practice")); setJokerMood("excited"); } }}
            disabled={!question}
            style={{ background:question?"linear-gradient(135deg,#4fc3f7,#0288d1)":"rgba(255,255,255,0.05)", border:"none", borderRadius:10, color:question?"#000":"#555", fontSize:15, fontWeight:800, padding:"15px", cursor:question?"pointer":"not-allowed", fontFamily:"system-ui" }}>
            {question ? "🖊️ Start Practice Session" : "Select a question to begin"}
          </button>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Question display */}
          <div style={{ background:"rgba(79,195,247,0.06)", border:"1px solid rgba(79,195,247,0.2)", borderRadius:12, padding:"14px 18px" }}>
            <div style={{ fontSize:11, color:"#4fc3f7", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6, fontFamily:"system-ui" }}>Your Question</div>
            <p style={{ color:"#e0e6f0", fontSize:14, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>{question}</p>
          </div>

          <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
            {/* Essay textarea */}
            <div style={{ flex:2, minWidth:300 }}>
              <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>
                Your Essay
                <span style={{ color:wordCount>=250?"#00c9a7":wordCount>=150?"#ffb74d":"#ef5350", marginLeft:10, fontWeight:400 }}>
                  {wordCount} words {wordCount>=250?"✓":wordCount>=150?"(keep going)":"(too short)"}
                </span>
              </label>
              <textarea value={practiceEssay} onChange={handleEssayChange} rows={14}
                placeholder="Start writing your essay here... I'll give you live feedback every few seconds!"
                style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.8, outline:"none", boxSizing:"border-box" }}
              />
              <button onClick={() => { setStarted(false); setPracticeEssay(""); setLiveFeedback(null); setSelectedQuestion(""); setCustomQuestion(""); }}
                style={{ marginTop:8, background:"transparent", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, color:"#667", fontSize:12, padding:"6px 14px", cursor:"pointer", fontFamily:"system-ui" }}>
                ← Change Question
              </button>
            </div>

            {/* Live feedback panel */}
            <div style={{ flex:1, minWidth:240 }}>
              <div style={{ fontSize:11, color:"#4fc3f7", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10, fontFamily:"system-ui" }}>
                {loadingFeedback ? "🔍 Analysing..." : "💬 Live Feedback"}
              </div>

              {loadingFeedback && (
                <div style={{ background:"rgba(79,195,247,0.05)", border:"1px solid rgba(79,195,247,0.15)", borderRadius:10, padding:"14px", textAlign:"center" }}>
                  <div style={{ color:"#4fc3f7", fontSize:13, fontFamily:"system-ui" }}>Reading your essay... 🎓</div>
                </div>
              )}

              {liveFeedback && !loadingFeedback && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {/* Estimated band */}
                  <div style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ fontSize:32, fontWeight:900, color:bandColor(liveFeedback.estimatedBand), fontFamily:"Georgia,serif", lineHeight:1 }}>{liveFeedback.estimatedBand}</div>
                    <div>
                      <div style={{ fontSize:11, color:"#667", fontFamily:"monospace", textTransform:"uppercase" }}>Estimated So Far</div>
                      <div style={{ fontSize:12, color:bandColor(liveFeedback.estimatedBand), fontFamily:"system-ui", fontWeight:600 }}>{bandLabel(liveFeedback.estimatedBand)}</div>
                    </div>
                  </div>

                  {/* Quick fix */}
                  {liveFeedback.quickFix && (
                    <div style={{ background:"rgba(239,83,80,0.08)", border:"1px solid rgba(239,83,80,0.2)", borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:"#ef9a9a", fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>🚨 QUICK FIX</div>
                      <p style={{ color:"#ffcdd2", fontSize:13, margin:0, lineHeight:1.5, fontFamily:"system-ui" }}>{liveFeedback.quickFix}</p>
                    </div>
                  )}

                  {/* Spot error */}
                  {liveFeedback.spotError && (
                    <div style={{ background:"rgba(255,183,77,0.08)", border:"1px solid rgba(255,183,77,0.2)", borderRadius:10, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>✏️ SPOT ERROR</div>
                      <p style={{ color:"#ffe082", fontSize:13, margin:0, lineHeight:1.5, fontFamily:"system-ui" }}>{liveFeedback.spotError}</p>
                    </div>
                  )}

                  {/* Tips */}
                  <div style={{ background:"rgba(79,195,247,0.05)", border:"1px solid rgba(79,195,247,0.15)", borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, color:"#4fc3f7", fontWeight:700, marginBottom:8, fontFamily:"system-ui" }}>💡 TIPS</div>
                    {liveFeedback.tips?.map((tip, i) => (
                      <div key={i} style={{ color:"#cdd5e0", fontSize:13, lineHeight:1.5, marginBottom:6, fontFamily:"system-ui" }}>• {tip}</div>
                    ))}
                  </div>

                  {/* Encouragement */}
                  {liveFeedback.encouragement && (
                    <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.15)", borderRadius:10, padding:"10px 14px" }}>
                      <p style={{ color:"#c9a84c", fontSize:12, margin:0, fontStyle:"italic", fontFamily:"system-ui" }}>🃏 {liveFeedback.encouragement}</p>
                    </div>
                  )}
                </div>
              )}

              {!liveFeedback && !loadingFeedback && (
                <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:10, padding:"16px", textAlign:"center" }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>🖊️</div>
                  <p style={{ color:"#555", fontSize:13, margin:0, fontFamily:"system-ui" }}>Start writing — feedback appears after a few seconds of typing!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main App ──────────────────────────────────
export default function IELTSBot() {
  const [mainView, setMainView] = useState("analyze");
  const [taskType, setTaskType] = useState("task2");
  const [topic, setTopic] = useState("");
  const [essay, setEssay] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("scores");
  const [showPaywall, setShowPaywall] = useState(false);
  const [uses, setUses] = useState(getStoredUses);
  const [proUser, setProUser] = useState(getStoredPro);
  const [jokerMessage, setJokerMessage] = useState(getJokerLine("idle"));
  const [jokerMood, setJokerMood] = useState("idle");
  const fileRef = useRef();

  const usesLeft = FREE_USES_LIMIT - uses;
  const minWords = TASK_TYPES[taskType].minWords;
  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
  const sampleWordCount = result?.sampleEssay ? result.sampleEssay.trim().split(/\s+/).filter(Boolean).length : 0;

  // Joker reacts to typing
  useEffect(() => {
    if (!essay) return;
    if (wordCount < minWords && wordCount > 10) {
      setJokerMessage(getJokerLine("wordCount"));
      setJokerMood("concerned");
    } else if (wordCount >= minWords) {
      setJokerMessage(getJokerLine("wordGood") || getJokerLine("typing"));
      setJokerMood("happy");
    }
  }, [wordCount]);

  const handleProSuccess = () => {
    savePro();
    setProUser(true);
    setShowPaywall(false);
    setJokerMessage("Well, well, well... a paying customer. I'm almost impressed. 🃏 Unlimited access unlocked!");
    setJokerMood("excited");
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setImage(ev.target.result.split(",")[1]); setImagePreview(ev.target.result); };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!topic.trim() || !essay.trim()) { setError("Please provide both the task question and your response."); return; }
    if (wordCount < 30) { setError("Response too short."); return; }
    if (taskType === "task1academic" && !image) { setError("Please upload the graph/chart image for Academic Task 1."); return; }
    if (!proUser && uses >= FREE_USES_LIMIT) { setShowPaywall(true); return; }

    setError(""); setLoading(true); setResult(null);
    setJokerMessage(getJokerLine("analyzing"));
    setJokerMood("analyzing");

    try {
      const messageContent = taskType === "task1academic" && image
        ? [{ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:image } }, { type:"text", text:`IELTS ${TASK_TYPES[taskType].label}\nQuestion: "${topic}"\nEssay:\n${essay}\n\nEvaluate and respond as JSON only.` }]
        : `IELTS ${TASK_TYPES[taskType].label}\nQuestion: "${topic}"\nEssay:\n${essay}\n\nEvaluate and respond as JSON only.`;

      const res = await fetch(API_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:4000, system:getSystemPrompt(taskType), messages:[{ role:"user", content:messageContent }] })
      });
      const data = await res.json();
      const text = data.content.map(b => b.text||"").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());

      if (!proUser) {
        const newUses = uses + 1;
        setUses(newUses);
        saveUses(newUses);
      }

      setResult(parsed);
      setActiveTab("scores");

      // Joker reacts to score
      if (parsed.overallBand >= 7.5) {
        setJokerMessage(getJokerLine("scoreHigh"));
        setJokerMood("happy");
      } else if (parsed.overallBand >= 6) {
        setJokerMessage(getJokerLine("scoreMid"));
        setJokerMood("idle");
      } else {
        setJokerMessage(getJokerLine("scoreLow"));
        setJokerMood("concerned");
      }
    } catch(e) {
      setError("Something went wrong. Please try again.");
      setJokerMessage("Something broke. Even I'm surprised. 🃏");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#0d1117", color:"#e0e6f0", paddingBottom:60 }}>
      {showPaywall && <PaywallModal onClose={()=>setShowPaywall(false)} onSuccess={handleProSuccess} />}

      {/* Joker */}
      <Joker message={jokerMessage} mood={jokerMood} />

      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#0d1117,#161b27)", borderBottom:"1px solid rgba(201,168,76,0.15)", padding:"28px 24px", textAlign:"center" }}>
        <div style={{ fontSize:11, letterSpacing:"0.3em", color:"#c9a84c", fontFamily:"monospace", marginBottom:10, textTransform:"uppercase" }}>AI-Powered</div>
        <h1 style={{ margin:0, fontSize:"clamp(24px,5vw,44px)", fontWeight:900, fontFamily:"Georgia,serif", background:"linear-gradient(90deg,#c9a84c,#00c9a7)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          BandUp AI
        </h1>
        <p style={{ color:"#667", fontSize:13, fontFamily:"system-ui", margin:"8px auto 0", maxWidth:560 }}>
          IELTS Writing Examiner · Task 1 & 2 · Practice Mode · Live Feedback · Full Toolkit
        </p>
        <div style={{ marginTop:14, display:"inline-flex", background:proUser?"rgba(0,201,167,0.1)":usesLeft<=0?"rgba(239,83,80,0.1)":"rgba(201,168,76,0.08)", border:`1px solid ${proUser?"rgba(0,201,167,0.3)":usesLeft<=0?"rgba(239,83,80,0.3)":"rgba(201,168,76,0.2)"}`, borderRadius:100, padding:"5px 16px", fontSize:13, fontFamily:"system-ui", color:proUser?"#00c9a7":usesLeft<=0?"#ef9a9a":"#c9a84c", fontWeight:600 }}>
          {proUser ? "✓ Pro — Unlimited Access" : usesLeft > 0 ? `${usesLeft} free ${usesLeft===1?"analysis":"analyses"} remaining` : "Free limit reached — upgrade to continue"}
        </div>
      </div>

      <div style={{ maxWidth:860, margin:"0 auto", padding:"24px 16px 0", paddingLeft:100 }}>

        {/* Main Navigation */}
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          <MainTab label="🎓 Analyze Essay" active={mainView==="analyze"} onClick={()=>setMainView("analyze")} />
          <MainTab label="🖊️ Practice Mode" active={mainView==="practice"} onClick={()=>{ setMainView("practice"); setJokerMessage(getJokerLine("practice")); setJokerMood("excited"); }} />
          <MainTab label="📚 IELTS Toolkit" active={mainView==="toolkit"} onClick={()=>setMainView("toolkit")} />
        </div>

        {/* ── ANALYZE VIEW ── */}
        {mainView === "analyze" && (
          <div>
            {/* Task Type */}
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, fontFamily:"monospace" }}>Select Task Type</label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {Object.entries(TASK_TYPES).map(([key, task]) => (
                  <button key={key} onClick={() => { setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); }}
                    style={{ background:taskType===key?"rgba(201,168,76,0.12)":"rgba(255,255,255,0.03)", border:taskType===key?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"14px 10px", cursor:"pointer", textAlign:"center" }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{task.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:taskType===key?"#c9a84c":"#cdd5e0", fontFamily:"system-ui", marginBottom:2 }}>{task.label}</div>
                    <div style={{ fontSize:11, color:"#555", fontFamily:"system-ui" }}>{task.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Image upload */}
            {taskType === "task1academic" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8, fontFamily:"monospace" }}>Upload Graph / Chart Image *</label>
                <div onClick={() => fileRef.current.click()}
                  style={{ border:`2px dashed ${imagePreview?"rgba(0,201,167,0.4)":"rgba(201,168,76,0.3)"}`, borderRadius:12, padding:"20px", textAlign:"center", cursor:"pointer", background:"rgba(255,255,255,0.02)" }}>
                  {imagePreview ? (
                    <div><img src={imagePreview} alt="graph" style={{ maxHeight:180, maxWidth:"100%", borderRadius:8, marginBottom:8 }} /><div style={{ fontSize:12, color:"#00c9a7", fontFamily:"system-ui" }}>✓ Uploaded — click to change</div></div>
                  ) : (
                    <div><div style={{ fontSize:32, marginBottom:8 }}>📊</div><div style={{ fontSize:14, color:"#c9a84c", fontFamily:"system-ui", marginBottom:4 }}>Click to upload graph/chart image</div><div style={{ fontSize:12, color:"#555", fontFamily:"system-ui" }}>JPG, PNG — AI will read and evaluate the graph</div></div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>
                  {taskType==="task1general"?"Letter Task Instructions":taskType==="task1academic"?"Task Description":"Essay Question / Topic"}
                </label>
                <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
                  placeholder={taskType==="task2"?"e.g. Some people think universities should focus on job skills. Others believe universities should provide knowledge for its own sake. Discuss both views and give your opinion.":taskType==="task1academic"?"e.g. The graph below shows changes in energy consumption in the US between 1980 and 2020. Summarise the information by selecting and reporting the main features.":"e.g. You recently bought a laptop online but it arrived damaged. Write a letter to the manager. Explain what happened and what you want them to do."}
                  style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box" }}
                />
              </div>

              <div>
                <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>
                  Student's Response
                  <span style={{ color:wordCount>=minWords?"#00c9a7":wordCount>=(minWords*0.6)?"#ffb74d":"#ef5350", marginLeft:10, fontWeight:400, fontFamily:"system-ui" }}>
                    {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords}${wordCount<minWords?" — penalty applies":""})`}
                  </span>
                </label>
                <textarea value={essay} onChange={e=>{ setEssay(e.target.value); if(e.target.value.length>20) { setJokerMessage(getJokerLine("typing")); setJokerMood("thinking"); } }}
                  placeholder={taskType==="task1general"?"Dear Sir/Madam,\n\nI am writing to...":taskType==="task1academic"?"The graph illustrates...":"Paste the student's essay here..."}
                  rows={10}
                  style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.8, outline:"none", boxSizing:"border-box" }}
                />
              </div>

              {error && <div style={{ background:"rgba(239,83,80,0.1)", border:"1px solid rgba(239,83,80,0.3)", borderRadius:8, padding:"11px 14px", color:"#ef9a9a", fontSize:14, fontFamily:"system-ui" }}>{error}</div>}

              {!proUser && usesLeft===1 && (
                <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:8, padding:"11px 14px", fontSize:13, color:"#c9a84c", fontFamily:"system-ui", textAlign:"center" }}>
                  ⚠️ Last free analysis!{" "}<button onClick={()=>setShowPaywall(true)} style={{ background:"none", border:"none", color:"#e8c97a", fontWeight:700, cursor:"pointer", textDecoration:"underline", fontSize:13, fontFamily:"system-ui" }}>Upgrade to Pro</button>{" "}for unlimited access.
                </div>
              )}

              <button onClick={analyze} disabled={loading}
                style={{ background:loading?"rgba(201,168,76,0.1)":"linear-gradient(135deg,#c9a84c,#a87c30)", border:"none", borderRadius:10, color:loading?"#c9a84c":"#000", fontSize:15, fontWeight:800, padding:"15px 28px", cursor:loading?"not-allowed":"pointer", fontFamily:"system-ui", boxShadow:loading?"none":"0 6px 24px rgba(201,168,76,0.25)", transition:"all 0.2s" }}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?"🔓 Upgrade to Continue":`🎓 Analyze ${TASK_TYPES[taskType].label}`}
              </button>
            </div>

            {/* Results */}
            {result && (
              <div style={{ marginTop:36 }}>
                <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,0.1),rgba(0,201,167,0.1))", border:"1px solid rgba(201,168,76,0.25)", borderRadius:14, padding:"24px 28px", display:"flex", alignItems:"center", gap:24, marginBottom:20, flexWrap:"wrap" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:60, fontWeight:900, color:bandColor(result.overallBand), lineHeight:1, fontFamily:"Georgia,serif" }}>{result.overallBand}</div>
                    <div style={{ fontSize:11, color:"#667", fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:3 }}>Overall Band</div>
                  </div>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                      <div style={{ fontSize:20, fontWeight:700, color:bandColor(result.overallBand), fontFamily:"Georgia,serif" }}>{bandLabel(result.overallBand)} User</div>
                      <span style={{ background:result.wordCount>=minWords?"rgba(0,201,167,0.15)":"rgba(239,83,80,0.15)", border:`1px solid ${result.wordCount>=minWords?"rgba(0,201,167,0.3)":"rgba(239,83,80,0.3)"}`, borderRadius:20, padding:"2px 10px", fontSize:12, color:result.wordCount>=minWords?"#00c9a7":"#ef9a9a", fontFamily:"system-ui" }}>
                        {result.wordCount} words {result.wordCount>=minWords?"✓":"⚠ below minimum"}
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {result.strengths?.map((s,i) => <span key={i} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.25)", borderRadius:20, padding:"2px 10px", fontSize:12, color:"#80cbc4", fontFamily:"system-ui" }}>✓ {s}</span>)}
                    </div>
                  </div>
                </div>

                <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
                  <TabBtn label="📊 Scores" active={activeTab==="scores"} onClick={()=>setActiveTab("scores")} />
                  <TabBtn label="🔍 Mistakes" active={activeTab==="mistakes"} onClick={()=>setActiveTab("mistakes")} badge={result.mistakes?.length} />
                  <TabBtn label="📈 Band Booster" active={activeTab==="booster"} onClick={()=>setActiveTab("booster")} />
                  <TabBtn label="💬 Vocabulary" active={activeTab==="vocab"} onClick={()=>setActiveTab("vocab")} />
                  <TabBtn label="🎓 Examiner Tips" active={activeTab==="tips"} onClick={()=>setActiveTab("tips")} />
                  <TabBtn label="✨ Sample" active={activeTab==="sample"} onClick={()=>setActiveTab("sample")} />
                </div>

                {activeTab==="scores" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <CriteriaCard label="Task Achievement" data={result.criteria.taskAchievement} />
                    <CriteriaCard label="Coherence & Cohesion" data={result.criteria.coherenceCohesion} />
                    <CriteriaCard label="Lexical Resource" data={result.criteria.lexicalResource} />
                    <CriteriaCard label="Grammatical Range & Accuracy" data={result.criteria.grammaticalRange} />
                    {result.improvements?.length>0 && (
                      <div style={{ background:"rgba(255,183,77,0.07)", border:"1px solid rgba(255,183,77,0.2)", borderRadius:10, padding:"14px 18px" }}>
                        <div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, fontFamily:"system-ui" }}>Key Improvements Needed</div>
                        {result.improvements.map((imp,i)=><div key={i} style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.6, marginBottom:4, fontFamily:"system-ui" }}>→ {imp}</div>)}
                      </div>
                    )}
                  </div>
                )}

                {activeTab==="mistakes" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                      {[["major","#ef5350"],["moderate","#ffb74d"],["minor","#4fc3f7"]].map(([s,c])=>(
                        <span key={s} style={{ background:`${c}15`, border:`1px solid ${c}40`, borderRadius:20, padding:"3px 10px", fontSize:11, color:c, fontFamily:"system-ui", fontWeight:600 }}>● {s}</span>
                      ))}
                      <span style={{ color:"#555", fontSize:12, fontFamily:"system-ui", alignSelf:"center" }}>— {result.mistakes?.length} found</span>
                    </div>
                    {result.mistakes?.length===0 ? <div style={{ color:"#00c9a7", textAlign:"center", padding:36, fontFamily:"system-ui" }}>No mistakes — excellent!</div>
                    : result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i} />)}
                  </div>
                )}

                {activeTab==="booster" && result.bandBooster && (
                  <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,0.1),rgba(0,201,167,0.05))", border:"1px solid rgba(201,168,76,0.25)", borderRadius:14, padding:"20px 24px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20, flexWrap:"wrap" }}>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:36, fontWeight:900, color:bandColor(result.bandBooster.currentBand), fontFamily:"Georgia,serif" }}>{result.bandBooster.currentBand}</div><div style={{ fontSize:10, color:"#667", fontFamily:"monospace", textTransform:"uppercase" }}>Current</div></div>
                      <div style={{ fontSize:24, color:"#c9a84c" }}>→</div>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:36, fontWeight:900, color:bandColor(result.bandBooster.targetBand), fontFamily:"Georgia,serif" }}>{result.bandBooster.targetBand}</div><div style={{ fontSize:10, color:"#667", fontFamily:"monospace", textTransform:"uppercase" }}>Target</div></div>
                      <div style={{ flex:1 }}><div style={{ fontSize:14, color:"#c9a84c", fontWeight:700, fontFamily:"system-ui" }}>What to do:</div></div>
                    </div>
                    {result.bandBooster.specificActions?.map((a,i)=>(
                      <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:10 }}>
                        <span style={{ background:"rgba(201,168,76,0.2)", border:"1px solid rgba(201,168,76,0.4)", borderRadius:"50%", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#c9a84c", fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                        <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{a}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab==="vocab" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
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

                {activeTab==="tips" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                    {result.examinerTips?.map((tip,i)=>(
                      <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"16px 20px", display:"flex", gap:14, alignItems:"flex-start" }}>
                        <span style={{ background:"rgba(201,168,76,0.15)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:"50%", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#c9a84c", fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                        <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{tip}</p>
                      </div>
                    ))}
                  </div>
                )}

                {activeTab==="sample" && result.sampleEssay && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <div style={{ background:"rgba(0,201,167,0.06)", border:"1px solid rgba(0,201,167,0.2)", borderRadius:12, padding:"18px 22px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                        <div style={{ fontSize:11, color:"#00c9a7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"system-ui" }}>Band 8+ Model Response</div>
                        <div style={{ fontSize:12, fontFamily:"system-ui", fontWeight:600, color:sampleWordCount>=minWords?"#00c9a7":"#ef5350" }}>{sampleWordCount} words {sampleWordCount>=minWords?"✓":"⚠ below minimum"}</div>
                      </div>
                      <p style={{ color:"#dde5f0", fontSize:15, lineHeight:1.9, whiteSpace:"pre-wrap", margin:0, fontFamily:"Georgia,serif" }}>{result.sampleEssay}</p>
                    </div>
                    {result.sampleEssayExplanation && (
                      <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"18px 22px" }}>
                        <div style={{ fontSize:11, color:"#4fc3f7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Why This Scores High</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                          {[["Introduction",result.sampleEssayExplanation.introduction],["Body Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
                            <div key={lbl}><div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>{lbl}</div><p style={{ color:"#b0b8c8", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{txt}</p></div>
                          ))}
                          {result.sampleEssayExplanation.vocabularyHighlights?.length>0 && (
                            <div>
                              <div style={{ fontSize:11, color:"#ffb74d", fontWeight:700, marginBottom:6, fontFamily:"system-ui" }}>Advanced Vocabulary</div>
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                {result.sampleEssayExplanation.vocabularyHighlights.map((v,i)=><span key={i} style={{ background:"rgba(79,195,247,0.1)", border:"1px solid rgba(79,195,247,0.25)", borderRadius:6, padding:"2px 9px", fontSize:12, color:"#4fc3f7", fontFamily:"system-ui" }}>{v}</span>)}
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
        )}

        {/* ── PRACTICE VIEW ── */}
        {mainView === "practice" && (
          <PracticeMode isPro={proUser} onUpgrade={()=>setShowPaywall(true)} setJokerMessage={setJokerMessage} setJokerMood={setJokerMood} />
        )}

        {/* ── TOOLKIT VIEW ── */}
        {mainView === "toolkit" && (
          <ToolkitContent isPro={proUser} onUpgrade={()=>setShowPaywall(true)} />
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideIn { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
      `}</style>
    </div>
  );
}
