import { useState, useRef, useEffect, useCallback } from "react";

const STRIPE_CONFIGURED = false;
const FREE_USES_LIMIT = 2;
const STORAGE_KEY = "bandup_uses";
const HISTORY_KEY = "bandup_history";
const API_URL = "/api/analyze";

const T = {
  bg:"#f5f5f5", bg2:"#ffffff", bg3:"#f0f0f0",
  border:"#e0e0e0", borderStrong:"#cccccc",
  // IELTS.org red + black
  red:"#e2001a", redHover:"#c0001a", redLight:"#fff0f0", redBorder:"#ffb3bc",
  navy:"#1a1a1a", navyLight:"#f5f5f5", navyBorder:"#dddddd",
  teal:"#e2001a", tealLight:"#fff0f0", tealBorder:"#ffb3bc",
  gold:"#e2001a", goldLight:"#fff0f0", goldBorder:"#ffb3bc",
  text:"#1a1a1a", textMid:"#444444", textMuted:"#888888",
  green:"#007a5e", greenBg:"#e6f6f2", greenBorder:"#5cc8ad",
  blue:"#0066cc", blueBg:"#e8f0ff", blueBorder:"#99bbee",
  redBg:"#fff0f0", redBorder2:"#ffb3bc",
  amber:"#c47a00", amberBg:"#fff8e6", amberBorder:"#fcd77a",
  purple:"#5b3fa0", purpleBg:"#f0ecfa", purpleBorder:"#c4aff0",
  shadow:"0 1px 3px rgba(0,0,0,0.08)", shadowMd:"0 4px 12px rgba(0,0,0,0.1)", shadowLg:"0 10px 32px rgba(0,0,0,0.15)"
};

const TASK_TYPES = {
  task2:{ label:"Task 2 — Essay", description:"Academic & General Training", minWords:250, icon:"✍️" },
  task1academic:{ label:"Task 1 — Academic", description:"Graph / Chart / Diagram", minWords:150, icon:"📊" },
  task1general:{ label:"Task 1 — General", description:"Formal / Informal Letter", minWords:150, icon:"✉️" }
};

const countWords = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const bandColor = (b) => b>=8?T.green:b>=7?T.blue:b>=6?T.amber:b>=5?"#ea580c":T.red;
const bandBg = (b) => b>=8?T.greenBg:b>=7?T.blueBg:b>=6?T.amberBg:b>=5?"#fff7ed":T.redBg;
const bandLabel = (b) => b>=8.5?"Expert":b>=7.5?"Very Good":b>=6.5?"Competent":b>=5.5?"Modest":"Limited";
const severityColor = (s) => s==="major"?T.red:s==="moderate"?T.amber:T.blue;
const severityBg = (s) => s==="major"?T.redBg:s==="moderate"?T.amberBg:T.blueBg;
const categoryColor = (c) => {
  if(c==="Spelling") return T.red;
  if(c==="Punctuation") return T.purple;
  if(c==="Grammar"||c==="Subject-Verb Agreement"||c==="Verb Tense") return T.amber;
  if(c==="Word Choice"||c==="Academic Style") return T.blue;
  return T.textMid;
};

const getStoredUses = () => { try{ return parseInt(localStorage.getItem(STORAGE_KEY)||"0"); }catch{ return 0; } };
const saveUses = (n) => { try{ localStorage.setItem(STORAGE_KEY,String(n)); }catch{} };
const getStoredPro = () => { try{ return localStorage.getItem("bandup_pro")==="true"; }catch{ return false; } };
const savePro = () => { try{ localStorage.setItem("bandup_pro","true"); }catch{} };
const getHistory = () => { try{ return JSON.parse(localStorage.getItem(HISTORY_KEY)||"[]"); }catch{ return []; } };
const saveHistory = (h) => { try{ localStorage.setItem(HISTORY_KEY,JSON.stringify(h)); }catch{} };
const addToHistory = (entry) => {
  const h = getHistory();
  h.unshift({ ...entry, date: new Date().toISOString(), id: Date.now() });
  saveHistory(h.slice(0,20)); // keep last 20
};

const PRACTICE_QUESTIONS = {
  "Education":["Some people believe that universities should focus on providing students with the practical skills needed in the workplace. Others argue that universities should prioritise academic knowledge. Discuss both views and give your opinion.","In some countries, children start formal education at a very early age. Some people think this is beneficial while others believe it is harmful. Discuss both views.","Some people think that the government should pay for higher education. Others believe students should pay for it themselves. Discuss both views."],
  "Technology":["The increasing use of technology in the workplace has led to concerns about job losses. To what extent do you agree or disagree?","Social media has had a largely negative impact on society. To what extent do you agree or disagree?","Some people think that technology is making people less sociable. Others disagree. Discuss both views and give your own opinion."],
  "Environment":["Many people believe that the most important way to protect the environment is to reduce the amount of energy used. To what extent do you agree or disagree?","Climate change is the most serious issue facing the world today. To what extent do you agree or disagree?","Some people think governments should focus on reducing environmental pollution rather than individuals. Discuss both views."],
  "Crime":["Some people think that the best way to reduce crime is to give longer prison sentences. Others believe there are better alternative ways. Discuss both views and give your own opinion.","The best way to reduce youth crime is to educate parents. To what extent do you agree or disagree?"],
  "Health":["In many countries, obesity is becoming a serious problem. What are the causes and what measures could be taken to address it?","Healthcare should be funded entirely by governments. To what extent do you agree or disagree?"]
};

const getSystemPrompt = (taskType, lang="en") => `You are an expert IELTS examiner with 20+ years of experience. You apply the official IELTS band descriptors with precision.

${taskType==="task2"?"Evaluating IELTS Task 2. Under 250 words = Task Achievement MAX Band 5.0.":taskType==="task1academic"?"Evaluating IELTS Task 1 Academic. Check: overview present? key trends identified? data accurately referenced? no personal opinion given?":"Evaluating IELTS Task 1 General letter. Check: all three bullet points addressed? correct register (formal/informal)? appropriate opening and closing?"}

OFFICIAL IELTS BAND DESCRIPTORS — apply these precisely:

TASK ACHIEVEMENT / TASK RESPONSE:
- Band 9: Fully addresses all parts of the task. Position is clear and fully developed. Ideas are relevant, fully extended and well supported.
- Band 8: Sufficiently addresses all parts. Position is clear and well developed. Ideas are relevant, well extended and supported.
- Band 7: Addresses all parts of the task. A clear position is presented throughout. Main ideas are extended and supported but there may be a tendency to over-generalise.
- Band 6: Addresses all parts though some may be more fully covered. A relevant position is presented. Main ideas are relevant but some may be inadequately developed or unclear.
- Band 5: Addresses the task only partially. The format may be inappropriate in places. A position is presented but not always maintained. Some main ideas are put forward but they are limited and not sufficiently developed.

COHERENCE & COHESION:
- Band 9: Uses cohesion in a skilful way. Paragraphing is used appropriately throughout.
- Band 8: Sequences information and ideas logically. Manages all aspects of cohesion well. Uses paragraphing sufficiently and appropriately.
- Band 7: Logically organises information and ideas with clear progression. Uses a range of cohesive devices appropriately. Presents a clear central topic within each paragraph.
- Band 6: Arranges information and ideas coherently. Uses cohesive devices effectively but cohesion within and/or between sentences may be faulty or mechanical.
- Band 5: Presents information with some organisation but there may be a lack of overall progression. Makes inadequate, inaccurate or overuse of cohesive devices. May be repetitive.

LEXICAL RESOURCE:
- Band 9: Uses a wide range of vocabulary with very natural and sophisticated control of lexical features. Rare minor errors occur only as slips.
- Band 8: Uses a wide range of vocabulary fluently and flexibly to convey precise meanings. Skilfully uses uncommon lexical items. Occasional errors in word choice, spelling and/or word formation.
- Band 7: Uses sufficient range of vocabulary to allow flexibility and precision. Uses less common lexical items with some awareness of style and collocation. May produce occasional errors in word choice, spelling and/or word formation.
- Band 6: Uses an adequate range of vocabulary for the task. Attempts to use less common vocabulary but with some inaccuracy. Makes some errors in spelling and/or word formation but these do not impede communication.
- Band 5: Uses a limited range of vocabulary but this is minimally adequate for the task. May make noticeable errors in spelling and/or word formation that may cause some difficulty for the reader.

GRAMMATICAL RANGE & ACCURACY:
- Band 9: Uses a wide range of structures with full flexibility and accuracy. Rare minor errors occur only as slips.
- Band 8: Uses a wide range of structures. The majority of sentences are error-free. Occasional inappropriate sentences or non-systematic errors.
- Band 7: Uses a variety of complex structures. Produces frequent error-free sentences. Has good control of grammar and punctuation but may make a few errors.
- Band 6: Uses a mix of simple and complex sentence forms. Makes some errors in grammar and punctuation but these rarely reduce communication.
- Band 5: Uses only a limited range of structures. Attempts complex sentences but these tend to be less accurate than simple sentences. May make frequent grammatical errors and punctuation may be faulty.

CRITICAL SCORING RULES:
- The overall band is the mean of the four criteria bands, rounded to the nearest 0.5
- Under 250 words (Task 2) = Task Achievement MAX Band 5.0. Under 150 words (Task 1) = Task Achievement MAX Band 5.0
- Task 1 Academic with clear overview + accurate data coverage + good comparisons + no major errors = minimum Band 7.0 overall
- Never undermark — if writing demonstrates Band 7 features, score it Band 7
- Never overmark — errors that impede communication must reduce the score
- Punctuation errors (missing commas, wrong apostrophes, run-on sentences) count under Grammatical Range & Accuracy

WORD COUNT: Count by splitting on spaces. Report exact count in wordCount field.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "wordCount":201,"overallBand":7.5,
  "criteria":{"taskAchievement":{"band":7.0,"feedback":"..."},"coherenceCohesion":{"band":7.5,"feedback":"..."},"lexicalResource":{"band":7.0,"feedback":"..."},"grammaticalRange":{"band":7.5,"feedback":"..."}},
  "mistakes":[{"original":"exact phrase from text","correction":"corrected version","explanation":"clear explanation","category":"Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Register","severity":"minor|moderate|major"}],
  "vocabularyUpgrades":[{"weak":"exact weak phrase from essay","advanced":"better IELTS alternative","reason":"why this upgrade helps"}],
  "bandBooster":{"currentBand":7.0,"targetBand":7.5,"specificActions":["specific action 1","action 2","action 3"]},
  "examinerTips":["insider tip 1 specific to this essay","tip 2","tip 3"],
  "strengths":["strength 1","strength 2"],
  "improvements":["improvement 1","improvement 2"],
  "sampleEssay":"Full Band 8+ response — MINIMUM 270 words Task 2 / 185 words Task 1. Count carefully.",
  "sampleEssayExplanation":{"introduction":"...","bodyParagraphs":"...","conclusion":"...","vocabularyHighlights":["word 1","word 2"],"whyHighScore":"..."}
}

Find ALL mistakes — spelling, grammar, punctuation, sentence structure, word choice, register. No limit. The "original" field must match the essay text EXACTLY character for character.
${lang==="ar"?"\n\nمهم جداً: قدّم جميع التعليقات والشرح باللغة العربية. هذا يشمل: حقل feedback لكل معيار، وحقل explanation لكل خطأ، وحقل reason لكل ترقية مفردات، وحقل specificActions في Band Booster، وحقل examinerTips، وحقل strengths، وحقل improvements، وحقل sampleEssayExplanation بالكامل. أبقِ درجات الباند (أرقام) والمقال النموذجي sampleEssay باللغة الإنجليزية. جميع التعليقات الأخرى يجب أن تكون باللغة العربية الفصحى الواضحة.":""}
`;

const PRACTICE_SYSTEM = `You are a direct IELTS writing coach reviewing an essay in progress. Be concise and specific.
Respond ONLY with valid JSON (no markdown):
{
  "tips":["specific tip 1 with example","tip 2"],
  "quickFix":"The most important fix right now — be specific",
  "encouragement":"One short honest comment",
  "estimatedBand":6.0,
  "spotErrors":[{"original":"exact error text","correction":"corrected","explanation":"why this is wrong","category":"Grammar|Spelling|Punctuation|Word Choice|Academic Style"}]
}
spotErrors: find up to 5 real errors from the text. Each original must be exact text from the essay.`;

const TOOLKIT = {
  linkingWords:[
    {category:"Adding Information",color:"#0284c7",words:["Furthermore","Moreover","In addition","Additionally","What is more","Besides this"]},
    {category:"Contrasting",color:"#d97706",words:["However","Nevertheless","Nonetheless","On the other hand","In contrast","Conversely","Although","Whereas"]},
    {category:"Cause & Effect",color:"#059669",words:["Therefore","Consequently","As a result","Hence","Thus","For this reason","This leads to"]},
    {category:"Examples",color:"#b8860b",words:["For instance","For example","To illustrate","Such as","A case in point is","This is exemplified by"]},
    {category:"Conclusion",color:"#7c3aed",words:["In conclusion","To conclude","In summary","Overall","All things considered","Taking everything into account"]},
    {category:"Task 1 Sequencing",color:"#0891b2",words:["Initially","Subsequently","Following this","Meanwhile","Over the period shown","By contrast"]}
  ],
  vocabulary:[
    {topic:"Education",words:[["learn","acquire knowledge"],["school","educational institution"],["important","crucial / paramount"],["students","learners / pupils"],["helpful","beneficial / advantageous"]]},
    {topic:"Crime",words:[["crime","criminal activity / antisocial behaviour"],["punish","penalise / impose sanctions"],["prison","incarceration"],["reduce","curb / alleviate / diminish"],["rise","surge / escalate / proliferate"]]},
    {topic:"Technology",words:[["use","utilise / harness / leverage"],["change","transform / revolutionise"],["new","cutting-edge / innovative"],["problem","drawback / pitfall"],["spread","proliferate / permeate"]]},
    {topic:"Graph Language",words:[["went up","rose / increased / surged"],["went down","fell / declined / plummeted"],["stayed same","remained stable / plateaued"],["big change","dramatic / sharp / significant increase"],["highest","peaked at / reached a peak of"]]}
  ],
  grammarRules:[
    {rule:"Subject-Verb Agreement",tip:"Collective nouns = singular: 'The government IS...' Uncountable = singular: 'Information IS...'"},
    {rule:"Article Usage (a/an/the)",tip:"Use 'the' for specific things. 'a/an' for first mention. Omit with general plurals: 'Children need education' NOT 'The children need the education'."},
    {rule:"Avoid Contractions",tip:"NEVER use: don't → do not, can't → cannot, it's → it is. Contractions lower Lexical Resource score."},
    {rule:"Passive Voice for Formality",tip:"'It is widely believed...' / 'It has been argued...' Use passive for academic formality."},
    {rule:"Uncountable Nouns",tip:"Never add 's' to: advice, information, knowledge, research, evidence, equipment, furniture, traffic, behaviour, progress."}
  ],
  petPeeves:[
    {peeve:"Starting with 'Nowadays'",fix:"Use: 'In contemporary society...' / 'In the modern era...' / 'Over recent decades...'"},
    {peeve:"'In my opinion, I think...'",fix:"Redundant. Use one: 'I firmly contend that...' / 'It is my view that...'"},
    {peeve:"Vague examples: 'in some countries'",fix:"Name the country: 'Finland's education system...' / 'Norway's recidivism rate of 20%...' Specific = higher Task Achievement."},
    {peeve:"One-sentence paragraphs",fix:"Minimum 3 sentences: Topic sentence → Explanation → Example/Result."},
    {peeve:"Copying words from the question",fix:"Paraphrase. 'reduce crime' → 'address criminal activity'. Direct copying is penalised."}
  ],
  templates:[
    {type:"Task 2 Introduction",template:"In contemporary society, [topic] has become an increasingly [debated/contentious] issue. While some argue that [view 1], others contend that [view 2]. This essay will examine both perspectives before arguing that [your position]."},
    {type:"Body Paragraph",template:"[Topic sentence]. This is because [explanation]. For instance, [specific example with data/country]. Consequently, [result/implication]."},
    {type:"Concession + Rebuttal",template:"Admittedly, [opposing view]. However, [counter-argument]. While [opponent's point] may hold some merit, the evidence overwhelmingly suggests that [your point]."},
    {type:"Task 2 Conclusion",template:"In conclusion, while [opposing view] has some validity, I firmly maintain that [your position] is the more effective approach. Governments and individuals must [action] in order to [outcome]."},
    {type:"Task 1 Overview",template:"Overall, it is clear that [main trend 1], while [main trend 2]. [Category] experienced the most significant [change], whereas [other] remained comparatively [stable/low]."}
  ]
};

// ── Annotated Essay ───────────────────────────
const AnnotatedEssay = ({ essay, mistakes }) => {
  const [activeTooltip, setActiveTooltip] = useState(null);
  if(!mistakes||mistakes.length===0) return <p style={{color:T.text,fontSize:15,lineHeight:1.9,margin:0,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap"}}>{essay}</p>;
  const found=[];
  mistakes.forEach((m,idx)=>{ if(!m.original) return; const pos=essay.indexOf(m.original); if(pos!==-1) found.push({pos,end:pos+m.original.length,mistake:m,idx}); });
  found.sort((a,b)=>a.pos-b.pos);
  const clean=[]; let lastEnd=0;
  found.forEach(f=>{ if(f.pos>=lastEnd){ clean.push(f); lastEnd=f.end; } });
  const segments=[]; let cursor=0;
  clean.forEach(f=>{ if(f.pos>cursor) segments.push({text:essay.slice(cursor,f.pos),type:"normal"}); segments.push({text:essay.slice(f.pos,f.end),type:"mistake",mistake:f.mistake,idx:f.idx}); cursor=f.end; });
  if(cursor<essay.length) segments.push({text:essay.slice(cursor),type:"normal"});
  return (
    <div style={{position:"relative",fontSize:15,lineHeight:1.9,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap",color:T.text}}>
      {segments.map((seg,i)=>{
        if(seg.type==="normal") return <span key={i}>{seg.text}</span>;
        const c=severityColor(seg.mistake.severity);
        const catColor=categoryColor(seg.mistake.category);
        return (
          <span key={i} style={{position:"relative",display:"inline"}}>
            <span onClick={()=>setActiveTooltip(activeTooltip===seg.idx?null:seg.idx)}
              style={{borderBottom:`2px solid ${c}`,cursor:"pointer",background:activeTooltip===seg.idx?`${c}18`:"transparent",borderRadius:3,padding:"0 1px",transition:"background 0.15s"}}>
              {seg.text}
            </span>
            {activeTooltip===seg.idx&&(
              <span style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"white",borderRadius:10,padding:"10px 14px",fontSize:13,fontFamily:"system-ui",width:260,zIndex:100,boxShadow:T.shadowLg,lineHeight:1.5,fontStyle:"normal",whiteSpace:"normal"}}>
                <span style={{position:"absolute",bottom:-6,left:"50%",transform:"translateX(-50%)",width:0,height:0,borderLeft:"6px solid transparent",borderRight:"6px solid transparent",borderTop:"6px solid #1e293b"}}/>
                <div style={{display:"flex",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                  <span style={{background:`${c}30`,border:`1px solid ${c}60`,borderRadius:20,padding:"1px 8px",fontSize:11,color:c,fontWeight:700}}>{seg.mistake.severity}</span>
                  <span style={{background:`${catColor}20`,border:`1px solid ${catColor}40`,borderRadius:20,padding:"1px 8px",fontSize:11,color:catColor}}>{seg.mistake.category}</span>
                </div>
                <div style={{marginBottom:6}}><span style={{color:"#94a3b8",fontSize:11}}>✏️ </span><span style={{color:"#86efac",fontWeight:700}}>{seg.mistake.correction}</span></div>
                <div style={{color:"#cbd5e1",fontSize:12}}>{seg.mistake.explanation}</div>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
};

// ── Components ─────────────────────────────────
const Card=({children,style})=><div style={{background:"white",border:"1px solid #e8e8e8",borderRadius:8,padding:"20px 24px",boxShadow:"0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)",...style}}>{children}</div>;
const CriteriaCard=({label,data})=>(
  <div style={{background:"white",border:"1px solid #e8e8e8",borderRadius:10,padding:"20px 24px",boxShadow:"0 2px 8px rgba(0,0,0,0.06)",borderLeft:`5px solid ${bandColor(data.band)}`}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
      <span style={{color:"#333",fontSize:13,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",fontFamily:"system-ui"}}>{label}</span>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <div style={{background:bandBg(data.band),borderRadius:6,padding:"6px 16px",border:`1px solid ${bandColor(data.band)}30`}}>
          <span style={{color:bandColor(data.band),fontWeight:900,fontSize:22,fontFamily:"Georgia,serif",lineHeight:1}}>{data.band}</span>
        </div>
      </div>
    </div>
    <p style={{color:"#555",fontSize:14,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>{data.feedback}</p>
  </div>
);
const MistakeCard=({mistake,i})=>(
  <div style={{background:severityBg(mistake.severity),border:`1px solid ${severityColor(mistake.severity)}40`,borderLeft:`3px solid ${severityColor(mistake.severity)}`,borderRadius:10,padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:700,color:taskType===key?"rgba(255,255,255,0.6)":"#999",fontFamily:"system-ui"}}>#{i+1}</span>
      <span style={{background:"white",border:`1px solid ${severityColor(mistake.severity)}60`,borderRadius:20,padding:"1px 8px",fontSize:11,color:severityColor(mistake.severity),fontFamily:"system-ui",fontWeight:700}}>{mistake.severity}</span>
      <span style={{background:"white",border:`1px solid ${categoryColor(mistake.category)}50`,borderRadius:20,padding:"1px 8px",fontSize:11,color:categoryColor(mistake.category),fontFamily:"system-ui",fontWeight:600}}>{mistake.category}</span>
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"system-ui",fontWeight:600}}>ORIGINAL</div><div style={{background:"#fee2e2",borderRadius:6,padding:"5px 10px",color:"#991b1b",fontSize:13,fontStyle:"italic"}}>"{mistake.original}"</div></div>
      <div style={{fontSize:16,color:T.textMuted,alignSelf:"center"}}>→</div>
      <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"system-ui",fontWeight:600}}>CORRECTION</div><div style={{background:"#dcfce7",borderRadius:6,padding:"5px 10px",color:"#166534",fontSize:13}}>"{mistake.correction}"</div></div>
    </div>
    <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"system-ui"}}>💡 {mistake.explanation}</p>
  </div>
);
const TabBtn=({label,active,onClick,badge})=>(
  <button onClick={onClick} style={{
    background:active?T.red:"transparent",
    border:"none",
    borderRadius:active?6:6,
    color:active?"white":"#666",
    padding:"8px 16px",
    cursor:"pointer",
    fontSize:12,
    fontWeight:active?700:500,
    fontFamily:"system-ui",
    display:"flex",
    alignItems:"center",
    gap:6,
    whiteSpace:"nowrap",
    transition:"all 0.2s",
    boxShadow:active?"0 2px 8px rgba(226,0,26,0.3)":"none"
  }}>
    {label}{badge>0&&<span style={{background:active?"white":T.red,color:active?T.red:"white",borderRadius:20,padding:"1px 7px",fontSize:10,fontWeight:800}}>{badge}</span>}
  </button>
);
const MainTab=({label,active,onClick})=>(
  <button onClick={onClick}
    style={{
      flex:1, minWidth:120,
      background:active?"white":"transparent",
      border:"none",
      borderBottom:active?`4px solid ${T.red}`:"4px solid transparent",
      borderTop:active?"4px solid transparent":"4px solid transparent",
      color:active?T.red:"#666",
      padding:"18px 12px 14px",
      cursor:"pointer",
      fontSize:13,
      fontWeight:active?800:500,
      fontFamily:"system-ui",
      transition:"all 0.2s",
      letterSpacing:active?"-0.2px":"0",
      whiteSpace:"nowrap"
    }}>
    {label}
  </button>
);

// ── Paywall ───────────────────────────────────
const PaywallModal=({onClose,onSuccess})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:T.bg2,border:`1px solid ${T.border}`,borderRadius:20,padding:"40px 32px",maxWidth:440,width:"100%",position:"relative",boxShadow:T.shadowLg}}>
      <button onClick={onClose} style={{position:"absolute",top:16,right:20,background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer"}}>✕</button>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:36,marginBottom:8}}>🎓</div>
        <div style={{display:"inline-block",background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:100,padding:"5px 16px",fontSize:11,color:T.gold,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"system-ui"}}>Free analyses used up</div>
        <h2 style={{fontFamily:"Georgia,serif",color:T.text,fontSize:24,marginBottom:8}}>Unlock Unlimited Access</h2>
        <p style={{color:T.textMid,fontSize:14,lineHeight:1.6,fontFamily:"system-ui"}}>Full IELTS Writing coverage — Task 1 & 2, Academic & General Training.</p>
      </div>
      <div style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:12,padding:"16px",marginBottom:20,textAlign:"center"}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:48,fontWeight:900,color:T.text,lineHeight:1}}><sup style={{fontSize:20,verticalAlign:"super"}}>$</sup>19<sub style={{fontSize:14,color:T.textMuted}}>/month</sub></div>
        <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"system-ui"}}>Cancel anytime · No hidden fees</div>
      </div>
      <ul style={{listStyle:"none",padding:0,display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
        {["Unlimited analyses — Task 1 & 2, Academic & General","Complete mistake detection — spelling, grammar & punctuation","Inline essay annotations with correction bubbles","Progress tracker — see your improvement over time","Band Booster + Vocabulary upgrades from YOUR essay","Full IELTS Toolkit (Grammar, Templates, Pet Peeves)","Practice Mode with live AI coaching + inline corrections","Graph image upload for Task 1 Academic","Unlimited Band 8+ model responses"].map((f,i)=>(
          <li key={i} style={{display:"flex",gap:10,fontSize:13,color:T.textMid,fontFamily:"system-ui"}}><span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}</li>
        ))}
      </ul>
      <button onClick={()=>{savePro();onSuccess();}} style={{width:"100%",background:T.red,color:"white",fontWeight:700,fontSize:15,padding:"16px",borderRadius:4,border:"none",cursor:"pointer",fontFamily:"system-ui"}}>
        🔓 {STRIPE_CONFIGURED?"Start Pro — $19/month":"Unlock Pro (Test Mode)"}
      </button>
      {!STRIPE_CONFIGURED&&<p style={{textAlign:"center",color:T.textMuted,fontSize:11,marginTop:10,fontFamily:"system-ui"}}>Add Stripe keys to enable real payments.</p>}
    </div>
  </div>
);

// ── Progress Tracker ──────────────────────────
const ProgressTracker=({onUpgrade,isPro})=>{
  const history=getHistory();
  if(!isPro&&history.length===0) return (
    <Card style={{textAlign:"center",padding:"40px 24px"}}>
      <div style={{fontSize:40,marginBottom:16}}>📈</div>
      <h3 style={{fontFamily:"Georgia,serif",color:T.text,fontSize:20,marginBottom:8}}>Track Your Progress</h3>
      <p style={{color:T.textMid,fontSize:14,fontFamily:"system-ui",marginBottom:20,lineHeight:1.6}}>Complete your first essay analysis to start tracking your band score improvement over time.</p>
    </Card>
  );
  if(history.length===0) return (
    <Card style={{textAlign:"center",padding:"40px 24px"}}>
      <div style={{fontSize:40,marginBottom:16}}>📈</div>
      <p style={{color:T.textMid,fontSize:14,fontFamily:"system-ui"}}>No essays analysed yet. Complete your first analysis to start tracking progress!</p>
    </Card>
  );
  const latest=history[0];
  const previous=history[1];
  const bandDiff=previous?(latest.band-previous.band).toFixed(1):null;
  const mistakeDiff=previous?(latest.mistakeCount-previous.mistakeCount):null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      {/* Summary cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
        <Card style={{textAlign:"center",background:bandBg(latest.band),border:`1px solid ${bandColor(latest.band)}30`}}>
          <div style={{fontSize:42,fontWeight:900,color:bandColor(latest.band),fontFamily:"Georgia,serif",lineHeight:1}}>{latest.band}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Latest Band</div>
          {bandDiff!==null&&<div style={{fontSize:13,color:parseFloat(bandDiff)>=0?T.green:T.red,fontWeight:700,fontFamily:"system-ui",marginTop:4}}>{parseFloat(bandDiff)>=0?`▲ +${bandDiff}`:`▼ ${bandDiff}`} vs previous</div>}
        </Card>
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:42,fontWeight:900,color:T.text,fontFamily:"Georgia,serif",lineHeight:1}}>{history.length}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Essays Analysed</div>
        </Card>
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:42,fontWeight:900,color:T.red,fontFamily:"Georgia,serif",lineHeight:1}}>{latest.mistakeCount}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Latest Mistakes</div>
          {mistakeDiff!==null&&<div style={{fontSize:13,color:mistakeDiff<=0?T.green:T.red,fontWeight:700,fontFamily:"system-ui",marginTop:4}}>{mistakeDiff<=0?`▲ ${Math.abs(mistakeDiff)} fewer`:`▼ ${mistakeDiff} more`} vs previous</div>}
        </Card>
        {history.length>=2&&(
          <Card style={{textAlign:"center",background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
            <div style={{fontSize:42,fontWeight:900,color:T.green,fontFamily:"Georgia,serif",lineHeight:1}}>{Math.max(...history.map(h=>h.band))}</div>
            <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Best Band Ever</div>
          </Card>
        )}
      </div>

      {/* Band score history visual */}
      {history.length>=2&&(
        <Card>
          <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"system-ui"}}>📊 Band Score History</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120,padding:"0 8px"}}>
            {[...history].reverse().map((h,i)=>{
              const heightPct=((h.band-4)/(9-4))*100;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:11,fontWeight:700,color:bandColor(h.band),fontFamily:"system-ui"}}>{h.band}</div>
                  <div style={{width:"100%",background:bandColor(h.band),borderRadius:"4px 4px 0 0",height:`${heightPct}%`,minHeight:8,opacity:i===history.length-1?1:0.7,transition:"all 0.3s"}}/>
                  <div style={{fontSize:9,color:T.textMuted,fontFamily:"system-ui",textAlign:"center"}}>{new Date(h.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Criteria breakdown comparison */}
      {previous&&(
        <Card>
          <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"system-ui"}}>📋 Criteria Comparison — Latest vs Previous</div>
          {[["Task Achievement","taskAchievement"],["Coherence & Cohesion","coherenceCohesion"],["Lexical Resource","lexicalResource"],["Grammatical Range","grammaticalRange"]].map(([label,key])=>{
            const curr=latest.criteria?.[key]||0;
            const prev=previous.criteria?.[key]||0;
            const diff=(curr-prev).toFixed(1);
            return (
              <div key={key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:160,fontSize:13,color:T.textMid,fontFamily:"system-ui",flexShrink:0}}>{label}</div>
                <div style={{flex:1,background:T.bg3,borderRadius:6,height:8,position:"relative"}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${(curr/9)*100}%`,background:bandColor(curr),borderRadius:6,transition:"width 0.5s"}}/>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:bandColor(curr),fontFamily:"system-ui",width:32}}>{curr}</div>
                <div style={{fontSize:12,fontWeight:700,color:parseFloat(diff)>0?T.green:parseFloat(diff)<0?T.red:T.textMuted,fontFamily:"system-ui",width:40}}>
                  {parseFloat(diff)>0?`+${diff}`:diff}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      {/* Essay history list */}
      <Card>
        <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"system-ui"}}>📝 Essay History</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {history.map((h,i)=>(
            <div key={h.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:i===0?bandBg(h.band):T.bg3,borderRadius:10,border:i===0?`1px solid ${bandColor(h.band)}30`:`1px solid ${T.border}`}}>
              <div style={{fontSize:24,fontWeight:900,color:bandColor(h.band),fontFamily:"Georgia,serif",lineHeight:1,width:40}}>{h.band}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:T.text,fontFamily:"system-ui",fontWeight:600,marginBottom:2}}>{h.taskType==="task2"?"Task 2 Essay":h.taskType==="task1academic"?"Task 1 Academic":"Task 1 General"} {i===0&&<span style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:20,padding:"1px 8px",fontSize:10,color:T.gold,fontWeight:700}}>Latest</span>}</div>
                <div style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui"}}>{h.wordCount} words · {h.mistakeCount} mistakes · {new Date(h.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>
              </div>
              <div style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui",textAlign:"right"}}>{bandLabel(h.band)}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

// ── Toolkit ───────────────────────────────────
const ToolkitContent=({isPro,onUpgrade})=>{
  const [section,setSection]=useState("linking");
  const sections=[{key:"linking",label:"🔗 Linking Words",free:true},{key:"vocab",label:"📚 Vocabulary",free:false},{key:"grammar",label:"📐 Grammar",free:false},{key:"peeves",label:"⚠️ Pet Peeves",free:false},{key:"templates",label:"📝 Templates",free:false}];
  const LockedSection=()=>(
    <div style={{position:"relative"}}>
      <div style={{filter:"blur(3px)",pointerEvents:"none",userSelect:"none"}}>
        {[1,2,3].map(i=><Card key={i} style={{marginBottom:8}}><div style={{height:16,background:T.bg3,borderRadius:4,marginBottom:8,width:"60%"}}/><div style={{height:12,background:T.bg3,borderRadius:4,width:"90%"}}/></Card>)}
      </div>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
        <div style={{fontSize:36}}>🔒</div>
        <div style={{textAlign:"center"}}>
          <div style={{color:T.text,fontWeight:700,fontSize:15,fontFamily:"system-ui",marginBottom:4}}>Pro Feature</div>
          <button onClick={onUpgrade} style={{background:T.gold,color:"white",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"system-ui"}}>Upgrade to Pro — $19/mo</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <Card style={{marginBottom:16,background:"#fff5f5",border:"1px solid #ffcccc"}}>
        <p style={{color:T.red,fontSize:13,margin:0,fontFamily:"system-ui"}}>🎓 Your personal IELTS reference guide. {!isPro&&<span style={{color:T.textMid}}>Linking Words free. Upgrade for full access.</span>}</p>
      </Card>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {sections.map(s=>(
          <button key={s.key} onClick={()=>setSection(s.key)}
            style={{background:section===s.key?T.red:"white",border:section===s.key?`1px solid ${T.red}`:`1px solid ${T.border}`,color:section===s.key?"white":T.textMid,borderRadius:4,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"system-ui",display:"flex",alignItems:"center",gap:5}}>
            {s.label}{!s.free&&!isPro&&<span style={{fontSize:10}}>🔒</span>}
          </button>
        ))}
      </div>
      {section==="linking"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.linkingWords.map((cat,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:cat.color,marginBottom:10,fontFamily:"system-ui",textTransform:"uppercase",letterSpacing:"0.06em"}}>{cat.category}</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{cat.words.map((w,j)=><span key={j} style={{background:`${cat.color}12`,border:`1px solid ${cat.color}40`,borderRadius:8,padding:"4px 12px",fontSize:13,color:cat.color,fontFamily:"system-ui"}}>{w}</span>)}</div></Card>)}</div>}
      {section==="vocab"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.vocabulary.map((topic,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:T.gold,marginBottom:10,fontFamily:"system-ui",textTransform:"uppercase"}}>{topic.topic}</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{topic.words.map((pair,j)=><div key={j} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><span style={{background:"#fee2e2",borderRadius:6,padding:"3px 10px",fontSize:13,color:"#991b1b",fontFamily:"system-ui"}}>✗ {pair[0]}</span><span style={{color:T.textMuted}}>→</span><span style={{background:"#dcfce7",borderRadius:6,padding:"3px 10px",fontSize:13,color:"#166534",fontFamily:"system-ui"}}>✓ {pair[1]}</span></div>)}</div></Card>)}</div>:<LockedSection/>)}
      {section==="grammar"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.grammarRules.map((item,i)=><Card key={i} style={{border:`1px solid ${T.blueBorder}`,background:T.blueBg}}><div style={{fontSize:13,fontWeight:700,color:T.blue,marginBottom:6,fontFamily:"system-ui"}}>📐 {item.rule}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>{item.tip}</p></Card>)}</div>:<LockedSection/>)}
      {section==="peeves"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.petPeeves.map((item,i)=><Card key={i} style={{border:`1px solid ${T.redBorder}`,background:T.redBg}}><div style={{fontSize:13,fontWeight:700,color:T.red,marginBottom:6,fontFamily:"system-ui"}}>⚠️ {item.peeve}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>✅ {item.fix}</p></Card>)}</div>:<LockedSection/>)}
      {section==="templates"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.templates.map((item,i)=><Card key={i} style={{border:`1px solid ${T.amberBorder}`,background:T.amberBg}}><div style={{fontSize:11,fontWeight:700,color:T.amber,marginBottom:8,fontFamily:"system-ui",textTransform:"uppercase"}}>📝 {item.type}</div><p style={{color:T.text,fontSize:13,lineHeight:1.8,margin:0,fontFamily:"Georgia,serif",fontStyle:"italic",background:"white",padding:"10px 14px",borderRadius:8,whiteSpace:"pre-wrap",border:`1px solid ${T.amberBorder}`}}>{item.template}</p></Card>)}</div>:<LockedSection/>)}
    </div>
  );
};

// ── Practice Mode ─────────────────────────────
const PracticeMode=({isPro,onUpgrade})=>{
  const [questionMode,setQuestionMode]=useState("choose");
  const [selectedTopic,setSelectedTopic]=useState("Education");
  const [selectedQuestion,setSelectedQuestion]=useState("");
  const [customQuestion,setCustomQuestion]=useState("");
  const [practiceEssay,setPracticeEssay]=useState("");
  const [liveFeedback,setLiveFeedback]=useState(null);
  const [loadingFeedback,setLoadingFeedback]=useState(false);
  const [started,setStarted]=useState(false);
  const [showAnnotated,setShowAnnotated]=useState(false);
  const timerRef=useRef(null);
  const wordCount=countWords(practiceEssay);
  const question=selectedQuestion||customQuestion;

  // Convert spotErrors to mistake format for AnnotatedEssay
  const practiceAnnotations=liveFeedback?.spotErrors?.map(e=>({
    original:e.original, correction:e.correction, explanation:e.explanation,
    category:e.category||"Grammar", severity:"moderate"
  }))||[];

  const fetchLiveFeedback=useCallback(async(text)=>{
    if(countWords(text)<25) return;
    if(!isPro&&getStoredUses()>=FREE_USES_LIMIT){ onUpgrade(); return; }
    setLoadingFeedback(true);
    try{
      const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-opus-4-6",max_tokens:800,system:PRACTICE_SYSTEM,messages:[{role:"user",content:`Question: "${question}"\n\nEssay so far:\n${text}\n\nGive coaching feedback with spotted errors as JSON.`}]})});
      const data=await res.json();
      const raw=data.content?.map(b=>b.text||"").join("")||"";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setLiveFeedback(parsed);
      if(!isPro){ const n=getStoredUses()+1; saveUses(n); }
    }catch(e){ console.error(e); }
    finally{ setLoadingFeedback(false); }
  },[question,isPro,onUpgrade]);

  const handleEssayChange=(e)=>{
    const val=e.target.value;
    setPracticeEssay(val);
    setShowAnnotated(false);
    if(timerRef.current) clearTimeout(timerRef.current);
    timerRef.current=setTimeout(()=>{ fetchLiveFeedback(val); setShowAnnotated(true); },1500);
  };

  return (
    <div>
      <Card style={{marginBottom:20,background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
        <p style={{color:T.blue,fontSize:13,margin:0,fontFamily:"system-ui"}}>🎯 <strong>Practice Mode</strong> — Write freely and get live AI coaching every ~1.5 seconds. Mistakes are highlighted inline in your essay. Each feedback uses one free try.</p>
      </Card>
      {!started?(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",gap:8}}>
            {[["choose","📋 Choose a Question"],["custom","✏️ Write My Own"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setQuestionMode(mode)} style={{flex:1,background:questionMode===mode?T.gold:"white",border:questionMode===mode?`1px solid ${T.gold}`:`1px solid ${T.border}`,borderRadius:10,padding:"10px",cursor:"pointer",color:questionMode===mode?"white":T.textMid,fontSize:13,fontWeight:600,fontFamily:"system-ui"}}>{label}</button>
            ))}
          </div>
          {questionMode==="choose"&&(
            <div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {Object.keys(PRACTICE_QUESTIONS).map(topic=>(
                  <button key={topic} onClick={()=>{ setSelectedTopic(topic); setSelectedQuestion(""); }}
                    style={{background:selectedTopic===topic?T.red:"white",border:selectedTopic===topic?`1px solid ${T.red}`:`1px solid ${T.border}`,borderRadius:8,padding:"6px 14px",cursor:"pointer",color:selectedTopic===topic?"white":T.textMid,fontSize:12,fontWeight:600,fontFamily:"system-ui"}}>{topic}</button>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {PRACTICE_QUESTIONS[selectedTopic].map((q,i)=>(
                  <div key={i} onClick={()=>setSelectedQuestion(q)}
                    style={{background:selectedQuestion===q?"#fff0f0":"white",border:selectedQuestion===q?`2px solid ${T.red}`:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",color:selectedQuestion===q?T.red:T.textMid,fontSize:13,fontFamily:"system-ui",lineHeight:1.6,transition:"all 0.15s",boxShadow:T.shadow}}>
                    {i+1}. {q}
                  </div>
                ))}
              </div>
            </div>
          )}
          {questionMode==="custom"&&(
            <div>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"system-ui",fontWeight:600}}>Your Question</label>
              <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} rows={3}
                placeholder="Paste your own IELTS question here..."
                style={{width:"100%",background:"white",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",boxShadow:T.shadow}}/>
            </div>
          )}
          <button onClick={()=>{ if(question) setStarted(true); }} disabled={!question}
            style={{background:question?T.red:"#e2e8f0",border:"none",borderRadius:4,color:question?"white":T.textMuted,fontSize:15,fontWeight:700,padding:"15px",cursor:question?"pointer":"not-allowed",fontFamily:"system-ui"}}>
            {question?"🖊️ Start Practice Session":"Select a question to begin"}
          </button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
            <div style={{fontSize:11,color:T.blue,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontFamily:"system-ui"}}>Your Question</div>
            <p style={{color:T.text,fontSize:14,margin:0,lineHeight:1.6,fontFamily:"system-ui"}}>{question}</p>
          </Card>

          <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
            {/* Writing area */}
            <div style={{flex:2,minWidth:280,display:"flex",flexDirection:"column",gap:10}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"system-ui",fontWeight:600}}>
                Your Essay
                <span style={{color:wordCount>=250?T.green:wordCount>=150?T.amber:T.red,marginLeft:10,fontWeight:400}}>{wordCount} words {wordCount>=250?"✓":wordCount>=150?"(keep going!)":"(too short)"}</span>
              </label>
              <textarea value={practiceEssay} onChange={handleEssayChange} rows={12}
                placeholder="Start writing here — live feedback and inline corrections appear as you pause!"
                style={{width:"100%",background:"white",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",boxShadow:T.shadow}}/>

              {/* Annotated preview */}
              {showAnnotated&&liveFeedback&&practiceAnnotations.length>0&&(
                <Card style={{border:`1px solid ${T.amberBorder}`}}>
                  <div style={{fontSize:11,color:T.amber,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"system-ui",display:"flex",justifyContent:"space-between"}}>
                    <span>✏️ Your Essay — Click underlined mistakes</span>
                    <span style={{color:T.red}}>{practiceAnnotations.length} spotted</span>
                  </div>
                  <AnnotatedEssay essay={practiceEssay} mistakes={practiceAnnotations}/>
                </Card>
              )}

              <button onClick={()=>{ setStarted(false); setPracticeEssay(""); setLiveFeedback(null); setShowAnnotated(false); setSelectedQuestion(""); setCustomQuestion(""); }}
                style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMid,fontSize:12,padding:"6px 14px",cursor:"pointer",fontFamily:"system-ui",alignSelf:"flex-start"}}>← Change Question</button>
            </div>

            {/* Live feedback panel */}
            <div style={{flex:1,minWidth:220,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"system-ui"}}>
                {loadingFeedback?"🔍 Analysing...":"💬 Live Coaching"}
              </div>
              {loadingFeedback&&<Card style={{textAlign:"center",background:T.blueBg,border:`1px solid ${T.blueBorder}`}}><div style={{color:T.blue,fontSize:13,fontFamily:"system-ui"}}>Reading your essay... 🎓</div></Card>}
              {liveFeedback&&!loadingFeedback&&(
                <>
                  <Card style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:36,fontWeight:900,color:bandColor(liveFeedback.estimatedBand),fontFamily:"Georgia,serif",lineHeight:1}}>{liveFeedback.estimatedBand}</div>
                    <div><div style={{fontSize:10,color:T.textMuted,fontFamily:"system-ui",textTransform:"uppercase",letterSpacing:"0.08em"}}>Estimated Band</div><div style={{fontSize:13,color:bandColor(liveFeedback.estimatedBand),fontFamily:"system-ui",fontWeight:700}}>{bandLabel(liveFeedback.estimatedBand)}</div></div>
                  </Card>
                  {liveFeedback.quickFix&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><div style={{fontSize:11,color:T.red,fontWeight:700,marginBottom:4,fontFamily:"system-ui"}}>🚨 QUICK FIX</div><p style={{color:"#991b1b",fontSize:13,margin:0,lineHeight:1.5,fontFamily:"system-ui"}}>{liveFeedback.quickFix}</p></Card>}
                  {liveFeedback.spotErrors?.length>0&&(
                    <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`}}>
                      <div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:8,fontFamily:"system-ui"}}>✏️ ERRORS SPOTTED ({liveFeedback.spotErrors.length})</div>
                      {liveFeedback.spotErrors.map((e,i)=>(
                        <div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:i<liveFeedback.spotErrors.length-1?`1px solid ${T.amberBorder}`:"none"}}>
                          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                            <span style={{background:"#fee2e2",borderRadius:4,padding:"1px 6px",fontSize:12,color:"#991b1b",fontStyle:"italic"}}>"{e.original}"</span>
                            <span style={{color:T.textMuted,fontSize:12}}>→</span>
                            <span style={{background:"#dcfce7",borderRadius:4,padding:"1px 6px",fontSize:12,color:"#166534",fontWeight:600}}>"{e.correction}"</span>
                          </div>
                          <div style={{fontSize:11,color:T.textMid,fontFamily:"system-ui"}}>{e.explanation}</div>
                        </div>
                      ))}
                    </Card>
                  )}
                  <Card style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
                    <div style={{fontSize:11,color:T.blue,fontWeight:700,marginBottom:8,fontFamily:"system-ui"}}>💡 TIPS</div>
                    {liveFeedback.tips?.map((tip,i)=><div key={i} style={{color:T.textMid,fontSize:13,lineHeight:1.5,marginBottom:5,fontFamily:"system-ui"}}>• {tip}</div>)}
                  </Card>
                  {liveFeedback.encouragement&&<Card style={{background:"#fff5f5",border:"1px solid #ffcccc"}}><p style={{color:T.gold,fontSize:12,margin:0,fontStyle:"italic",fontFamily:"system-ui"}}>💬 {liveFeedback.encouragement}</p></Card>}
                </>
              )}
              {!liveFeedback&&!loadingFeedback&&<Card style={{textAlign:"center",padding:"24px 16px"}}><div style={{fontSize:28,marginBottom:8}}>🖊️</div><p style={{color:T.textMuted,fontSize:13,margin:0,fontFamily:"system-ui"}}>Start writing — feedback and corrections appear after a short pause!</p></Card>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


// ── Analytics Helper ─────────────────────────
// Replace GA_MEASUREMENT_ID with your Google Analytics 4 ID (e.g. G-XXXXXXXXXX)
// Get it free at analytics.google.com → Admin → Create Property
const GA_ID = "G-XXXXXXXXXX"; // ← Replace this with your GA4 ID

const trackEvent = (eventName, params={}) => {
  try {
    if(window.gtag) window.gtag("event", eventName, params);
  } catch(e) {}
};

// ── Contact Page ─────────────────────────────
// Uses EmailJS to send emails to your Gmail (free)
// Setup: go to emailjs.com → create account → create service → create template
// Then replace the three placeholders below
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";    // ← from emailjs.com
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";  // ← from emailjs.com
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";     // ← from emailjs.com

const ContactPage = () => {
  const [form, setForm] = useState({ name:"", country:"", age:"", email:"", message:"" });
  const [status, setStatus] = useState(null); // null | "sending" | "success" | "error"

  const COUNTRIES = ["Afghanistan","Albania","Algeria","Argentina","Australia","Austria","Bahrain","Bangladesh","Belgium","Brazil","Canada","Chile","China","Colombia","Croatia","Czech Republic","Denmark","Egypt","Ethiopia","Finland","France","Germany","Ghana","Greece","Hungary","India","Indonesia","Iran","Iraq","Ireland","Italy","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Lebanon","Libya","Malaysia","Mexico","Morocco","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Palestine","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia","Singapore","South Africa","South Korea","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Thailand","Tunisia","Turkey","UAE","UK","USA","Ukraine","Vietnam","Yemen","Other"];

  const AGE_GROUPS = ["Under 18","18–24","25–34","35–44","45–54","55+"];

  const handleSubmit = async () => {
    if(!form.name||!form.email||!form.message){ setStatus("error"); return; }
    setStatus("sending");
    trackEvent("contact_form_submit", { country: form.country, age_group: form.age });
    try {
      if(EMAILJS_PUBLIC_KEY === "YOUR_PUBLIC_KEY") {
        // Demo mode — EmailJS not configured yet
        await new Promise(r => setTimeout(r, 1500));
        setStatus("success");
        setForm({ name:"", country:"", age:"", email:"", message:"" });
        return;
      }
      await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        from_name: form.name,
        from_email: form.email,
        country: form.country,
        age_group: form.age,
        message: form.message,
        to_email: "diogenes.agnos@gmail.com"
      }, EMAILJS_PUBLIC_KEY);
      setStatus("success");
      setForm({ name:"", country:"", age:"", email:"", message:"" });
    } catch(e) {
      setStatus("error");
    }
  };

  const inputStyle = { width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", fontFamily:"system-ui", outline:"none", boxSizing:"border-box", boxShadow:T.shadow, transition:"border-color 0.2s" };
  const labelStyle = { display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6, fontFamily:"system-ui", fontWeight:600 };

  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px 0"}}>
      {/* Page header */}
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:48,marginBottom:12}}>✉️</div>
        <h2 style={{fontFamily:"Arial Black,system-ui",color:T.text,fontSize:28,margin:"0 0 8px 0",fontWeight:900}}>Contact Us</h2>
        <p style={{color:T.textMid,fontSize:15,fontFamily:"system-ui",margin:0,lineHeight:1.6}}>Have a question, feedback or need support? We'd love to hear from you.</p>
        <p style={{color:T.textMuted,fontSize:13,fontFamily:"system-ui",marginTop:4,direction:"rtl"}}>هل لديك سؤال أو ملاحظة؟ تواصل معنا بكل سرور.</p>
      </div>

      <Card style={{border:"2px solid #e0e0e0"}}>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          {/* Name + Country row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={labelStyle}>Full Name *</label>
              <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name" style={inputStyle}/>
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <select value={form.country} onChange={e=>setForm({...form,country:e.target.value})} style={{...inputStyle,background:"white"}}>
                <option value="">Select country...</option>
                {COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Age + Email row */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={labelStyle}>Age Group</label>
              <select value={form.age} onChange={e=>setForm({...form,age:e.target.value})} style={{...inputStyle,background:"white"}}>
                <option value="">Select age group...</option>
                {AGE_GROUPS.map(a=><option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="your@email.com" style={inputStyle}/>
            </div>
          </div>

          {/* Message */}
          <div>
            <label style={labelStyle}>Message *</label>
            <textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Write your message here... / اكتب رسالتك هنا..." rows={5} style={{...inputStyle,resize:"vertical",lineHeight:1.6}}/>
          </div>

          {/* Status messages */}
          {status==="error"&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:13,margin:0,fontFamily:"system-ui"}}>⚠️ Please fill in all required fields (Name, Email, Message).</p></Card>}
          {status==="success"&&<Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}><p style={{color:T.green,fontSize:13,margin:0,fontFamily:"system-ui"}}>✅ Message sent successfully! We'll get back to you soon. / تم إرسال رسالتك بنجاح!</p></Card>}

          {/* Submit button */}
          <button onClick={handleSubmit} disabled={status==="sending"}
            style={{background:status==="sending"?"#ccc":T.red,border:"none",borderRadius:4,color:"white",fontSize:15,fontWeight:700,padding:"16px",cursor:status==="sending"?"not-allowed":"pointer",fontFamily:"system-ui"}}>
            {status==="sending"?"⏳ Sending...":"Send Message →"}
          </button>

          {/* EmailJS setup note */}
          {EMAILJS_PUBLIC_KEY==="YOUR_PUBLIC_KEY"&&(
            <p style={{textAlign:"center",color:T.textMuted,fontSize:11,fontFamily:"system-ui",fontStyle:"italic",margin:0}}>
              📧 EmailJS not configured yet — messages won't be delivered until you add your EmailJS keys in the code.
            </p>
          )}
        </div>
      </Card>


    </div>
  );
};

// ── MAIN APP ──────────────────────────────────
export default function IELTSBot(){
  const [mainView,setMainView]=useState("analyze"); // analyze | practice | progress | toolkit | contact
  const [taskType,setTaskType]=useState("task2");
  const [topic,setTopic]=useState("");
  const [essay,setEssay]=useState("");
  const [image,setImage]=useState(null);
  const [imagePreview,setImagePreview]=useState(null);
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(null);
  const [error,setError]=useState("");
  const [activeTab,setActiveTab]=useState("scores");
  const [showPaywall,setShowPaywall]=useState(false);
  const [uses,setUses]=useState(getStoredUses);
  const [proUser,setProUser]=useState(getStoredPro);
  const [lang,setLang]=useState("en");
  const fileRef=useRef();
  const analyzeRef=useRef(null);

  const switchLang=(newLang)=>{
    setLang(newLang);
    if(result){ setTimeout(()=>analyzeRef.current?.click(),150); }
  };

  const usesLeft=FREE_USES_LIMIT-uses;
  const minWords=TASK_TYPES[taskType].minWords;
  const wordCount=countWords(essay);
  const sampleWordCount=result?.sampleEssay?countWords(result.sampleEssay):0;

  const handleProSuccess=()=>{ savePro(); setProUser(true); setShowPaywall(false); trackEvent('upgrade_to_pro'); };
  const handleImageUpload=(e)=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=(ev)=>{ setImage(ev.target.result.split(",")[1]); setImagePreview(ev.target.result); }; reader.readAsDataURL(file); };

  const analyze=async()=>{
    if(!topic.trim()||!essay.trim()){ setError("Please provide both the task question and your response."); return; }
    if(wordCount<30){ setError("Response too short."); return; }
    if(taskType==="task1academic"&&!image){ setError("Please upload the graph/chart image for Academic Task 1."); return; }
    if(!proUser&&uses>=FREE_USES_LIMIT){ setShowPaywall(true); trackEvent('paywall_shown',{task_type:taskType}); return; }
    setError(""); setLoading(true); setResult(null);
    try{
      const messageContent=taskType==="task1academic"&&image
        ?[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:image}},{type:"text",text:`IELTS ${TASK_TYPES[taskType].label}\nQuestion: "${topic}"\nEssay:\n${essay}\n\nEvaluate thoroughly. Count words by splitting on spaces. Respond as JSON only.`}]
        :`IELTS ${TASK_TYPES[taskType].label}\nQuestion: "${topic}"\nEssay:\n${essay}\n\nEvaluate thoroughly. Count words by splitting on spaces. Respond as JSON only.`;
      const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-opus-4-6",max_tokens:4000,system:getSystemPrompt(taskType,lang),messages:[{role:"user",content:messageContent}]})});
      const data=await res.json();
      const text=data.content.map(b=>b.text||"").join("");
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      if(!proUser){ const n=uses+1; setUses(n); saveUses(n); }
      // Save to history
      addToHistory({ band:parsed.overallBand, taskType, wordCount:parsed.wordCount||wordCount, mistakeCount:parsed.mistakes?.length||0, criteria:{ taskAchievement:parsed.criteria?.taskAchievement?.band, coherenceCohesion:parsed.criteria?.coherenceCohesion?.band, lexicalResource:parsed.criteria?.lexicalResource?.band, grammaticalRange:parsed.criteria?.grammaticalRange?.band } });
      setResult(parsed); setActiveTab("annotated");
      trackEvent("essay_analyzed", { task_type: taskType, band_score: parsed.overallBand, language: lang, is_pro: proUser });
    }catch(e){ setError("Something went wrong. Please try again."); }
    finally{ setLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#f0f2f5",color:T.text,paddingBottom:80}}>
      {showPaywall&&<PaywallModal onClose={()=>setShowPaywall(false)} onSuccess={handleProSuccess}/>}

      {/* ── TOP NAV BAR ── */}
      <div style={{background:"rgba(20,20,20,0.97)",backdropFilter:"blur(12px)",position:"sticky",top:0,zIndex:200,borderBottom:"1px solid rgba(255,255,255,0.08)"}}>
        <div style={{maxWidth:1100,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:60}}>
          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{background:T.red,color:"white",fontWeight:900,fontSize:16,padding:"5px 12px",letterSpacing:"-0.5px",fontFamily:"Arial Black,system-ui",borderRadius:3}}>BandUp</div>
            <div style={{color:"white",fontWeight:900,fontSize:16,fontFamily:"Arial Black,system-ui",letterSpacing:"-0.5px"}}>AI</div>
            <div style={{width:1,height:20,background:"rgba(255,255,255,0.2)",margin:"0 8px"}}/>
            <div style={{color:"rgba(255,255,255,0.5)",fontSize:11,fontFamily:"system-ui",letterSpacing:"0.1em",textTransform:"uppercase"}}>IELTS Writing</div>
          </div>
          {/* Right side */}
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{background:proUser?"rgba(0,180,100,0.2)":usesLeft<=0?"rgba(226,0,26,0.3)":"rgba(255,255,255,0.1)",border:`1px solid ${proUser?"rgba(0,200,100,0.4)":usesLeft<=0?"rgba(226,0,26,0.5)":"rgba(255,255,255,0.2)"}`,borderRadius:20,padding:"4px 14px",fontSize:12,fontFamily:"system-ui",color:proUser?"#5ef0a0":usesLeft<=0?"#ff8888":"rgba(255,255,255,0.85)",fontWeight:600}}>
              {proUser?"✓ Pro":usesLeft>0?`${usesLeft} free left`:"Limit reached"}
            </div>
            <button onClick={()=>switchLang("en")} style={{background:lang==="en"?T.red:"transparent",border:`1px solid ${lang==="en"?T.red:"rgba(255,255,255,0.25)"}`,borderRadius:3,padding:"5px 12px",fontSize:11,fontWeight:700,color:"white",cursor:"pointer",fontFamily:"system-ui",transition:"all 0.2s"}}>🇬🇧 EN</button>
            <button onClick={()=>switchLang("ar")} style={{background:lang==="ar"?T.red:"transparent",border:`1px solid ${lang==="ar"?T.red:"rgba(255,255,255,0.25)"}`,borderRadius:3,padding:"5px 12px",fontSize:11,fontWeight:700,color:"white",cursor:"pointer",fontFamily:"system-ui",transition:"all 0.2s"}}>🇸🇦 AR</button>
          </div>
        </div>
      </div>

      {/* ── HERO WITH BACKGROUND IMAGE ── */}
      <div style={{
        position:"relative",
        minHeight:340,
        background:"#111",
        backgroundImage:"url('https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=1600&q=80&auto=format&fit=crop')",
        backgroundSize:"cover",
        backgroundPosition:"center 30%",
        display:"flex",
        flexDirection:"column",
        alignItems:"center",
        justifyContent:"center",
        padding:"60px 24px 48px",
        overflow:"hidden"
      }}>
        {/* Dark overlay with red tint at bottom */}
        <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(20,0,0,0.8) 100%)"}}/>
        {/* Red accent line at top */}
        <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:T.red}}/>
        {/* Content */}
        <div style={{position:"relative",textAlign:"center",maxWidth:700}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(226,0,26,0.15)",border:"1px solid rgba(226,0,26,0.4)",borderRadius:20,padding:"5px 16px",marginBottom:20}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:T.red,animation:"pulse 2s infinite"}}/>
            <span style={{color:"#ff9999",fontSize:11,fontFamily:"system-ui",letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:600}}>AI-Powered · IELTS Writing Examiner</span>
          </div>
          <h1 style={{margin:"0 0 16px",fontSize:"clamp(32px,5.5vw,62px)",fontWeight:900,fontFamily:"Arial Black,system-ui",color:"white",lineHeight:1.05,letterSpacing:"-1px"}}>
            Write better.<br/><span style={{color:T.red}}>Score higher.</span>
          </h1>
          <p style={{color:"rgba(255,255,255,0.7)",fontSize:16,fontFamily:"system-ui",margin:"0 0 28px",lineHeight:1.6}}>
            Instant AI band scores · Complete mistake detection · Band 8+ model essays · Practice Mode
          </p>
          <div style={{display:"flex",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            {[["📊","Task 1 Academic"],["✍️","Task 2 Essay"],["✉️","Task 1 General"]].map(([icon,label])=>(
              <div key={label} style={{background:"rgba(255,255,255,0.1)",backdropFilter:"blur(8px)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"8px 18px",color:"white",fontSize:13,fontFamily:"system-ui",fontWeight:600}}>{icon} {label}</div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT WRAPPER ── */}
      <div style={{maxWidth:960,margin:"-1px auto 0",position:"relative"}}>

        {/* ── NAVIGATION TABS ── */}
        <div style={{background:"white",boxShadow:"0 4px 20px rgba(0,0,0,0.12)",borderRadius:"0 0 0 0",position:"relative",zIndex:10}}>
          <div style={{display:"flex",gap:0,overflowX:"auto"}}>
            <MainTab label="🎓 Analyze Essay" active={mainView==="analyze"} onClick={()=>{ setMainView("analyze"); trackEvent("nav_click",{page:"analyze"}); }}/>
            <MainTab label="🖊️ Practice Mode" active={mainView==="practice"} onClick={()=>{ setMainView("practice"); trackEvent("nav_click",{page:"practice"}); }}/>
            <MainTab label="📈 Progress" active={mainView==="progress"} onClick={()=>{ setMainView("progress"); trackEvent("nav_click",{page:"progress"}); }}/>
            <MainTab label="📚 Toolkit" active={mainView==="toolkit"} onClick={()=>{ setMainView("toolkit"); trackEvent("nav_click",{page:"toolkit"}); }}/>
            <MainTab label="✉️ Contact" active={mainView==="contact"} onClick={()=>{ setMainView("contact"); trackEvent("nav_click",{page:"contact"}); }}/>
          </div>
        </div>

        {/* ── PAGE CONTENT ── */}
        <div style={{padding:"28px 24px 60px"}}>

        {/* ── ANALYZE ── */}
        {mainView==="analyze"&&(
          <div style={{padding:"24px 0"}}>
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:"system-ui",fontWeight:600}}>Select Task Type</label>
              <p style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui",marginBottom:10,marginTop:0}}>Choose the type of writing task you are submitting. Task 2 is the essay. Task 1 Academic is for graphs/charts. Task 1 General is for letters.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {Object.entries(TASK_TYPES).map(([key,task])=>(
                  <button key={key} onClick={()=>{ setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); }}
                    style={{
                      background:taskType===key?"#1a1a1a":"white",
                      border:taskType===key?`2px solid #1a1a1a`:"1px solid #e8e8e8",
                      borderBottom:taskType===key?`4px solid ${T.red}`:"4px solid #e8e8e8",
                      borderRadius:8,
                      padding:"18px 12px",
                      cursor:"pointer",
                      textAlign:"center",
                      boxShadow:taskType===key?"0 8px 24px rgba(0,0,0,0.2)":"0 2px 8px rgba(0,0,0,0.06)",
                      transform:taskType===key?"translateY(-2px)":"none",
                      transition:"all 0.2s"
                    }}>
                    <div style={{fontSize:22,marginBottom:6}}>{task.icon}</div>
                    <div style={{fontSize:12,fontWeight:700,color:taskType===key?"white":T.text,fontFamily:"system-ui",marginBottom:2,fontWeight:700}}>{task.label}</div>
                    <div style={{fontSize:11,color:T.textMuted,fontFamily:"system-ui"}}>{task.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {taskType==="task1academic"&&(
              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"system-ui",fontWeight:600}}>Upload Graph / Chart Image *</label>
                <div onClick={()=>fileRef.current.click()} style={{border:`2px dashed ${imagePreview?T.greenBorder:"#e2001a"}`,borderRadius:12,padding:"20px",textAlign:"center",cursor:"pointer",background:"white",boxShadow:T.shadow}}>
                  {imagePreview?(<div><img src={imagePreview} alt="graph" style={{maxHeight:180,maxWidth:"100%",borderRadius:8,marginBottom:8}}/><div style={{fontSize:12,color:T.green,fontFamily:"system-ui"}}>✓ Uploaded — click to change</div></div>):(<div><div style={{fontSize:32,marginBottom:8}}>📊</div><div style={{fontSize:14,color:T.gold,fontFamily:"system-ui",marginBottom:4}}>Click to upload graph/chart image</div><div style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui"}}>JPG, PNG — AI reads and evaluates the graph</div></div>)}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7,fontFamily:"system-ui",fontWeight:600}}>
                  {taskType==="task1general"?"Letter Task Instructions":taskType==="task1academic"?"Task Description":"Essay Question / Topic"}
                </label>
                <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
                  placeholder={taskType==="task2"?"e.g. Some people think universities should focus on job skills. Discuss both views and give your opinion.":taskType==="task1academic"?"e.g. The graph below shows changes in energy consumption. Summarise the information and make comparisons.":"e.g. You recently bought a laptop online but it arrived damaged. Write a letter to the manager."}
                  style={{width:"100%",background:"white",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",boxShadow:T.shadow}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7,fontFamily:"system-ui",fontWeight:600}}>
                  Student's Response <span style={{fontSize:11,color:T.textMuted,fontWeight:400,textTransform:"none",letterSpacing:0}}>(minimum {minWords} words required for Task {taskType==="task2"?"2":"1"})</span>
                  <span style={{color:wordCount>=minWords?T.green:wordCount>=(minWords*0.6)?T.amber:T.red,marginLeft:10,fontWeight:500,fontFamily:"system-ui"}}>
                    {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords} required${wordCount>10&&wordCount<minWords?" — penalty applies":""})`}
                  </span>
                </label>
                <textarea value={essay} onChange={e=>setEssay(e.target.value)}
                  placeholder={taskType==="task1general"?"Dear Sir/Madam,\n\nI am writing to...":taskType==="task1academic"?"The graph illustrates...":"Paste the student's essay here..."}
                  rows={10}
                  style={{width:"100%",background:"white",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",boxShadow:T.shadow}}/>
              </div>
              {error&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:14,margin:0,fontFamily:"system-ui"}}>{error}</p></Card>}
              {!proUser&&usesLeft===1&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"system-ui"}}>⚠️ Last free analysis! </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"system-ui"}}>Upgrade to Pro</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"system-ui"}}> for unlimited access.</span>
                </Card>
              )}
              <button ref={analyzeRef} onClick={analyze} disabled={loading}
                style={{
                  background:loading?"#ccc":"#1a1a1a",
                  border:"none",
                  borderRadius:8,
                  borderBottom:loading?"4px solid #aaa":`4px solid ${T.red}`,
                  color:"white",
                  fontSize:16,
                  fontWeight:800,
                  padding:"16px 40px",
                  cursor:loading?"not-allowed":"pointer",
                  fontFamily:"system-ui",
                  transition:"all 0.2s",
                  display:"flex",
                  alignItems:"center",
                  gap:10,
                  justifyContent:"center",
                  letterSpacing:"-0.3px",
                  boxShadow:loading?"none":"0 4px 20px rgba(0,0,0,0.2)"
                }}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?"🔓 Upgrade to Continue":`Analyze ${TASK_TYPES[taskType].label} →`}
              </button>

              {/* Language Selector */}
              <Card style={{background:T.bg3,border:`1px solid ${T.border}`,marginTop:4}}>
                <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"system-ui"}}>🌐 Feedback Language / لغة التغذية الراجعة</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:lang==="en"?"#fff0f0":"white",border:`1px solid ${lang==="en"?T.red:T.border}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s"}} onClick={()=>switchLang("en")}>
                    <div style={{fontSize:22,flexShrink:0}}>🇬🇧</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:lang==="en"?T.red:T.text,fontFamily:"system-ui",marginBottom:2}}>English — Feedback in English</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui"}}>All scores, corrections and tips will appear in English.</div>
                      {lang==="en"&&result&&<div style={{fontSize:11,color:T.amber,fontFamily:"system-ui",marginTop:4}}>⚠️ Switching language will re-run the analysis.</div>}
                    </div>
                    {lang==="en"&&<span style={{background:T.red,color:"white",borderRadius:2,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"system-ui",flexShrink:0}}>✓ Active</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:lang==="ar"?"#fff0f0":"white",border:`1px solid ${lang==="ar"?T.red:T.border}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s",direction:"ltr"}} onClick={()=>switchLang("ar")}>
                    <div style={{fontSize:22,flexShrink:0}}>🇸🇦</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:lang==="ar"?T.red:T.text,fontFamily:"system-ui",marginBottom:2}}>عربي — التغذية الراجعة بالعربية</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui",direction:"rtl",textAlign:"right"}}>ستظهر جميع الدرجات والتصحيحات والنصائح باللغة العربية.</div>
                      {lang==="ar"&&result&&<div style={{fontSize:11,color:T.amber,fontFamily:"system-ui",marginTop:4,direction:"rtl",textAlign:"right"}}>⚠️ تغيير اللغة سيُعيد تحليل المقال من جديد.</div>}
                    </div>
                    {lang==="ar"&&<span style={{background:T.red,color:"white",borderRadius:2,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"system-ui",flexShrink:0}}>✓ نشط</span>}
                  </div>
                </div>
              </Card>
            </div>

            {result&&(
              <div style={{marginTop:32}}>
                <div style={{
                  background:`linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)`,
                  borderRadius:12,
                  padding:"28px 32px",
                  marginBottom:24,
                  display:"flex",
                  alignItems:"center",
                  gap:28,
                  flexWrap:"wrap",
                  boxShadow:"0 8px 32px rgba(0,0,0,0.2)",
                  borderLeft:`6px solid ${bandColor(result.overallBand)}`
                }}>
                  <div style={{textAlign:"center",minWidth:100}}>
                    <div style={{fontSize:72,fontWeight:900,color:bandColor(result.overallBand),lineHeight:1,fontFamily:"Georgia,serif",textShadow:`0 0 40px ${bandColor(result.overallBand)}60`}}>{result.overallBand}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.5)",fontFamily:"monospace",letterSpacing:"0.15em",textTransform:"uppercase",marginTop:4}}>Overall Band</div>
                  </div>
                  <div style={{flex:1,minWidth:180}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                      <div style={{fontSize:20,fontWeight:800,color:"white",fontFamily:"Georgia,serif"}}>{bandLabel(result.overallBand)} <span style={{color:bandColor(result.overallBand)}}>User</span></div>
                      <span style={{background:"white",border:`1px solid ${result.wordCount>=minWords?T.greenBorder:T.redBorder}`,borderRadius:20,padding:"2px 10px",fontSize:12,color:result.wordCount>=minWords?T.green:T.red,fontFamily:"system-ui",fontWeight:600}}>
                        {result.wordCount} words {result.wordCount>=minWords?"✓":"⚠ below minimum"}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {result.strengths?.map((s,i)=><span key={i} style={{background:"rgba(0,200,120,0.15)",border:"1px solid rgba(0,200,120,0.3)",borderRadius:20,padding:"3px 12px",fontSize:12,color:"#5ef0a0",fontFamily:"system-ui",fontWeight:600}}>✓ {s}</span>)}
                    </div>
                  </div>
                </div>

                {result.mistakes?.length>0&&(
                  <Card style={{marginBottom:16,background:T.bg3}}>
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:13,color:T.text,fontFamily:"system-ui",marginBottom:2,fontWeight:700}}>👆 Click any underlined word to see its correction and explanation.</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"system-ui",direction:"rtl",textAlign:"right",marginBottom:8}}>اضغط على أي كلمة تحتها خط لرؤية التصحيح والشرح.</div>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      {[["major",T.red,"Major — خطأ كبير"],["moderate",T.amber,"Moderate — خطأ متوسط"],["minor",T.blue,"Minor — خطأ بسيط"]].map(([s,c,l])=>(
                        <span key={s} style={{fontSize:12,fontFamily:"system-ui",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{display:"inline-block",width:20,height:2,background:c,borderRadius:1}}/><span style={{color:c,fontWeight:600}}>{l}</span>
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap",background:"#f0f2f5",padding:6,borderRadius:10,border:"1px solid #e4e4e4"}}>
                  <TabBtn label="📝 Annotated Essay" active={activeTab==="annotated"} onClick={()=>setActiveTab("annotated")}/>
                  <TabBtn label="📊 Scores" active={activeTab==="scores"} onClick={()=>setActiveTab("scores")}/>
                  <TabBtn label="🔍 Mistakes" active={activeTab==="mistakes"} onClick={()=>setActiveTab("mistakes")} badge={result.mistakes?.length}/>
                  <TabBtn label="📈 Band Booster" active={activeTab==="booster"} onClick={()=>setActiveTab("booster")}/>
                  <TabBtn label="💬 Vocabulary" active={activeTab==="vocab"} onClick={()=>setActiveTab("vocab")}/>
                  <TabBtn label="🎓 Tips" active={activeTab==="tips"} onClick={()=>setActiveTab("tips")}/>
                  <TabBtn label="✨ Sample" active={activeTab==="sample"} onClick={()=>setActiveTab("sample")}/>
                </div>

                {activeTab==="annotated"&&(
                  <Card>
                    <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"system-ui",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>📝 Your Essay — 👆 Click underlined words for corrections / اضغط على الكلمات لرؤية التصحيح</span>
                      <span style={{color:T.red,fontWeight:600}}>{result.mistakes?.length} mistakes found</span>
                    </div>
                    <AnnotatedEssay essay={essay} mistakes={result.mistakes}/>
                  </Card>
                )}

                {activeTab==="scores"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <CriteriaCard label="Task Achievement" data={result.criteria.taskAchievement}/>
                    <CriteriaCard label="Coherence & Cohesion" data={result.criteria.coherenceCohesion}/>
                    <CriteriaCard label="Lexical Resource" data={result.criteria.lexicalResource}/>
                    <CriteriaCard label="Grammatical Range & Accuracy" data={result.criteria.grammaticalRange}/>
                    {result.improvements?.length>0&&(
                      <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`}}>
                        <div style={{fontSize:11,color:T.amber,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"system-ui"}}>Key Improvements Needed</div>
                        {result.improvements.map((imp,i)=><div key={i} style={{color:T.textMid,fontSize:14,lineHeight:1.6,marginBottom:4,fontFamily:"system-ui"}}>→ {imp}</div>)}
                      </Card>
                    )}
                  </div>
                )}

                {activeTab==="mistakes"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
                      {[["major",T.red],["moderate",T.amber],["minor",T.blue]].map(([s,c])=>(
                        <span key={s} style={{background:"white",border:`1px solid ${c}60`,borderRadius:20,padding:"3px 10px",fontSize:11,color:c,fontFamily:"system-ui",fontWeight:600}}>● {s}</span>
                      ))}
                      <span style={{color:T.textMuted,fontSize:12,fontFamily:"system-ui",alignSelf:"center"}}>— {result.mistakes?.length} total</span>
                    </div>
                    {result.mistakes?.length===0?<Card style={{textAlign:"center",color:T.green,padding:36,fontFamily:"system-ui"}}>No mistakes — excellent!</Card>:result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i}/>)}
                  </div>
                )}

                {activeTab==="booster"&&result.bandBooster&&(
                  <Card style={{background:"#f5f5f5",border:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,flexWrap:"wrap"}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize:36,fontWeight:900,color:bandColor(result.bandBooster.currentBand),fontFamily:"Georgia,serif"}}>{result.bandBooster.currentBand}</div><div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase"}}>Current</div></div>
                      <div style={{fontSize:24,color:T.red}}>→</div>
                      <div style={{textAlign:"center"}}><div style={{fontSize:36,fontWeight:900,color:bandColor(result.bandBooster.targetBand),fontFamily:"Georgia,serif"}}>{result.bandBooster.targetBand}</div><div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase"}}>Target</div></div>
                      <div style={{flex:1}}><div style={{fontSize:14,color:T.gold,fontWeight:700,fontFamily:"system-ui"}}>What to do:</div></div>
                    </div>
                    {result.bandBooster.specificActions?.map((a,i)=>(
                      <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                        <span style={{background:T.red,borderRadius:2,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:700,flexShrink:0,fontFamily:"system-ui"}}>{i+1}</span>
                        <p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>{a}</p>
                      </div>
                    ))}
                  </Card>
                )}

                {activeTab==="vocab"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {result.vocabularyUpgrades?.map((v,i)=>(
                      <Card key={i} style={{border:`1px solid ${T.blueBorder}`,background:T.blueBg}}>
                        <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap",marginBottom:8}}>
                          <div style={{background:"#fee2e2",borderRadius:6,padding:"4px 12px",color:"#991b1b",fontSize:14,fontStyle:"italic"}}>"{v.weak}"</div>
                          <div style={{fontSize:16,color:T.textMuted}}>→</div>
                          <div style={{background:"#dcfce7",borderRadius:6,padding:"4px 12px",color:"#166534",fontSize:14,fontWeight:600}}>"{v.advanced}"</div>
                        </div>
                        <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"system-ui"}}>💡 {v.reason}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="tips"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {result.examinerTips?.map((tip,i)=>(
                      <Card key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                        <span style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:700,flexShrink:0,fontFamily:"system-ui"}}>{i+1}</span>
                        <p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>{tip}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="sample"&&result.sampleEssay&&(
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                        <div style={{fontSize:11,color:T.green,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"system-ui"}}>Band 8+ Model Response</div>
                        <div style={{fontSize:12,fontFamily:"system-ui",fontWeight:600,color:sampleWordCount>=minWords?T.green:T.red}}>{sampleWordCount} words {sampleWordCount>=minWords?"✓":"⚠ below minimum"}</div>
                      </div>
                      <p style={{color:T.text,fontSize:15,lineHeight:1.9,whiteSpace:"pre-wrap",margin:0,fontFamily:"Georgia,serif"}}>{result.sampleEssay}</p>
                    </Card>
                    {result.sampleEssayExplanation&&(
                      <Card>
                        <div style={{fontSize:11,color:T.blue,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"system-ui"}}>Why This Response Scores High</div>
                        <div style={{display:"flex",flexDirection:"column",gap:12}}>
                          {[["Introduction",result.sampleEssayExplanation.introduction],["Body Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
                            <div key={lbl}><div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:4,fontFamily:"system-ui"}}>{lbl}</div><p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>{txt}</p></div>
                          ))}
                          {result.sampleEssayExplanation.vocabularyHighlights?.length>0&&(
                            <div>
                              <div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:6,fontFamily:"system-ui"}}>Advanced Vocabulary Used</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{result.sampleEssayExplanation.vocabularyHighlights.map((v,i)=><span key={i} style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"2px 9px",fontSize:12,color:T.blue,fontFamily:"system-ui"}}>{v}</span>)}</div>
                            </div>
                          )}
                          <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}><p style={{color:T.green,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"system-ui"}}>🏆 {result.sampleEssayExplanation.whyHighScore}</p></Card>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mainView==="practice"&&<div style={{padding:"24px 0"}}><PracticeMode isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/></div>}
        {mainView==="progress"&&<div style={{padding:"24px 0"}}><ProgressTracker isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/></div>}
        {mainView==="toolkit"&&<div style={{padding:"24px 0"}}><ToolkitContent isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/></div>}
        {mainView==="contact"&&<ContactPage/>}
        </div>{/* end page content */}
      </div>{/* end main wrapper */}
    </div>
  );
}
