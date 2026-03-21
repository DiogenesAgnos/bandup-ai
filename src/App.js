import { useState, useRef, useEffect, useCallback } from "react";

const STRIPE_CONFIGURED = false;
const FREE_USES_LIMIT = 2;
const STORAGE_KEY = "bandup_uses";
const HISTORY_KEY = "bandup_history";
const API_URL = "/api/analyze";

const T = {
  primary:      "#0056d2",
  primaryHover: "#0041a8",
  primaryLight: "#e8f0fc",
  primaryBorder:"#b3ccf5",
  bg:           "#ffffff",
  bgMuted:      "#f9f9f9",
  bgGray:       "#f3f3f3",
  text:         "#1f1f1f",
  textMid:      "#3c3c3c",
  textMuted:    "#636363",
  textLight:    "#8c8c8c",
  border:       "#e0e0e0",
  borderMid:    "#c7c7c7",
  green:        "#00785a", greenBg:"#e6f4f1",  greenBorder:"#99d6c8",
  red:          "#c0392b", redBg:"#fdf2f2",    redBorder:"#f0a09a",
  amber:        "#b45309", amberBg:"#fef9ec",  amberBorder:"#fcd97a",
  blue:         "#0056d2", blueBg:"#e8f0fc",   blueBorder:"#b3ccf5",
  purple:       "#6554af", purpleBg:"#f2f0ff", purpleBorder:"#c2b8ff",
  gold:         "#b45309",
  shadow:    "0 2px 4px rgba(0,0,0,0.08)",
  shadowMd:  "0 4px 12px rgba(0,0,0,0.1)",
  shadowLg:  "0 8px 32px rgba(0,0,0,0.12)",
  shadowNav: "0 2px 4px rgba(0,0,0,0.1)",
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
  saveHistory(h.slice(0,20));
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

MISTAKE DETECTION — MANDATORY EXHAUSTIVE SCAN:
You are acting as a strict IELTS examiner who must find EVERY imperfection. Go through the essay sentence by sentence. Check ALL of the following without exception:

GRAMMAR:
- Subject-verb agreement errors ("governments...is" → "are")
- Wrong tense or tense inconsistency
- Missing or incorrect articles (a/an/the)
- Wrong prepositions (consist of, rely on, invest in, etc.)
- Incorrect verb forms (infinitive vs gerund)
- Passive voice errors
- Dangling or misplaced modifiers
- Incomplete sentences or run-on sentences
- Conditional errors (if + wrong tense)

PUNCTUATION:
- Missing commas after introductory phrases ("In conclusion[,]")
- Missing commas before coordinating conjunctions in compound sentences
- Comma splices (two independent clauses joined by just a comma)
- Missing apostrophes in contractions or possessives
- Incorrect semicolon usage
- Unnecessary or missing hyphens

SPELLING:
- Any misspelled word, including commonly confused words (affect/effect, their/there, etc.)

WORD CHOICE & ACADEMIC STYLE:
- Informal or conversational language ("a lot", "things", "stuff", "good", "bad", "big")
- Vague language that weakens the argument
- Repetition of the same word/phrase within 2-3 sentences
- Weak verbs that should be replaced with stronger academic verbs
- Colloquial expressions
- Any contraction (don't, can't, it's → do not, cannot, it is)

SENTENCE STRUCTURE:
- Short simplistic sentences that could be combined for sophistication
- Overuse of the same sentence structure
- Starting consecutive sentences with the same word

TASK-SPECIFIC:
- Copying exact phrases from the question without paraphrasing
- Weak or absent topic sentences
- Claims made without any supporting evidence or example
- Conclusion that merely repeats the introduction

MINIMUM EXPECTED: A Band 7-8 essay typically has 5-10 annotatable items. A Band 5-6 essay typically has 10-20+. Never return fewer than 5 mistakes unless the essay is genuinely flawless (Band 9). Each "original" field must match the essay text EXACTLY character for character — copy it precisely.

CRITICAL SCORING RULE: You must determine and lock in all band scores (Task Achievement, Coherence & Cohesion, Lexical Resource, Grammatical Range & Accuracy, and Overall Band) before considering the feedback language. Scores must be identical whether feedback is in English or Arabic. The language of feedback must never influence the numerical scores.

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

  // Robust matching: try exact first, then normalized whitespace, then case-insensitive
  const findInEssay = (original, essayText) => {
    if(!original) return -1;
    // 1. Exact match
    let pos = essayText.indexOf(original);
    if(pos !== -1) return { pos, len: original.length };
    // 2. Normalize whitespace (collapse multiple spaces/newlines)
    const norm = (s) => s.replace(/\s+/g,' ').trim();
    const normEssay = norm(essayText);
    const normOrig = norm(original);
    pos = normEssay.indexOf(normOrig);
    if(pos !== -1) {
      // Map position back to original essay
      let origPos = 0, normPos = 0;
      while(normPos < pos && origPos < essayText.length) {
        if(essayText[origPos].match(/\s/)) { while(origPos < essayText.length && essayText[origPos].match(/\s/)) origPos++; normPos++; }
        else { origPos++; normPos++; }
      }
      return { pos: origPos, len: normOrig.length };
    }
    // 3. Case-insensitive match
    pos = essayText.toLowerCase().indexOf(normOrig.toLowerCase());
    if(pos !== -1) return { pos, len: normOrig.length };
    return -1;
  };

  const found=[];
  mistakes.forEach((m,idx)=>{ if(!m.original) return; const result=findInEssay(m.original, essay); if(result!==-1) found.push({pos:result.pos,end:result.pos+result.len,mistake:m,idx}); });
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
              style={{borderBottom:`2px solid ${T.red}`,cursor:"pointer",background:activeTooltip===seg.idx?`${T.red}18`:"transparent",borderRadius:3,padding:"0 1px",transition:"background 0.15s"}}>
              {seg.text}
            </span>
            {activeTooltip===seg.idx&&(
              <span style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"white",borderRadius:10,padding:"10px 14px",fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui",width:260,zIndex:100,boxShadow:T.shadowLg,lineHeight:1.5,fontStyle:"normal",whiteSpace:"normal"}}>
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
const Card=({children,style})=>(
  <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"20px 24px",boxShadow:T.shadow,...style}}>
    {children}
  </div>
);

const CriteriaCard=({label,data})=>(
  <div style={{
    background: T.bg, border: `1px solid ${T.border}`,
    borderRadius: 8, padding: "20px 24px", boxShadow: T.shadow,
    borderLeft: `4px solid ${bandColor(data.band)}`,
  }}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
      <span style={{color:T.textMuted,fontSize:12,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{label}</span>
      <span style={{background:bandBg(data.band),color:bandColor(data.band),fontWeight:700,fontSize:20,borderRadius:6,padding:"4px 14px",border:`1px solid ${bandColor(data.band)}30`}}>{data.band}</span>
    </div>
    <p style={{color:T.textMid,fontSize:15,lineHeight:1.65,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{data.feedback}</p>
  </div>
);

const MistakeCard=({mistake,i,essay})=>{
  // Check if this mistake can be found in the essay
  const norm = (s) => s ? s.replace(/\s+/g,' ').trim() : '';
  const isLocated = mistake.original && (
    essay.indexOf(mistake.original) !== -1 ||
    essay.toLowerCase().indexOf(norm(mistake.original).toLowerCase()) !== -1
  );
  return (
  <div style={{background:severityBg(mistake.severity),border:`1px solid ${severityColor(mistake.severity)}40`,borderLeft:`3px solid ${severityColor(mistake.severity)}`,borderRadius:10,padding:"12px 16px",display:"flex",flexDirection:"column",gap:8}}>
    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
      <span style={{fontSize:11,fontWeight:700,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>#{i+1}</span>
      <span style={{background:"white",border:`1px solid ${severityColor(mistake.severity)}60`,borderRadius:20,padding:"1px 8px",fontSize:11,color:severityColor(mistake.severity),fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>{mistake.severity}</span>
      <span style={{background:"white",border:`1px solid ${categoryColor(mistake.category)}50`,borderRadius:20,padding:"1px 8px",fontSize:11,color:categoryColor(mistake.category),fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>{mistake.category}</span>
      {!isLocated&&<span style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:20,padding:"1px 8px",fontSize:10,color:T.amber,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>⚠ not highlighted in essay</span>}
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>ORIGINAL</div><div style={{background:"#fee2e2",borderRadius:6,padding:"5px 10px",color:"#991b1b",fontSize:13,fontStyle:"italic"}}>"{mistake.original}"</div></div>
      <div style={{fontSize:16,color:T.textMuted,alignSelf:"center"}}>→</div>
      <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>CORRECTION</div><div style={{background:"#dcfce7",borderRadius:6,padding:"5px 10px",color:"#166534",fontSize:13}}>"{mistake.correction}"</div></div>
    </div>
    <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>💡 {mistake.explanation}</p>
  </div>
  );
};

const TabBtn=({label,active,onClick,badge})=>(
  <button onClick={onClick} style={{
    background: "transparent",
    border: "none",
    borderBottom: active ? `3px solid ${T.primary}` : "3px solid transparent",
    color: active ? T.primary : T.textMuted,
    padding: "12px 16px",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    fontFamily: "'Source Sans Pro', 'Inter', system-ui",
    display: "flex",
    alignItems: "center",
    gap: 6,
    whiteSpace: "nowrap",
    transition: "color 0.15s, border-color 0.15s",
    flexShrink: 0,
  }}>
    {label}
    {badge > 0 && (
      <span style={{
        background: T.red, color: "#fff", borderRadius: 20,
        padding: "1px 7px", fontSize: 11, fontWeight: 700
      }}>{badge}</span>
    )}
  </button>
);

const MainTab=({label,active,onClick})=>(
  <button onClick={onClick} style={{
    background: "transparent",
    border: "none",
    borderBottom: active ? `3px solid ${T.primary}` : "3px solid transparent",
    color: active ? T.primary : T.textMuted,
    padding: "0 14px",
    height: 64,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    fontFamily: "'Source Sans Pro','Inter',system-ui",
    transition: "color 0.15s, border-color 0.15s",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }}>
    {label}
  </button>
);

// ── Paywall ───────────────────────────────────
const PaywallModal=({onClose,onSuccess})=>(
  <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
    <div style={{background:"#fefdf8",border:`1px solid ${T.border}`,borderRadius:20,padding:"40px 32px",maxWidth:440,width:"100%",position:"relative",boxShadow:T.shadowLg}}>
      <button onClick={onClose} style={{position:"absolute",top:16,right:20,background:"none",border:"none",color:T.textMuted,fontSize:22,cursor:"pointer"}}>✕</button>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:36,marginBottom:8}}>🎓</div>
        <div style={{display:"inline-block",background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:100,padding:"5px 16px",fontSize:11,color:T.gold,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Free analyses used up</div>
        <h2 style={{fontFamily:"Georgia,serif",color:T.text,fontSize:24,marginBottom:8}}>Unlock Unlimited Access</h2>
        <p style={{color:T.textMid,fontSize:14,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Full IELTS Writing coverage — Task 1 & 2, Academic & General Training.</p>
      </div>
      <div style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:12,padding:"16px",marginBottom:20,textAlign:"center"}}>
        <div style={{fontFamily:"Georgia,serif",fontSize:48,fontWeight:900,color:T.text,lineHeight:1}}><sup style={{fontSize:20,verticalAlign:"super"}}>$</sup>19<sub style={{fontSize:14,color:T.textMuted}}>/month</sub></div>
        <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Cancel anytime · No hidden fees</div>
      </div>
      <ul style={{listStyle:"none",padding:0,display:"flex",flexDirection:"column",gap:8,marginBottom:22}}>
        {["Unlimited analyses — Task 1 & 2, Academic & General","Complete mistake detection — spelling, grammar & punctuation","Inline essay annotations with correction bubbles","Progress tracker — see your improvement over time","Band Booster + Vocabulary upgrades from YOUR essay","Full IELTS Toolkit (Grammar, Templates, Pet Peeves)","Practice Mode with live AI coaching + inline corrections","Graph image upload for Task 1 Academic","Unlimited Band 8+ model responses"].map((f,i)=>(
          <li key={i} style={{display:"flex",gap:10,fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui"}}><span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}</li>
        ))}
      </ul>
      <button onClick={()=>{savePro();onSuccess();}} style={{width:"100%",background:T.primary,color:"white",fontWeight:700,fontSize:15,padding:"14px",borderRadius:4,border:"none",cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:T.shadowMd}}>
        🔓 {STRIPE_CONFIGURED?"Start Pro — $19/month":"Unlock Pro (Test Mode)"}
      </button>
      {!STRIPE_CONFIGURED&&<p style={{textAlign:"center",color:T.textMuted,fontSize:11,marginTop:10,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Add Stripe keys to enable real payments.</p>}
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
      <p style={{color:T.textMid,fontSize:14,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:20,lineHeight:1.6}}>Complete your first essay analysis to start tracking your band score improvement over time.</p>
    </Card>
  );
  if(history.length===0) return (
    <Card style={{textAlign:"center",padding:"40px 24px"}}>
      <div style={{fontSize:40,marginBottom:16}}>📈</div>
      <p style={{color:T.textMid,fontSize:14,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>No essays analysed yet. Complete your first analysis to start tracking progress!</p>
    </Card>
  );
  const latest=history[0];
  const previous=history[1];
  const bandDiff=previous?(latest.band-previous.band).toFixed(1):null;
  const mistakeDiff=previous?(latest.mistakeCount-previous.mistakeCount):null;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12}}>
        <Card style={{textAlign:"center",background:bandBg(latest.band),border:`1px solid ${bandColor(latest.band)}30`}}>
          <div style={{fontSize:42,fontWeight:900,color:bandColor(latest.band),fontFamily:"Georgia,serif",lineHeight:1}}>{latest.band}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Latest Band</div>
          {bandDiff!==null&&<div style={{fontSize:13,color:parseFloat(bandDiff)>=0?T.green:T.red,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",marginTop:4}}>{parseFloat(bandDiff)>=0?`▲ +${bandDiff}`:`▼ ${bandDiff}`} vs previous</div>}
        </Card>
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:42,fontWeight:900,color:T.text,fontFamily:"Georgia,serif",lineHeight:1}}>{history.length}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Essays Analysed</div>
        </Card>
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:42,fontWeight:900,color:T.red,fontFamily:"Georgia,serif",lineHeight:1}}>{latest.mistakeCount}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Latest Mistakes</div>
          {mistakeDiff!==null&&<div style={{fontSize:13,color:mistakeDiff<=0?T.green:T.red,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",marginTop:4}}>{mistakeDiff<=0?`▲ ${Math.abs(mistakeDiff)} fewer`:`▼ ${mistakeDiff} more`} vs previous</div>}
        </Card>
        {history.length>=2&&(
          <Card style={{textAlign:"center",background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
            <div style={{fontSize:42,fontWeight:900,color:T.green,fontFamily:"Georgia,serif",lineHeight:1}}>{Math.max(...history.map(h=>h.band))}</div>
            <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Best Band Ever</div>
          </Card>
        )}
      </div>
      {history.length>=2&&(
        <Card>
          <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📊 Band Score History</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120,padding:"0 8px"}}>
            {[...history].reverse().map((h,i)=>{
              const heightPct=((h.band-4)/(9-4))*100;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:11,fontWeight:700,color:bandColor(h.band),fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{h.band}</div>
                  <div style={{width:"100%",background:bandColor(h.band),borderRadius:"4px 4px 0 0",height:`${heightPct}%`,minHeight:8,opacity:i===history.length-1?1:0.7,transition:"all 0.3s"}}/>
                  <div style={{fontSize:9,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",textAlign:"center"}}>{new Date(h.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {previous&&(
        <Card>
          <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📋 Criteria Comparison — Latest vs Previous</div>
          {[["Task Achievement","taskAchievement"],["Coherence & Cohesion","coherenceCohesion"],["Lexical Resource","lexicalResource"],["Grammatical Range","grammaticalRange"]].map(([label,key])=>{
            const curr=latest.criteria?.[key]||0;
            const prev=previous.criteria?.[key]||0;
            const diff=(curr-prev).toFixed(1);
            return (
              <div key={key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:160,fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>{label}</div>
                <div style={{flex:1,background:T.bgGray,borderRadius:6,height:8,position:"relative"}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${(curr/9)*100}%`,background:bandColor(curr),borderRadius:6,transition:"width 0.5s"}}/>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:bandColor(curr),fontFamily:"'Source Sans Pro','Inter',system-ui",width:32}}>{curr}</div>
                <div style={{fontSize:12,fontWeight:700,color:parseFloat(diff)>0?T.green:parseFloat(diff)<0?T.red:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",width:40}}>
                  {parseFloat(diff)>0?`+${diff}`:diff}
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <Card>
        <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📝 Essay History</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {history.map((h,i)=>(
            <div key={h.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:i===0?bandBg(h.band):T.bg,borderRadius:10,border:i===0?`1px solid ${bandColor(h.band)}30`:`1px solid ${T.border}`}}>
              <div style={{fontSize:24,fontWeight:900,color:bandColor(h.band),fontFamily:"Georgia,serif",lineHeight:1,width:40}}>{h.band}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:T.text,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600,marginBottom:2}}>{h.taskType==="task2"?"Task 2 Essay":h.taskType==="task1academic"?"Task 1 Academic":"Task 1 General"} {i===0&&<span style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:20,padding:"1px 8px",fontSize:10,color:T.gold,fontWeight:700}}>Latest</span>}</div>
                <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{h.wordCount} words · {h.mistakeCount} mistakes · {new Date(h.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>
              </div>
              <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",textAlign:"right"}}>{bandLabel(h.band)}</div>
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
        {[1,2,3].map(i=><div key={i} style={{background:'#fefdf8',border:`1px solid ${T.border}`,borderRadius:10,padding:'16px 20px',marginBottom:8}}><div style={{height:16,background:T.bgGray,borderRadius:4,marginBottom:8,width:'60%'}}/><div style={{height:12,background:T.bgGray,borderRadius:4,width:'90%'}}/></div>)}
      </div>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
        <div style={{fontSize:36}}>🔒</div>
        <div style={{textAlign:"center"}}>
          <div style={{color:T.text,fontWeight:700,fontSize:15,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>Pro Feature</div>
          <button onClick={onUpgrade} style={{background:T.gold,color:"white",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Upgrade to Pro — $19/mo</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <Card style={{marginBottom:16,background:"#fff5f5",border:"1px solid #ffcccc"}}>
        <p style={{color:T.red,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🎓 Your personal IELTS reference guide. {!isPro&&<span style={{color:T.textMid}}>Linking Words free. Upgrade for full access.</span>}</p>
      </Card>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {sections.map(s=>(
          <button key={s.key} onClick={()=>setSection(s.key)}
            style={{background:section===s.key?T.primaryLight:T.bgGray,border:section===s.key?`1px solid ${T.primary}`:`1px solid ${T.border}`,color:section===s.key?T.primary:T.textMid,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",alignItems:"center",gap:5}}>
            {s.label}{!s.free&&!isPro&&<span style={{fontSize:10}}>🔒</span>}
          </button>
        ))}
      </div>
      {section==="linking"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.linkingWords.map((cat,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:cat.color,marginBottom:10,fontFamily:"'Source Sans Pro','Inter',system-ui",textTransform:"uppercase",letterSpacing:"0.06em"}}>{cat.category}</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{cat.words.map((w,j)=><span key={j} style={{background:`${cat.color}12`,border:`1px solid ${cat.color}40`,borderRadius:8,padding:"4px 12px",fontSize:13,color:cat.color,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{w}</span>)}</div></Card>)}</div>}
      {section==="vocab"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.vocabulary.map((topic,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:T.gold,marginBottom:10,fontFamily:"'Source Sans Pro','Inter',system-ui",textTransform:"uppercase"}}>{topic.topic}</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{topic.words.map((pair,j)=><div key={j} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><span style={{background:"#fee2e2",borderRadius:6,padding:"3px 10px",fontSize:13,color:"#991b1b",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✗ {pair[0]}</span><span style={{color:T.textMuted}}>→</span><span style={{background:"#dcfce7",borderRadius:6,padding:"3px 10px",fontSize:13,color:"#166534",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✓ {pair[1]}</span></div>)}</div></Card>)}</div>:<LockedSection/>)}
      {section==="grammar"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.grammarRules.map((item,i)=><Card key={i} style={{border:`1px solid ${T.blueBorder}`,background:T.blueBg}}><div style={{fontSize:13,fontWeight:700,color:T.blue,marginBottom:6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📐 {item.rule}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{item.tip}</p></Card>)}</div>:<LockedSection/>)}
      {section==="peeves"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.petPeeves.map((item,i)=><Card key={i} style={{border:`1px solid ${T.redBorder}`,background:T.redBg}}><div style={{fontSize:13,fontWeight:700,color:T.red,marginBottom:6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ {item.peeve}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✅ {item.fix}</p></Card>)}</div>:<LockedSection/>)}
      {section==="templates"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.templates.map((item,i)=><Card key={i} style={{border:`1px solid ${T.amberBorder}`,background:T.amberBg}}><div style={{fontSize:11,fontWeight:700,color:T.amber,marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui",textTransform:"uppercase"}}>📝 {item.type}</div><p style={{color:T.text,fontSize:13,lineHeight:1.8,margin:0,fontFamily:"Georgia,serif",fontStyle:"italic",background:"white",padding:"10px 14px",borderRadius:8,whiteSpace:"pre-wrap",border:`1px solid ${T.amberBorder}`}}>{item.template}</p></Card>)}</div>:<LockedSection/>)}
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
        <p style={{color:T.blue,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🎯 <strong>Practice Mode</strong> — Write freely and get live AI coaching every ~1.5 seconds. Mistakes are highlighted inline in your essay. Each feedback uses one free try.</p>
      </Card>
      {!started?(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",gap:8}}>
            {[["choose","📋 Choose a Question"],["custom","✏️ Write My Own"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setQuestionMode(mode)} style={{flex:1,background:questionMode===mode?T.primary:T.bgGray,border:`2px solid ${questionMode===mode?T.primary:T.border}`,borderRadius:10,padding:"10px",cursor:"pointer",color:questionMode===mode?"white":T.textMid,fontSize:13,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:questionMode===mode?T.shadowMd:'none',transition:'all 0.2s'}}>{label}</button>
            ))}
          </div>
          {questionMode==="choose"&&(
            <div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {Object.keys(PRACTICE_QUESTIONS).map(topic=>(
                  <button key={topic} onClick={()=>{ setSelectedTopic(topic); setSelectedQuestion(""); }}
                    style={{background:selectedTopic===topic?T.primary:T.bgGray,border:`1px solid ${selectedTopic===topic?T.primary:T.border}`,borderRadius:20,padding:"6px 16px",cursor:"pointer",color:selectedTopic===topic?"white":T.textMid,fontSize:12,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:selectedTopic===topic?T.shadowMd:'none',transition:'all 0.18s'}}>{topic}</button>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {PRACTICE_QUESTIONS[selectedTopic].map((q,i)=>(
                  <div key={i} onClick={()=>setSelectedQuestion(q)}
                    style={{background:selectedQuestion===q?T.primaryLight:T.bgGray,border:selectedQuestion===q?`2px solid ${T.primary}`:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",color:selectedQuestion===q?T.primary:T.textMid,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6,transition:"all 0.15s",boxShadow:T.shadow}}>
                    {i+1}. {q}
                  </div>
                ))}
              </div>
            </div>
          )}
          {questionMode==="custom"&&(
            <div>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>Your Question</label>
              <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} rows={3}
                placeholder="Paste your own IELTS question here..."
                style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
            </div>
          )}
          <button onClick={()=>{ if(question) setStarted(true); }} disabled={!question}
            style={{background:question?T.primary:T.bgGray,border:`1px solid ${question?T.primary:T.border}`,borderRadius:10,color:question?"white":T.textMuted,fontSize:15,fontWeight:700,padding:"15px",cursor:question?"pointer":"not-allowed",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:question?T.shadowMd:"none",transition:"all 0.2s"}}>
            {question?"🖊️ Start Practice Session":"Select a question to begin"}
          </button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
            <div style={{fontSize:11,color:T.blue,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Your Question</div>
            <p style={{color:T.text,fontSize:14,margin:0,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{question}</p>
          </Card>
          <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{flex:2,minWidth:280,display:"flex",flexDirection:"column",gap:10}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>
                Your Essay
                <span style={{color:wordCount>=250?T.green:wordCount>=150?T.amber:T.red,marginLeft:10,fontWeight:400}}>{wordCount} words {wordCount>=250?"✓":wordCount>=150?"(keep going!)":"(too short)"}</span>
              </label>
              <textarea value={practiceEssay} onChange={handleEssayChange} rows={12}
                placeholder="Start writing here — live feedback and inline corrections appear as you pause!"
                style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              {showAnnotated&&liveFeedback&&practiceAnnotations.length>0&&(
                <Card style={{border:`1px solid ${T.amberBorder}`}}>
                  <div style={{fontSize:11,color:T.amber,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",justifyContent:"space-between"}}>
                    <span>✏️ Your Essay — Click underlined mistakes</span>
                    <span style={{color:T.red}}>{practiceAnnotations.length} spotted</span>
                  </div>
                  <AnnotatedEssay essay={practiceEssay} mistakes={practiceAnnotations}/>
                </Card>
              )}
              <button onClick={()=>{ setStarted(false); setPracticeEssay(""); setLiveFeedback(null); setShowAnnotated(false); setSelectedQuestion(""); setCustomQuestion(""); }}
                style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMid,fontSize:12,padding:"6px 14px",cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",alignSelf:"flex-start"}}>← Change Question</button>
            </div>
            <div style={{flex:1,minWidth:220,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                {loadingFeedback?"🔍 Analysing...":"💬 Live Coaching"}
              </div>
              {loadingFeedback&&<Card style={{textAlign:"center",background:T.blueBg,border:`1px solid ${T.blueBorder}`}}><div style={{color:T.blue,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Reading your essay... 🎓</div></Card>}
              {liveFeedback&&!loadingFeedback&&(
                <>
                  <Card style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:36,fontWeight:900,color:bandColor(liveFeedback.estimatedBand),fontFamily:"Georgia,serif",lineHeight:1}}>{liveFeedback.estimatedBand}</div>
                    <div><div style={{fontSize:10,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",textTransform:"uppercase",letterSpacing:"0.08em"}}>Estimated Band</div><div style={{fontSize:13,color:bandColor(liveFeedback.estimatedBand),fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>{bandLabel(liveFeedback.estimatedBand)}</div></div>
                  </Card>
                  {liveFeedback.quickFix&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><div style={{fontSize:11,color:T.red,fontWeight:700,marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🚨 QUICK FIX</div><p style={{color:"#991b1b",fontSize:13,margin:0,lineHeight:1.5,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{liveFeedback.quickFix}</p></Card>}
                  {liveFeedback.spotErrors?.length>0&&(
                    <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`}}>
                      <div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✏️ ERRORS SPOTTED ({liveFeedback.spotErrors.length})</div>
                      {liveFeedback.spotErrors.map((e,i)=>(
                        <div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:i<liveFeedback.spotErrors.length-1?`1px solid ${T.amberBorder}`:"none"}}>
                          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                            <span style={{background:"#fee2e2",borderRadius:4,padding:"1px 6px",fontSize:12,color:"#991b1b",fontStyle:"italic"}}>"{e.original}"</span>
                            <span style={{color:T.textMuted,fontSize:12}}>→</span>
                            <span style={{background:"#dcfce7",borderRadius:4,padding:"1px 6px",fontSize:12,color:"#166534",fontWeight:600}}>"{e.correction}"</span>
                          </div>
                          <div style={{fontSize:11,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{e.explanation}</div>
                        </div>
                      ))}
                    </Card>
                  )}
                  <Card style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
                    <div style={{fontSize:11,color:T.blue,fontWeight:700,marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>💡 TIPS</div>
                    {liveFeedback.tips?.map((tip,i)=><div key={i} style={{color:T.textMid,fontSize:13,lineHeight:1.5,marginBottom:5,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>• {tip}</div>)}
                  </Card>
                  {liveFeedback.encouragement&&<Card style={{background:"#fff5f5",border:"1px solid #ffcccc"}}><p style={{color:T.gold,fontSize:12,margin:0,fontStyle:"italic",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>💬 {liveFeedback.encouragement}</p></Card>}
                </>
              )}
              {!liveFeedback&&!loadingFeedback&&<Card style={{textAlign:"center",padding:"24px 16px"}}><div style={{fontSize:28,marginBottom:8}}>🖊️</div><p style={{color:T.textMuted,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Start writing — feedback and corrections appear after a short pause!</p></Card>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Analytics Helper ─────────────────────────
const GA_ID = "G-XXXXXXXXXX";
const trackEvent = (eventName, params={}) => {
  try { if(window.gtag) window.gtag("event", eventName, params); } catch(e) {}
};

// ── Contact Page ─────────────────────────────
const EMAILJS_SERVICE_ID = "YOUR_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY = "YOUR_PUBLIC_KEY";

const ContactPage = () => {
  const [form, setForm] = useState({ name:"", country:"", age:"", email:"", message:"" });
  const [status, setStatus] = useState(null);
  const COUNTRIES = ["Afghanistan","Albania","Algeria","Argentina","Australia","Austria","Bahrain","Bangladesh","Belgium","Brazil","Canada","Chile","China","Colombia","Croatia","Czech Republic","Denmark","Egypt","Ethiopia","Finland","France","Germany","Ghana","Greece","Hungary","India","Indonesia","Iran","Iraq","Ireland","Italy","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Lebanon","Libya","Malaysia","Mexico","Morocco","Netherlands","New Zealand","Nigeria","Norway","Oman","Pakistan","Palestine","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Saudi Arabia","Singapore","South Africa","South Korea","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Thailand","Tunisia","Turkey","UAE","UK","USA","Ukraine","Vietnam","Yemen","Other"];
  const AGE_GROUPS = ["Under 18","18–24","25–34","35–44","45–54","55+"];
  const handleSubmit = async () => {
    if(!form.name||!form.email||!form.message){ setStatus("error"); return; }
    setStatus("sending");
    trackEvent("contact_form_submit", { country: form.country, age_group: form.age });
    try {
      if(EMAILJS_PUBLIC_KEY === "YOUR_PUBLIC_KEY") {
        await new Promise(r => setTimeout(r, 1500));
        setStatus("success");
        setForm({ name:"", country:"", age:"", email:"", message:"" });
        return;
      }
      await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        from_name: form.name, from_email: form.email, country: form.country,
        age_group: form.age, message: form.message, to_email: "diogenes.agnos@gmail.com"
      }, EMAILJS_PUBLIC_KEY);
      setStatus("success");
      setForm({ name:"", country:"", age:"", email:"", message:"" });
    } catch(e) { setStatus("error"); }
  };
  const inputStyle = { width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", fontFamily:"'Source Sans Pro','Inter',system-ui", outline:"none", boxSizing:"border-box", boxShadow:T.shadow, transition:"border-color 0.2s" };
  const labelStyle = { display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6, fontFamily:"'Source Sans Pro','Inter',system-ui", fontWeight:600 };
  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px 0"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:48,marginBottom:12}}>✉️</div>
        <h2 style={{fontFamily:"Arial Black,system-ui",color:T.text,fontSize:28,margin:"0 0 8px 0",fontWeight:900}}>Contact Us</h2>
        <p style={{color:T.textMid,fontSize:15,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:0,lineHeight:1.6}}>Have a question, feedback or need support? We'd love to hear from you.</p>
        <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui",marginTop:4,direction:"rtl"}}>هل لديك سؤال أو ملاحظة؟ تواصل معنا بكل سرور.</p>
      </div>
      <Card style={{border:"2px solid #e0e0e0"}}>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={labelStyle}>Full Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name" style={inputStyle}/></div>
            <div><label style={labelStyle}>Country</label><select value={form.country} onChange={e=>setForm({...form,country:e.target.value})} style={{...inputStyle,background:"white"}}><option value="">Select country...</option>{COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={labelStyle}>Age Group</label><select value={form.age} onChange={e=>setForm({...form,age:e.target.value})} style={{...inputStyle,background:"white"}}><option value="">Select age group...</option>{AGE_GROUPS.map(a=><option key={a} value={a}>{a}</option>)}</select></div>
            <div><label style={labelStyle}>Email Address *</label><input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="your@email.com" style={inputStyle}/></div>
          </div>
          <div><label style={labelStyle}>Message *</label><textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder="Write your message here... / اكتب رسالتك هنا..." rows={5} style={{...inputStyle,resize:"vertical",lineHeight:1.6}}/></div>
          {status==="error"&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ Please fill in all required fields (Name, Email, Message).</p></Card>}
          {status==="success"&&<Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}><p style={{color:T.green,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✅ Message sent successfully! We'll get back to you soon.</p></Card>}
          <button onClick={handleSubmit} disabled={status==="sending"} style={{background:status==="sending"?T.bgGray:T.primary,border:"none",borderRadius:4,color:status==="sending"?T.textMuted:"white",fontSize:14,fontWeight:600,padding:"14px",cursor:status==="sending"?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:T.shadow}}>
            {status==="sending"?"⏳ Sending...":"Send Message →"}
          </button>
          {EMAILJS_PUBLIC_KEY==="YOUR_PUBLIC_KEY"&&(<p style={{textAlign:"center",color:T.amber,fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui",fontStyle:"italic",margin:0}}>📧 EmailJS verification pending — messages will be delivered once account is verified (up to 48hrs).</p>)}
        </div>
      </Card>
    </div>
  );
};

// ── POLICY PAGES ─────────────────────────────
const PolicyPage = ({ title, children, onBack }) => (
  <div style={{maxWidth:800, margin:"0 auto", padding:"0 24px 80px"}}>
    <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",padding:"24px 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to BandUp AI</button>
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"40px 48px",boxShadow:T.shadow}}>
      <h1 style={{fontFamily:"'Source Sans Pro','Inter',system-ui",fontSize:28,fontWeight:700,color:T.text,marginBottom:8,marginTop:0}}>{title}</h1>
      <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:32}}>Last updated: {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</p>
      <div style={{color:T.textMid,fontSize:15,lineHeight:1.8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{children}</div>
    </div>
  </div>
);
const Section = ({title, children}) => (
  <div style={{marginBottom:28}}>
    <h2 style={{fontSize:17,fontWeight:700,color:"#1c1d1f",marginBottom:10,marginTop:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{title}</h2>
    {children}
  </div>
);
const TermsPage = ({onBack}) => (
  <PolicyPage title="Terms of Service" onBack={onBack}>
    <Section title="1. Acceptance of Terms"><p style={{margin:"0 0 12px"}}>By accessing or using BandUp AI ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. BandUp AI is operated by Ahmad Sartawi ("we", "us", "our").</p></Section>
    <Section title="2. Description of Service"><p style={{margin:"0 0 12px"}}>BandUp AI is an AI-powered IELTS Writing examination tool that provides automated band score assessment, mistake detection, vocabulary feedback, and model essay generation for IELTS Writing Tasks 1 and 2. The Service is intended for educational purposes only.</p></Section>
    <Section title="3. User Accounts and Subscriptions"><p style={{margin:"0 0 12px"}}>The Service offers a free tier with limited analyses and a Pro subscription at $19 USD per month. Subscription payments are processed securely by Paddle.com as our Merchant of Record. By subscribing, you authorize recurring monthly charges to your payment method.</p><p style={{margin:"0 0 12px"}}>You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of the current billing period.</p></Section>
    <Section title="4. Acceptable Use"><p style={{margin:"0 0 12px"}}>You agree to use BandUp AI only for lawful educational purposes. You must not: (a) attempt to reverse engineer or copy the AI systems; (b) submit content that is harmful, offensive, or violates any laws; (c) share account access with others; (d) use the Service in any way that could damage or overburden our systems.</p></Section>
    <Section title="5. AI Accuracy Disclaimer"><p style={{margin:"0 0 12px"}}>BandUp AI uses artificial intelligence to provide IELTS writing feedback. While we strive for accuracy, AI-generated scores and feedback are for guidance only and do not constitute official IELTS examination results. Actual IELTS scores are determined solely by certified IELTS examiners appointed by the British Council, IDP, or Cambridge Assessment English.</p></Section>
    <Section title="6. Intellectual Property"><p style={{margin:"0 0 12px"}}>All content, design, software, and materials on BandUp AI are the property of Ahmad Sartawi and are protected by applicable intellectual property laws. Essays submitted by users remain the property of the user. We do not claim ownership over user-submitted content.</p></Section>
    <Section title="7. Limitation of Liability"><p style={{margin:"0 0 12px"}}>To the maximum extent permitted by law, BandUp AI shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability to you shall not exceed the amount paid by you in the 12 months preceding the claim.</p></Section>
    <Section title="8. Modifications to Terms"><p style={{margin:"0 0 12px"}}>We reserve the right to modify these Terms at any time. We will notify users of material changes via email or prominent notice on the Service. Continued use after changes constitutes acceptance of the new Terms.</p></Section>
    <Section title="9. Governing Law"><p style={{margin:"0 0 12px"}}>These Terms shall be governed by the laws of the Hashemite Kingdom of Jordan. Any disputes shall be resolved in the courts of Amman, Jordan.</p></Section>
    <Section title="10. Contact"><p style={{margin:"0 0 12px"}}>For any questions regarding these Terms, please contact us at: <strong>diogenes.agnos@gmail.com</strong></p></Section>
  </PolicyPage>
);
const PrivacyPage = ({onBack}) => (
  <PolicyPage title="Privacy Policy" onBack={onBack}>
    <Section title="1. Information We Collect"><p style={{margin:"0 0 12px"}}>We collect information you provide directly to us, including:</p><ul style={{margin:"0 0 12px",paddingLeft:20}}><li style={{marginBottom:6}}>Contact form submissions (name, email, country, age group, message)</li><li style={{marginBottom:6}}>Essay content submitted for analysis</li><li style={{marginBottom:6}}>Payment information (processed and stored by Paddle — we do not store card details)</li><li style={{marginBottom:6}}>Usage data collected via Google Analytics (anonymised)</li></ul></Section>
    <Section title="2. How We Use Your Information"><p style={{margin:"0 0 12px"}}>We use the information we collect to: provide and improve the Service; process subscription payments; respond to your enquiries; send service-related communications; and analyse usage patterns to improve user experience.</p><p style={{margin:"0 0 12px"}}>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p></Section>
    <Section title="3. Essay Data"><p style={{margin:"0 0 12px"}}>Essays you submit are processed by Anthropic's Claude AI API for analysis. Essays are transmitted securely and are not stored permanently on our servers. We do not use your essays to train AI models.</p></Section>
    <Section title="4. Cookies and Analytics"><p style={{margin:"0 0 12px"}}>We use Google Analytics to collect anonymised data about how users interact with our Service. You can opt out of Google Analytics by installing the Google Analytics Opt-out Browser Add-on.</p></Section>
    <Section title="5. Data Security"><p style={{margin:"0 0 12px"}}>We implement appropriate technical and organisational measures to protect your personal data. All data is transmitted over HTTPS encryption.</p></Section>
    <Section title="6. Data Retention"><p style={{margin:"0 0 12px"}}>We retain your personal data only as long as necessary to provide the Service and comply with legal obligations.</p></Section>
    <Section title="7. Your Rights"><p style={{margin:"0 0 12px"}}>You have the right to: access your personal data; correct inaccurate data; request deletion of your data; withdraw consent at any time. Contact us at <strong>diogenes.agnos@gmail.com</strong>.</p></Section>
    <Section title="8. Third-Party Services"><p style={{margin:"0 0 12px"}}>Our Service integrates with: Anthropic Claude API; Paddle (payments); Google Analytics; EmailJS (contact form).</p></Section>
    <Section title="9. Contact"><p style={{margin:"0 0 12px"}}>For privacy-related enquiries: <strong>diogenes.agnos@gmail.com</strong></p></Section>
  </PolicyPage>
);
const RefundPage = ({onBack}) => (
  <PolicyPage title="Refund Policy" onBack={onBack}>
    <Section title="1. Subscription Cancellation"><p style={{margin:"0 0 12px"}}>You may cancel your BandUp AI Pro subscription at any time. Upon cancellation, you will retain access to Pro features until the end of your current billing period.</p></Section>
    <Section title="2. Refund Eligibility"><p style={{margin:"0 0 12px"}}>We offer a <strong>7-day money-back guarantee</strong> for new Pro subscribers. If you are not satisfied within 7 days of your initial subscription, contact us for a full refund.</p></Section>
    <Section title="3. How to Request a Refund"><p style={{margin:"0 0 12px"}}>Email <strong>diogenes.agnos@gmail.com</strong> with your registered email, date of purchase, and reason for refund. We process requests within 5 business days.</p></Section>
    <Section title="4. Contact"><p style={{margin:"0 0 12px"}}>For refund enquiries: <strong>diogenes.agnos@gmail.com</strong></p></Section>
  </PolicyPage>
);

// ── MAIN APP ──────────────────────────────────
export default function IELTSBot(){
  const [mainView,setMainView]=useState("analyze");
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

  const switchLang=(newLang)=>{ setLang(newLang); if(result){ setTimeout(()=>analyzeRef.current?.click(),150); } };

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
      addToHistory({ band:parsed.overallBand, taskType, wordCount:wordCount, mistakeCount:parsed.mistakes?.length||0, criteria:{ taskAchievement:parsed.criteria?.taskAchievement?.band, coherenceCohesion:parsed.criteria?.coherenceCohesion?.band, lexicalResource:parsed.criteria?.lexicalResource?.band, grammaticalRange:parsed.criteria?.grammaticalRange?.band } });
      setResult(parsed); setActiveTab("annotated");
      trackEvent("essay_analyzed", { task_type: taskType, band_score: parsed.overallBand, language: lang, is_pro: proUser });
    }catch(e){ setError("Something went wrong. Please try again."); }
    finally{ setLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#f9f9f9",fontFamily:"'Source Sans Pro','Inter',system-ui,sans-serif",color:T.text}}>
      {showPaywall&&<PaywallModal onClose={()=>setShowPaywall(false)} onSuccess={handleProSuccess}/>}

      {/* NAV BAR 1 */}
      <div style={{background:"#1c1d1f",padding:"0 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",height:40,gap:24}}>
          {["For Students","For Schools","For Teachers"].map(item=>(
            <span key={item} style={{color:"rgba(255,255,255,0.7)",fontSize:13,fontWeight:400,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",transition:"color 0.15s"}}
              onMouseEnter={e=>e.target.style.color="#fff"} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.7)"}>{item}</span>
          ))}
        </div>
      </div>

      {/* NAV BAR 2 */}
      <div style={{position:"sticky",top:0,zIndex:200,background:T.bg,borderBottom:`1px solid ${T.border}`,boxShadow:T.shadowNav}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
          <div style={{display:"flex",alignItems:"center",gap:24}}>
            <span style={{color:T.primary,fontWeight:800,fontSize:26,fontFamily:"'Source Sans Pro','Inter',system-ui",letterSpacing:"-0.8px",lineHeight:1}}>BandUp AI</span>
            <div style={{display:"flex",gap:4}}>
              <MainTab label="🎓 Analyze" active={mainView==="analyze"} onClick={()=>{setMainView("analyze");trackEvent("nav_click",{page:"analyze"});}}/>
              <MainTab label="🖊️ Practice" active={mainView==="practice"} onClick={()=>{setMainView("practice");trackEvent("nav_click",{page:"practice"});}}/>
              <MainTab label="📈 Progress" active={mainView==="progress"} onClick={()=>{setMainView("progress");trackEvent("nav_click",{page:"progress"});}}/>
              <MainTab label="📚 Toolkit" active={mainView==="toolkit"} onClick={()=>{setMainView("toolkit");trackEvent("nav_click",{page:"toolkit"});}}/>
              <MainTab label="✉️ Contact" active={mainView==="contact"} onClick={()=>{setMainView("contact");trackEvent("nav_click",{page:"contact"});}}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:13,color:proUser?T.green:usesLeft<=0?T.red:T.textMuted,fontWeight:600,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
              {proUser?"✓ Pro — Unlimited":usesLeft>0?`${usesLeft} free ${usesLeft===1?"use":"uses"} left`:"Free limit reached"}
            </span>
            <div style={{width:1,height:20,background:T.border}}/>
            {["en","ar"].map(l=>(
              <button key={l} onClick={()=>switchLang(l)} style={{background:lang===l?T.primaryLight:"transparent",border:`1px solid ${lang===l?T.primaryBorder:T.border}`,borderRadius:4,padding:"5px 12px",fontSize:13,fontWeight:lang===l?700:400,color:lang===l?T.primary:T.textMuted,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",transition:"all 0.15s"}}>{l==="en"?"🇬🇧 English":"🇸🇦 عربي"}</button>
            ))}
            {!proUser&&(<button onClick={()=>setShowPaywall(true)} style={{background:T.primary,color:"white",border:"none",borderRadius:4,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",transition:"background 0.15s"}}>Upgrade to Pro →</button>)}
          </div>
        </div>
      </div>

      {/* HERO */}
      <div style={{background:"#f0f4ff",overflow:"hidden",position:"relative"}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"stretch",minHeight:340}}>
          <div style={{flex:"0 0 55%",padding:"48px 40px 48px 0",display:"flex",flexDirection:"column",justifyContent:"center",zIndex:2}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(0,86,210,0.1)",border:"1px solid rgba(0,86,210,0.2)",borderRadius:4,padding:"4px 12px",marginBottom:18,alignSelf:"flex-start"}}>
              <span style={{color:T.primary,fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>AI-Powered · IELTS Writing Examiner</span>
            </div>
            <h1 style={{margin:"0 0 14px",fontSize:"clamp(26px,3.2vw,42px)",fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",color:"#1c1d1f",lineHeight:1.2,letterSpacing:"-0.3px"}}>
              Write better.<br/>Score higher.<br/><span style={{color:T.primary}}>Get the IELTS band you deserve.</span>
            </h1>
            <p style={{color:T.textMuted,fontSize:16,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:"0 0 24px",maxWidth:460}}>
              Instant AI band scores · Complete mistake detection · Band 8+ model essays · Practice Mode with live coaching
            </p>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <button onClick={()=>setMainView("analyze")} style={{background:T.primary,color:"white",border:"none",borderRadius:4,padding:"13px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:"0 2px 8px rgba(0,86,210,0.3)"}}>Start Analyzing →</button>
              <button onClick={()=>setMainView("practice")} style={{background:"transparent",color:T.primary,border:`2px solid ${T.primary}`,borderRadius:4,padding:"11px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Try Practice Mode</button>
            </div>
          </div>
          <div style={{flex:"0 0 45%",position:"relative",overflow:"hidden",minHeight:320}}>
            <img src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&q=85&auto=format&fit=crop" alt="Student studying for IELTS" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top"}}/>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg, #f0f4ff 0%, transparent 30%)"}}/>
          </div>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"16px 24px"}}>
        <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:32,alignItems:"center",flexWrap:"wrap"}}>
          {[["9","Band levels covered"],["4","IELTS criteria scored"],["100%","AI-powered analysis"],["Task 1 & 2","Academic + General Training"]].map(([num,label])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{color:T.primary,fontWeight:700,fontSize:18,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{num}</span>
              <span style={{color:T.textMuted,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* CONTENT AREA */}
      <div style={{maxWidth:1200,margin:"24px auto 80px",padding:"0 24px"}}>
        <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"32px",boxShadow:T.shadow}}>

        {/* ANALYZE */}
        {mainView==="analyze"&&(
          <div style={{background:"rgba(255,255,255,0.97)",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",padding:"32px 28px",backdropFilter:"blur(20px)"}}>
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>Select Task Type</label>
              <p style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:10,marginTop:0}}>Choose the type of writing task you are submitting. Task 2 is the essay. Task 1 Academic is for graphs/charts. Task 1 General is for letters.</p>
              <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {Object.entries(TASK_TYPES).map(([key,task])=>(
                  <button key={key} onClick={()=>{ setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); }}
                    style={{background:taskType===key?T.primaryLight:"#f9f9f9",border:`2px solid ${taskType===key?T.primary:T.border}`,borderRadius:8,padding:"20px 14px",cursor:"pointer",textAlign:"center",boxShadow:taskType===key?`0 0 0 2px ${T.primaryBorder}`:T.shadow,transition:"all 0.18s"}}>
                    <div style={{fontSize:22,marginBottom:6}}>{task.icon}</div>
                    <div style={{fontSize:13,fontWeight:600,color:taskType===key?T.primary:T.text,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>{task.label}</div>
                    <div style={{fontSize:11,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{task.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {taskType==="task1academic"&&(
              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>Upload Graph / Chart Image *</label>
                <div onClick={()=>fileRef.current.click()} style={{border:`2px dashed ${imagePreview?T.greenBorder:"#e2001a"}`,borderRadius:12,padding:"20px",textAlign:"center",cursor:"pointer",background:"white",boxShadow:T.shadow}}>
                  {imagePreview?(<div><img src={imagePreview} alt="graph" style={{maxHeight:180,maxWidth:"100%",borderRadius:8,marginBottom:8}}/><div style={{fontSize:12,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✓ Uploaded — click to change</div></div>):(<div><div style={{fontSize:32,marginBottom:8}}>📊</div><div style={{fontSize:14,color:T.gold,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>Click to upload graph/chart image</div><div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>JPG, PNG — AI reads and evaluates the graph</div></div>)}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>
                  {taskType==="task1general"?"Letter Task Instructions":taskType==="task1academic"?"Task Description":"Essay Question / Topic"}
                </label>
                <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
                  placeholder={taskType==="task2"?"e.g. Some people think universities should focus on job skills. Discuss both views and give your opinion.":taskType==="task1academic"?"e.g. The graph below shows changes in energy consumption. Summarise the information and make comparisons.":"e.g. You recently bought a laptop online but it arrived damaged. Write a letter to the manager."}
                  style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              </div>
              <div>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>
                  Student's Response
                  <span style={{fontSize:11,color:T.textMuted,fontWeight:400,textTransform:"none",letterSpacing:0}}> (minimum {minWords} words required)</span>
                  <span style={{color:wordCount>=minWords?T.green:wordCount>=(minWords*0.6)?T.amber:T.red,marginLeft:10,fontWeight:500,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                    {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords} required)`}
                  </span>
                </label>
                <textarea value={essay} onChange={e=>setEssay(e.target.value)}
                  placeholder={taskType==="task1general"?"Dear Sir/Madam,\n\nI am writing to...":taskType==="task1academic"?"The graph illustrates...":"Paste the student's essay here..."}
                  rows={10}
                  style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              </div>
              {error&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:14,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{error}</p></Card>}
              {!proUser&&usesLeft===1&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ Last free analysis! </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Upgrade to Pro</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}> for unlimited access.</span>
                </Card>
              )}
              <button ref={analyzeRef} onClick={analyze} disabled={loading}
                style={{background:loading?T.bgGray:T.primary,border:"none",borderRadius:4,color:loading?T.textMuted:"#fff",fontSize:15,fontWeight:700,padding:"14px 32px",cursor:loading?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",transition:"background 0.15s",display:"flex",alignItems:"center",gap:10,justifyContent:"center",letterSpacing:"0.01em"}}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?"🔓 Upgrade to Continue":`Analyze ${TASK_TYPES[taskType].label} →`}
              </button>

              {/* Language Selector */}
              <Card style={{background:T.bgGray,border:`1px solid ${T.border}`,marginTop:4}}>
                <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🌐 Feedback Language / لغة التغذية الراجعة</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:lang==="en"?T.primaryLight:"white",border:`1px solid ${lang==="en"?T.primaryBorder:T.border}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s"}} onClick={()=>switchLang("en")}>
                    <div style={{fontSize:22,flexShrink:0}}>🇬🇧</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:lang==="en"?T.primary:T.text,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:2}}>English — Feedback in English</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>All scores, corrections and tips will appear in English.</div>
                    </div>
                    {lang==="en"&&<span style={{background:T.primary,color:"white",borderRadius:4,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>✓ Active</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:lang==="ar"?T.primaryLight:"white",border:`1px solid ${lang==="ar"?T.primaryBorder:T.border}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s",direction:"ltr"}} onClick={()=>switchLang("ar")}>
                    <div style={{fontSize:22,flexShrink:0}}>🇸🇦</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:lang==="ar"?T.primary:T.text,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:2}}>عربي — التغذية الراجعة بالعربية</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",direction:"rtl",textAlign:"right"}}>ستظهر جميع الدرجات والتصحيحات والنصائح باللغة العربية.</div>
                    </div>
                    {lang==="ar"&&<span style={{background:T.primary,color:"white",borderRadius:4,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>✓ نشط</span>}
                  </div>
                </div>
              </Card>
            </div>

            {result&&(
              <div style={{marginTop:32}}>
                {/* FIX 1: Overall band header — score now visible with proper contrasting colors */}
                <div style={{background:`linear-gradient(135deg, ${T.primary} 0%, #003a99 100%)`,borderRadius:12,padding:"28px 32px",marginBottom:24,display:"flex",alignItems:"center",gap:28,flexWrap:"wrap",boxShadow:"0 8px 32px rgba(0,0,0,0.2)",borderLeft:`6px solid ${bandColor(result.overallBand)}`}}>
                  <div style={{textAlign:"center",minWidth:100}}>
                    <div style={{fontSize:72,fontWeight:900,color:"#ffffff",lineHeight:1,fontFamily:"Georgia,serif",textShadow:`0 0 40px ${bandColor(result.overallBand)}`}}>{result.overallBand}</div>
                    <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",fontFamily:"monospace",letterSpacing:"0.15em",textTransform:"uppercase",marginTop:4}}>Overall Band</div>
                  </div>
                  <div style={{flex:1,minWidth:180}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
                      <div style={{fontSize:20,fontWeight:800,color:"white",fontFamily:"Georgia,serif"}}>{bandLabel(result.overallBand)} <span style={{color:bandColor(result.overallBand),background:"rgba(255,255,255,0.15)",borderRadius:6,padding:"2px 10px",fontSize:16}}>{result.overallBand}</span></div>
                      {/* FIX 1: word count badge — dark text on white background, color-coded */}
                      <span style={{background:"white",border:`1px solid ${T.border}`,borderRadius:20,padding:"2px 10px",fontSize:12,color:wordCount>=minWords?T.green:T.red,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>
                        {wordCount} words {wordCount>=minWords?"✓":"⚠ below minimum"}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {result.strengths?.map((s,i)=><span key={i} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:20,padding:"3px 12px",fontSize:12,color:"rgba(255,255,255,0.9)",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>✓ {s}</span>)}
                    </div>
                  </div>
                </div>

                {result.mistakes?.length>0&&(
                  <Card style={{marginBottom:16,background:T.bgGray}}>
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:13,color:T.text,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:2,fontWeight:700}}>👆 Click any underlined word to see its correction and explanation.</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",direction:"rtl",textAlign:"right",marginBottom:8}}>اضغط على أي كلمة تحتها خط لرؤية التصحيح والشرح.</div>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      {[["major",T.red,"Major — خطأ كبير"],["moderate",T.amber,"Moderate — خطأ متوسط"],["minor",T.blue,"Minor — خطأ بسيط"]].map(([s,c,l])=>(
                        <span key={s} style={{fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",alignItems:"center",gap:4}}>
                          <span style={{display:"inline-block",width:20,height:2,background:c,borderRadius:1}}/><span style={{color:c,fontWeight:600}}>{l}</span>
                        </span>
                      ))}
                    </div>
                  </Card>
                )}

                <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap",background:T.bg,padding:6,borderRadius:10,border:"1px solid #e4e4e4"}}>
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
                    <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>📝 Your Essay — 👆 Click underlined words for corrections</span>
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
                        <div style={{fontSize:11,color:T.amber,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Key Improvements Needed</div>
                        {result.improvements.map((imp,i)=><div key={i} style={{color:T.textMid,fontSize:14,lineHeight:1.6,marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>→ {imp}</div>)}
                      </Card>
                    )}
                  </div>
                )}

                {activeTab==="mistakes"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
                      {[["major",T.red],["moderate",T.amber],["minor",T.blue]].map(([s,c])=>(
                        <span key={s} style={{background:"white",border:`1px solid ${c}60`,borderRadius:20,padding:"3px 10px",fontSize:11,color:c,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>● {s}</span>
                      ))}
                      <span style={{color:T.textMuted,fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui",alignSelf:"center"}}>— {result.mistakes?.length} total</span>
                    </div>
                    {result.mistakes?.length===0?<Card style={{textAlign:"center",color:T.green,padding:36,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>No mistakes — excellent!</Card>:result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i} essay={essay}/>)}
                  </div>
                )}

                {activeTab==="booster"&&result.bandBooster&&(
                  <Card style={{background:"#f5f5f5",border:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,flexWrap:"wrap"}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize:36,fontWeight:900,color:bandColor(result.bandBooster.currentBand),fontFamily:"Georgia,serif"}}>{result.bandBooster.currentBand}</div><div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase"}}>Current</div></div>
                      <div style={{fontSize:24,color:T.red}}>→</div>
                      <div style={{textAlign:"center"}}><div style={{fontSize:36,fontWeight:900,color:bandColor(result.bandBooster.targetBand),fontFamily:"Georgia,serif"}}>{result.bandBooster.targetBand}</div><div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase"}}>Target</div></div>
                      <div style={{flex:1}}><div style={{fontSize:14,color:T.gold,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>What to do:</div></div>
                    </div>
                    {result.bandBooster.specificActions?.map((a,i)=>(
                      <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                        <span style={{background:T.red,borderRadius:2,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:700,flexShrink:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{i+1}</span>
                        <p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{a}</p>
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
                        <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>💡 {v.reason}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="tips"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {result.examinerTips?.map((tip,i)=>(
                      <Card key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                        {/* FIX 2: tip number circles — solid red background so number is visible */}
                        <span style={{background:T.red,border:"none",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:700,flexShrink:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{i+1}</span>
                        <p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{tip}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="sample"&&result.sampleEssay&&(
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                        <div style={{fontSize:11,color:T.green,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Band 8+ Model Response</div>
                        <div style={{fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600,color:sampleWordCount>=minWords?T.green:T.red}}>{sampleWordCount} words {sampleWordCount>=minWords?"✓":"⚠ below minimum"}</div>
                      </div>
                      <p style={{color:T.text,fontSize:15,lineHeight:1.9,whiteSpace:"pre-wrap",margin:0,fontFamily:"Georgia,serif"}}>{result.sampleEssay}</p>
                    </Card>
                    {result.sampleEssayExplanation&&(
                      <Card>
                        <div style={{fontSize:11,color:T.blue,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Why This Response Scores High</div>
                        <div style={{display:"flex",flexDirection:"column",gap:12}}>
                          {[["Introduction",result.sampleEssayExplanation.introduction],["Body Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
                            <div key={lbl}><div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{lbl}</div><p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{txt}</p></div>
                          ))}
                          {result.sampleEssayExplanation.vocabularyHighlights?.length>0&&(
                            <div>
                              <div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Advanced Vocabulary Used</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{result.sampleEssayExplanation.vocabularyHighlights.map((v,i)=><span key={i} style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"2px 9px",fontSize:12,color:T.blue,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{v}</span>)}</div>
                            </div>
                          )}
                          <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}><p style={{color:T.green,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🏆 {result.sampleEssayExplanation.whyHighScore}</p></Card>
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mainView==="practice"&&<PracticeMode isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="progress"&&<ProgressTracker isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="toolkit"&&<ToolkitContent isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="contact"&&<ContactPage/>}
        </div>
      </div>

      {mainView==="terms"&&<TermsPage onBack={()=>setMainView("analyze")}/>}
      {mainView==="privacy"&&<PrivacyPage onBack={()=>setMainView("analyze")}/>}
      {mainView==="refund"&&<RefundPage onBack={()=>setMainView("analyze")}/>}

      {/* FOOTER */}
      <div style={{background:"#1c1d1f",borderTop:"1px solid #333",padding:"32px 24px",marginTop:40}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16,marginBottom:20}}>
            <span style={{color:"#fff",fontWeight:800,fontSize:20,fontFamily:"'Source Sans Pro','Inter',system-ui",letterSpacing:"-0.5px"}}>BandUp AI</span>
            <div style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              {[["terms","Terms of Service"],["privacy","Privacy Policy"],["refund","Refund Policy"]].map(([key,label])=>(
                <button key={key} onClick={()=>setMainView(key)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:13,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",padding:0}}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:16,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>© {new Date().getFullYear()} BandUp AI. All rights reserved.</span>
            <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>AI-powered IELTS Writing Examiner</span>
          </div>
        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap');
        * { box-sizing: border-box; }
        body { font-family: 'Source Sans 3', 'Inter', system-ui, sans-serif; margin: 0; }
        textarea, input, select, button { font-family: 'Source Sans Pro', 'Inter', system-ui, sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F3F4F6; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
      `}</style>
    </div>
  );
}
