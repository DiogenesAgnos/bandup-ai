import { useState, useRef } from "react";

const STRIPE_PUBLISHABLE_KEY = "pk_live_YOUR_KEY_HERE";
const STRIPE_PRICE_ID = "price_YOUR_PRICE_ID_HERE";
const STRIPE_CONFIGURED = false;
const FREE_USES_LIMIT = 3;
const API_URL = "/api/analyze";

const TASK_TYPES = {
  task2: {
    label: "Task 2 — Essay",
    description: "Academic & General Training",
    minWords: 250,
    icon: "✍️"
  },
  task1academic: {
    label: "Task 1 — Academic",
    description: "Graph / Chart / Diagram",
    minWords: 150,
    icon: "📊"
  },
  task1general: {
    label: "Task 1 — General",
    description: "Formal / Informal Letter",
    minWords: 150,
    icon: "✉️"
  }
};

const getSystemPrompt = (taskType) => {
  const taskInstructions = {
    task2: `You are evaluating an IELTS Academic or General Training Writing TASK 2 essay.
Task 2 criteria: Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
WORD COUNT RULE: Under 250 words = Task Achievement MAX Band 5.0. Under 150 words = MAX Band 4.0. Always state word count in Task Achievement feedback.`,

    task1academic: `You are evaluating an IELTS Academic Writing TASK 1 response describing a graph, chart, diagram or process.
Task 1 Academic criteria: Task Achievement (does it accurately describe key features and trends?), Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
Key Task Achievement checks: overview present? key trends identified? data accurately referenced? no personal opinion given?
WORD COUNT RULE: Under 150 words = Task Achievement MAX Band 5.0. Always state word count in feedback.`,

    task1general: `You are evaluating an IELTS General Training Writing TASK 1 letter.
Task 1 General criteria: Task Achievement (are all bullet points addressed? appropriate tone - formal/semi-formal/informal?), Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy.
Key Task Achievement checks: all 3 bullet points addressed? correct register/tone used? opening and closing appropriate?
WORD COUNT RULE: Under 150 words = Task Achievement MAX Band 5.0. Always state word count in feedback.`
  };

  return `You are an expert IELTS examiner with 20+ years of experience. You evaluate IELTS Writing responses with extreme precision and thoroughness.

${taskInstructions[taskType]}

When given a task and response, you must respond ONLY with a valid JSON object (no markdown, no backticks) in this exact structure:

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
      "original": "exact phrase from response",
      "correction": "corrected version",
      "explanation": "why this is wrong",
      "category": "Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Register|Data Reference",
      "severity": "minor|moderate|major"
    }
  ],
  "vocabularyUpgrades": [
    {
      "weak": "exact weak word/phrase from response",
      "advanced": "better IELTS-appropriate alternative",
      "reason": "why this upgrade helps"
    }
  ],
  "bandBooster": {
    "currentBand": 6.0,
    "targetBand": 6.5,
    "specificActions": ["Specific action 1", "Specific action 2", "Specific action 3"]
  },
  "examinerTips": [
    "Insider tip 1 specific to this response",
    "Insider tip 2",
    "Insider tip 3"
  ],
  "strengths": ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "sampleEssay": "Full Band 8+ sample response on the same task (minimum 270 words for Task 2, minimum 175 words for Task 1)...",
  "sampleEssayExplanation": {
    "introduction": "Explanation of why the intro is effective...",
    "bodyParagraphs": "Explanation of body paragraph structure...",
    "conclusion": "Explanation of conclusion technique...",
    "vocabularyHighlights": ["advanced word/phrase used", "another highlight"],
    "whyHighScore": "Overall explanation of why this response would score Band 8+"
  }
}

MISTAKE DETECTION — be completely exhaustive, find every single error:
- Every spelling mistake
- Every grammatical error (subject-verb agreement, tense, articles, prepositions)
- Every punctuation error
- Every sentence structure problem (run-ons, fragments, awkward phrasing)
- Every informal or inappropriate register for the task type
- Every wrong word choice
- NO limit on number of mistakes — report ALL of them

VOCABULARY UPGRADES: Find 5-8 weak/basic words from the response and suggest advanced alternatives.

SAMPLE RESPONSE: Must be minimum 270 words for Task 2, 175 words for Task 1. Count every word. Never produce a sample under these limits.

BAND BOOSTER: Most impactful actions to jump exactly 0.5 bands from current score.

EXAMINER TIPS: 3 insider tips specific to THIS response.`;
};

const bandColor = (b) => b >= 8 ? "#00c9a7" : b >= 7 ? "#4fc3f7" : b >= 6 ? "#ffb74d" : b >= 5 ? "#ff8a65" : "#ef5350";
const bandLabel = (b) => b >= 8.5 ? "Expert" : b >= 7.5 ? "Very Good" : b >= 6.5 ? "Competent" : b >= 5.5 ? "Modest" : "Limited";
const severityColor = (s) => s === "major" ? "#ef5350" : s === "moderate" ? "#ffb74d" : "#4fc3f7";

let _uses = 0; let _pro = false;
const getUses = () => _uses;
const addUse = () => { _uses += 1; };
const getIsPro = () => _pro;
const grantPro = () => { _pro = true; };

// ── TOOLKIT DATA ─────────────────────────────
const TOOLKIT = {
  linkingWords: [
    { category: "Adding Information", color: "#4fc3f7", words: ["Furthermore", "Moreover", "In addition", "Additionally", "What is more", "Not only that, but", "Besides this"] },
    { category: "Contrasting", color: "#ffb74d", words: ["However", "Nevertheless", "Nonetheless", "On the other hand", "In contrast", "Despite this", "Notwithstanding", "Conversely", "Although", "Even though", "Whereas", "While"] },
    { category: "Cause & Effect", color: "#00c9a7", words: ["Therefore", "Consequently", "As a result", "Hence", "Thus", "For this reason", "This leads to", "This results in", "Owing to this"] },
    { category: "Examples", color: "#c9a84c", words: ["For instance", "For example", "To illustrate", "Such as", "A case in point is", "This is exemplified by", "Notably"] },
    { category: "Conclusion", color: "#ff8a65", words: ["In conclusion", "To conclude", "In summary", "To summarise", "Overall", "All things considered", "Taking everything into account"] },
    { category: "Emphasis", color: "#b39ddb", words: ["Particularly", "Especially", "Significantly", "Notably", "Above all", "Most importantly", "It is worth noting that"] },
    { category: "Sequencing (Task 1)", color: "#80cbc4", words: ["Firstly", "Initially", "Subsequently", "Following this", "Finally", "Prior to", "At the same time", "Meanwhile", "Over the period shown"] }
  ],
  vocabulary: [
    { topic: "Education", words: [["learn", "acquire knowledge"], ["school", "educational institution"], ["teach", "impart knowledge / educate"], ["students", "learners / pupils"], ["helpful", "beneficial / advantageous"], ["important", "crucial / paramount / imperative"]] },
    { topic: "Environment", words: [["damage", "deteriorate / deplete"], ["problem", "pressing concern / critical issue"], ["fix", "address / mitigate / combat"], ["bad", "detrimental / adverse / harmful"], ["pollution", "environmental contamination"], ["save", "preserve / conserve / safeguard"]] },
    { topic: "Society & Crime", words: [["crime", "criminal activity / antisocial behaviour"], ["punish", "penalise / impose sanctions on"], ["prison", "incarceration / custodial sentence"], ["help", "rehabilitate / reintegrate"], ["rise", "surge / escalate / proliferate"], ["reduce", "curb / alleviate / diminish"]] },
    { topic: "Technology", words: [["use", "utilise / harness / leverage"], ["change", "transform / revolutionise / reshape"], ["new", "cutting-edge / innovative / state-of-the-art"], ["good", "advantageous / beneficial / favourable"], ["problem", "drawback / pitfall / challenge"], ["spread", "proliferate / permeate / disseminate"]] },
    { topic: "Health", words: [["sick", "afflicted / suffering from"], ["help", "alleviate / treat / address"], ["increase", "surge / escalate / rise sharply"], ["lifestyle", "way of life / daily habits / behavioural patterns"], ["important", "vital / essential / indispensable"], ["doctor", "medical practitioner / healthcare professional"]] },
    { topic: "Graph Language (Task 1)", words: [["went up", "rose / increased / climbed / surged"], ["went down", "fell / declined / dropped / plummeted"], ["stayed same", "remained stable / plateaued / levelled off"], ["big change", "dramatic / sharp / significant / marked increase"], ["small change", "slight / marginal / modest change"], ["highest", "peaked at / reached a peak of / hit a high of"]] }
  ],
  grammarRules: [
    { rule: "Subject-Verb Agreement", tip: "Collective nouns take singular verbs: 'The government IS...' not 'The government ARE...'. Uncountable nouns too: 'Information IS...' not 'Information ARE...'" },
    { rule: "Article Usage (a/an/the)", tip: "Use 'the' for specific things already mentioned or uniquely identified. Use 'a/an' for first mention. Omit articles with plural general nouns: 'Children need education' not 'The children need the education'." },
    { rule: "Avoiding Repetition", tip: "Never use the same noun twice in a row. Use pronouns (it, they, this) or synonyms. Examiners penalise repetitive vocabulary heavily in Lexical Resource." },
    { rule: "Passive Voice for Formality", tip: "Use passive voice to sound more academic: 'It is widely believed...' / 'It has been argued that...' / 'This can be attributed to...' Avoid 'I think' — use 'It is my contention that...'" },
    { rule: "Conditional Structures", tip: "Show range by using conditionals: 'Were this policy to be implemented...' (3rd conditional) / 'Should the government invest...' These signal Band 7+ grammatical range." },
    { rule: "Avoid Contractions", tip: "NEVER use contractions in academic writing: don't → do not, can't → cannot, it's → it is. This is a basic formality requirement and immediately lowers your Lexical Resource score." },
    { rule: "Countable vs Uncountable", tip: "These words are UNCOUNTABLE — never add 's': advice, information, knowledge, research, evidence, equipment, furniture, traffic, behaviour, progress, work." },
    { rule: "Relative Clauses", tip: "Use relative clauses to add complexity: 'This policy, which has been widely debated, could...' / 'Countries that invest in education tend to...' Examiners reward varied sentence structures." }
  ],
  petPeeves: [
    { peeve: "Starting with 'Nowadays'", fix: "Examiners see this in 80% of essays. Replace with: 'In contemporary society...' / 'In the modern era...' / 'Over recent decades...'" },
    { peeve: "Writing 'In my opinion, I think...'", fix: "This is redundant — pick one. Better: 'I firmly contend that...' / 'It is my view that...' / 'I am convinced that...'" },
    { peeve: "Using 'more better' or 'more easier'", fix: "Never double-compare. Either 'better' OR 'more effective' — never both together." },
    { peeve: "Vague examples: 'For example, in some countries...'", fix: "Always name the country/study/data: 'For instance, Finland's education system...' / 'Norway's recidivism rate of 20%...' Specific = higher Task Achievement." },
    { peeve: "Writing 'people' repeatedly", fix: "Vary with: individuals, citizens, members of society, the general public, young people, the population, communities." },
    { peeve: "One-sentence paragraphs", fix: "Every body paragraph needs minimum 3 sentences: Topic sentence → Explanation/Evidence → Example/Result. One sentence = underdeveloped = Band 5 Task Achievement." },
    { peeve: "Copying words from the question", fix: "Paraphrase the question in your introduction. If the question says 'reduce crime', write 'address criminal activity' or 'curb antisocial behaviour'. Direct copying is penalised." }
  ],
  templates: [
    { type: "Task 2 Introduction", template: "In contemporary society, [topic] has become an increasingly [debated/pressing/contentious] issue. While some argue that [view 1], others contend that [view 2]. This essay will examine both perspectives before arguing that [your position]." },
    { type: "Body Paragraph (Argument)", template: "[Topic sentence stating main point]. This is because [explanation of reasoning]. For instance, [specific example with data/country if possible]. Consequently, [result or implication of this point]." },
    { type: "Concession + Rebuttal", template: "Admittedly, [acknowledge opposing view]. However, [counter-argument that is stronger]. While [opponent's point] may hold some merit, the evidence overwhelmingly suggests that [your point]." },
    { type: "Task 2 Conclusion", template: "In conclusion, while [opposing view] has some validity, I firmly maintain that [your position] is the more effective approach. Governments and individuals alike must [recommended action] in order to [desired outcome]." },
    { type: "Task 1 Academic Overview", template: "Overall, it is clear that [main trend 1], while [main trend 2]. [Category/country] experienced the most significant [increase/decrease], whereas [other category] remained comparatively [stable/low/high]." },
    { type: "Task 1 General Opening", template: "Dear [Sir/Madam / Mr.Name / friend's name],\n\nI am writing [to complain about / to request / to apply for / with regard to] [subject of letter]." }
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
  <div style={{ background:"rgba(239,83,80,0.06)", border:`1px solid ${severityColor(mistake.severity)}40`, borderLeft:`3px solid ${severityColor(mistake.severity)}`, borderRadius:12, padding:"14px 18px", display:"flex", flexDirection:"column", gap:8 }}>
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      <div style={{ fontSize:11, color:"#ef9a9a", fontWeight:700, fontFamily:"system-ui" }}>#{i+1}</div>
      <span style={{ background:`${severityColor(mistake.severity)}20`, border:`1px solid ${severityColor(mistake.severity)}50`, borderRadius:20, padding:"2px 8px", fontSize:11, color:severityColor(mistake.severity), fontFamily:"system-ui", fontWeight:600 }}>{mistake.severity}</span>
      <span style={{ background:"rgba(79,195,247,0.1)", border:"1px solid rgba(79,195,247,0.2)", borderRadius:20, padding:"2px 8px", fontSize:11, color:"#4fc3f7", fontFamily:"system-ui" }}>{mistake.category}</span>
    </div>
    <div style={{ display:"flex", gap:10, alignItems:"flex-start", flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:150 }}>
        <div style={{ fontSize:10, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>ORIGINAL</div>
        <div style={{ background:"rgba(239,83,80,0.15)", borderRadius:6, padding:"5px 10px", color:"#ffcdd2", fontSize:13, fontStyle:"italic" }}>"{mistake.original}"</div>
      </div>
      <div style={{ fontSize:16, color:"#555", alignSelf:"center" }}>→</div>
      <div style={{ flex:1, minWidth:150 }}>
        <div style={{ fontSize:10, color:"#888", marginBottom:3, fontFamily:"system-ui" }}>CORRECTION</div>
        <div style={{ background:"rgba(0,201,167,0.12)", borderRadius:6, padding:"5px 10px", color:"#80cbc4", fontSize:13 }}>"{mistake.correction}"</div>
      </div>
    </div>
    <p style={{ color:"#aaa", fontSize:13, margin:0, lineHeight:1.6, fontFamily:"system-ui" }}>💡 {mistake.explanation}</p>
  </div>
);

const Tab = ({ label, active, onClick, badge }) => (
  <button onClick={onClick} style={{ background:active?"rgba(79,195,247,0.15)":"transparent", border:active?"1px solid rgba(79,195,247,0.4)":"1px solid transparent", color:active?"#4fc3f7":"#667", borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"system-ui", display:"flex", alignItems:"center", gap:5, whiteSpace:"nowrap" }}>
    {label}
    {badge && <span style={{ background:"#ef5350", color:"#fff", borderRadius:20, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{badge}</span>}
  </button>
);

const PaywallModal = ({ onClose, onSuccess }) => (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)", backdropFilter:"blur(10px)", zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
    <div style={{ background:"#13151a", border:"1px solid rgba(201,168,76,0.35)", borderRadius:20, padding:"40px 32px", maxWidth:440, width:"100%", position:"relative" }}>
      <button onClick={onClose} style={{ position:"absolute", top:16, right:20, background:"none", border:"none", color:"#555", fontSize:22, cursor:"pointer" }}>✕</button>
      <div style={{ textAlign:"center", marginBottom:20 }}>
        <div style={{ display:"inline-block", background:"rgba(201,168,76,0.1)", border:"1px solid rgba(201,168,76,0.3)", borderRadius:100, padding:"6px 16px", fontSize:11, color:"#c9a84c", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>🎓 3 Free Analyses Used</div>
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
        {["Unlimited analyses — Task 1 & 2, Academic & General","Graph/chart image upload for Task 1 Academic","Complete mistake detection (all categories)","Vocabulary upgrades & Band Booster","Examiner insider tips","IELTS Toolkit — linking words, templates & grammar","Unlimited Band 8+ model responses"].map((f,i) => (
          <li key={i} style={{ display:"flex", gap:10, fontSize:13, color:"#d4cfc6", fontFamily:"system-ui" }}>
            <span style={{ color:"#00c9a7", fontWeight:700, flexShrink:0 }}>✓</span>{f}
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

// ── TOOLKIT TAB ───────────────────────────────
const ToolkitTab = () => {
  const [section, setSection] = useState("linking");
  const sections = [
    { key:"linking", label:"🔗 Linking Words" },
    { key:"vocab", label:"📚 Vocabulary" },
    { key:"grammar", label:"📐 Grammar Rules" },
    { key:"peeves", label:"⚠️ Examiner Pet Peeves" },
    { key:"templates", label:"📝 Essay Templates" }
  ];
  return (
    <div>
      <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"14px 18px", marginBottom:16 }}>
        <p style={{ color:"#c9a84c", fontSize:13, margin:0, fontFamily:"system-ui" }}>🎓 Your personal IELTS reference guide — use these in every essay to boost your band score.</p>
      </div>
      {/* Sub-nav */}
      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginBottom:16 }}>
        {sections.map(s => (
          <button key={s.key} onClick={() => setSection(s.key)}
            style={{ background:section===s.key?"rgba(201,168,76,0.15)":"rgba(255,255,255,0.03)", border:section===s.key?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", color:section===s.key?"#c9a84c":"#667", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"system-ui" }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* LINKING WORDS */}
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

      {/* VOCABULARY */}
      {section === "vocab" && (
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {TOOLKIT.vocabulary.map((topic, i) => (
            <div key={i} style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#c9a84c", marginBottom:10, fontFamily:"system-ui", textTransform:"uppercase", letterSpacing:"0.06em" }}>{topic.topic}</div>
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {topic.words.map((pair, j) => (
                  <div key={j} style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ background:"rgba(239,83,80,0.1)", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#ffcdd2", fontFamily:"system-ui", minWidth:120 }}>✗ {pair[0]}</span>
                    <span style={{ color:"#555", fontSize:12 }}>→</span>
                    <span style={{ background:"rgba(0,201,167,0.1)", borderRadius:6, padding:"3px 10px", fontSize:13, color:"#80cbc4", fontFamily:"system-ui" }}>✓ {pair[1]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* GRAMMAR RULES */}
      {section === "grammar" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.grammarRules.map((item, i) => (
            <div key={i} style={{ background:"rgba(79,195,247,0.05)", border:"1px solid rgba(79,195,247,0.15)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#4fc3f7", marginBottom:6, fontFamily:"system-ui" }}>📐 {item.rule}</div>
              <p style={{ color:"#cdd5e0", fontSize:13, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{item.tip}</p>
            </div>
          ))}
        </div>
      )}

      {/* PET PEEVES */}
      {section === "peeves" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.petPeeves.map((item, i) => (
            <div key={i} style={{ background:"rgba(239,83,80,0.05)", border:"1px solid rgba(239,83,80,0.15)", borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#ef9a9a", marginBottom:6, fontFamily:"system-ui" }}>⚠️ {item.peeve}</div>
              <p style={{ color:"#cdd5e0", fontSize:13, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>✅ {item.fix}</p>
            </div>
          ))}
        </div>
      )}

      {/* TEMPLATES */}
      {section === "templates" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {TOOLKIT.templates.map((item, i) => (
            <div key={i} style={{ background:"rgba(201,168,76,0.05)", border:"1px solid rgba(201,168,76,0.15)", borderRadius:12, padding:"16px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#c9a84c", marginBottom:8, fontFamily:"system-ui", textTransform:"uppercase", letterSpacing:"0.06em" }}>📝 {item.type}</div>
              <p style={{ color:"#dde5f0", fontSize:13, lineHeight:1.8, margin:0, fontFamily:"Georgia,serif", fontStyle:"italic", background:"rgba(255,255,255,0.03)", padding:"10px 14px", borderRadius:8, whiteSpace:"pre-wrap" }}>{item.template}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── MAIN APP ──────────────────────────────────
export default function IELTSBot() {
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
  const [usesLeft, setUsesLeft] = useState(FREE_USES_LIMIT);
  const [proUser, setProUser] = useState(false);
  const fileRef = useRef();

  const minWords = TASK_TYPES[taskType].minWords;
  const wordCount = essay.trim().split(/\s+/).filter(Boolean).length;
  const sampleWordCount = result?.sampleEssay ? result.sampleEssay.trim().split(/\s+/).filter(Boolean).length : 0;

  const handleProSuccess = () => { grantPro(); setProUser(true); setUsesLeft(999); setShowPaywall(false); };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImage(ev.target.result.split(",")[1]); // base64
      setImagePreview(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const analyze = async () => {
    if (!topic.trim() || !essay.trim()) { setError("Please provide both the task question and your response."); return; }
    if (wordCount < 30) { setError("Response too short — please write more."); return; }
    if (taskType === "task1academic" && !image) { setError("Please upload the graph/chart image for Academic Task 1."); return; }
    if (!getIsPro() && getUses() >= FREE_USES_LIMIT) { setShowPaywall(true); return; }
    setError(""); setLoading(true); setResult(null);

    try {
      const userContent = [];

      // Add image for Academic Task 1
      if (taskType === "task1academic" && image) {
        userContent.push({ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:image } });
      }

      userContent.push({
        type:"text",
        content:`IELTS ${TASK_TYPES[taskType].label}\n\nTask Question/Instructions:\n"${topic}"\n\nStudent Response (count words carefully):\n${essay}\n\nEvaluate thoroughly and respond as JSON only.`
      });

      // Fix content format
      const messageContent = taskType === "task1academic" && image
        ? [{ type:"image", source:{ type:"base64", media_type:"image/jpeg", data:image } }, { type:"text", text:`IELTS ${TASK_TYPES[taskType].label}\n\nTask Question/Instructions:\n"${topic}"\n\nStudent Response:\n${essay}\n\nEvaluate thoroughly and respond as JSON only.` }]
        : `IELTS ${TASK_TYPES[taskType].label}\n\nTask Question/Instructions:\n"${topic}"\n\nStudent Response:\n${essay}\n\nEvaluate thoroughly and respond as JSON only.`;

      const res = await fetch(API_URL, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514",
          max_tokens:4000,
          system: getSystemPrompt(taskType),
          messages:[{ role:"user", content: messageContent }]
        })
      });
      const data = await res.json();
      const text = data.content.map(b => b.text||"").join("");
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      if (!getIsPro()) { addUse(); setUsesLeft(FREE_USES_LIMIT - getUses()); }
      setResult(parsed); setActiveTab("scores");
    } catch(e) {
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
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
        <p style={{ color:"#667", fontSize:13, fontFamily:"system-ui", margin:"8px auto 0", maxWidth:560 }}>
          Task 1 & 2 · Academic & General Training · Complete mistake detection · Vocabulary · Band Booster · Toolkit
        </p>
        <div style={{ marginTop:14, display:"inline-flex", background:pillBg, border:`1px solid ${pillBorder}`, borderRadius:100, padding:"5px 16px", fontSize:13, fontFamily:"system-ui", color:pillColor, fontWeight:600 }}>
          {proUser ? "✓ Pro — Unlimited Access" : usesLeft > 0 ? `${usesLeft} free ${usesLeft===1?"analysis":"analyses"} remaining` : "Free limit reached — upgrade to continue"}
        </div>
      </div>

      <div style={{ maxWidth:800, margin:"0 auto", padding:"28px 16px 0" }}>

        {/* Task Type Selector */}
        <div style={{ marginBottom:20 }}>
          <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:10, fontFamily:"monospace" }}>Select Task Type</label>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {Object.entries(TASK_TYPES).map(([key, task]) => (
              <button key={key} onClick={() => { setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); }}
                style={{ background:taskType===key?"rgba(201,168,76,0.12)":"rgba(255,255,255,0.03)", border:taskType===key?"1px solid rgba(201,168,76,0.4)":"1px solid rgba(255,255,255,0.08)", borderRadius:12, padding:"14px 10px", cursor:"pointer", textAlign:"center", transition:"all 0.2s" }}>
                <div style={{ fontSize:22, marginBottom:6 }}>{task.icon}</div>
                <div style={{ fontSize:12, fontWeight:700, color:taskType===key?"#c9a84c":"#cdd5e0", fontFamily:"system-ui", marginBottom:2 }}>{task.label}</div>
                <div style={{ fontSize:11, color:"#555", fontFamily:"system-ui" }}>{task.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Image Upload for Academic Task 1 */}
        {taskType === "task1academic" && (
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8, fontFamily:"monospace" }}>Upload Graph / Chart / Diagram Image *</label>
            <div onClick={() => fileRef.current.click()}
              style={{ border:`2px dashed ${imagePreview ? "rgba(0,201,167,0.4)" : "rgba(201,168,76,0.3)"}`, borderRadius:12, padding:"20px", textAlign:"center", cursor:"pointer", background:"rgba(255,255,255,0.02)", transition:"all 0.2s" }}>
              {imagePreview ? (
                <div>
                  <img src={imagePreview} alt="uploaded graph" style={{ maxHeight:200, maxWidth:"100%", borderRadius:8, marginBottom:8 }} />
                  <div style={{ fontSize:12, color:"#00c9a7", fontFamily:"system-ui" }}>✓ Image uploaded — click to change</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
                  <div style={{ fontSize:14, color:"#c9a84c", fontFamily:"system-ui", marginBottom:4 }}>Click to upload graph/chart image</div>
                  <div style={{ fontSize:12, color:"#555", fontFamily:"system-ui" }}>JPG, PNG or GIF — the AI will read and evaluate the graph</div>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display:"none" }} />
          </div>
        )}

        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>
              {taskType === "task1general" ? "Letter Task Instructions" : taskType === "task1academic" ? "Task Description / Instructions" : "Essay Question / Topic"}
            </label>
            <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
              placeholder={
                taskType === "task2" ? "e.g. Some people think universities should focus on job skills. Others believe the purpose of a university is to provide knowledge for its own sake. Discuss both views and give your opinion." :
                taskType === "task1academic" ? "e.g. The graph below shows the changes in energy consumption in the US between 1980 and 2020. Summarise the information by selecting and reporting the main features." :
                "e.g. You recently bought a laptop from an online store but it arrived damaged. Write a letter to the store manager. In your letter: describe the laptop you bought, explain what the damage was, say what you would like the store to do."
              }
              style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:10, color:"#e0e6f0", fontSize:14, padding:"12px 14px", resize:"vertical", fontFamily:"system-ui", lineHeight:1.6, outline:"none", boxSizing:"border-box" }}
            />
          </div>

          <div>
            <label style={{ display:"block", fontSize:11, color:"#c9a84c", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:7, fontFamily:"monospace" }}>
              Student's Response
              <span style={{ color:wordCount>=minWords?"#00c9a7":wordCount>=(minWords*0.6)?"#ffb74d":"#ef5350", marginLeft:10, fontWeight:400, fontFamily:"system-ui" }}>
                {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords} required${wordCount<minWords?" — penalty applies":""})`}
              </span>
            </label>
            <textarea value={essay} onChange={e=>setEssay(e.target.value)} rows={10}
              placeholder={
                taskType === "task1general" ? "Dear Sir/Madam,\n\nI am writing to..." :
                taskType === "task1academic" ? "The graph illustrates..." :
                "Paste the student's essay here..."
              }
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
            {loading?"⏳ Examining response...":!proUser&&usesLeft===0?"🔓 Upgrade to Continue":`🎓 Analyze ${TASK_TYPES[taskType].label}`}
          </button>
        </div>

        {/* TOOLKIT — always visible below */}
        <div style={{ marginTop:40, borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:32 }}>
          <div style={{ fontSize:11, color:"#c9a84c", letterSpacing:"0.2em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:4 }}>Reference Guide</div>
          <h2 style={{ fontFamily:"Georgia,serif", color:"#f5f0e8", fontSize:22, marginBottom:16, fontWeight:700 }}>IELTS Writing Toolkit</h2>
          <ToolkitTab />
        </div>

        {/* Results */}
        {result && (
          <div style={{ marginTop:40, borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:32 }}>
            <div style={{ fontSize:11, color:"#c9a84c", letterSpacing:"0.2em", textTransform:"uppercase", fontFamily:"monospace", marginBottom:16 }}>Analysis Results</div>

            {/* Score banner */}
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
                  {result.strengths?.map((s,i) => (
                    <span key={i} style={{ background:"rgba(0,201,167,0.12)", border:"1px solid rgba(0,201,167,0.25)", borderRadius:20, padding:"2px 10px", fontSize:12, color:"#80cbc4", fontFamily:"system-ui" }}>✓ {s}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Result Tabs */}
            <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
              <Tab label="📊 Scores" active={activeTab==="scores"} onClick={()=>setActiveTab("scores")} />
              <Tab label="🔍 Mistakes" active={activeTab==="mistakes"} onClick={()=>setActiveTab("mistakes")} badge={result.mistakes?.length} />
              <Tab label="📈 Band Booster" active={activeTab==="booster"} onClick={()=>setActiveTab("booster")} />
              <Tab label="💬 Vocabulary" active={activeTab==="vocab"} onClick={()=>setActiveTab("vocab")} />
              <Tab label="🎓 Examiner Tips" active={activeTab==="tips"} onClick={()=>setActiveTab("tips")} />
              <Tab label="✨ Sample Response" active={activeTab==="sample"} onClick={()=>setActiveTab("sample")} />
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
                    {result.improvements.map((imp,i)=>(
                      <div key={i} style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.6, marginBottom:4, fontFamily:"system-ui" }}>→ {imp}</div>
                    ))}
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
                  <span style={{ color:"#555", fontSize:12, fontFamily:"system-ui", alignSelf:"center" }}>— {result.mistakes?.length} total mistakes found</span>
                </div>
                {result.mistakes?.length===0
                  ? <div style={{ color:"#00c9a7", textAlign:"center", padding:36, fontFamily:"system-ui" }}>No mistakes found — excellent work!</div>
                  : result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i} />)
                }
              </div>
            )}

            {activeTab==="booster" && result.bandBooster && (
              <div style={{ background:"linear-gradient(135deg,rgba(201,168,76,0.1),rgba(0,201,167,0.05))", border:"1px solid rgba(201,168,76,0.25)", borderRadius:14, padding:"20px 24px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20, flexWrap:"wrap" }}>
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
                    <div style={{ fontSize:14, color:"#c9a84c", fontWeight:700, fontFamily:"system-ui" }}>Exactly what to do to get there:</div>
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {result.bandBooster.specificActions?.map((action,i)=>(
                    <div key={i} style={{ display:"flex", gap:12, alignItems:"flex-start" }}>
                      <span style={{ background:"rgba(201,168,76,0.2)", border:"1px solid rgba(201,168,76,0.4)", borderRadius:"50%", width:26, height:26, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#c9a84c", fontWeight:700, flexShrink:0, fontFamily:"system-ui" }}>{i+1}</span>
                      <p style={{ color:"#cdd5e0", fontSize:14, lineHeight:1.7, margin:0, fontFamily:"system-ui" }}>{action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab==="vocab" && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"12px 16px", marginBottom:4 }}>
                  <p style={{ color:"#6b6760", fontSize:13, margin:0, fontFamily:"system-ui", fontStyle:"italic" }}>Weak or basic words from your response — upgraded to IELTS Band 7-8 alternatives.</p>
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

            {activeTab==="tips" && (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                <div style={{ background:"rgba(201,168,76,0.06)", border:"1px solid rgba(201,168,76,0.2)", borderRadius:12, padding:"12px 16px", marginBottom:4 }}>
                  <p style={{ color:"#c9a84c", fontSize:13, margin:0, fontFamily:"system-ui" }}>🎓 Insider tips from an experienced examiner — specific to YOUR response.</p>
                </div>
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
                    <div style={{ fontSize:12, fontFamily:"system-ui", fontWeight:600, color:sampleWordCount>=minWords?"#00c9a7":"#ef5350" }}>
                      {sampleWordCount} words {sampleWordCount>=minWords?"✓":"⚠ below minimum — AI needs to write more"}
                    </div>
                  </div>
                  <p style={{ color:"#dde5f0", fontSize:15, lineHeight:1.9, whiteSpace:"pre-wrap", margin:0, fontFamily:"Georgia,serif" }}>{result.sampleEssay}</p>
                </div>
                {result.sampleEssayExplanation && (
                  <div style={{ background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:12, padding:"18px 22px" }}>
                    <div style={{ fontSize:11, color:"#4fc3f7", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:14, fontFamily:"system-ui" }}>Why This Response Scores High</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
                      {[["Introduction",result.sampleEssayExplanation.introduction],["Body / Main Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
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
