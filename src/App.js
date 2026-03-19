import { useState, useRef, useEffect, useCallback } from "react"; 

// ── Config ─────────────────────────────────
const STRIPE_CONFIGURED = false;
const FREE_USES_LIMIT = 2;
const STORAGE_KEY = "bandup_uses";
const API_URL = "/api/analyze";

// ── Theme ───────────────────────────────────
const T = {
  bg: "#f8f9fc",
  bg2: "#ffffff",
  bg3: "#f0f2f7",
  border: "#e2e8f0",
  borderStrong: "#cbd5e1",
  gold: "#b8860b",
  goldLight: "#fef3c7",
  goldBorder: "#fcd34d",
  text: "#1e293b",
  textMid: "#475569",
  textMuted: "#94a3b8",
  green: "#059669",
  greenBg: "#ecfdf5",
  greenBorder: "#6ee7b7",
  blue: "#0284c7",
  blueBg: "#e0f2fe",
  blueBorder: "#7dd3fc",
  red: "#dc2626",
  redBg: "#fef2f2",
  redBorder: "#fca5a5",
  amber: "#d97706",
  amberBg: "#fffbeb",
  amberBorder: "#fcd34d",
  shadow: "0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06)",
  shadowMd: "0 4px 6px rgba(0,0,0,0.07), 0 2px 4px rgba(0,0,0,0.05)",
  shadowLg: "0 10px 25px rgba(0,0,0,0.1)"
};

const TASK_TYPES = {
  task2: { label: "Task 2 — Essay", description: "Academic & General Training", minWords: 250, icon: "✍️" },
  task1academic: { label: "Task 1 — Academic", description: "Graph / Chart / Diagram", minWords: 150, icon: "📊" },
  task1general: { label: "Task 1 — General", description: "Formal / Informal Letter", minWords: 150, icon: "✉️" }
};

// ── Helpers ─────────────────────────────────
const bandColor = (b) => b >= 8 ? T.green : b >= 7 ? T.blue : b >= 6 ? T.amber : b >= 5 ? "#ea580c" : T.red;
const bandBg = (b) => b >= 8 ? T.greenBg : b >= 7 ? T.blueBg : b >= 6 ? T.amberBg : b >= 5 ? "#fff7ed" : T.redBg;
const bandLabel = (b) => b >= 8.5 ? "Expert" : b >= 7.5 ? "Very Good" : b >= 6.5 ? "Competent" : b >= 5.5 ? "Modest" : "Limited";
const severityColor = (s) => s === "major" ? T.red : s === "moderate" ? T.amber : T.blue;
const severityBg = (s) => s === "major" ? T.redBg : s === "moderate" ? T.amberBg : T.blueBg;

// ── Persistent storage ───────────────────────
const getStoredUses = () => { try { return parseInt(localStorage.getItem(STORAGE_KEY) || "0"); } catch { return 0; } };
const saveUses = (n) => { try { localStorage.setItem(STORAGE_KEY, String(n)); } catch {} };
const getStoredPro = () => { try { return localStorage.getItem("bandup_pro") === "true"; } catch { return false; } };
const savePro = () => { try { localStorage.setItem("bandup_pro", "true"); } catch {} };

// ── Joker Lines ──────────────────────────────
const JOKER_LINES = {
  idle: [
    "Why so serious? Start writing! 🃏",
    "An empty page... how delightfully tragic.",
    "The cursor blinks. Your future blinks. Coincidence?",
    "I've seen better writing on Arkham's walls. But no pressure. 🃏",
    "Tick tock. The examiner's patience isn't infinite. Neither is mine."
  ],
  typing: [
    "Ooh, you're actually trying. How adorably ambitious. 🃏",
    "Keep going... I'm watching. EVERY. WORD.",
    "Not bad. For someone who clearly skipped class.",
    "I see potential. Don't ruin it. 🃏",
    "You know what's funny? Your sentence structure. Ha. HA. HAHA!"
  ],
  mistake_grammar: [
    "Subject-verb agreement? Never heard of her? 🃏",
    "Oh, a grammatical disaster. My FAVOURITE kind.",
    "Your grammar called. It's sobbing. 🃏",
    "I used to have a grammar error like that once. I burned it.",
    "The examiner's face reading this... 🃏 *chef's kiss of horror*"
  ],
  mistake_spelling: [
    "That's... not how you spell that. At all. 🃏",
    "Spell-check exists for a REASON, darling.",
    "Autocorrect tried to help you. You rejected it. Tragic. 🃏",
    "I've seen this spelling error so many times it haunts my dreams."
  ],
  wordCount: [
    "Under 250 words? The examiner will LOVE this. Oh wait. 🃏",
    "This isn't a tweet, sweetheart. Keep. Writing.",
    "Short essay. Short band score. Short future. 🃏",
    "You stopped? We were just getting started!"
  ],
  wordGood: [
    "Over 250 words! I'm almost proud. Almost. 🃏",
    "Good length! Now let's hope the quality matches. 🃏",
    "Word count achieved! Half the battle won. The easier half."
  ],
  analyzing: [
    "Calculating the damage... 🃏",
    "Reading this so the examiner doesn't suffer alone...",
    "Preparing my most disappointed face... almost ready... 🃏",
    "Processing... brace yourself."
  ],
  scoreHigh: [
    "Well well well... you CAN write. I'm almost disappointed. 🃏",
    "Band 7+?! I had a whole speech prepared. Ruined. 🃏",
    "Hm. Actually good. Don't tell anyone I said that."
  ],
  scoreMid: [
    "Band 6. The Switzerland of IELTS. Safe. Neutral. Forgettable. 🃏",
    "Could be worse. Could also be MUCH better. Just saying.",
    "Band 6 is like a participation trophy. Nice, but not why you're here. 🃏"
  ],
  scoreLow: [
    "Band 5. You know what that means? More practice. Lots more. 🃏",
    "I've seen worse. Okay I haven't. But I'm being KIND.",
    "Good news: nowhere to go but up! Bad news: you have A LOT of going up to do. 🃏"
  ],
  practice: [
    "Practice mode! Let's see what you've got. I'll be watching. 🃏",
    "Write freely! I'll interrupt with sarcastic wisdom every few seconds!",
    "Time to practice! Remember: I judge everything. Everything. 🃏"
  ]
};

const getJokerLine = (type) => {
  const lines = JOKER_LINES[type] || JOKER_LINES.idle;
  return lines[Math.floor(Math.random() * lines.length)];
};

// ── Practice Questions ───────────────────────
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

// ── System Prompts ───────────────────────────
const getSystemPrompt = (taskType) => `You are an expert IELTS examiner with 20+ years of experience.

${taskType === "task2" ? "Evaluating IELTS Task 2. Under 250 words = Task Achievement MAX Band 5.0." : taskType === "task1academic" ? "Evaluating IELTS Task 1 Academic. Check: overview? key trends? data accuracy? no personal opinion?" : "Evaluating IELTS Task 1 General letter. Check: all bullet points? correct register?"}

SCORING: Band 9=flawless, Band 8=very good minor errors only, Band 7=good some errors rarely impede, Band 6=competent noticeable errors, Band 5=frequent errors limited vocab. Task 1 with clear overview+accurate data+good comparisons = 7.5-8.0 minimum. Do NOT undermark.

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
  "mistakes": [{ "original": "exact phrase from text", "correction": "corrected version", "explanation": "clear explanation", "category": "Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Register", "severity": "minor|moderate|major" }],
  "vocabularyUpgrades": [{ "weak": "exact weak phrase", "advanced": "better alternative", "reason": "why this helps" }],
  "bandBooster": { "currentBand": 7.0, "targetBand": 7.5, "specificActions": ["action 1", "action 2", "action 3"] },
  "examinerTips": ["insider tip 1 specific to this essay", "tip 2", "tip 3"],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "sampleEssay": "Full Band 8+ response. MINIMUM 270 words Task 2 / 185 words Task 1. Count carefully.",
  "sampleEssayExplanation": { "introduction": "...", "bodyParagraphs": "...", "conclusion": "...", "vocabularyHighlights": ["word 1", "word 2"], "whyHighScore": "..." }
}
Find ALL mistakes — spelling, grammar, punctuation, sentence structure, word choice, register. No limit.
Vocabulary: 5-8 weak words from essay with Band 7-8 alternatives.`;

const PRACTICE_SYSTEM = `You are a sharp, witty IELTS writing coach reviewing a student essay in progress. Be sarcastic but helpful. Keep it SHORT.
Respond ONLY with valid JSON (no markdown):
{
  "tips": ["specific actionable tip 1", "tip 2"],
  "quickFix": "The single most important fix right now — be specific and direct",
  "encouragement": "One short sarcastic-but-kind comment",
  "estimatedBand": 6.0,
  "spotError": "Quote one real error from the text and correct it — format: 'X' should be 'Y' — or null"
}`;

// ── Toolkit Data ─────────────────────────────
const TOOLKIT = {
  linkingWords: [
    { category: "Adding Information", color: "#0284c7", words: ["Furthermore", "Moreover", "In addition", "Additionally", "What is more", "Besides this"] },
    { category: "Contrasting", color: "#d97706", words: ["However", "Nevertheless", "Nonetheless", "On the other hand", "In contrast", "Conversely", "Although", "Whereas"] },
    { category: "Cause & Effect", color: "#059669", words: ["Therefore", "Consequently", "As a result", "Hence", "Thus", "For this reason", "This leads to"] },
    { category: "Examples", color: "#b8860b", words: ["For instance", "For example", "To illustrate", "Such as", "A case in point is", "This is exemplified by"] },
    { category: "Conclusion", color: "#7c3aed", words: ["In conclusion", "To conclude", "In summary", "Overall", "All things considered", "Taking everything into account"] },
    { category: "Task 1 Sequencing", color: "#0891b2", words: ["Initially", "Subsequently", "Following this", "Meanwhile", "Over the period shown", "By contrast"] }
  ],
  vocabulary: [
    { topic: "Education", words: [["learn", "acquire knowledge"], ["school", "educational institution"], ["important", "crucial / paramount"], ["students", "learners / pupils"], ["helpful", "beneficial / advantageous"]] },
    { topic: "Crime", words: [["crime", "criminal activity / antisocial behaviour"], ["punish", "penalise / impose sanctions"], ["prison", "incarceration"], ["reduce", "curb / alleviate / diminish"], ["rise", "surge / escalate / proliferate"]] },
    { topic: "Technology", words: [["use", "utilise / harness / leverage"], ["change", "transform / revolutionise"], ["new", "cutting-edge / innovative"], ["problem", "drawback / pitfall"], ["spread", "proliferate / permeate"]] },
    { topic: "Graph Language", words: [["went up", "rose / increased / surged / climbed"], ["went down", "fell / declined / dropped / plummeted"], ["same", "remained stable / plateaued / levelled off"], ["big change", "dramatic / sharp / significant increase"], ["highest", "peaked at / reached a peak of"]] }
  ],
  grammarRules: [
    { rule: "Subject-Verb Agreement", tip: "Collective nouns = singular: 'The government IS...' Uncountable = singular: 'Information IS...'" },
    { rule: "Article Usage (a/an/the)", tip: "Use 'the' for specific things. Use 'a/an' for first mention. Omit with general plurals: 'Children need education' NOT 'The children need the education'." },
    { rule: "Avoid Contractions", tip: "NEVER: don't → do not, can't → cannot, it's → it is. Contractions instantly lower Lexical Resource score." },
    { rule: "Passive Voice for Formality", tip: "'It is widely believed...' / 'It has been argued...' / 'This can be attributed to...' Use for academic formality." },
    { rule: "Uncountable Nouns", tip: "Never add 's' to: advice, information, knowledge, research, evidence, equipment, furniture, traffic, behaviour, progress." }
  ],
  petPeeves: [
    { peeve: "Starting with 'Nowadays'", fix: "Examiners see this in 80% of essays. Use: 'In contemporary society...' / 'In the modern era...' / 'Over recent decades...'" },
    { peeve: "'In my opinion, I think...'", fix: "Redundant. Use ONE: 'I firmly contend that...' / 'It is my view that...' / 'I am convinced that...'" },
    { peeve: "Vague examples: 'in some countries'", fix: "Name the country: 'Finland's education system...' / 'Norway's recidivism rate of 20%...' Specific = higher Task Achievement." },
    { peeve: "One-sentence paragraphs", fix: "Minimum 3 sentences per body paragraph: Topic sentence → Explanation → Example/Result." },
    { peeve: "Copying words from the question", fix: "Paraphrase the introduction. 'reduce crime' → 'address criminal activity'. Direct copying is penalised." }
  ],
  templates: [
    { type: "Task 2 Introduction", template: "In contemporary society, [topic] has become an increasingly [debated/contentious] issue. While some argue that [view 1], others contend that [view 2]. This essay will examine both perspectives before arguing that [your position]." },
    { type: "Body Paragraph", template: "[Topic sentence]. This is because [explanation]. For instance, [specific example with data/country]. Consequently, [result/implication]." },
    { type: "Concession + Rebuttal", template: "Admittedly, [opposing view]. However, [counter-argument]. While [opponent's point] may hold some merit, the evidence overwhelmingly suggests that [your point]." },
    { type: "Task 2 Conclusion", template: "In conclusion, while [opposing view] has some validity, I firmly maintain that [your position] is the more effective approach. Governments and individuals must [action] in order to [outcome]." },
    { type: "Task 1 Overview", template: "Overall, it is clear that [main trend 1], while [main trend 2]. [Category] experienced the most significant [change], whereas [other] remained comparatively [stable/low]." }
  ]
};

// ── THE JOKER SVG ────────────────────────────
const Joker = ({ message, mood }) => {
  const [visible, setVisible] = useState(true);
  const [wiggle, setWiggle] = useState(false);

  useEffect(() => {
    setWiggle(true);
    const t = setTimeout(() => setWiggle(false), 400);
    return () => clearTimeout(t);
  }, [message]);

  return (
    <div style={{ position:"fixed", top:70, left:12, zIndex:500, display:"flex", flexDirection:"column", alignItems:"flex-start", gap:6, maxWidth:200 }}>
      {/* Joker SVG */}
      <div onClick={() => setVisible(v => !v)} style={{ cursor:"pointer", transform:wiggle?"rotate(-8deg)":"rotate(0deg)", transition:"transform 0.2s ease", filter:"drop-shadow(2px 4px 8px rgba(0,0,0,0.25))" }}>
        <svg width="80" height="110" viewBox="0 0 80 110" xmlns="http://www.w3.org/2000/svg">
          {/* Purple top hat */}
          <rect x="12" y="4" width="56" height="5" rx="2" fill="#4a0080"/>
          <rect x="18" y="8" width="44" height="26" rx="4" fill="#5c0099"/>
          <rect x="14" y="33" width="52" height="4" rx="2" fill="#4a0080"/>
          {/* Hat band */}
          <rect x="18" y="30" width="44" height="5" rx="1" fill="#2d004d"/>
          {/* Green hair sides */}
          <ellipse cx="15" cy="50" rx="8" ry="14" fill="#1a7a1a"/>
          <ellipse cx="65" cy="50" rx="8" ry="14" fill="#1a7a1a"/>
          <rect x="10" y="38" width="12" height="20" rx="6" fill="#228b22"/>
          <rect x="58" y="38" width="12" height="20" rx="6" fill="#228b22"/>
          {/* White face */}
          <ellipse cx="40" cy="68" rx="28" ry="34" fill="#f5f0e0"/>
          {/* Face shadow/depth */}
          <ellipse cx="40" cy="70" rx="26" ry="30" fill="#ede8d5" opacity="0.3"/>
          {/* Dark eye makeup */}
          <ellipse cx="28" cy="60" rx="10" ry="7" fill="#1a0a2e" opacity="0.8"/>
          <ellipse cx="52" cy="60" rx="10" ry="7" fill="#1a0a2e" opacity="0.8"/>
          {/* Eyes */}
          <ellipse cx="28" cy="60" rx="7" ry="6" fill="white"/>
          <ellipse cx="52" cy="60" rx="7" ry="6" fill="white"/>
          <ellipse cx="29" cy="61" rx="4" ry="4" fill="#1a0a2e"/>
          <ellipse cx="53" cy="61" rx="4" ry="4" fill="#1a0a2e"/>
          <ellipse cx="30" cy="59" rx="1.5" ry="1.5" fill="white"/>
          <ellipse cx="54" cy="59" rx="1.5" ry="1.5" fill="white"/>
          {/* Arched menacing eyebrows */}
          <path d="M18 52 Q28 46 36 52" stroke="#2d5a1b" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          <path d="M44 52 Q52 46 62 52" stroke="#2d5a1b" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
          {/* Scar lines on cheeks */}
          <path d="M12 64 Q16 60 18 65" stroke="#cc2200" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          <path d="M62 64 Q66 60 68 65" stroke="#cc2200" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
          {/* Red triangles on cheeks (classic Joker face paint) */}
          <polygon points="14,70 20,65 20,75" fill="#cc0000" opacity="0.7"/>
          <polygon points="66,70 60,65 60,75" fill="#cc0000" opacity="0.7"/>
          {/* Red nose */}
          <ellipse cx="40" cy="72" rx="3" ry="2.5" fill="#cc0000"/>
          {/* Big red Glasgow grin */}
          <path d="M16 80 Q28 100 40 102 Q52 100 64 80" stroke="#cc0000" strokeWidth="3" fill="none" strokeLinecap="round"/>
          {/* Mouth fill */}
          <path d="M16 80 Q28 96 40 98 Q52 96 64 80 Q52 86 40 88 Q28 86 16 80 Z" fill="#8b0000" opacity="0.6"/>
          {/* Teeth */}
          <path d="M24 82 Q40 90 56 82 Q40 87 24 82 Z" fill="white" opacity="0.9"/>
          {/* Purple collar */}
          <path d="M12 100 Q24 95 40 97 Q56 95 68 100 L68 110 L12 110 Z" fill="#4a0080"/>
          <path d="M32 97 L40 106 L48 97 L40 102 Z" fill="#6600b3"/>
          {/* Bow tie */}
          <polygon points="34,98 40,103 46,98 40,96" fill="#cc0000"/>
        </svg>
      </div>

      {/* Speech bubble */}
      {visible && message && (
        <div style={{
          background:"#1a0a2e",
          border:"1px solid #6600b3",
          borderRadius:12,
          padding:"10px 14px",
          position:"relative",
          boxShadow:"0 4px 16px rgba(102,0,179,0.3)",
          maxWidth:190,
          animation:"jokerPop 0.3s cubic-bezier(0.34,1.56,0.64,1)"
        }}>
          <div style={{ position:"absolute", top:10, left:-7, width:0, height:0, borderTop:"6px solid transparent", borderBottom:"6px solid transparent", borderRight:"7px solid #1a0a2e" }}/>
          <p style={{ color:"#e8d5ff", fontSize:11.5, margin:0, lineHeight:1.5, fontFamily:"system-ui", fontStyle:"italic" }}>{message}</p>
        </div>
      )}
    </div>
  );
};

// ── Components ────────────────────────────────
const Card = ({ children, style }) => (
  <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:12, padding:"16px 20px", boxShadow:T.shadow, ...style }}>
    {children}
  </div>
);

const CriteriaCard = ({ label, data }) => (
  <Card>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
      <span style={{ color:T.textMid, fontSize:12, fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", fontFamily:"system-ui" }}>{label}</span>
      <span style={{ background:bandBg(data.band), color:bandColor(data.band), fontWeight:800, fontSize:14, borderRadius:8, padding:"3px 12px", border:`1px solid ${bandColor(data.band)}40` }}>{data.band}</span>
    </div>
    <p style={{ color:T.textMid, fontSize:14, lineHeight:1.65, margin:0, fontFamily:"system-ui" }}>{data.feedback}</p>
  </Card>
);

const MistakeCard = ({ mistake, i }) => (
  <div style={{ background:severityBg(mistake.severity), border:`1px solid ${severityColor(mistake.severity)}40`, borderLeft:`3px solid ${severityColor(mistake.severity)}`, borderRadius:10, padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", gap:6, alignItems:"center", flexWrap:"wrap" }}>
      <span style={{ fontSize:11, fontWeight:700, color:T.textMuted, fontFamily:"system-ui" }}>#{i+1}</span>
      <span style={{ background:"white", border:`1px solid ${severityColor(mistake.severity)}60`, borderRadius:20, padding:"1px 8px", fontSize:11, color:severityColor(mistake.severity), fontFamily:"system-ui", fontWeight:700 }}>{mistake.severity}</span>
      <span style={{ background:"white", border:`1px solid ${T.blueBorder}`, borderRadius:20, padding:"1px 8px", fontSize:11, color:T.blue, fontFamily:"system-ui" }}>{mistake.category}</span>
    </div>
    <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:130 }}>
        <div style={{ fontSize:10, color:T.textMuted, marginBottom:3, fontFamily:"system-ui", fontWeight:600 }}>ORIGINAL</div>
        <div style={{ background:"#fee2e2", borderRadius:6, padding:"5px 10px", color:"#991b1b", fontSize:13, fontStyle:"italic" }}>"{mistake.original}"</div>
      </div>
      <div style={{ fontSize:16, color:T.textMuted, alignSelf:"center" }}>→</div>
      <div style={{ flex:1, minWidth:130 }}>
        <div style={{ fontSize:10, color:T.textMuted, marginBottom:3, fontFamily:"system-ui", fontWeight:600 }}>CORRECTION</div>
        <div style={{ background:"#dcfce7", borderRadius:6, padding:"5px 10px", color:"#166534", fontSize:13 }}>"{mistake.correction}"</div>
      </div>
    </div>
    <p style={{ color:T.textMid, fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {mistake.explanation}</p>
  </div>
);

const TabBtn = ({ label, active, onClick, badge }) => (
  <button onClick={onClick} style={{ background:active?"#eff6ff":"transparent", border:active?`1px solid ${T.blueBorder}`:"1px solid transparent", color:active?T.blue:T.textMuted, borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"system-ui", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap", transition:"all 0.15s" }}>
    {label}{badge > 0 && <span style={{ background:T.red, color:"white", borderRadius:20, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{badge}</span>}
  </button>
);

const MainTab = ({ label, active, onClick }) => (
  <button onClick={onClick} style={{ flex:1, background:active?T.gold:"transparent", border:active?`1px solid ${T.gold}`:`1px solid ${T.border}`, color:active?"white":T.textMid, borderRadius:10, padding:"11px 8px", cursor:"pointer", fontSize:13, fontWeight:700, fontFamily:"system-ui", transition:"all 0.2s", boxShadow:active?T.shadowMd:"none" }}>
    {label}
  </button>
);

// ── Paywall ───────────────────────────────────
const PaywallModal = ({ onClose, onSuccess }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", backdropFilter:"blur(6px)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
    <div style={{ background:T.bg2, border:`1px solid ${T.border}`, borderRadius:20, padding:"40px 32px", maxWidth:440, width:"100%", position:"relative", boxShadow:T.shadowLg }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:T.textMuted, fontSize:22, cursor:"pointer" }}>✕</button>
      <div style={{ textAlign:"center", marginBottom:24 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🃏</div>
        <div style={{ display:"inline-block", background:T.goldLight, border:`1px solid ${T.goldBorder}`, borderRadius:100, padding:"5px 16px", fontSize:11, color:T.gold, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Free analyses used up</div>
        <h2 style={{ fontFamily:"Georgia,serif", color:T.text, fontSize:24, marginBottom:8 }}>Unlock Unlimited Access</h2>
        <p style={{ color:T.textMid, fontSize:14, lineHeight:1.6, fontFamily:"system-ui" }}>Full IELTS Writing coverage — Task 1 & 2, Academic & General Training.</p>
      </div>
      <div style={{ background:T.goldLight, border:`1px solid ${T.goldBorder}`, borderRadius:12, padding:"16px", marginBottom:20, textAlign:"center" }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:48, fontWeight:900, color:T.text, lineHeight:1 }}>
          <sup style={{ fontSize:20, verticalAlign:"super" }}>$</sup>19<sub style={{ fontSize:14, color:T.textMuted }}>/month</sub>
        </div>
        <div style={{ color:T.textMuted, fontSize:12, marginTop:4, fontFamily:"system-ui" }}>Cancel anytime · No hidden fees</div>
      </div>
      <ul style={{ listStyle:"none", padding:0, display:"flex", flexDirection:"column", gap:8, marginBottom:22 }}>
        {["Unlimited analyses — Task 1 & 2, Academic & General","Complete mistake detection (all categories & severities)","Band Booster + Vocabulary upgrades from YOUR essay","Full IELTS Toolkit (Grammar Rules, Templates, Pet Peeves)","Practice Mode with live AI coaching feedback","Graph image upload for Task 1 Academic","Unlimited Band 8+ model responses"].map((f,i) => (
          <li key={i} style={{ display:"flex", gap:10, fontSize:13, color:T.textMid, fontFamily:"system-ui" }}>
            <span style={{ color:T.green, fontWeight:700, flexShrink:0 }}>✓</span>{f}
          </li>
        ))}
      </ul>
      <button onClick={() => { savePro(); onSuccess(); }}
        style={{ width:"100%", background:T.gold, color:"white", fontWeight:800, fontSize:15, padding:"15px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"system-ui", boxShadow:T.shadowMd }}>
        🔓 {STRIPE_CONFIGURED ? "Start Pro — $19/month" : "Unlock Pro (Test Mode)"}
      </button>
      {!STRIPE_CONFIGURED && <p style={{ textAlign:"center", color:T.textMuted, fontSize:11, marginTop:10, fontFamily:"system-ui" }}>Add Stripe keys to enable real payments.</p>}
    </div>
  </div>
);

// ── Toolkit ───────────────────────────────────
const ToolkitContent = ({ isPro, onUpgrade }) => {
  const [section, setSection] = useState("linking");
  const sections = [
    { key:"linking", label:"🔗 Linking Words", free:true },
    { key:"vocab", label:"📚 Vocabulary", free:false },
    { key:"grammar", label:"📐 Grammar", free:false },
    { key:"peeves", label:"⚠️ Pet Peeves", free:false },
    { key:"templates", label:"📝 Templates", free:false }
  ];

  const LockedSection = () => (
    <div style={{ position:"relative" }}>
      <div style={{ filter:"blur(3px)", pointerEvents:"none", userSelect:"none" }}>
        {[1,2,3].map(i => (
          <Card key={i} style={{ marginBottom:8 }}>
            <div style={{ height:16, background:T.bg3, borderRadius:4, marginBottom:8, width:"60%" }}/>
            <div style={{ height:12, background:T.bg3, borderRadius:4, width:"90%" }}/>
          </Card>
        ))}
      </div>
      <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
        <div style={{ fontSize:36 }}>🔒</div>
        <div style={{ textAlign:"center" }}>
          <div style={{ color:T.text, fontWeight:700, fontSize:15, fontFamily:"system-ui", marginBottom:4 }}>Pro Feature</div>
          <div style={{ color:T.textMid, fontSize:13, fontFamily:"system-ui", marginBottom:14 }}>Upgrade to unlock this section</div>
          <button onClick={onUpgrade} style={{ background:T.gold, color:"white", fontWeight:700, fontSize:13, padding:"9px 20px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"system-ui" }}>
            Upgrade to Pro — $19/mo
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <Card style={{ marginBottom:16, background:T.goldLight, border:`1px solid ${T.goldBorder}` }}>
        <p style={{ color:T.gold, fontSize:13, margin:0, fontFamily:"system-ui" }}>🎓 Your personal IELTS reference guide — use these in every essay to boost your band score. {!isPro && <span style={{ color:T.textMid }}>Linking Words are free. Upgrade for full access.</span>}</p>
      </Card>
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{ background:section===s.key?T.gold:"white", border:section===s.key?`1px solid ${T.gold}`:`1px solid ${T.border}`, color:section===s.key?"white":T.textMid, borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"system-ui", display:"flex", alignItems:"center", gap:5 }}>
            {s.label}{!s.free && !isPro && <span style={{ fontSize:10 }}>🔒</span>}
          </button>
        ))}
      </div>

      {section === "linking" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.linkingWords.map((cat, i) => (
            <Card key={i}>
              <div style={{ fontSize:11, fontWeight:700, color:cat.color, marginBottom:10, fontFamily:"system-ui", textTransform:"uppercase", letterSpacing:"0.06em" }}>{cat.category}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {cat.words.map((w, j) => (
                  <span key={j} style={{ background:`${cat.color}12`, border:`1px solid ${cat.color}40`, borderRadius:8, padding:"4px 12px", fontSize:13, color:cat.color, fontFamily:"system-ui" }}>{w}</span>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {section === "vocab" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.vocabulary.map((topic, i) => (
            <Card key={i}>
              <div style={{ fontSize:11, fontWeight:700, color:T.gold, marginBottom:10, fontFamily:"system-ui", textTransform:"uppercase" }}>{topic.topic}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {topic.words.map((pair, j) => (
                  <div key={j} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ background:"#fee2e2", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#991b1b", fontFamily:"system-ui" }}>✗ {pair[0]}</span>
                    <span style={{ color:T.textMuted }}>→</span>
                    <span style={{ background:"#dcfce7", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#166534", fontFamily:"system-ui" }}>✓ {pair[1]}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      ) : <LockedSection />)}

      {section === "grammar" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.grammarRules.map((item, i) => (
            <Card key={i} style={{ border:`1px solid ${T.blueBorder}`, background:T.blueBg }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.blue, marginBottom:6, fontFamily:"system-ui" }}>📐 {item.rule}</div>
              <p style={{ color:T.textMid, fontSize:13, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{item.tip}</p>
            </Card>
          ))}
        </div>
      ) : <LockedSection />)}

      {section === "peeves" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.petPeeves.map((item, i) => (
            <Card key={i} style={{ border:`1px solid ${T.redBorder}`, background:T.redBg }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.red, marginBottom:6, fontFamily:"system-ui" }}>⚠️ {item.peeve}</div>
              <p style={{ color:T.textMid, fontSize:13, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>✅ {item.fix}</p>
            </Card>
          ))}
        </div>
      ) : <LockedSection />)}

      {section === "templates" && (isPro ? (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.templates.map((item, i) => (
            <Card key={i} style={{ border:`1px solid ${T.amberBorder}`, background:T.amberBg }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.amber, marginBottom:8, fontFamily:"system-ui", textTransform:"uppercase" }}>📝 {item.type}</div>
              <p style={{ color:T.text, fontSize:13, lineHeight:1.8, margin:0, fontFamily:"Georgia,serif", fontStyle:"italic", background:"white", padding:"10px 14px", borderRadius:8, whiteSpace:"pre-wrap", border:`1px solid ${T.amberBorder}` }}>{item.template}</p>
            </Card>
          ))}
        </div>
      ) : <LockedSection />)}
    </div>
  );
};

// ── Practice Mode ─────────────────────────────
const PracticeMode = ({ isPro, onUpgrade, setJokerMessage, setJokerMood }) => {
  const [questionMode, setQuestionMode] = useState("choose");
  const [selectedTopic, setSelectedTopic] = useState("Education");
  const [selectedQuestion, setSelectedQuestion] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [practiceEssay, setPracticeEssay] = useState("");
  const [liveFeedback, setLiveFeedback] = useState(null);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [started, setStarted] = useState(false);
  const timerRef = useRef(null);
  const wordCount = practiceEssay.trim().split(/\s+/).filter(Boolean).length;
  const question = selectedQuestion || customQuestion;

  const fetchLiveFeedback = useCallback(async (text) => {
    if (text.trim().split(/\s+/).length < 25) return;
    if (!isPro && getStoredUses() >= FREE_USES_LIMIT) { onUpgrade(); return; }
    setLoadingFeedback(true);
    try {
      const res = await fetch(API_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:600, system:PRACTICE_SYSTEM, messages:[{ role:"user", content:`Question: "${question}"\n\nEssay so far:\n${text}\n\nGive quick sarcastic coaching feedback as JSON.` }] })
      });
      const data = await res.json();
      const raw = data.content?.map(b => b.text||"").join("") || "";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setLiveFeedback(parsed);
if (!isPro) { const n = getStoredUses() + 1; saveUses(n); }
      if (parsed.spotError) { setJokerMessage(getJokerLine("mistake_grammar")); }
      else if (parsed.estimatedBand >= 7) { setJokerMessage(getJokerLine("scoreHigh")); }
      else { setJokerMessage(getJokerLine("typing")); }
    } catch(e) { console.error(e); }
    finally { setLoadingFeedback(false); }
  }, [question, setJokerMessage]);

  const handleEssayChange = (e) => {
    const val = e.target.value;
    setPracticeEssay(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchLiveFeedback(val), 1500);
  };

  return (
    <div>
      <Card style={{ marginBottom:20, background:T.blueBg, border:`1px solid ${T.blueBorder}` }}>
        <p style={{ color:T.blue, fontSize:13, margin:0, fontFamily:"system-ui" }}>🎯 <strong>Practice Mode</strong> — Write freely and get live AI coaching every ~1.5 seconds as you pause. No final score — just real-time improvement tips from your friendly neighbourhood Joker. 🃏</p>
      </Card>

      {!started ? (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div style={{ display:"flex", gap:8 }}>
            {[["choose","📋 Choose a Question"],["custom","✏️ Write My Own"]].map(([mode, label]) => (
              <button key={mode} onClick={()=>setQuestionMode(mode)} style={{ flex:1, background:questionMode===mode?T.gold:"white", border:questionMode===mode?`1px solid ${T.gold}`:`1px solid ${T.border}`, borderRadius:10, padding:"10px", cursor:"pointer", color:questionMode===mode?"white":T.textMid, fontSize:13, fontWeight:600, fontFamily:"system-ui" }}>{label}</button>
            ))}
          </div>

          {questionMode === "choose" && (
            <div>
              <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:12 }}>
                {Object.keys(PRACTICE_QUESTIONS).map(topic => (
                  <button key={topic} onClick={()=>{ setSelectedTopic(topic); setSelectedQuestion(""); }}
                    style={{ background:selectedTopic===topic?T.gold:"white", border:selectedTopic===topic?`1px solid ${T.gold}`:`1px solid ${T.border}`, borderRadius:8, padding:"6px 14px", cursor:"pointer", color:selectedTopic===topic?"white":T.textMid, fontSize:12, fontWeight:600, fontFamily:"system-ui" }}>{topic}</button>
                ))}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {PRACTICE_QUESTIONS[selectedTopic].map((q, i) => (
                  <div key={i} onClick={()=>setSelectedQuestion(q)}
                    style={{ background:selectedQuestion===q?T.blueBg:"white", border:selectedQuestion===q?`1px solid ${T.blueBorder}`:`1px solid ${T.border}`, borderRadius:10, padding:"12px 16px", cursor:"pointer", color:selectedQuestion===q?T.blue:T.textMid, fontSize:13, fontFamily:"system-ui", lineHeight:1.6, transition:"all 0.15s", boxShadow:selectedQuestion===q?T.shadowMd:T.shadow }}>
                    {i+1}. {q}
                  </div>
                ))}
              </div>
            </div>
          )}

          {questionMode === "custom" && (
            <div>
              <label style={{ display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, fontFamily:"system-ui", fontWeight:600 }}>Your Question</label>
              <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} rows={3}
                placeholder="Paste or type your own IELTS question here..."
                style={{ width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box", boxShadow:T.shadow }}
              />
            </div>
          )}

          <button onClick={() => { if (question) { setStarted(true); setJokerMessage(getJokerLine("practice")); } }}
            disabled={!question}
            style={{ background:question?T.gold:"#e2e8f0", border:"none", borderRadius:10, color:question?"white":T.textMuted, fontSize:15, fontWeight:800, padding:"15px", cursor:question?"pointer":"not-allowed", fontFamily:"system-ui", boxShadow:question?T.shadowMd:"none" }}>
            {question ? "🖊️ Start Practice Session" : "Select a question to begin"}
          </button>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <Card style={{ background:T.blueBg, border:`1px solid ${T.blueBorder}` }}>
            <div style={{ fontSize:11, color:T.blue, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6, fontFamily:"system-ui" }}>Your Question</div>
            <p style={{ color:T.text, fontSize:14, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>{question}</p>
          </Card>

          <div style={{ display:"flex", gap:16, alignItems:"flex-start", flexWrap:"wrap" }}>
            <div style={{ flex:2, minWidth:280 }}>
              <label style={{ display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7, fontFamily:"system-ui", fontWeight:600 }}>
                Your Essay
                <span style={{ color:wordCount>=250?T.green:wordCount>=150?T.amber:T.red, marginLeft:10, fontWeight:400 }}>
                  {wordCount} words {wordCount>=250?"✓":wordCount>=150?"(keep going!)":"(too short)"}
                </span>
              </label>
              <textarea value={practiceEssay} onChange={handleEssayChange} rows={14}
                placeholder="Start writing here... I'll give you live feedback every second or so!"
                style={{ width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.8, outline:"none", boxSizing:"border-box", boxShadow:T.shadow }}
              />
              <button onClick={() => { setStarted(false); setPracticeEssay(""); setLiveFeedback(null); setSelectedQuestion(""); setCustomQuestion(""); }}
                style={{ marginTop:8, background:"transparent", border:`1px solid ${T.border}`, borderRadius:8, color:T.textMid, fontSize:12, padding:"6px 14px", cursor:"pointer", fontFamily:"system-ui" }}>
                ← Change Question
              </button>
            </div>

            {/* Live feedback */}
            <div style={{ flex:1, minWidth:220, display:"flex", flexDirection:"column", gap:10 }}>
              <div style={{ fontSize:11, color:T.textMid, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"system-ui" }}>
                {loadingFeedback ? "🔍 Analysing..." : "💬 Live Coaching"}
              </div>

              {loadingFeedback && (
                <Card style={{ textAlign:"center", background:T.blueBg, border:`1px solid ${T.blueBorder}` }}>
                  <div style={{ color:T.blue, fontSize:13, fontFamily:"system-ui" }}>Reading your essay... 🎓</div>
                </Card>
              )}

              {liveFeedback && !loadingFeedback && (
                <>
                  <Card style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ fontSize:36, fontWeight:900, color:bandColor(liveFeedback.estimatedBand), fontFamily:"Georgia,serif", lineHeight:1 }}>{liveFeedback.estimatedBand}</div>
                    <div>
                      <div style={{ fontSize:10, color:T.textMuted, fontFamily:"system-ui", textTransform:"uppercase", letterSpacing:"0.08em" }}>Estimated Band</div>
                      <div style={{ fontSize:13, color:bandColor(liveFeedback.estimatedBand), fontFamily:"system-ui", fontWeight:700 }}>{bandLabel(liveFeedback.estimatedBand)}</div>
                    </div>
                  </Card>
                  {liveFeedback.quickFix && (
                    <Card style={{ background:T.redBg, border:`1px solid ${T.redBorder}` }}>
                      <div style={{ fontSize:11, color:T.red, fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>🚨 QUICK FIX</div>
                      <p style={{ color:"#991b1b", fontSize:13, margin:0, lineHeight:1.5, fontFamily:"system-ui" }}>{liveFeedback.quickFix}</p>
                    </Card>
                  )}
                  {liveFeedback.spotError && (
                    <Card style={{ background:T.amberBg, border:`1px solid ${T.amberBorder}` }}>
                      <div style={{ fontSize:11, color:T.amber, fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>✏️ SPOT ERROR</div>
                      <p style={{ color:"#92400e", fontSize:13, margin:0, lineHeight:1.5, fontFamily:"system-ui" }}>{liveFeedback.spotError}</p>
                    </Card>
                  )}
                  <Card style={{ background:T.blueBg, border:`1px solid ${T.blueBorder}` }}>
                    <div style={{ fontSize:11, color:T.blue, fontWeight:700, marginBottom:8, fontFamily:"system-ui" }}>💡 TIPS</div>
                    {liveFeedback.tips?.map((tip, i) => (
                      <div key={i} style={{ color:T.textMid, fontSize:13, lineHeight:1.5, marginBottom:5, fontFamily:"system-ui" }}>• {tip}</div>
                    ))}
                  </Card>
                  {liveFeedback.encouragement && (
                    <Card style={{ background:T.goldLight, border:`1px solid ${T.goldBorder}` }}>
                      <p style={{ color:T.gold, fontSize:12, margin:0, fontStyle:"italic", fontFamily:"system-ui" }}>🃏 {liveFeedback.encouragement}</p>
                    </Card>
                  )}
                </>
              )}

              {!liveFeedback && !loadingFeedback && (
                <Card style={{ textAlign:"center", padding:"24px 16px" }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🖊️</div>
                  <p style={{ color:T.textMuted, fontSize:13, margin:0, fontFamily:"system-ui" }}>Start writing — feedback appears after a short pause!</p>
                </Card>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── MAIN APP ──────────────────────────────────
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

  useEffect(() => {
    if (wordCount > 20 && wordCount < minWords) { setJokerMessage(getJokerLine("wordCount")); }
    else if (wordCount >= minWords) { setJokerMessage(getJokerLine("wordGood")); }
  }, [wordCount, minWords]);

  const handleProSuccess = () => { savePro(); setProUser(true); setShowPaywall(false); setJokerMessage("A paying customer! I'm... almost impressed. 🃏 Unlimited access unlocked!"); };

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

      if (!proUser) { const n = uses+1; setUses(n); saveUses(n); }
      setResult(parsed); setActiveTab("scores");

      if (parsed.overallBand >= 7.5) { setJokerMessage(getJokerLine("scoreHigh")); }
      else if (parsed.overallBand >= 6) { setJokerMessage(getJokerLine("scoreMid")); }
      else { setJokerMessage(getJokerLine("scoreLow")); }
    } catch(e) {
      setError("Something went wrong. Please try again.");
      setJokerMessage("Something broke. Even I'm surprised. 🃏");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:T.bg, color:T.text, paddingBottom:60 }}>
      {showPaywall && <PaywallModal onClose={()=>setShowPaywall(false)} onSuccess={handleProSuccess} />}
      <Joker message={jokerMessage} mood={jokerMood} />

      {/* Header */}
      <div style={{ background:T.bg2, borderBottom:`1px solid ${T.border}`, padding:"24px 24px 20px", textAlign:"center", boxShadow:T.shadow }}>
        <div style={{ fontSize:10, letterSpacing:"0.3em", color:T.gold, fontFamily:"monospace", marginBottom:8, textTransform:"uppercase", fontWeight:700 }}>AI-Powered · IELTS Writing</div>
        <h1 style={{ margin:0, fontSize:"clamp(24px,5vw,40px)", fontWeight:900, fontFamily:"Georgia,serif", color:T.text }}>
          BandUp <span style={{ color:T.gold }}>AI</span>
        </h1>
        <p style={{ color:T.textMuted, fontSize:13, fontFamily:"system-ui", margin:"6px auto 0", maxWidth:500 }}>
          Task 1 & 2 · Complete mistake detection · Practice Mode · Live Feedback · IELTS Toolkit
        </p>
        <div style={{ marginTop:12, display:"inline-flex", background:proUser?T.greenBg:usesLeft<=0?T.redBg:T.goldLight, border:`1px solid ${proUser?T.greenBorder:usesLeft<=0?T.redBorder:T.goldBorder}`, borderRadius:100, padding:"4px 16px", fontSize:13, fontFamily:"system-ui", color:proUser?T.green:usesLeft<=0?T.red:T.gold, fontWeight:600 }}>
          {proUser ? "✓ Pro — Unlimited Access" : usesLeft > 0 ? `${usesLeft} free ${usesLeft===1?"analysis":"analyses"} remaining` : "Free limit reached — upgrade to continue"}
        </div>
      </div>

      <div style={{ maxWidth:880, margin:"0 auto", padding:"24px 16px 0", paddingLeft:110 }}>
        {/* Main Nav */}
        <div style={{ display:"flex", gap:8, marginBottom:24 }}>
          <MainTab label="🎓 Analyze Essay" active={mainView==="analyze"} onClick={()=>setMainView("analyze")} />
          <MainTab label="🖊️ Practice Mode" active={mainView==="practice"} onClick={()=>{ setMainView("practice"); setJokerMessage(getJokerLine("practice")); }} />
          <MainTab label="📚 IELTS Toolkit" active={mainView==="toolkit"} onClick={()=>setMainView("toolkit")} />
        </div>

        {/* ── ANALYZE ── */}
        {mainView === "analyze" && (
          <div>
            {/* Task selector */}
            <div style={{ marginBottom:20 }}>
              <label style={{ display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10, fontFamily:"system-ui", fontWeight:600 }}>Select Task Type</label>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
                {Object.entries(TASK_TYPES).map(([key, task]) => (
                  <button key={key} onClick={() => { setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); }}
                    style={{ background:taskType===key?T.goldLight:"white", border:taskType===key?`1px solid ${T.gold}`:`1px solid ${T.border}`, borderRadius:12, padding:"14px 10px", cursor:"pointer", textAlign:"center", boxShadow:taskType===key?T.shadowMd:T.shadow, transition:"all 0.15s" }}>
                    <div style={{ fontSize:22, marginBottom:6 }}>{task.icon}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:taskType===key?T.gold:T.text, fontFamily:"system-ui", marginBottom:2 }}>{task.label}</div>
                    <div style={{ fontSize:11, color:T.textMuted, fontFamily:"system-ui" }}>{task.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Image upload */}
            {taskType === "task1academic" && (
              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, fontFamily:"system-ui", fontWeight:600 }}>Upload Graph / Chart Image *</label>
                <div onClick={() => fileRef.current.click()}
                  style={{ border:`2px dashed ${imagePreview?T.greenBorder:T.goldBorder}`, borderRadius:12, padding:"20px", textAlign:"center", cursor:"pointer", background:"white", boxShadow:T.shadow }}>
                  {imagePreview ? (
                    <div><img src={imagePreview} alt="graph" style={{ maxHeight:180, maxWidth:"100%", borderRadius:8, marginBottom:8 }} /><div style={{ fontSize:12, color:T.green, fontFamily:"system-ui" }}>✓ Uploaded — click to change</div></div>
                  ) : (
                    <div><div style={{ fontSize:32, marginBottom:8 }}>📊</div><div style={{ fontSize:14, color:T.gold, fontFamily:"system-ui", marginBottom:4 }}>Click to upload graph/chart image</div><div style={{ fontSize:12, color:T.textMuted, fontFamily:"system-ui" }}>JPG, PNG — AI reads and evaluates the graph</div></div>
                  )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div>
                <label style={{ display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7, fontFamily:"system-ui", fontWeight:600 }}>
                  {taskType==="task1general"?"Letter Task Instructions":taskType==="task1academic"?"Task Description":"Essay Question / Topic"}
                </label>
                <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
                  placeholder={taskType==="task2"?"e.g. Some people think universities should focus on job skills. Others believe universities should provide knowledge for its own sake. Discuss both views and give your opinion.":taskType==="task1academic"?"e.g. The graph below shows changes in energy consumption in the US between 1980 and 2020. Summarise the information by selecting and reporting the main features.":"e.g. You recently bought a laptop online but it arrived damaged. Write a letter to the manager explaining what happened and what you want them to do."}
                  style={{ width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box", boxShadow:T.shadow }}
                />
              </div>

              <div>
                <label style={{ display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7, fontFamily:"system-ui", fontWeight:600 }}>
                  Student's Response
                  <span style={{ color:wordCount>=minWords?T.green:wordCount>=(minWords*0.6)?T.amber:T.red, marginLeft:10, fontWeight:500 }}>
                    {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords} required${wordCount<minWords&&wordCount>10?" — penalty applies":""})`}
                  </span>
                </label>
                <textarea value={essay}
                  onChange={e=>{ setEssay(e.target.value); if(e.target.value.length>20) setJokerMessage(getJokerLine("typing")); }}
                  placeholder={taskType==="task1general"?"Dear Sir/Madam,\n\nI am writing to...":taskType==="task1academic"?"The graph illustrates...":"Paste the student's essay here..."}
                  rows={10}
                  style={{ width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.8, outline:"none", boxSizing:"border-box", boxShadow:T.shadow }}
                />
              </div>

              {error && <Card style={{ background:T.redBg, border:`1px solid ${T.redBorder}` }}><p style={{ color:T.red, fontSize:14, margin:0, fontFamily:"system-ui" }}>{error}</p></Card>}

              {!proUser && usesLeft===1 && (
                <Card style={{ background:T.amberBg, border:`1px solid ${T.amberBorder}`, textAlign:"center" }}>
                  <span style={{ color:T.amber, fontSize:13, fontFamily:"system-ui" }}>⚠️ Last free analysis! </span>
                  <button onClick={()=>setShowPaywall(true)} style={{ background:"none", border:"none", color:T.gold, fontWeight:700, cursor:"pointer", textDecoration:"underline", fontSize:13, fontFamily:"system-ui" }}>Upgrade to Pro</button>
                  <span style={{ color:T.amber, fontSize:13, fontFamily:"system-ui" }}> for unlimited access.</span>
                </Card>
              )}

              <button onClick={analyze} disabled={loading}
                style={{ background:loading?"#e2e8f0":T.gold, border:"none", borderRadius:10, color:loading?T.textMuted:"white", fontSize:15, fontWeight:800, padding:"15px 28px", cursor:loading?"not-allowed":"pointer", fontFamily:"system-ui", boxShadow:loading?"none":T.shadowMd, transition:"all 0.2s" }}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?"🔓 Upgrade to Continue":`🎓 Analyze ${TASK_TYPES[taskType].label}`}
              </button>
            </div>

            {/* Results */}
            {result && (
              <div style={{ marginTop:32 }}>
                {/* Score banner */}
                <Card style={{ display:"flex", alignItems:"center", gap:24, marginBottom:20, flexWrap:"wrap", background:bandBg(result.overallBand), border:`1px solid ${bandColor(result.overallBand)}30` }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:60, fontWeight:900, color:bandColor(result.overallBand), lineHeight:1, fontFamily:"Georgia,serif" }}>{result.overallBand}</div>
                    <div style={{ fontSize:10, color:T.textMuted, fontFamily:"monospace", letterSpacing:"0.1em", textTransform:"uppercase", marginTop:2 }}>Overall Band</div>
                  </div>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8, flexWrap:"wrap" }}>
                      <div style={{ fontSize:20, fontWeight:700, color:bandColor(result.overallBand), fontFamily:"Georgia,serif" }}>{bandLabel(result.overallBand)} User</div>
                      <span style={{ background:"white", border:`1px solid ${result.wordCount>=minWords?T.greenBorder:T.redBorder}`, borderRadius:20, padding:"2px 10px", fontSize:12, color:result.wordCount>=minWords?T.green:T.red, fontFamily:"system-ui", fontWeight:600 }}>
                        {result.wordCount} words {result.wordCount>=minWords?"✓":"⚠ below minimum"}
                      </span>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      {result.strengths?.map((s,i) => <span key={i} style={{ background:"white", border:`1px solid ${T.greenBorder}`, borderRadius:20, padding:"2px 10px", fontSize:12, color:T.green, fontFamily:"system-ui" }}>✓ {s}</span>)}
                    </div>
                  </div>
                </Card>

                {/* Result tabs */}
                <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap", background:"white", padding:6, borderRadius:12, border:`1px solid ${T.border}`, boxShadow:T.shadow }}>
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
                      <Card style={{ background:T.amberBg, border:`1px solid ${T.amberBorder}` }}>
                        <div style={{ fontSize:11, color:T.amber, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8, fontFamily:"system-ui" }}>Key Improvements Needed</div>
                        {result.improvements.map((imp,i)=><div key={i} style={{ color:T.textMid, fontSize:14, lineHeight:1.6, marginBottom:4, fontFamily:"system-ui" }}>→ {imp}</div>)}
                      </Card>
                    )}
                  </div>
                )}

                {activeTab==="mistakes" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                      {[["major",T.red],["moderate",T.amber],["minor",T.blue]].map(([s,c])=>(
                        <span key={s} style={{ background:"white", border:`1px solid ${c}60`, borderRadius:20, padding:"3px 10px", fontSize:11, color:c, fontFamily:"system-ui", fontWeight:600 }}>● {s}</span>
                      ))}
                      <span style={{ color:T.textMuted, fontSize:12, fontFamily:"system-ui", alignSelf:"center" }}>— {result.mistakes?.length} total found</span>
                    </div>
                    {result.mistakes?.length===0
                      ? <Card style={{ textAlign:"center", color:T.green, padding:36, fontFamily:"system-ui" }}>No mistakes found — excellent work!</Card>
                      : result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i} />)
                    }
                  </div>
                )}

                {activeTab==="booster" && result.bandBooster && (
                  <Card style={{ background:T.goldLight, border:`1px solid ${T.goldBorder}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20, flexWrap:"wrap" }}>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:36, fontWeight:900, color:bandColor(result.bandBooster.currentBand), fontFamily:"Georgia,serif" }}>{result.bandBooster.currentBand}</div><div style={{ fontSize:10, color:T.textMuted, fontFamily:"monospace", textTransform:"uppercase" }}>Current</div></div>
                      <div style={{ fontSize:24, color:T.gold }}>→</div>
                      <div style={{ textAlign:"center" }}><div style={{ fontSize:36, fontWeight:900, color:bandColor(result.bandBooster.targetBand), fontFamily:"Georgia,serif" }}>{result.bandBooster.targetBand}</div><div style={{ fontSize:10, color:T.textMuted, fontFamily:"monospace", textTransform:"uppercase" }}>Target</div></div>
                      <div style={{ flex:1 }}><div style={{ fontSize:14, color:T.gold, fontWeight:700, fontFamily:"system-ui" }}>Exactly what to do:</div></div>
                    </div>
                    {result.bandBooster.specificActions?.map((a,i)=>(
                      <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:10 }}>
                        <span style={{ background:T.gold, borderRadius:"50%", width:24, height:24, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"white", fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                        <p style={{ color:T.textMid, fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{a}</p>
                      </div>
                    ))}
                  </Card>
                )}

                {activeTab==="vocab" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {result.vocabularyUpgrades?.map((v,i)=>(
                      <Card key={i} style={{ border:`1px solid ${T.blueBorder}`, background:T.blueBg }}>
                        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap", marginBottom:8 }}>
                          <div style={{ background:"#fee2e2", borderRadius:6, padding:"4px 12px", color:"#991b1b", fontSize:14, fontStyle:"italic" }}>"{v.weak}"</div>
                          <div style={{ fontSize:16, color:T.textMuted }}>→</div>
                          <div style={{ background:"#dcfce7", borderRadius:6, padding:"4px 12px", color:"#166534", fontSize:14, fontWeight:600 }}>"{v.advanced}"</div>
                        </div>
                        <p style={{ color:T.textMid, fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {v.reason}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="tips" && (
                  <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                    {result.examinerTips?.map((tip,i)=>(
                      <Card key={i} style={{ display:"flex", gap:14, alignItems:"flex-start" }}>
                        <span style={{ background:T.goldLight, border:`1px solid ${T.goldBorder}`, borderRadius:"50%", width:28, height:28, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:T.gold, fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                        <p style={{ color:T.textMid, fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{tip}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="sample" && result.sampleEssay && (
                  <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                    <Card style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14, flexWrap:"wrap", gap:8 }}>
                        <div style={{ fontSize:11, color:T.green, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", fontFamily:"system-ui" }}>Band 8+ Model Response</div>
                        <div style={{ fontSize:12, fontFamily:"system-ui", fontWeight:600, color:sampleWordCount>=minWords?T.green:T.red }}>
                          {sampleWordCount} words {sampleWordCount>=minWords?"✓":"⚠ below minimum"}
                        </div>
                      </div>
                      <p style={{ color:T.text, fontSize:15, lineHeight:1.9, whiteSpace:"pre-wrap", margin:0, fontFamily:"Georgia,serif" }}>{result.sampleEssay}</p>
                    </Card>
                    {result.sampleEssayExplanation && (
                      <Card>
                        <div style={{ fontSize:11, color:T.blue, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Why This Response Scores High</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                          {[["Introduction",result.sampleEssayExplanation.introduction],["Body Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
                            <div key={lbl}><div style={{ fontSize:11, color:T.amber, fontWeight:700, marginBottom:4, fontFamily:"system-ui" }}>{lbl}</div><p style={{ color:T.textMid, fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{txt}</p></div>
                          ))}
                          {result.sampleEssayExplanation.vocabularyHighlights?.length>0 && (
                            <div>
                              <div style={{ fontSize:11, color:T.amber, fontWeight:700, marginBottom:6, fontFamily:"system-ui" }}>Advanced Vocabulary Used</div>
                              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                                {result.sampleEssayExplanation.vocabularyHighlights.map((v,i)=><span key={i} style={{ background:T.blueBg, border:`1px solid ${T.blueBorder}`, borderRadius:6, padding:"2px 9px", fontSize:12, color:T.blue, fontFamily:"system-ui" }}>{v}</span>)}
                              </div>
                            </div>
                          )}
                          <Card style={{ background:T.greenBg, border:`1px solid ${T.greenBorder}` }}>
                            <p style={{ color:T.green, fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>🏆 {result.sampleEssayExplanation.whyHighScore}</p>
                          </Card>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mainView === "practice" && <PracticeMode isPro={proUser} onUpgrade={()=>setShowPaywall(true)} setJokerMessage={setJokerMessage} setJokerMood={setJokerMood} />}
        {mainView === "toolkit" && <ToolkitContent isPro={proUser} onUpgrade={()=>setShowPaywall(true)} />}
      </div>

      <style>{`
        @keyframes jokerPop {
          from { opacity:0; transform:scale(0.8) translateX(-10px); }
          to { opacity:1; transform:scale(1) translateX(0); }
        }
      `}</style>
    </div>
  );
}
