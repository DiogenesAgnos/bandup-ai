import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client (anon key is safe to expose) ──────────────
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL || "",
  process.env.REACT_APP_SUPABASE_ANON_KEY || ""
);

// Helper: Supabase user → simple session shape the rest of the app uses
const toSession = (user) => user ? {
  email: user.email,
  name: user.user_metadata?.name || user.email?.split("@")[0] || "User"
} : null;

// Helper: fetch Pro status from Supabase profiles table
const fetchProStatus = async (email) => {
  if (!email) return false;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("email", email.toLowerCase().trim())
      .single();
    return data?.is_pro || false;
  } catch { return false; }
};

const STRIPE_CONFIGURED = false;
const ADMIN_KEY = process.env.REACT_APP_ADMIN_KEY || "EFadmin2026!";
const FREE_USES_LIMIT = 1;
const STORAGE_KEY = "bandup_uses";
const HISTORY_KEY = "bandup_history";
const API_URL = "/api/analyze";
const LAST_RESULT_KEY = "bandup_last_result";

// ── Local storage helpers (only for non-auth data) ────────────
const saveLastResult = (data) => { try{ localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data)); }catch{} };
const getLastResult = () => { try{ return JSON.parse(localStorage.getItem(LAST_RESULT_KEY)||"null"); }catch{ return null; } };
const clearLastResult = () => { try{ localStorage.removeItem(LAST_RESULT_KEY); }catch{} };

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

const getStoredUses = (email) => { try{ return parseInt(localStorage.getItem(STORAGE_KEY+(email||""))||"0"); }catch{ return 0; } };
const saveUses = (n,email) => { try{ localStorage.setItem(STORAGE_KEY+(email||""),String(n)); }catch{} };
const getHistory = (email) => { try{ return JSON.parse(localStorage.getItem(HISTORY_KEY+(email||""))||"[]"); }catch{ return []; } };
const saveHistory = (h,email) => { try{ localStorage.setItem(HISTORY_KEY+(email||""),JSON.stringify(h)); }catch{} };
const addToHistory = (entry,email) => {
  const h = getHistory(email);
  h.unshift({ ...entry, date: new Date().toISOString(), id: Date.now() });
  saveHistory(h.slice(0,20),email);
};

const PRACTICE_QUESTIONS = {
  "Education":["Some people believe that universities should focus on providing students with the practical skills needed in the workplace. Others argue that universities should prioritise academic knowledge. Discuss both views and give your opinion.","In some countries, children start formal education at a very early age. Some people think this is beneficial while others believe it is harmful. Discuss both views.","Some people think that the government should pay for higher education. Others believe students should pay for it themselves. Discuss both views."],
  "Technology":["The increasing use of technology in the workplace has led to concerns about job losses. To what extent do you agree or disagree?","Social media has had a largely negative impact on society. To what extent do you agree or disagree?","Some people think that technology is making people less sociable. Others disagree. Discuss both views and give your own opinion."],
  "Environment":["Many people believe that the most important way to protect the environment is to reduce the amount of energy used. To what extent do you agree or disagree?","Climate change is the most serious issue facing the world today. To what extent do you agree or disagree?","Some people think governments should focus on reducing environmental pollution rather than individuals. Discuss both views."],
  "Crime":["Some people think that the best way to reduce crime is to give longer prison sentences. Others believe there are better alternative ways. Discuss both views and give your own opinion.","The best way to reduce youth crime is to educate parents. To what extent do you agree or disagree?","In many cities, crime rates are increasing. What are the causes and what solutions can you suggest?"],
  "Health":["In many countries, obesity is becoming a serious problem. What are the causes and what measures could be taken to address it?","Healthcare should be funded entirely by governments. To what extent do you agree or disagree?","Prevention is better than cure. To what extent do you agree that governments should spend more on preventing illness rather than treating it?"],
  "Society":["The gap between the rich and the poor is growing wider in many countries. What problems does this cause and what solutions can you suggest?","In many societies, elderly people are no longer looked after by their families but are put in care homes. Is this a positive or negative development?","Some people think that cultural traditions will be destroyed when they are used as money-making attractions aimed at tourists. Others disagree. Discuss both views."],
  "Government":["Some people believe that the government should spend more money on public services rather than on the arts. To what extent do you agree or disagree?","Many governments think that economic progress is their most important goal. Some people, however, think that other types of progress are equally important. Discuss both views and give your opinion.","Some people believe that all citizens should be required to do a period of national service. Others disagree. Discuss both views."],
  "Work":["Some people believe that it is better to work for a large company, while others prefer to work for a small company. Discuss both views and give your opinion.","Many people now work from home instead of going to the office. What are the advantages and disadvantages of this trend?","Some people argue that job satisfaction is more important than job security, while others believe the opposite. Discuss both views and give your opinion."]
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
  "mistakes":[{"original":"exact phrase from text","correction":"the EXACT replacement text that should replace the original — NEVER advice or descriptions like 'use a stronger word', ALWAYS a concrete drop-in phrase the student can copy-paste","explanation":"clear explanation of WHY this is wrong and HOW the correction improves it","category":"Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Register","severity":"minor|moderate|major"}],
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

CRITICAL — CORRECTION FIELD RULES:
The "correction" field must ALWAYS contain a concrete replacement phrase that the student can directly substitute into their essay. NEVER write advice, descriptions, or suggestions like "use a stronger word" or "consider more formal language".
Examples of CORRECT corrections:
  - original: "a lot of people", correction: "a significant proportion of individuals" (NOT "use a more formal quantifier")
  - original: "things", correction: "factors" or "aspects" (NOT "be more specific")
  - original: "good", correction: "beneficial" or "advantageous" (NOT "use a stronger adjective")
  - original: "is very important", correction: "is of paramount importance" (NOT "strengthen this phrase")
  - original: "In my opinion, I think", correction: "I firmly contend that" (NOT "remove redundancy")
  - original: "people who break the law", correction: "offenders" or "those who contravene legislation" (NOT "use more academic language")
For Word Choice and Academic Style mistakes, the correction IS the upgraded academic phrase. For Grammar mistakes, the correction IS the grammatically fixed version.

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
  "spotErrors":[{"original":"exact error text","correction":"the exact replacement phrase to substitute in — NEVER advice like 'use a stronger word', ALWAYS a concrete phrase","explanation":"why this is wrong","category":"Grammar|Spelling|Punctuation|Word Choice|Academic Style"}]
}
spotErrors: find up to 5 real errors from the text. Each original must be exact text from the essay. Each correction must be a direct drop-in replacement, not advice. Example: original "a lot of", correction "a considerable amount of" (NOT "use formal language").`;

const TOOLKIT = {
  linkingWords:[
    {category:"Adding Information",color:"#0284c7",words:["Furthermore","Moreover","In addition","Additionally","What is more","Besides this","Not only... but also","Equally important"]},
    {category:"Contrasting",color:"#d97706",words:["However","Nevertheless","Nonetheless","On the other hand","In contrast","Conversely","Although","Whereas","Despite this","Notwithstanding"]},
    {category:"Cause & Effect",color:"#059669",words:["Therefore","Consequently","As a result","Hence","Thus","For this reason","This leads to","Owing to","On account of","This gives rise to"]},
    {category:"Examples",color:"#b8860b",words:["For instance","For example","To illustrate","Such as","A case in point is","This is exemplified by","Notably","As evidenced by"]},
    {category:"Concession",color:"#9333ea",words:["Admittedly","Granted","While it is true that","It could be argued that","One might contend","Despite the merits of"]},
    {category:"Emphasis",color:"#dc2626",words:["Indeed","Particularly","Especially","Significantly","Crucially","It is worth noting that","Undeniably","Above all"]},
    {category:"Conclusion",color:"#7c3aed",words:["In conclusion","To conclude","In summary","Overall","All things considered","Taking everything into account","On balance","In light of the above"]},
    {category:"Task 1 Trends & Data",color:"#0891b2",words:["Initially","Subsequently","Following this","Meanwhile","Over the period shown","By contrast","Approximately","Roughly","Just under","In the region of","The figure stood at","There was a marked increase"]}
  ],
  vocabulary:[
    {topic:"Education",words:[["learn","acquire knowledge / assimilate"],["school","educational institution / academy"],["important","crucial / paramount / indispensable"],["students","learners / pupils / scholars"],["helpful","beneficial / advantageous / conducive"],["teach","instruct / impart knowledge / educate"],["test","assessment / evaluation / examination"],["subject","discipline / field of study"],["good grades","academic excellence / high attainment"]]},
    {topic:"Crime & Justice",words:[["crime","criminal activity / antisocial behaviour / offence"],["punish","penalise / impose sanctions / discipline"],["prison","incarceration / detention / correctional facility"],["reduce","curb / alleviate / diminish / mitigate"],["rise","surge / escalate / proliferate"],["steal","commit theft / misappropriate"],["criminal","offender / perpetrator / lawbreaker"],["police","law enforcement / authorities"],["dangerous","hazardous / perilous / high-risk"]]},
    {topic:"Technology",words:[["use","utilise / harness / leverage / employ"],["change","transform / revolutionise / reshape"],["new","cutting-edge / innovative / state-of-the-art"],["problem","drawback / pitfall / shortcoming"],["spread","proliferate / permeate / disseminate"],["computer","digital device / technological tool"],["internet","digital sphere / online realm / cyberspace"],["phone","mobile device / smartphone / handset"],["fast","rapid / swift / accelerated"]]},
    {topic:"Health & Wellbeing",words:[["healthy","wholesome / salubrious / health-conscious"],["sick","afflicted / suffering from / ailing"],["doctor","medical practitioner / physician / clinician"],["exercise","physical activity / exertion / fitness regime"],["fat","obese / overweight / corpulent"],["food","nutrition / dietary intake / sustenance"],["mental health","psychological wellbeing / emotional welfare"],["cure","remedy / treatment / therapeutic intervention"],["hospital","medical facility / healthcare institution"]]},
    {topic:"Environment",words:[["pollution","contamination / environmental degradation"],["destroy","devastate / decimate / annihilate"],["save","conserve / preserve / safeguard"],["dirty","contaminated / polluted / toxic"],["animal","species / wildlife / fauna"],["cut trees","deforestation / logging / forest clearance"],["weather","climate conditions / meteorological patterns"],["waste","refuse / byproducts / effluent"],["green energy","renewable energy / sustainable power / clean energy"]]},
    {topic:"Society & Culture",words:[["rich","affluent / prosperous / wealthy"],["poor","impoverished / deprived / disadvantaged"],["old people","the elderly / senior citizens / ageing population"],["help","assist / support / facilitate"],["country","nation / state / sovereign territory"],["tradition","custom / cultural heritage / practice"],["gap","disparity / inequality / divide"],["community","neighbourhood / social group / collective"],["foreign","overseas / international / cross-border"]]},
    {topic:"Government & Policy",words:[["government","authorities / administration / the state"],["law","legislation / statute / legal framework"],["rule","regulation / policy / directive"],["spend money","allocate funds / invest resources / finance"],["tax","levy / fiscal charge / revenue collection"],["ban","prohibit / outlaw / impose a moratorium on"],["allow","permit / authorise / sanction"],["vote","suffrage / democratic participation / ballot"],["leader","head of state / policymaker / official"]]},
    {topic:"Work & Economy",words:[["job","occupation / profession / vocation"],["money","income / revenue / remuneration"],["pay","salary / wages / compensation"],["boss","employer / supervisor / line manager"],["worker","employee / labourer / member of the workforce"],["fired","dismissed / made redundant / terminated"],["business","enterprise / corporation / commercial entity"],["buy","purchase / acquire / procure"],["cheap","affordable / cost-effective / economical"]]},
    {topic:"Graph Language (Task 1)",words:[["went up","rose / increased / surged / climbed"],["went down","fell / declined / plummeted / dropped"],["stayed same","remained stable / plateaued / levelled off"],["big change","dramatic / sharp / significant / marked"],["highest","peaked at / reached a peak of / hit a high of"],["lowest","bottomed out at / reached a trough of"],["small change","marginal / slight / modest / negligible"],["fast change","rapid / steep / exponential"],["slow change","gradual / steady / incremental"]]}
  ],
  grammarRules:[
    {rule:"Subject-Verb Agreement",tip:"Collective nouns = singular: 'The government IS responsible.' Uncountable nouns = singular: 'Information IS available.' Watch for tricky subjects: 'The number of students HAS risen' (but 'A number of students HAVE enrolled')."},
    {rule:"Article Usage (a/an/the/zero)",tip:"Use 'the' for specific, known things: 'the government of Japan'. Use 'a/an' for first mention or general singular: 'a student needs motivation'. Use ZERO article with general plurals and uncountables: 'Education is important' NOT 'The education is important'. 'Children need support' NOT 'The children need the support'."},
    {rule:"Avoid Contractions in Formal Writing",tip:"NEVER use: don't → do not, can't → cannot, it's → it is, won't → will not, isn't → is not. Contractions lower your Lexical Resource and Grammatical Range scores. This is one of the easiest marks to gain."},
    {rule:"Passive Voice for Academic Formality",tip:"Use passive to sound objective: 'It is widely believed that...' / 'Measures should be implemented...' / 'It has been argued that...' / 'Education can be regarded as...' Mix active and passive — do not overuse either."},
    {rule:"Uncountable Nouns — Never Add 's'",tip:"These are ALWAYS singular with no 's': advice, information, knowledge, research, evidence, equipment, furniture, traffic, behaviour, progress, homework, feedback, luggage, accommodation, employment, unemployment, pollution, legislation."},
    {rule:"Conditional Sentences",tip:"Zero conditional (facts): 'If water reaches 100°C, it boils.' First (likely future): 'If the government invests, education WILL improve.' Second (hypothetical): 'If I WERE the president, I WOULD reform...' Third (past unreal): 'If they HAD invested, the economy WOULD HAVE grown.' Never mix tenses within one conditional."},
    {rule:"Relative Clauses (who/which/that/where)",tip:"Use 'who' for people, 'which' for things, 'where' for places, 'when' for times. Non-defining (extra info): 'London, WHICH is the capital, has...' — use commas. Defining (essential info): 'The city THAT has the highest pollution...' — no commas."},
    {rule:"Gerund vs Infinitive",tip:"Some verbs take gerund (-ing): enjoy, avoid, consider, suggest, deny, risk. Some take infinitive (to + verb): decide, agree, refuse, tend, appear, seem. Some take both with different meaning: 'stop smoking' (quit) vs 'stop to smoke' (pause in order to)."},
    {rule:"Preposition Collocations",tip:"Memorise these: depend ON, consist OF, invest IN, result IN, contribute TO, lead TO, suffer FROM, benefit FROM, comply WITH, deal WITH, succeed IN, insist ON, object TO, focus ON, rely ON, respond TO. Wrong prepositions are heavily penalised."},
    {rule:"Parallel Structure",tip:"Items in a list must match form: 'The plan involves REDUCING waste, RECYCLING materials, and CONSERVING energy.' NOT: 'reducing waste, recycle materials, and to conserve.' Applies to comparisons too: 'She prefers READING to WATCHING TV.'"},
    {rule:"Comma Rules for IELTS",tip:"Use commas: (1) after introductory phrases: 'In conclusion, ...' (2) before conjunctions in compound sentences: 'Crime is rising, and governments must act.' (3) around non-essential clauses: 'London, which is diverse, attracts...' (4) after transition words: 'However, this approach...' Missing commas penalise your GRA score."},
    {rule:"Run-on Sentences & Comma Splices",tip:"WRONG: 'Education is important, it helps people get jobs.' (comma splice). FIX with: semicolon: '...important; it helps...', conjunction: '...important, and it helps...', or period: '...important. It helps...' These count as major GRA errors."},
    {rule:"Noun Clauses (that/whether/what)",tip:"Use noun clauses to add complexity: 'It is evident THAT education plays a key role.' 'WHAT matters most is quality.' 'WHETHER this approach works remains debatable.' These show advanced grammar and raise your GRA score."},
    {rule:"Comparatives & Superlatives",tip:"One syllable: add -er/-est (bigger, biggest). Two+ syllables: use more/most (more significant, most important). Irregular: good → better → best, bad → worse → worst. NEVER double: 'more better' is ALWAYS wrong."},
    {rule:"It + Passive for Impersonal Statements",tip:"Sound academic: 'It is commonly believed that...' / 'It can be argued that...' / 'It should be noted that...' / 'It has been demonstrated that...' This avoids 'I think' overuse and shows grammatical range."},
    {rule:"Tense Consistency",tip:"Do not randomly switch tenses within a paragraph. If discussing a current trend, use present simple. If discussing completed research, use past simple. If discussing ongoing effects, use present perfect. 'The study found (past) that pollution has increased (present perfect) and continues (present) to rise.'"}
  ],
  petPeeves:[
    {peeve:"Starting with 'Nowadays'",fix:"Use: 'In contemporary society...' / 'In the modern era...' / 'Over recent decades...' / 'In today's increasingly globalised world...'"},
    {peeve:"'In my opinion, I think...'",fix:"Redundant. Use one: 'I firmly contend that...' / 'It is my considered view that...' / 'I am inclined to believe that...'"},
    {peeve:"Vague examples: 'in some countries'",fix:"Name the country: 'Finland's education system...' / 'Norway's recidivism rate of 20%...' / 'Singapore's strict anti-littering laws...' Specific = higher Task Achievement."},
    {peeve:"One-sentence paragraphs",fix:"Minimum 3 sentences: Topic sentence → Explanation → Example/Result. Ideally 4-5 sentences per body paragraph."},
    {peeve:"Copying words from the question",fix:"Paraphrase. 'reduce crime' → 'address criminal activity'. 'young people' → 'the younger generation'. Direct copying is penalised under Lexical Resource."},
    {peeve:"Using 'etcetera' or 'etc.'",fix:"Never use in IELTS. Instead, complete your list or use: 'among others' / 'and so forth' / 'to name but a few'."},
    {peeve:"Overusing 'However' to start sentences",fix:"Vary: 'Nevertheless...' / 'That said...' / 'Be that as it may...' / 'Notwithstanding this...' / 'In spite of this...' Using one connector repeatedly lowers Coherence & Cohesion."},
    {peeve:"Writing 'The essay will discuss...' in introductions",fix:"This is weak meta-language. Instead, directly present both sides: 'While some argue X, others maintain Y. This essay contends that Z.'"}
  ],
  templates:[
    {type:"Task 2 — Discuss Both Views + Opinion (Introduction)",template:"In contemporary society, [topic] has become an increasingly [debated/contentious] issue. While some argue that [view 1], others contend that [view 2]. This essay will examine both perspectives before arguing that [your position]."},
    {type:"Task 2 — Agree/Disagree (Introduction)",template:"It is often claimed that [statement from question]. While this view has some merit, I [strongly agree/disagree] with this proposition, as I believe [your main reason]. This essay will outline the key arguments supporting this stance."},
    {type:"Task 2 — Body Paragraph (PEEL structure)",template:"[Point — Topic sentence stating the main idea]. This is primarily because [Explanation — elaborate on why this is true]. For instance, [Example — specific example with data, country, or evidence]. Consequently, [Link — connect back to the argument or question]."},
    {type:"Task 2 — Concession + Rebuttal",template:"Admittedly, [opposing view]. This perspective holds some validity, as [brief reason]. However, [counter-argument]. While [opponent's point] may apply in certain contexts, the evidence overwhelmingly suggests that [your point], making it the more compelling position."},
    {type:"Task 2 — Conclusion",template:"In conclusion, while [opposing view] has some validity, I firmly maintain that [your position] is the more effective approach. It is imperative that governments and individuals [action] in order to [desired outcome]. Only through such measures can [broader benefit] be achieved."},
    {type:"Task 1 Academic — Overview",template:"Overall, it is clear that [main trend 1], while [main trend 2]. [Category A] experienced the most significant [change], whereas [Category B] remained comparatively [stable/low]. The most notable feature is [key observation]."},
    {type:"Task 1 Academic — Describing Trends",template:"In [start year], [subject] stood at approximately [figure]. Over the following [time period], it [rose/fell] [adverb: steadily/sharply/gradually] to reach [figure] by [end year]. This represents a [percentage]% [increase/decrease] over the period shown."},
    {type:"Task 1 General — Formal Letter Opening",template:"Dear Sir or Madam,\n\nI am writing to [purpose: express my concern about / request information regarding / apply for the position of] [specific topic]. I would be most grateful if you could [main request]."},
    {type:"Task 1 General — Informal Letter Opening",template:"Dear [Name],\n\nI hope this letter finds you well. I am writing to [tell you about / ask for your help with / invite you to] [topic]. It has been a while since we last spoke, and I wanted to share some news."},
    {type:"Task 1 General — Letter Closing (Formal)",template:"I would greatly appreciate your prompt attention to this matter. Should you require any further information, please do not hesitate to contact me.\n\nYours faithfully,\n[Name]"},
    {type:"Task 1 General — Letter Closing (Informal)",template:"Well, that is all my news for now. I really hope to hear from you soon. Do let me know if you have any questions!\n\nBest wishes,\n[Name]"}
  ],
  modelEssays:[
    {
      taskType:"Task 2 — Discuss Both Views",
      topic:"Some people believe that universities should focus on providing students with the practical skills needed in the workplace. Others argue that universities should prioritise academic knowledge. Discuss both views and give your opinion.",
      band:8.0,
      essay:"The role of universities in preparing students for the future has long been a subject of debate. While some advocate for a curriculum centred on practical, workplace-oriented skills, others maintain that academic knowledge should remain the primary focus of higher education. This essay will examine both perspectives before arguing that a balanced approach is the most effective.\n\nThose who favour practical training contend that universities have a responsibility to produce employable graduates. In an increasingly competitive job market, students who possess hands-on skills such as data analysis, project management, and digital literacy are more likely to secure employment upon graduation. For instance, Germany's dual education system, which integrates vocational training with academic study, has contributed to one of the lowest youth unemployment rates in Europe. From this standpoint, universities that neglect practical preparation risk leaving their graduates ill-equipped for professional life.\n\nConversely, proponents of academic knowledge argue that the purpose of university extends beyond mere job training. Critical thinking, research methodology, and intellectual curiosity are cultivated through rigorous academic programmes, and these skills transcend any single profession. A graduate with strong analytical and reasoning abilities can adapt to multiple career paths over a lifetime, whereas narrowly trained individuals may struggle when industries evolve. Furthermore, academic research at universities drives innovation and societal progress in ways that purely vocational training cannot.\n\nIn my view, the most effective universities are those that integrate both dimensions. Practical skills without intellectual depth produce technically competent but uncritical workers, while academic knowledge without application can lead to theoretical understanding detached from reality. Institutions such as MIT and ETH Zurich demonstrate that excellence in both domains is not only possible but mutually reinforcing.\n\nIn conclusion, rather than privileging one approach over the other, universities should strive for a curriculum that marries academic rigour with practical relevance. This balanced model equips graduates not only for their first job but for a lifetime of meaningful contribution.",
      explanation:"This essay scores Band 8 because it fully addresses all parts of the task with well-developed, relevant ideas. Both views are explored with specific examples (Germany, MIT, ETH Zurich). The position is clear and maintained throughout. Paragraphing is logical with clear topic sentences. Lexical resource is wide — 'intellectual curiosity', 'mutually reinforcing', 'privileging'. Grammar is varied with error-free complex structures."
    },
    {
      taskType:"Task 2 — Agree/Disagree",
      topic:"Climate change is the most serious issue facing the world today. To what extent do you agree or disagree?",
      band:7.5,
      essay:"It is frequently argued that climate change represents the gravest threat to humanity in the modern era. While I acknowledge the severity of this issue, I partially agree with this statement, as I believe that other global challenges — such as poverty and armed conflict — are equally pressing.\n\nThere is no doubt that climate change poses an existential risk. Rising sea levels threaten to displace millions of people living in coastal regions, while extreme weather events such as droughts and hurricanes are increasing in both frequency and severity. According to the Intergovernmental Panel on Climate Change, global temperatures could rise by as much as 2.5 degrees Celsius by 2050, with devastating consequences for agriculture and biodiversity. These facts underscore why many regard climate change as the defining challenge of our time.\n\nHowever, it would be shortsighted to claim that no other issue rivals it in urgency. Approximately 700 million people worldwide still live in extreme poverty, lacking access to clean water, adequate nutrition, and basic healthcare. In many developing nations, these immediate threats to human survival take precedence over longer-term environmental concerns. Similarly, ongoing conflicts in regions such as the Middle East and Sub-Saharan Africa cause immense human suffering and displacement on a scale that demands urgent attention.\n\nFurthermore, it could be argued that many of these issues are interconnected. Climate change exacerbates poverty by reducing agricultural yields, while poverty limits communities' ability to adapt to environmental changes. Addressing these challenges therefore requires an integrated approach rather than a hierarchy of importance.\n\nIn conclusion, while climate change is undeniably one of the most critical issues of our era, labelling it as the single most serious problem oversimplifies a complex reality. A holistic strategy that addresses environmental, economic, and humanitarian challenges simultaneously is both necessary and achievable.",
      explanation:"This scores Band 7.5. Task response is strong — the partial agreement position is clear and nuanced. Coherence is logical with smooth transitions. Vocabulary is good: 'existential risk', 'shortsighted', 'exacerbates'. Some minor over-generalisation in the poverty paragraph prevents a full 8. Grammar is mostly error-free with good complex structure variety."
    },
    {
      taskType:"Task 1 Academic — Line Graph",
      topic:"The graph below shows the number of international tourists visiting three different countries between 2005 and 2020. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.",
      band:8.0,
      essay:"The line graph illustrates the volume of overseas visitors to three nations — France, the United States, and Brazil — over a fifteen-year period from 2005 to 2020.\n\nOverall, it is evident that France consistently attracted the highest number of international tourists throughout the period, while Brazil received the fewest. All three countries experienced a sharp decline in visitor numbers in 2020, almost certainly attributable to the global pandemic.\n\nIn 2005, France welcomed approximately 75 million tourists, a figure that rose steadily to reach a peak of roughly 90 million in 2019. The United States followed a broadly similar trajectory, beginning the period at around 50 million visitors and climbing to approximately 80 million by 2019, thereby narrowing the gap with France considerably. Brazil, by contrast, attracted a comparatively modest 5 million tourists in 2005, which grew gradually to about 7 million by 2019.\n\nThe most striking feature of the graph is the precipitous drop recorded in 2020, when all three nations saw their tourist numbers fall by approximately 70 to 80 percent. France's figures plummeted to under 30 million, while the United States declined to roughly 20 million. Brazil's numbers fell to just over 1 million, representing its lowest figure in the entire period.\n\nIn summary, while all three countries experienced overall growth in tourism between 2005 and 2019, this upward trend was dramatically reversed in 2020.",
      explanation:"This earns Band 8 for Task 1. It has a clear overview, accurate data reporting with specific figures, and effective comparisons between countries. Key language: 'precipitous drop', 'attributable to', 'broadly similar trajectory', 'narrowing the gap'. The structure is logical — overview first, then detailed periods, then the dramatic 2020 change. Word count (212) is well above the 150 minimum."
    },
    {
      taskType:"Task 1 General — Formal Letter",
      topic:"You recently ordered a product online and were dissatisfied with what you received. Write a letter to the company. In your letter: describe what you ordered and when; explain what the problem is; say what action you would like the company to take.",
      band:7.5,
      essay:"Dear Sir or Madam,\n\nI am writing to express my dissatisfaction with a product I recently purchased through your online store and to request appropriate remedial action.\n\nOn 15th February, I placed an order for a Brookfield oak bookshelf, reference number BK-4421, at a cost of 189 pounds. The item was delivered to my home address on 22nd February, which was within the estimated delivery window.\n\nHowever, upon opening the package, I discovered several significant issues. Firstly, one of the side panels had a large crack running across its entire width, rendering it structurally unsound. Secondly, the assembly instructions were missing from the box, making it impossible to put the item together. Finally, the colour of the shelves appeared considerably darker than what was shown on your website, suggesting a possible error in the item dispatched.\n\nGiven the extent of these defects, I do not believe that a repair would be sufficient. I would therefore like to request a full replacement to be delivered at no additional charge. Alternatively, if the item is currently out of stock, I would accept a complete refund to my original payment method. I would also appreciate a prepaid return label for the damaged item.\n\nI trust that you will address this matter promptly and look forward to your response within the next seven working days.\n\nYours faithfully,\nAlex Morgan",
      explanation:"This scores Band 7.5 for GT Task 1. All three bullet points are fully addressed with appropriate detail. The tone and register are consistently formal throughout. Good vocabulary: 'remedial action', 'rendering it structurally unsound', 'dispatched'. Minor deduction because the letter could have included one more specific detail. Letter format is correct with proper opening and closing."
    },
    {
      taskType:"Task 1 General — Informal Letter",
      topic:"A friend has written to you asking for advice about whether to take a gap year before starting university. Write a letter to your friend. In your letter: give your opinion about gap years; suggest what your friend could do during a gap year; explain how it might affect their university experience.",
      band:7.0,
      essay:"Dear Sam,\n\nThanks so much for your letter — it was great to hear from you! I can tell you have been thinking hard about this, and I am happy to share my thoughts on the gap year question.\n\nHonestly, I think taking a year out before university is a wonderful idea. I know a few people who went straight from school to uni and regretted not having a break. A gap year gives you time to grow up a bit and figure out what you really want to study, rather than just picking something because everyone else is.\n\nAs for what you could do, have you thought about volunteering abroad? There are some great programmes in Southeast Asia where you can teach English and explore at the same time. If that is not your thing, you could also try getting some work experience in a field you are interested in — it would look brilliant on your CV and give you a real advantage over other students.\n\nI genuinely believe it would make your university experience much better too. You would arrive more mature, more motivated, and with real-world stories to draw on in your essays. Plus, you would appreciate the academic side more after having a taste of working life.\n\nAnyway, whatever you decide, I am sure it will work out brilliantly. Let me know what you are leaning towards — I would love to hear!\n\nBest wishes,\nJordan",
      explanation:"This scores Band 7.0. All three bullet points are addressed clearly. The informal register is appropriate and consistent — friendly but not overly casual. Good range of vocabulary without being forced: 'leaning towards', 'a real advantage'. Note the avoidance of contractions to maintain scoring potential. Some ideas could be extended further for a higher band, and one more specific example would strengthen Task Achievement."
    },
    {
      taskType:"Task 2 — Problem/Solution",
      topic:"In many cities, the increasing number of private cars is causing serious traffic congestion and air pollution. What are the causes of this problem and what measures could be taken to address it?",
      band:7.0,
      essay:"Traffic congestion and air pollution caused by the rising number of private vehicles have become critical urban issues in many parts of the world. This essay will examine the primary causes of this problem before proposing several practical solutions.\n\nThe main reason behind the proliferation of private cars is the inadequacy of public transport systems in many cities. When buses and trains are overcrowded, unreliable, or poorly connected, commuters naturally turn to private vehicles as a more convenient alternative. In cities such as Cairo and Jakarta, public transport networks have failed to keep pace with rapid population growth, forcing millions to depend on cars and motorcycles for their daily commute. Additionally, the relatively low cost of car ownership in some countries, combined with the social status associated with owning a vehicle, further encourages this trend.\n\nTo address this issue, governments should invest heavily in modernising public transport infrastructure. Cities like Singapore and Copenhagen have demonstrated that efficient, affordable, and well-connected transit systems can significantly reduce car dependency. Furthermore, implementing congestion pricing in city centres, as London has done with its congestion charge, can discourage unnecessary car use while generating revenue to fund sustainable transport alternatives. Finally, promoting remote working arrangements where possible would reduce the volume of daily commuters on the roads.\n\nIn conclusion, while the causes of urban traffic congestion are deeply rooted in infrastructure deficiencies and cultural attitudes, targeted investment in public transport and smart policy measures can effectively mitigate this growing problem.",
      explanation:"This earns Band 7.0. Causes and solutions are clearly structured in separate paragraphs with specific examples (Cairo, Jakarta, Singapore, Copenhagen, London). The essay addresses the task fully but some points could be more deeply developed — the 'social status' idea is mentioned but not expanded. Vocabulary is appropriate: 'proliferation', 'mitigate', 'inadequacy'. Grammar is generally accurate with good complex sentence variety."
    }
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

// Memoized — prevents expensive re-render when switching tabs
const MemoAnnotatedEssay = memo(AnnotatedEssay, (prev, next) =>
  prev.essay === next.essay && prev.mistakes === next.mistakes
);

// ── Components ─────────────────────────────────
const Logo=({size=26,style={}})=>(
  <span style={{fontFamily:"'Rubik',sans-serif",fontWeight:900,fontSize:size,letterSpacing:"-1px",lineHeight:1,cursor:"pointer",...style}}>
    <span style={{color:"#DC2626"}}>E</span><span style={{color:"#EA580C"}}>n</span><span style={{color:"#CA8A04"}}>g</span><span style={{color:"#15803D"}}>l</span><span style={{color:"#0E7490"}}>i</span><span style={{color:"#1D4ED8"}}>s</span><span style={{color:"#7E22CE"}}>h</span><span style={{color:"#BE185D"}}>f</span><span style={{color:"#DC2626"}}>o</span><span style={{color:"#EA580C"}}>o</span><span style={{color:"#15803D"}}>l</span>
  </span>
);

const Card=({children,style,...rest})=>(
  <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"20px 24px",boxShadow:T.shadow,...style}} {...rest}>
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

// ── Auth Modal ────────────────────────────────
const AuthModal=({onClose,onSuccess})=>{
  const [mode,setMode]=useState("login"); // login | register | forgot
  const [email,setEmail]=useState(()=>{ try{ return localStorage.getItem("bandup_saved_email")||""; }catch{ return ""; } });
  const [password,setPassword]=useState("");
  const [name,setName]=useState("");
  const [showPass,setShowPass]=useState(false);
  const [rememberMe,setRememberMe]=useState(true);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [loading,setLoading]=useState(false);

  const handle=async()=>{
    setError(""); setSuccess(""); setLoading(true);
    try{
      // ── Forgot password ──
      if(mode==="forgot"){
        if(!email.trim()){ setError("Please enter your email address."); setLoading(false); return; }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + "/reset-password"
        });
        if(error){ setError(error.message); setLoading(false); return; }
        setSuccess("Password reset email sent! Check your inbox.");
        setLoading(false);
        return;
      }
      // ── Login ──
      if(mode==="login"){
        if(!email.trim()){ setError("Please enter your email address."); setLoading(false); return; }
        if(!password.trim()){ setError("Please enter your password."); setLoading(false); return; }
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if(error){ setError(error.message); setLoading(false); return; }
        if(rememberMe){ try{ localStorage.setItem("bandup_saved_email", email.toLowerCase().trim()); }catch{} }
        else{ try{ localStorage.removeItem("bandup_saved_email"); }catch{} }
        setLoading(false);
        onSuccess(toSession(data.user));
        return;
      }
      // ── Register ──
      if(!name.trim()){ setError("Please enter your name."); setLoading(false); return; }
      if(!email.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())){ setError("Please enter a valid email address."); setLoading(false); return; }
      if(password.length<6){ setError("Password must be at least 6 characters."); setLoading(false); return; }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(), password,
        options: { data: { name: name.trim() } }
      });
      if(error){ setError(error.message); setLoading(false); return; }
      if(rememberMe){ try{ localStorage.setItem("bandup_saved_email", email.toLowerCase().trim()); }catch{} }
      setLoading(false);
      // Supabase may require email confirmation — handle both cases
      if(data.session){ onSuccess(toSession(data.user)); }
      else{ setSuccess("Account created! Check your email to confirm, then sign in."); }
    }catch(e){
      console.error("Auth error:", e);
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const inp={width:"100%",background:"#f9f9f9",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"11px 14px",fontFamily:"'Source Sans Pro','Inter',system-ui",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"white",borderRadius:20,padding:"36px 28px",maxWidth:400,width:"100%",position:"relative",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"#f3f3f3",border:"none",fontSize:16,cursor:"pointer",width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:T.text}}>✕</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:8}}>🎓</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,margin:"0 0 4px"}}>
            {mode==="login"?"Welcome back":mode==="register"?"Create account":"Reset password"}
          </h2>
          <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:0}}>
            {mode==="login"?"Sign in to access your account":mode==="register"?"Join Englishfool today":"Enter your email to reset your password"}
          </p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {mode==="register"&&(
            <input value={name} onChange={e=>setName(e.target.value)}
              placeholder="Full name" autoComplete="name" style={inp}/>
          )}
          <input value={email} onChange={e=>setEmail(e.target.value)}
            placeholder="Email address" type="email" autoComplete="email" style={inp}/>
          {mode!=="forgot"&&(
            <div style={{position:"relative"}}>
              <input value={password} onChange={e=>setPassword(e.target.value)}
                placeholder="Password" type={showPass?"text":"password"}
                autoComplete={mode==="login"?"current-password":"new-password"}
                style={{...inp,paddingRight:48}}
                onKeyDown={e=>e.key==="Enter"&&handle()}/>
              <button type="button" onClick={()=>setShowPass(!showPass)}
                style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.textMuted,padding:4}}>
                {showPass?"🙈":"👁️"}
              </button>
            </div>
          )}
          {/* Remember me — login only */}
          {mode==="login"&&(
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
              <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}
                style={{width:16,height:16,cursor:"pointer",accentColor:T.primary}}/>
              Remember my email
            </label>
          )}
          {error&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{error}</div>}
          {success&&<div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{success}</div>}
          <button onClick={handle} disabled={loading}
            style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",opacity:loading?0.7:1}}>
            {loading?"⏳ Please wait...":mode==="login"?"Sign In →":mode==="register"?"Create Account →":"Send Reset Link →"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:13,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",flexDirection:"column",gap:8}}>
          {mode==="login"&&(
            <>
              <div>Don't have an account? <button onClick={()=>{setMode("register");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Sign up free</button></div>
              <div><button onClick={()=>{setMode("forgot");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui",textDecoration:"underline"}}>Forgot password?</button></div>
            </>
          )}
          {mode==="register"&&(
            <div>Already have an account? <button onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Sign in</button></div>
          )}
          {mode==="forgot"&&(
            <div><button onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>← Back to sign in</button></div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Change Password Modal ────────────────────
const ChangePasswordModal=({onClose})=>{
  const [newPass,setNewPass]=useState("");
  const [confirmPass,setConfirmPass]=useState("");
  const [showPass,setShowPass]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [loading,setLoading]=useState(false);

  const handleChange=async()=>{
    setError(""); setSuccess("");
    if(!newPass.trim()){ setError("Please enter a new password."); return; }
    if(newPass.length<6){ setError("Password must be at least 6 characters."); return; }
    if(newPass!==confirmPass){ setError("Passwords don't match."); return; }
    setLoading(true);
    try{
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if(error){ setError(error.message); setLoading(false); return; }
      setSuccess("Password changed successfully!");
      setTimeout(()=>onClose(),2000);
    }catch(e){ setError("Something went wrong."); }
    setLoading(false);
  };

  const inp={width:"100%",background:"#f9f9f9",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"11px 14px",fontFamily:"'Source Sans Pro','Inter',system-ui",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:20,padding:"36px 28px",maxWidth:400,width:"100%",position:"relative",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"#f3f3f3",border:"none",fontSize:16,cursor:"pointer",width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:T.text}}>✕</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:8}}>🔑</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,margin:"0 0 4px"}}>Change Password</h2>
          <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:0}}>Enter your new password below</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{position:"relative"}}>
            <input value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="New password (min 6 characters)" type={showPass?"text":"password"} style={{...inp,paddingRight:48}}/>
            <button type="button" onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.textMuted,padding:4}}>{showPass?"🙈":"👁️"}</button>
          </div>
          <input value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} placeholder="Confirm new password" type={showPass?"text":"password"} style={inp} onKeyDown={e=>e.key==="Enter"&&handleChange()}/>
          {error&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{error}</div>}
          {success&&<div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{success}</div>}
          <button onClick={handleChange} disabled={loading} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",opacity:loading?0.7:1}}>
            {loading?"⏳ Updating...":"Update Password →"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Paywall ───────────────────────────────────
const PaywallModal=({onClose,onSuccess,session,initialTab="cliq"})=>{
  const [tab,setTab]=useState(initialTab); // "cliq" | "international" | "code"
  const [cliqForm,setCliqForm]=useState({name:"",email:session?.email||"",mobile:""});
  const [cliqStatus,setCliqStatus]=useState(null); // null | "sending" | "sent" | "error"
  const [codeEmail,setCodeEmail]=useState(session?.email||"");
  const [codeVal,setCodeVal]=useState("");
  const [codeErr,setCodeErr]=useState("");
  const [codeSuccess,setCodeSuccess]=useState(false);

  const FEATURES=["Unlimited essay analyses — Task 1 & 2","Complete mistake & spelling detection","Inline annotated essay corrections","Band Booster + vocabulary upgrades","Full IELTS Toolkit (templates, model essays)","Practice Mode with live AI coaching","Unlimited Grammar & Spelling Checker","Progress tracker","Unlimited exercises — all categories"];

  const submitCliq=async()=>{
    if(!cliqForm.name.trim()||!cliqForm.email.trim()||!cliqForm.mobile.trim()){setCliqStatus("error");return;}
    setCliqStatus("sending");
    try{
      // Save to Supabase via API
      await fetch("/api/cliq/request",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name:cliqForm.name.trim(),email:cliqForm.email.trim(),mobile:cliqForm.mobile.trim()})
      });
      // Also send email notification via EmailJS (backup)
      try{
        if(window.emailjs) await window.emailjs.send("service_9es76g1","template_jrd4i4n",{
          from_name:"CLIQ PRO REQUEST: "+cliqForm.name.trim(),
          from_email:cliqForm.email.trim(),
          country:cliqForm.mobile.trim(),
          age_group:"CLIQ Payment",
          message:`New CLIQ Pro upgrade request:\n\nName: ${cliqForm.name.trim()}\nEmail: ${cliqForm.email.trim()}\nMobile: ${cliqForm.mobile.trim()}\nAmount: 17 JOD\nCLIQ Alias: Efool2026`,
          to_email:"diogenes.agnos@gmail.com"
        });
      }catch(emailErr){ console.warn("EmailJS failed (non-critical):",emailErr); }
      setCliqStatus("sent");
    }catch(e){console.error("CLIQ request error",e);setCliqStatus("error");}
  };

  const [codeLoading, setCodeLoading] = useState(false);
  const applyCode=async()=>{
    setCodeErr("");
    if(!codeEmail.trim()){setCodeErr("Please enter your email address.");return;}
    if(!codeVal.trim()){setCodeErr("Please enter your activation code.");return;}
    setCodeLoading(true);
    try{
      const res = await fetch("/api/pro/activate", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ email: codeEmail.trim(), code: codeVal.trim() })
      });
      const data = await res.json();
      if(!res.ok){ setCodeErr(data.error || "Invalid code."); setCodeLoading(false); return; }
      setCodeSuccess(true);
      setTimeout(()=>{ onSuccess(codeEmail.toLowerCase().trim()); }, 1600);
    }catch(e){
      setCodeErr("Something went wrong. Please try again.");
      setCodeLoading(false);
    }
  };

  const tabBtn=(key,icon,label)=>(
    <button onClick={()=>setTab(key)} style={{flex:1,minWidth:0,padding:"8px 4px",background:tab===key?T.primaryLight:"transparent",border:`1px solid ${tab===key?T.primaryBorder:T.border}`,borderRadius:8,fontSize:11,fontWeight:tab===key?700:400,color:tab===key?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",flexDirection:"column",alignItems:"center",gap:2,lineHeight:1.2,textAlign:"center",wordBreak:"break-word"}}>
      <span style={{fontSize:18}}>{icon}</span><span style={{display:"block"}}>{label}</span>
    </button>
  );

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fefdf8",border:`1px solid ${T.border}`,borderRadius:20,maxWidth:460,width:"100%",position:"relative",boxShadow:T.shadowLg,display:"flex",flexDirection:"column",maxHeight:"92vh",overflowY:"hidden"}}>

        {/* Sticky header — X always visible */}
        <div style={{flexShrink:0,padding:"16px 20px 0",position:"relative"}}>
          <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"#f3f3f3",border:"none",color:T.text,fontSize:18,cursor:"pointer",width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,zIndex:10}}>✕</button>
          <div style={{textAlign:"center",paddingBottom:16}}>
            <div style={{fontSize:32,marginBottom:6}}>🎓</div>
            <h2 style={{fontFamily:"Georgia,serif",color:T.text,fontSize:22,margin:"0 0 6px"}}>Unlock Pro Access</h2>
            <p style={{color:T.textMid,fontSize:13,lineHeight:1.5,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:0}}>Unlimited analyses, full toolkit, and all exercises.</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{overflowY:"auto",padding:"0 20px 24px",flex:1}}>

        {/* Features list */}
        <div style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:10,padding:"12px 16px",marginBottom:20}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 0"}}>
            {FEATURES.map((f,i)=>(
              <div key={i} style={{width:"100%",display:"flex",gap:8,fontSize:12,color:T.primary,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                <span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}
              </div>
            ))}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {tabBtn("cliq","🏦","CLIQ 🇯🇴")}
          {tabBtn("international","💳","International")}
          {tabBtn("code","🔑","Enter Code")}
        </div>

        {/* ── CLIQ Tab ── */}
        {tab==="cliq"&&(
          <div>
            <div style={{background:"#f0fdf4",border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"14px 16px",marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>🇯🇴 Pay via CLIQ — Available Now</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:T.text,lineHeight:1}}>17 <span style={{fontSize:20,fontWeight:700}}>JOD</span></div>
              <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>One-time monthly payment · Cancel anytime</div>
            </div>
            <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:700,color:T.amber,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>📲 How to pay:</div>
              <ol style={{margin:0,paddingLeft:18,fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.8}}>
                <li>Open your banking app → CliQ → Send Money</li>
                <li>Send <strong>17 JOD</strong> to CliQ alias: <strong style={{color:T.primary,fontFamily:"monospace",fontSize:14}}>Efool2026</strong></li>
                <li>Fill the form below and submit</li>
                <li>We'll WhatsApp your activation code within a few hours</li>
              </ol>
            </div>
            {cliqStatus==="sent"?(
              <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"18px",textAlign:"center"}}>
                <div style={{fontSize:28,marginBottom:8}}>✅</div>
                <div style={{fontSize:14,fontWeight:700,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>Request received!</div>
                <p style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:"0 0 8px",lineHeight:1.5}}>We'll verify your payment and WhatsApp your activation code to <strong>{cliqForm.mobile}</strong> within a few hours.</p>
                <p style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:0}}>Once you receive the code, click <strong>"Enter Code"</strong> tab above.</p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[{field:"name",label:"Full Name",placeholder:"Your full name",type:"text"},{field:"email",label:"Email Address",placeholder:"The email you signed up with",type:"email"},{field:"mobile",label:"Mobile Number (for WhatsApp)",placeholder:"e.g. 0791234567",type:"tel"}].map(({field,label,placeholder,type})=>(
                  <div key={field}>
                    <label style={{display:"block",fontSize:11,fontWeight:700,color:T.textMid,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{label}</label>
                    <input type={type} value={cliqForm[field]} onChange={e=>setCliqForm(p=>({...p,[field]:e.target.value}))} placeholder={placeholder}
                      style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"10px 12px",fontFamily:"'Source Sans Pro','Inter',system-ui",outline:"none",boxSizing:"border-box"}}/>
                  </div>
                ))}
                {cliqStatus==="error"&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ Please fill in all fields, or check your connection and try again.</div>}
                <button onClick={submitCliq} disabled={cliqStatus==="sending"}
                  style={{background:cliqStatus==="sending"?T.bgGray:T.green,color:cliqStatus==="sending"?T.textMuted:"white",border:"none",borderRadius:8,padding:"13px",fontSize:14,fontWeight:700,cursor:cliqStatus==="sending"?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                  {cliqStatus==="sending"?"⏳ Submitting...":"✅ I've Paid — Submit Request"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── International Tab ── */}
        {tab==="international"&&(
          <div style={{textAlign:"center"}}>
            <div style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px",marginBottom:16}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:T.text,lineHeight:1}}>$25 <span style={{fontSize:16,color:T.textMuted,fontWeight:400}}>/ month</span></div>
              <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Cancel anytime · Powered by Paddle</div>
            </div>
            <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"14px",marginBottom:16}}>
              <div style={{fontSize:13,color:T.amber,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>🔒 Online card payment is coming very soon.</div>
              <p style={{fontSize:12,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:"6px 0 0",lineHeight:1.5}}>We're finalising our payment processor. In the meantime, users inside Jordan can pay via CLIQ.</p>
            </div>
            <button disabled style={{width:"100%",background:"#94a3b8",color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:14,fontWeight:700,cursor:"not-allowed",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
              💳 Pay $25/month — Coming Soon
            </button>
          </div>
        )}

        {/* ── Enter Code Tab ── */}
        {tab==="code"&&(
          <div>
            <div style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:10,lineHeight:1.6}}>
              Already paid via CLIQ and received your activation code? Enter it below to unlock Pro instantly.
            </div>
            <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"10px 14px",marginBottom:14,fontSize:12,color:T.amber,fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6}}>
              💡 <strong>Using a new device?</strong> Register or sign in with the same email you used when paying, then enter your code here. Your Pro status activates on any device this way.
            </div>
            {codeSuccess?(
              <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"20px",textAlign:"center"}}>
                <div style={{fontSize:32,marginBottom:8}}>🎉</div>
                <div style={{fontSize:15,fontWeight:700,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Pro activated! Welcome aboard.</div>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:T.textMid,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Your Email Address</label>
                  <input type="email" value={codeEmail} onChange={e=>setCodeEmail(e.target.value)} placeholder="The email you signed up with"
                    style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"10px 12px",fontFamily:"'Source Sans Pro','Inter',system-ui",outline:"none",boxSizing:"border-box"}}/>
                </div>
                <div>
                  <label style={{display:"block",fontSize:11,fontWeight:700,color:T.textMid,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Activation Code</label>
                  <input type="text" value={codeVal} onChange={e=>setCodeVal(e.target.value)} placeholder="EFOOL-XXXX-XXXX"
                    style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"10px 12px",fontFamily:"'Source Sans Pro','Inter',system-ui",outline:"none",boxSizing:"border-box",letterSpacing:"0.05em"}}
                    onKeyDown={e=>e.key==="Enter"&&applyCode()}/>
                </div>
                {codeErr&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ {codeErr}</div>}
                <button onClick={applyCode} disabled={codeLoading}
                  style={{background:codeLoading?T.bgGray:T.primary,color:codeLoading?T.textMuted:"white",border:"none",borderRadius:8,padding:"13px",fontSize:14,fontWeight:700,cursor:codeLoading?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                  {codeLoading?"⏳ Verifying...":"🔓 Activate Pro"}
                </button>
              </div>
            )}
          </div>
        )}
        </div>{/* end scrollable body */}
      </div>
    </div>
  );
};


// ── Progress Tracker ──────────────────────────
const ProgressTracker=({onUpgrade,isPro,email})=>{
  const history=getHistory(email);
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
  const [expandedEssay,setExpandedEssay]=useState(null);
  const sections=[{key:"linking",label:"🔗 Linking Words",free:true},{key:"vocab",label:"📚 Vocabulary",free:false},{key:"grammar",label:"📐 Grammar",free:true},{key:"peeves",label:"⚠️ Pet Peeves",free:false},{key:"templates",label:"📝 Templates",free:false},{key:"essays",label:"🎓 Model Essays",free:false}];
  const LockedSection=()=>(
    <div style={{position:"relative"}}>
      <div style={{filter:"blur(3px)",pointerEvents:"none",userSelect:"none"}}>
        {[1,2,3].map(i=><div key={i} style={{background:'#fefdf8',border:`1px solid ${T.border}`,borderRadius:10,padding:'16px 20px',marginBottom:8}}><div style={{height:16,background:T.bgGray,borderRadius:4,marginBottom:8,width:'60%'}}/><div style={{height:12,background:T.bgGray,borderRadius:4,width:'90%'}}/></div>)}
      </div>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
        <div style={{fontSize:36}}>🔒</div>
        <div style={{textAlign:"center"}}>
          <div style={{color:T.text,fontWeight:700,fontSize:15,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>Pro Feature</div>
          <button onClick={onUpgrade} style={{background:T.gold,color:"white",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Upgrade to Pro — $25/mo</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <Card style={{marginBottom:16,background:"#fff5f5",border:"1px solid #ffcccc"}}>
        <p style={{color:T.red,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🎓 Your personal IELTS reference guide. {!isPro&&<span style={{color:T.textMid}}>Linking Words and Grammar are free. Upgrade for full access.</span>}</p>
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
      {section==="grammar"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.grammarRules.map((item,i)=><Card key={i} style={{border:`1px solid ${T.blueBorder}`,background:T.blueBg}}><div style={{fontSize:13,fontWeight:700,color:T.blue,marginBottom:6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📐 {item.rule}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{item.tip}</p></Card>)}</div>}
      {section==="peeves"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.petPeeves.map((item,i)=><Card key={i} style={{border:`1px solid ${T.redBorder}`,background:T.redBg}}><div style={{fontSize:13,fontWeight:700,color:T.red,marginBottom:6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ {item.peeve}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✅ {item.fix}</p></Card>)}</div>:<LockedSection/>)}
      {section==="templates"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.templates.map((item,i)=><Card key={i} style={{border:`1px solid ${T.amberBorder}`,background:T.amberBg}}><div style={{fontSize:11,fontWeight:700,color:T.amber,marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui",textTransform:"uppercase"}}>📝 {item.type}</div><p style={{color:T.text,fontSize:13,lineHeight:1.8,margin:0,fontFamily:"Georgia,serif",fontStyle:"italic",background:"white",padding:"10px 14px",borderRadius:8,whiteSpace:"pre-wrap",border:`1px solid ${T.amberBorder}`}}>{item.template}</p></Card>)}</div>:<LockedSection/>)}
      {section==="essays"&&(isPro?(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
            <p style={{color:T.green,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📖 Study these scored model essays to understand what examiners look for at each band level. Click any essay to expand the full response and examiner commentary.</p>
          </Card>
          {TOOLKIT.modelEssays.map((item,i)=>(
            <Card key={i} style={{border:`1px solid ${bandColor(item.band)}30`,cursor:"pointer",transition:"all 0.15s",boxShadow:expandedEssay===i?T.shadowMd:T.shadow}} onClick={()=>setExpandedEssay(expandedEssay===i?null:i)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{background:bandBg(item.band),color:bandColor(item.band),fontWeight:800,fontSize:16,borderRadius:6,padding:"3px 12px",border:`1px solid ${bandColor(item.band)}30`,fontFamily:"Georgia,serif"}}>{item.band}</span>
                    <span style={{fontSize:12,color:bandColor(item.band),fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{bandLabel(item.band)}</span>
                    <span style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:20,padding:"2px 10px",fontSize:11,color:T.primary,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>{item.taskType}</span>
                  </div>
                  <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.5,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{item.topic.length>120?item.topic.slice(0,120)+"...":item.topic}</p>
                </div>
                <span style={{fontSize:18,color:T.textMuted,transform:expandedEssay===i?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}>▼</span>
              </div>
              {expandedEssay===i&&(
                <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:16}} onClick={e=>e.stopPropagation()}>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>📋 Question</div>
                    <div style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:8,padding:"10px 14px"}}>
                      <p style={{color:T.text,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{item.topic}</p>
                    </div>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:11,color:T.green,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✍️ Model Response — Band {item.band}</span>
                      <span style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{countWords(item.essay)} words</span>
                    </div>
                    <div style={{background:"#fafff8",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"14px 16px"}}>
                      <p style={{color:T.text,fontSize:14,margin:0,lineHeight:1.9,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap"}}>{item.essay}</p>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:T.amber,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🎓 Examiner Commentary</div>
                    <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"10px 14px"}}>
                      <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.7,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{item.explanation}</p>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ):<LockedSection/>)}
    </div>
  );
};

// ── Practice Mode ─────────────────────────────
const PracticeMode=({isPro,onUpgrade,email})=>{
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
    if(!isPro&&getStoredUses(email)>=FREE_USES_LIMIT){ onUpgrade(); return; }
    setLoadingFeedback(true);
    try{
      const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:800,system:PRACTICE_SYSTEM,messages:[{role:"user",content:`Question: "${question}"\n\nEssay so far:\n${text}\n\nGive coaching feedback with spotted errors as JSON.`}]})});
      const data=await res.json();
      const raw=data.content?.map(b=>b.text||"").join("")||"";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      setLiveFeedback(parsed);
      if(!isPro){ const n=getStoredUses(email)+1; saveUses(n,email); }
    }catch(e){ console.error(e); }
    finally{ setLoadingFeedback(false); }
  },[question,isPro,onUpgrade,email]);

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
        <p style={{color:T.blue,fontSize:13,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🎯 <strong>Practice Mode</strong> — Write freely and get live coaching every ~1.5 seconds. Mistakes are highlighted inline in your essay. Each feedback uses one free try.</p>
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

// ── Grammar Checker (Free) ───────────────────
const GRAMMAR_SYSTEM = `You are a precise English language checker. Analyze the input (word, phrase, or sentence) for spelling, grammar, punctuation, and structural issues.

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "hasErrors": true/false,
  "corrected": "the corrected version (or original if no errors)",
  "issues": [
    {
      "type": "Spelling|Grammar|Punctuation|Structure|Word Choice",
      "original": "the problematic part",
      "correction": "the fixed version",
      "explanation": "brief clear explanation"
    }
  ],
  "noErrorReason": "if hasErrors is false, explain why the input is correct (e.g. 'Grammatically correct sentence with proper subject-verb agreement and punctuation.')"
}

Rules:
- For single words: check spelling only. If correct, say so and briefly define it.
- For phrases/sentences: check spelling, grammar, punctuation, verb tense, subject-verb agreement, articles, prepositions, sentence structure.
- The "corrected" field must always be the full corrected version of the input.
- Each "correction" must be a concrete replacement, never advice.
- Be thorough but concise in explanations.`;

const GRAMMAR_DAILY_LIMIT = 10;
const getGrammarUsesToday = () => { 
  try { 
    const data = JSON.parse(localStorage.getItem("ef_grammar_daily")||"{}");
    const today = new Date().toDateString();
    return data.date === today ? data.count : 0;
  } catch { return 0; }
};
const saveGrammarUse = () => {
  try {
    const today = new Date().toDateString();
    const data = JSON.parse(localStorage.getItem("ef_grammar_daily")||"{}");
    const count = data.date === today ? data.count + 1 : 1;
    localStorage.setItem("ef_grammar_daily", JSON.stringify({ date: today, count }));
  } catch {}
};

const GrammarChecker = ({isPro}) => {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dailyUses, setDailyUses] = useState(()=>getGrammarUsesToday());
  const dailyLeft = GRAMMAR_DAILY_LIMIT - dailyUses;

  const check = async () => {
    if (!input.trim()) { setError("Please enter a word or sentence to check."); return; }
    if (!isPro && dailyUses >= GRAMMAR_DAILY_LIMIT) { setError("Daily limit reached (10/day). Upgrade to Pro for unlimited grammar checks."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await fetch(API_URL, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 600,
          system: GRAMMAR_SYSTEM,
          messages: [{ role: "user", content: input.trim() }]
        })
      });
      const data = await res.json();
      const text = data.content?.map(b => b.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      setResult(parsed);
      if(!isPro){ saveGrammarUse(); setDailyUses(prev=>prev+1); }
    } catch (e) {
      console.error("Grammar check error:", e);
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div>
      <Card style={{ marginBottom: 20, background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
        <p style={{ color: T.green, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          ✏️ <strong>Grammar & Spell Checker</strong> — Enter any word, phrase, or sentence and get instant corrections with explanations. {isPro?"Unlimited checks with Pro.":(<><strong>{dailyLeft}</strong> of {GRAMMAR_DAILY_LIMIT} free checks remaining today.</>)}
        </p>
      </Card>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Input side */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
            Your Text
          </div>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder="Type a word, phrase, or full sentence here..."
            rows={6}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } }}
            style={{ width: "100%", background: T.bgGray, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 15, padding: "14px 16px", resize: "vertical", fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.7, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} />
          <button onClick={check} disabled={loading || !input.trim()}
            style={{ background: loading ? T.bgGray : T.primary, border: "none", borderRadius: 10, color: loading ? T.textMuted : "white", fontSize: 15, fontWeight: 700, padding: "14px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", boxShadow: loading ? "none" : T.shadowMd, transition: "all 0.2s" }}>
            {loading ? "⏳ Checking..." : "Check Grammar & Spelling →"}
          </button>
          {error && <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.red, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{error}</div>}
        </div>
        {/* Result side */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
            Result
          </div>
          {!result && !loading && (
            <Card style={{ textAlign: "center", padding: "40px 24px", background: T.bgGray, border: `1px dashed ${T.border}` }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✏️</div>
              <p style={{ color: T.textMuted, fontSize: 14, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.6 }}>
                Type something on the left and click "Check" — your corrected text will appear here.
              </p>
            </Card>
          )}
          {loading && (
            <Card style={{ textAlign: "center", padding: "40px 24px", background: T.blueBg, border: `1px solid ${T.blueBorder}` }}>
              <div style={{ color: T.blue, fontSize: 14, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Checking your text... ✏️</div>
            </Card>
          )}
          {result && !result.hasErrors && (
            <Card style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.green, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>No corrections needed!</span>
              </div>
              <div style={{ background: "white", borderRadius: 8, padding: "12px 16px", border: `1px solid ${T.greenBorder}`, marginBottom: 12 }}>
                <p style={{ color: T.text, fontSize: 15, margin: 0, lineHeight: 1.7, fontFamily: "Georgia,serif" }}>{result.corrected}</p>
              </div>
              <p style={{ color: T.green, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>💡 {result.noErrorReason}</p>
            </Card>
          )}
          {result && result.hasErrors && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
                <div style={{ fontSize: 11, color: T.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                  ✅ Corrected Version
                </div>
                <p style={{ color: T.text, fontSize: 15, margin: 0, lineHeight: 1.7, fontFamily: "Georgia,serif" }}>{result.corrected}</p>
              </Card>
              {result.issues?.map((issue, i) => (
                <Card key={i} style={{ borderLeft: `3px solid ${issue.type === "Spelling" ? T.red : issue.type === "Punctuation" ? T.purple : issue.type === "Structure" ? T.blue : T.amber}`, background: issue.type === "Spelling" ? T.redBg : issue.type === "Punctuation" ? T.purpleBg : issue.type === "Structure" ? T.blueBg : T.amberBg }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ background: "white", border: `1px solid ${T.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: issue.type === "Spelling" ? T.red : issue.type === "Punctuation" ? T.purple : issue.type === "Structure" ? T.blue : T.amber, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{issue.type}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ background: "#fee2e2", borderRadius: 6, padding: "4px 12px", color: "#991b1b", fontSize: 14, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>"{issue.original}"</span>
                    <span style={{ color: T.textMuted, fontSize: 16 }}>→</span>
                    <span style={{ background: "#dcfce7", borderRadius: 6, padding: "4px 12px", color: "#166534", fontSize: 14, fontWeight: 600, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>"{issue.correction}"</span>
                  </div>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>💡 {issue.explanation}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <Card style={{ marginTop: 20, background: T.primaryLight, border: `1px solid ${T.primaryBorder}` }}>
        <p style={{ color: T.primary, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          🎓 Want a full essay scored with band levels, vocabulary upgrades, and a model response? Try our <strong>Essay Analyzer</strong> — 1 free analysis, no sign-up needed.
        </p>
      </Card>
      <Card style={{ marginTop: 16, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
        <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          🏋️ Looking to practise grammar, paraphrasing, linking words, and more? Head over to the <strong>Exercises</strong> tab — 100+ questions with a 30-minute free session timer.
        </p>
      </Card>
    </div>
  );
};

// ── Grammar Exercises ────────────────────────
const GRAMMAR_EXERCISES = [
  {
    category: "Subject-Verb Agreement",
    icon: "🔗",
    color: "#DC2626",
    exercises: [
      { sentence: "The group of students ___ working on their project.", options: ["is","are"], correct: 0, explanation: "'Group' is a collective noun treated as singular. 'The group IS working.'" },
      { sentence: "Neither the teacher nor the students ___ ready.", options: ["was","were"], correct: 1, explanation: "With 'neither...nor', the verb agrees with the nearest subject. 'Students' is plural, so 'WERE ready.'" },
      { sentence: "The news about the earthquakes ___ shocking.", options: ["was","were"], correct: 0, explanation: "'News' is an uncountable noun, always singular. 'The news WAS shocking.'" },
      { sentence: "Every student and teacher ___ expected to attend.", options: ["is","are"], correct: 0, explanation: "'Every' makes compound subjects singular. 'Every student and teacher IS expected.'" },
      { sentence: "The number of applicants ___ increased significantly.", options: ["has","have"], correct: 0, explanation: "'The number of' is singular. 'The number HAS increased.' (But 'A number of applicants HAVE applied' — this is plural.)" },
      { sentence: "Mathematics ___ my favourite subject at university.", options: ["is","are"], correct: 0, explanation: "Academic subjects ending in 's' (mathematics, economics, physics, politics) are singular." },
      { sentence: "A number of students ___ failed the examination.", options: ["has","have"], correct: 1, explanation: "'A number of' = many, so it takes plural. 'A number of students HAVE failed.' Contrast: 'The number of students HAS increased.'" },
      { sentence: "The committee ___ unable to reach a decision.", options: ["was","were"], correct: 0, explanation: "'Committee' acting as one unit = singular. 'The committee WAS unable to reach a decision.'" },
      { sentence: "Each of the candidates ___ qualified for the position.", options: ["is","are"], correct: 0, explanation: "'Each of' always takes singular. 'Each of the candidates IS qualified.'" },
      { sentence: "The police ___ investigating the incident.", options: ["is","are"], correct: 1, explanation: "'Police' is always plural in English. 'The police ARE investigating.' (Not 'the police is.')" }
    ]
  },
  {
    category: "Articles (a / an / the / zero)",
    icon: "📝",
    color: "#EA580C",
    exercises: [
      { sentence: "___ education is important for all children.", options: ["The","An","(no article)"], correct: 2, explanation: "General concepts use zero article. 'Education' here means education in general." },
      { sentence: "She is ___ best student in the class.", options: ["a","the","(no article)"], correct: 1, explanation: "Superlatives always take 'the'. 'THE best student.'" },
      { sentence: "He wants to become ___ engineer.", options: ["a","an","the"], correct: 1, explanation: "'Engineer' starts with a vowel sound, so use 'AN engineer.'" },
      { sentence: "___ United Kingdom is an island nation.", options: ["A","The","(no article)"], correct: 1, explanation: "Countries with 'Kingdom', 'States', 'Republic' take 'the'." },
      { sentence: "I had ___ breakfast at 8 AM this morning.", options: ["a","the","(no article)"], correct: 2, explanation: "Meals typically take zero article. 'I had breakfast.'" },
      { sentence: "___ unemployment rate has risen by 3%.", options: ["A","The","(no article)"], correct: 1, explanation: "Specific known quantities take 'the'. 'THE unemployment rate.'" },
      { sentence: "She plays ___ piano beautifully.", options: ["a","the","(no article)"], correct: 1, explanation: "Musical instruments take 'the'. 'She plays THE piano.' (But sports don't: 'She plays tennis.')" },
      { sentence: "___ honesty is the best policy.", options: ["An","The","(no article)"], correct: 2, explanation: "Abstract qualities used generally take zero article. 'Honesty is the best policy.'" },
      { sentence: "I saw ___ interesting documentary last night.", options: ["a","an","the"], correct: 1, explanation: "'Interesting' starts with a vowel sound, so 'AN interesting documentary.' First mention = a/an." },
      { sentence: "Could you pass me ___ salt, please?", options: ["a","the","(no article)"], correct: 1, explanation: "Both speaker and listener know which salt. 'Pass me THE salt.' (The specific salt on the table.)" }
    ]
  },
  {
    category: "Verb Tenses",
    icon: "⏰",
    color: "#CA8A04",
    exercises: [
      { sentence: "By next year, she ___ her degree.", options: ["will complete","will have completed","completes"], correct: 1, explanation: "'By next year' signals future perfect. 'She WILL HAVE COMPLETED her degree by then.'" },
      { sentence: "The population ___ steadily since 2010.", options: ["grew","has grown","grows"], correct: 1, explanation: "'Since 2010' to now = present perfect. 'The population HAS GROWN steadily since 2010.'" },
      { sentence: "While I ___ for the exam, the power went out.", options: ["studied","was studying","have studied"], correct: 1, explanation: "A longer action interrupted by a shorter one = past continuous + past simple." },
      { sentence: "If the government ___ more in education, literacy rates would improve.", options: ["invests","invested","had invested"], correct: 1, explanation: "Second conditional (hypothetical): 'If + past simple, would + infinitive.'" },
      { sentence: "The report ___ that crime rates fell in 2023.", options: ["states","is stating","has stated"], correct: 0, explanation: "Reporting what a document says uses present simple. 'The report STATES that...'" },
      { sentence: "Before the law was introduced, people ___ about the issue for years.", options: ["complained","had been complaining","were complaining"], correct: 1, explanation: "Action continuing up to a past point = past perfect continuous." },
      { sentence: "I ___ three essays so far this week.", options: ["wrote","have written","am writing"], correct: 1, explanation: "'So far this week' = unfinished time period = present perfect. 'I HAVE WRITTEN three essays.'" },
      { sentence: "Look! The graph ___ a dramatic increase.", options: ["shows","is showing","has shown"], correct: 0, explanation: "Describing what a graph displays = present simple. 'The graph SHOWS a dramatic increase.'" },
      { sentence: "The company ___ 500 employees before it went bankrupt.", options: ["employs","employed","had employed"], correct: 2, explanation: "An action before another past action = past perfect. 'HAD EMPLOYED 500 before it went bankrupt.'" },
      { sentence: "This time next year, I ___ at a British university.", options: ["study","will study","will be studying"], correct: 2, explanation: "An ongoing action at a specific future time = future continuous. 'I WILL BE STUDYING this time next year.'" }
    ]
  },
  {
    category: "Prepositions",
    icon: "📍",
    color: "#15803D",
    exercises: [
      { sentence: "The success of the project depends ___ teamwork.", options: ["in","on","from"], correct: 1, explanation: "'Depend ON' is a fixed collocation." },
      { sentence: "Many students are interested ___ studying abroad.", options: ["in","to","for"], correct: 0, explanation: "'Interested IN' is correct. 'Interested to' is wrong." },
      { sentence: "The increase ___ crime is a cause for concern.", options: ["of","in","on"], correct: 1, explanation: "'Increase IN something' — always 'in.'" },
      { sentence: "This essay will focus ___ the advantages of technology.", options: ["in","at","on"], correct: 2, explanation: "'Focus ON' is the correct collocation." },
      { sentence: "She succeeded ___ passing the IELTS exam.", options: ["in","to","at"], correct: 0, explanation: "'Succeed IN doing something.' Not 'succeed to do.'" },
      { sentence: "The graph shows a sharp rise ___ 2015 and 2020.", options: ["from","between","during"], correct: 1, explanation: "'Between X and Y' for two specific points." },
      { sentence: "He is responsible ___ managing the team.", options: ["of","for","to"], correct: 1, explanation: "'Responsible FOR' is the correct collocation. Not 'responsible of.'" },
      { sentence: "The results are similar ___ those found in previous studies.", options: ["with","to","as"], correct: 1, explanation: "'Similar TO' — always 'to'. Not 'similar with' or 'similar as.'" },
      { sentence: "She insisted ___ finishing the project herself.", options: ["on","in","to"], correct: 0, explanation: "'Insist ON doing something' is the correct form." },
      { sentence: "The new law will have a significant impact ___ society.", options: ["to","on","for"], correct: 1, explanation: "'Impact ON' or 'effect ON' — always 'on'. Not 'impact to.'" }
    ]
  },
  {
    category: "Passive Voice",
    icon: "🔄",
    color: "#0E7490",
    exercises: [
      { sentence: "The new policy ___ by the government last year.", options: ["introduced","was introduced","has introduced"], correct: 1, explanation: "The policy received the action — passive. 'WAS INTRODUCED by the government.'" },
      { sentence: "It ___ that over 50% of students prefer online learning.", options: ["believes","is believed","has believed"], correct: 1, explanation: "Impersonal passive: 'IT IS BELIEVED that...' Also: it is argued, it is widely known." },
      { sentence: "More schools ___ in rural areas if funding increases.", options: ["will build","will be built","are building"], correct: 1, explanation: "Schools don't build themselves. 'More schools WILL BE BUILT.'" },
      { sentence: "The results ___ to the public next week.", options: ["will announce","will be announced","are announcing"], correct: 1, explanation: "Results are announced by someone — passive. 'WILL BE ANNOUNCED.'" },
      { sentence: "English ___ in over 60 countries worldwide.", options: ["speaks","is spoken","has spoken"], correct: 1, explanation: "English is spoken (by people) — passive. 'English IS SPOKEN in over 60 countries.'" },
      { sentence: "The report ___ by the time the meeting started.", options: ["had completed","had been completed","was completing"], correct: 1, explanation: "Past perfect passive for an action completed before another past event. 'HAD BEEN COMPLETED.'" },
      { sentence: "Smoking ___ in all public buildings since 2010.", options: ["has banned","has been banned","was banning"], correct: 1, explanation: "'Since 2010' = present perfect. Passive: 'Smoking HAS BEEN BANNED.'" },
      { sentence: "The problem needs ___.", options: ["to address","to be addressed","addressing"], correct: 1, explanation: "'Needs TO BE + past participle' is the formal passive form. 'Needs to be addressed.' ('Needs addressing' is also correct but less formal.)" }
    ]
  },
  {
    category: "Conditionals",
    icon: "🔀",
    color: "#1D4ED8",
    exercises: [
      { sentence: "If I ___ the prime minister, I would reform education.", options: ["am","was","were"], correct: 2, explanation: "Second conditional uses 'were' for all subjects (subjunctive mood). 'If I WERE...'" },
      { sentence: "If the government had invested more, the economy ___.", options: ["would improve","would have improved","will improve"], correct: 1, explanation: "Third conditional (past unreal): 'would have + past participle.'" },
      { sentence: "Unless action ___ soon, the problem will get worse.", options: ["is taken","will be taken","takes"], correct: 0, explanation: "'Unless' = 'if not'. Use present simple after unless, not 'will'." },
      { sentence: "Provided that students ___ hard, they will pass.", options: ["study","will study","studied"], correct: 0, explanation: "After 'provided that', 'as long as' — use present simple for future meaning." },
      { sentence: "If water ___ 100°C, it boils.", options: ["reaches","reached","will reach"], correct: 0, explanation: "Zero conditional (scientific facts): 'If + present simple, present simple.'" },
      { sentence: "Had I known about the deadline, I ___ submitted earlier.", options: ["will have","would have","had"], correct: 1, explanation: "Inverted third conditional: 'Had I known' = 'If I had known'. '...I WOULD HAVE submitted.'" },
      { sentence: "If she ___ harder, she would not have failed.", options: ["studies","studied","had studied"], correct: 2, explanation: "Third conditional: 'If + past perfect, would have + past participle.' 'If she HAD STUDIED harder...'" },
      { sentence: "Should you ___ any questions, please contact us.", options: ["have","had","having"], correct: 0, explanation: "Formal inverted conditional: 'Should you HAVE...' = 'If you have...' Very formal/academic." }
    ]
  },
  {
    category: "Relative Clauses",
    icon: "🔗",
    color: "#7E22CE",
    exercises: [
      { sentence: "Students ___ study abroad gain valuable experience.", options: ["who","which","whom"], correct: 0, explanation: "'WHO' for people. 'Which' is for things." },
      { sentence: "The university, ___ was founded in 1850, has an excellent reputation.", options: ["that","which","who"], correct: 1, explanation: "Non-defining clauses (with commas) use 'WHICH' not 'that'." },
      { sentence: "The country ___ I grew up has changed dramatically.", options: ["where","which","that"], correct: 0, explanation: "'WHERE' for places. 'The country WHERE I grew up.'" },
      { sentence: "The teacher ___ class I attended was very inspiring.", options: ["who","whose","whom"], correct: 1, explanation: "'WHOSE' shows possession. 'The teacher WHOSE class...'" },
      { sentence: "The reason ___ many students fail is lack of practice.", options: ["which","why","that"], correct: 1, explanation: "'The reason WHY' or 'the reason that' — 'why' is more natural." },
      { sentence: "The year ___ she graduated was 2020.", options: ["which","when","where"], correct: 1, explanation: "'WHEN' for times. 'The year WHEN she graduated.'" },
      { sentence: "The man to ___ I spoke was the manager.", options: ["who","whom","which"], correct: 1, explanation: "After a preposition, use 'WHOM' not 'who'. 'To WHOM I spoke.'" },
      { sentence: "This is the book ___ changed my perspective.", options: ["who","which","whose"], correct: 1, explanation: "'WHICH' or 'that' for things. 'The book WHICH changed my perspective.'" }
    ]
  },
  {
    category: "Commonly Confused Words",
    icon: "🔤",
    color: "#BE185D",
    exercises: [
      { sentence: "The new policy had a significant ___ on the economy.", options: ["affect","effect"], correct: 1, explanation: "'Effect' = noun (the result). 'Affect' = verb (to influence)." },
      { sentence: "The students handed in ___ assignments on time.", options: ["their","there","they're"], correct: 0, explanation: "'THEIR' = possessive. 'There' = place. 'They're' = they are." },
      { sentence: "The ___ of the school gave a welcoming speech.", options: ["principle","principal"], correct: 1, explanation: "'PRINCIPAL' = head of school. 'Principle' = rule or belief." },
      { sentence: "She could not decide ___ to study medicine or law.", options: ["weather","whether"], correct: 1, explanation: "'WHETHER' = alternatives. 'Weather' = climate." },
      { sentence: "The government needs to ___ equal access to healthcare.", options: ["assure","ensure","insure"], correct: 1, explanation: "'ENSURE' = make certain. 'Assure' = tell confidently. 'Insure' = financial insurance." },
      { sentence: "The economy is ___ than it was five years ago.", options: ["worse","worst"], correct: 0, explanation: "'WORSE' = comparative (two things). 'Worst' = superlative (the most bad of all)." },
      { sentence: "The teacher gave us some useful ___.", options: ["advice","advise"], correct: 0, explanation: "'ADVICE' = noun (what you receive). 'Advise' = verb (to give advice)." },
      { sentence: "His argument was not very ___.", options: ["convincing","convicting"], correct: 0, explanation: "'CONVINCING' = persuasive. 'Convicting' = finding guilty of a crime." },
      { sentence: "The two proposals are quite different. The ___ is more practical.", options: ["later","latter"], correct: 1, explanation: "'LATTER' = the second of two things mentioned. 'Later' = at a future time." },
      { sentence: "The charity event managed to ___ over $50,000.", options: ["raise","rise"], correct: 0, explanation: "'RAISE' = transitive (raise something). 'Rise' = intransitive (it rises on its own). 'Managed to RAISE $50,000.'" }
    ]
  },
  {
    category: "Sentence Structure",
    icon: "🏗️",
    color: "#059669",
    exercises: [
      { sentence: "Which is correct?", options: ["Although the economy improved, but unemployment remained high.","Although the economy improved, unemployment remained high."], correct: 1, explanation: "Never combine 'Although' with 'but'. Use one or the other." },
      { sentence: "Which is correct?", options: ["Not only does exercise improve health, but it also boosts mood.","Not only exercise improves health, but it also boosts mood."], correct: 0, explanation: "'Not only' triggers inversion: 'Not only DOES exercise improve...'" },
      { sentence: "Which is correct?", options: ["The reason is because many people lack education.","The reason is that many people lack education."], correct: 1, explanation: "'The reason is THAT...' not 'the reason is because.' 'Because' after 'reason' is redundant." },
      { sentence: "Which is correct?", options: ["Despite of the bad weather, the event was successful.","Despite the bad weather, the event was successful."], correct: 1, explanation: "'Despite' never takes 'of'. Use 'despite + noun' or 'in spite of + noun.'" },
      { sentence: "Which is correct?", options: ["I look forward to hear from you.","I look forward to hearing from you."], correct: 1, explanation: "'Look forward to' is followed by a gerund (-ing). 'To' here is a preposition, not part of an infinitive." },
      { sentence: "Which is correct?", options: ["He suggested to go to the library.","He suggested going to the library."], correct: 1, explanation: "'Suggest' is followed by gerund, not infinitive. 'Suggested GOING.' Not 'suggested to go.'" },
      { sentence: "Which is correct?", options: ["There is a increasing demand for technology.","There is an increasing demand for technology."], correct: 1, explanation: "'Increasing' starts with a vowel sound. Use 'AN increasing demand.'" },
      { sentence: "Which is correct?", options: ["The more you practice, the better you become.","The more you practice, the more better you become."], correct: 0, explanation: "'The more...the better' — never double comparatives. 'More better' is always wrong." }
    ]
  },
  {
    category: "Formal vs Informal",
    icon: "🎩",
    color: "#92400E",
    exercises: [
      { sentence: "Choose the more academic version:", options: ["A lot of people think that...","A significant proportion of individuals contend that..."], correct: 1, explanation: "Avoid 'a lot of' and 'think'. Use formal alternatives." },
      { sentence: "Choose the more academic version:", options: ["The thing is, crime rates went up.","It is worth noting that crime rates experienced a marked increase."], correct: 1, explanation: "Avoid 'the thing is' and 'went up'. Use formal register." },
      { sentence: "Choose the more academic version:", options: ["Kids nowadays don't read enough books.","Young people in contemporary society tend to engage less with literature."], correct: 1, explanation: "Avoid 'kids', 'nowadays', 'don't'. Use formal equivalents." },
      { sentence: "Choose the more academic version:", options: ["This shows that the idea is kind of wrong.","This suggests that the premise is fundamentally flawed."], correct: 1, explanation: "Avoid 'shows', 'kind of', 'wrong'. Use academic precision." },
      { sentence: "Choose the more academic version:", options: ["We need to do something about pollution.","Urgent measures must be implemented to address environmental contamination."], correct: 1, explanation: "Avoid 'do something about'. Use specific verbs: 'implement measures', 'address contamination.'" },
      { sentence: "Choose the more academic version:", options: ["There are good and bad things about social media.","Social media presents both significant advantages and notable drawbacks."], correct: 1, explanation: "Avoid 'good and bad things'. Use 'advantages and drawbacks' for academic tone." }
    ]
  },
  {
    category: "Punctuation",
    icon: "✍️",
    color: "#6D28D9",
    exercises: [
      { sentence: "Which is correctly punctuated?", options: ["In conclusion the government should act now.","In conclusion, the government should act now."], correct: 1, explanation: "Introductory phrases (In conclusion, However, Furthermore) MUST be followed by a comma." },
      { sentence: "Which is correctly punctuated?", options: ["The students who passed the exam were happy.","The students, who passed the exam, were happy."], correct: 0, explanation: "No commas = defining clause (only those who passed). Commas = non-defining (all students passed). Both are valid but mean different things. Option A is more likely in context." },
      { sentence: "Which is correctly punctuated?", options: ["It's important to know its meaning.","Its important to know it's meaning."], correct: 0, explanation: "'IT'S' = it is. 'ITS' = possessive. 'It's important to know its meaning.' is correct." },
      { sentence: "Which is correctly punctuated?", options: ["The country's economy is growing; however, inequality remains.","The country's economy is growing, however, inequality remains."], correct: 0, explanation: "Use semicolon before 'however' when connecting two independent clauses, not a comma (which creates a comma splice)." },
      { sentence: "Which is correctly punctuated?", options: ["Students need: books, pens, and a laptop.","Students need books, pens, and a laptop."], correct: 1, explanation: "Don't use a colon after a verb that directly introduces a list. 'Students need: ...' is wrong. Just 'Students need books, pens, and a laptop.'" },
      { sentence: "Which is correctly punctuated?", options: ["The children's toys were scattered everywhere.","The childrens' toys were scattered everywhere."], correct: 0, explanation: "'Children' is already plural (irregular). Add 's after: 'children's'. Not 'childrens' (not a word).'" },
      { sentence: "Which is correctly punctuated?", options: ["My brother who lives in London is a doctor.","My brother, who lives in London, is a doctor."], correct: 1, explanation: "If you only have one brother, this is extra info = non-defining clause with commas. 'My brother, who lives in London, is a doctor.'" },
      { sentence: "Which is correctly punctuated?", options: ["She asked whether I could help?","She asked whether I could help."], correct: 1, explanation: "Indirect questions end with a period, not a question mark. 'She asked whether I could help.' (Direct: 'Can you help?')" }
    ]
  },
  {
    category: "Gerunds vs Infinitives",
    icon: "🔧",
    color: "#0369A1",
    exercises: [
      { sentence: "She enjoys ___ classical music.", options: ["to listen to","listening to"], correct: 1, explanation: "'Enjoy' is always followed by gerund (-ing). 'Enjoys LISTENING to.'" },
      { sentence: "The government decided ___ new regulations.", options: ["implementing","to implement"], correct: 1, explanation: "'Decide' takes infinitive (to + verb). 'Decided TO IMPLEMENT.'" },
      { sentence: "He avoided ___ the difficult question.", options: ["to answer","answering"], correct: 1, explanation: "'Avoid' takes gerund. 'Avoided ANSWERING.' Other gerund verbs: enjoy, consider, deny, risk." },
      { sentence: "I would like ___ my English skills.", options: ["improving","to improve"], correct: 1, explanation: "'Would like' takes infinitive. 'Would like TO IMPROVE.' (But 'like improving' is also correct for habits.)" },
      { sentence: "She stopped ___ when the teacher entered.", options: ["to talk","talking"], correct: 1, explanation: "'Stop talking' = cease talking. 'Stop to talk' = pause in order to talk. Context: she stopped the action of talking." },
      { sentence: "They suggested ___ the meeting until next week.", options: ["to postpone","postponing"], correct: 1, explanation: "'Suggest' takes gerund. 'Suggested POSTPONING.' Never 'suggested to postpone.'" },
      { sentence: "He tends ___ late for appointments.", options: ["being","to be"], correct: 1, explanation: "'Tend' takes infinitive. 'Tends TO BE late.'" },
      { sentence: "I don't mind ___ overtime if it's necessary.", options: ["to work","working"], correct: 1, explanation: "'Don't mind' takes gerund. 'Don't mind WORKING.' (Mind = object to.)" }
    ]
  },
  {
    category: "Countable vs Uncountable",
    icon: "🔢",
    color: "#B45309",
    exercises: [
      { sentence: "She gave me some useful ___.", options: ["advices","advice"], correct: 1, explanation: "'Advice' is uncountable — never 'advices'. Say 'some advice' or 'pieces of advice.'" },
      { sentence: "The company bought new ___ for the office.", options: ["equipments","equipment"], correct: 1, explanation: "'Equipment' is uncountable. Never 'equipments'. Say 'pieces of equipment' if counting." },
      { sentence: "There ___ not enough information to make a decision.", options: ["is","are"], correct: 0, explanation: "'Information' is uncountable = singular verb. 'There IS not enough information.'" },
      { sentence: "We need to do more ___.", options: ["researches","research"], correct: 1, explanation: "'Research' is uncountable. Never 'researches' (as a noun). Say 'research studies' or 'pieces of research.'" },
      { sentence: "How ___ homework do you have tonight?", options: ["many","much"], correct: 1, explanation: "'Homework' is uncountable = 'how MUCH'. Use 'how many' only with countable nouns." },
      { sentence: "The ___ show that the policy was effective.", options: ["evidence show","evidence shows"], correct: 1, explanation: "'Evidence' is uncountable = singular verb. 'The evidence SHOWS.' Never 'evidences.'" },
      { sentence: "She made good ___ in her English this year.", options: ["progress","progresses"], correct: 0, explanation: "'Progress' is uncountable. Never 'progresses' (as a noun). 'She made good PROGRESS.'" },
      { sentence: "The hotel provides excellent ___.", options: ["accommodations","accommodation"], correct: 1, explanation: "'Accommodation' is uncountable in British English. 'Excellent ACCOMMODATION.' (US English sometimes uses plural.)" }
    ]
  },
  {
    category: "Which Sentence is Correct?",
    icon: "✅",
    color: "#DC2626",
    exercises: [
      { sentence: "Choose the correct sentence:", options: ["He gave me an advice about my career.","He gave me some advice about my career.","He gave me advices about my career."], correct: 1, explanation: "'Advice' is uncountable. Use 'some advice' — never 'an advice' or 'advices.'" },
      { sentence: "Choose the correct sentence:", options: ["The informations were very useful.","The information was very useful.","The information were very useful."], correct: 1, explanation: "'Information' is uncountable and singular. 'The information WAS very useful.'" },
      { sentence: "Choose the correct sentence:", options: ["She is more smarter than her brother.","She is more smart than her brother.","She is smarter than her brother."], correct: 2, explanation: "One-syllable adjectives add -er. 'SMARTER' — never 'more smarter' (double comparative) or 'more smart.'" },
      { sentence: "Choose the correct sentence:", options: ["I have been living here since five years.","I have been living here for five years.","I am living here for five years."], correct: 1, explanation: "'For' + duration (five years). 'Since' + point in time (since 2020). Present perfect continuous for ongoing action." },
      { sentence: "Choose the correct sentence:", options: ["According to me, education is important.","In my opinion, education is important.","As per my opinion, education is important."], correct: 1, explanation: "'In my opinion' is correct. 'According to me' and 'as per my opinion' are non-standard English." },
      { sentence: "Choose the correct sentence:", options: ["He is agree with the proposal.","He is agreed with the proposal.","He agrees with the proposal."], correct: 2, explanation: "'Agree' is a normal verb, not used with 'is'. 'He AGREES with the proposal.' Not 'he is agree.'" },
      { sentence: "Choose the correct sentence:", options: ["One of the most important thing is education.","One of the most important things is education.","One of the most important things are education."], correct: 1, explanation: "'One of the most important THINGS' (plural after 'one of'). But verb agrees with 'one' = singular 'IS.'" },
      { sentence: "Choose the correct sentence:", options: ["She suggested that he studies harder.","She suggested that he study harder.","She suggested that he will study harder."], correct: 1, explanation: "Subjunctive after 'suggest': bare infinitive. 'Suggested that he STUDY.' (Not 'studies' or 'will study.')" },
      { sentence: "Choose the correct sentence:", options: ["I am interesting in learning languages.","I am interested in learning languages.","I am interested to learn languages."], correct: 1, explanation: "'INTERESTED IN + gerund.' 'Interesting' describes the thing, not the person. 'Interested to learn' is non-standard." },
      { sentence: "Choose the correct sentence:", options: ["The number of road accidents have decreased.","The number of road accidents has decreased.","A number of road accidents has decreased."], correct: 1, explanation: "'THE number of' = singular = 'HAS decreased.' ('A number of accidents HAVE occurred' = plural.)" }
    ]
  }
];

const EXERCISE_TIMER_KEY = "ef_exercise_timer";
const EXERCISE_TIMER_LIMIT = 1800; // 30 minutes in seconds

const getExerciseTimer = () => {
  try {
    const data = JSON.parse(localStorage.getItem(EXERCISE_TIMER_KEY)||"null");
    if(!data) return EXERCISE_TIMER_LIMIT;
    return Math.max(0, data.remaining || 0);
  } catch { return EXERCISE_TIMER_LIMIT; }
};
const saveExerciseTimer = (remaining) => {
  try { localStorage.setItem(EXERCISE_TIMER_KEY, JSON.stringify({ remaining })); } catch {}
};

const GrammarExercises = ({isPro, onUpgrade}) => {
  const [openCat, setOpenCat] = useState(null);
  const [answers, setAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState({});
  const [timeLeft, setTimeLeft] = useState(()=> isPro ? Infinity : getExerciseTimer());
  const [paused, setPaused] = useState(true);
  const timerRef = useRef(null);

  const startTimer = useCallback(() => {
    if(isPro) return;
    setPaused(false);
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        if(next <= 0) { clearInterval(timerRef.current); setPaused(true); saveExerciseTimer(0); return 0; }
        saveExerciseTimer(next);
        return next;
      });
    }, 1000);
  }, [isPro]);

  const pauseTimer = useCallback(() => {
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPaused(true);
    if(!isPro) saveExerciseTimer(timeLeft);
  }, [isPro, timeLeft]);

  useEffect(() => { return () => { if(timerRef.current) clearInterval(timerRef.current); }; }, []);

  const formatTime = (s) => {
    if(s === Infinity) return "∞";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const canAnswer = isPro || (!paused && timeLeft > 0);
  const timeExpired = !isPro && timeLeft <= 0;

  const handleAnswer = (catIdx, exIdx, optIdx) => {
    if(!canAnswer) return;
    const key = `${catIdx}-${exIdx}`;
    if (answers[key] !== undefined) return;
    setAnswers(prev => ({ ...prev, [key]: optIdx }));
    setShowExplanation(prev => ({ ...prev, [key]: true }));
  };

  const getCatScore = (catIdx) => {
    const cat = GRAMMAR_EXERCISES[catIdx];
    let correct = 0, attempted = 0;
    cat.exercises.forEach((_, exIdx) => {
      const key = `${catIdx}-${exIdx}`;
      if (answers[key] !== undefined) {
        attempted++;
        if (answers[key] === cat.exercises[exIdx].correct) correct++;
      }
    });
    return { correct, attempted, total: cat.exercises.length };
  };

  const totalQ = GRAMMAR_EXERCISES.reduce((sum,c)=>sum+c.exercises.length,0);
  const totalAnswered = Object.keys(answers).length;
  const totalCorrect = Object.entries(answers).filter(([key,val])=>{const [ci,ei]=key.split("-").map(Number);return val===GRAMMAR_EXERCISES[ci].exercises[ei].correct;}).length;

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🏋️</div>
        <h3 style={{ fontFamily: "Georgia,serif", color: T.text, fontSize: 22, margin: "0 0 8px", fontWeight: 700 }}>Grammar Exercises</h3>
        <p style={{ color: T.textMid, fontSize: 14, fontFamily: "'Source Sans Pro','Inter',system-ui", margin: "0 0 16px", lineHeight: 1.6, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          Practice sentence structures, verb forms, articles, prepositions, and more. Tap a category to start — each exercise gives instant feedback with detailed explanations.
        </p>
      </div>

      {/* Sticky Timer bar */}
      {!isPro && (
        <div style={{ position: "sticky", top: 64, zIndex: 100, marginBottom: 16 }}>
          <div style={{ background: timeExpired ? T.redBg : paused ? T.amberBg : T.greenBg, border: `1px solid ${timeExpired ? T.redBorder : paused ? T.amberBorder : T.greenBorder}`, borderRadius: 10, padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: timeLeft < 300 ? T.red : paused ? T.amber : T.green, fontFamily: "'Source Sans Pro','Inter',system-ui", minWidth: 52 }}>
                  {formatTime(timeLeft)}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: timeExpired ? T.red : paused ? T.amber : T.green, fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.3 }}>
                    {timeExpired ? "Time's up — upgrade to continue practising" : paused ? "⏸ Timer paused — press Play to begin" : "▶ Timer running — exercises unlocked"}
                  </div>
                  {!timeExpired && (
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui", marginTop: 1 }}>
                      Free plan: 30 minutes of practice time · Pause anytime and pick up where you left off · Go Pro for unlimited access
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {!timeExpired && (
                  <button onClick={paused ? startTimer : pauseTimer}
                    style={{ background: paused ? T.green : T.amber, color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                    {paused ? "▶ Play" : "⏸ Pause"}
                  </button>
                )}
                {timeExpired && (
                  <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                    🔓 Upgrade to Pro
                  </button>
                )}
              </div>
            </div>
            {!timeExpired && (
              <div style={{ marginTop: 8, background: "rgba(0,0,0,0.08)", borderRadius: 4, height: 4 }}>
                <div style={{ width: `${(timeLeft / EXERCISE_TIMER_LIMIT) * 100}%`, background: timeLeft < 300 ? T.red : paused ? T.amber : T.green, borderRadius: 4, height: 4, transition: "width 1s linear" }}/>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Overall score */}
      {totalAnswered > 0 && (
        <Card style={{ marginBottom: 16, textAlign: "center" }}>
          <span style={{ fontSize: 13, color: T.textMid, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
            Overall: <strong style={{ color: T.text, fontSize: 16 }}>{totalCorrect}</strong> correct out of <strong>{totalAnswered}</strong> answered ({totalQ} total)
            {totalAnswered > 0 && <span style={{ color: totalCorrect/totalAnswered >= 0.8 ? T.green : totalCorrect/totalAnswered >= 0.6 ? T.amber : T.red, marginLeft: 8, fontWeight: 700 }}>({Math.round(totalCorrect/totalAnswered*100)}%)</span>}
          </span>
        </Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, opacity: timeExpired && !isPro ? 0.5 : 1, pointerEvents: timeExpired && !isPro ? "none" : "auto" }}>
        {GRAMMAR_EXERCISES.map((cat, catIdx) => {
          const score = getCatScore(catIdx);
          const isOpen = openCat === catIdx;
          return (
            <div key={catIdx}>
              <div onClick={() => setOpenCat(isOpen ? null : catIdx)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: isOpen ? `${cat.color}10` : T.bg, border: `1px solid ${isOpen ? cat.color + "40" : T.border}`, borderRadius: isOpen ? "10px 10px 0 0" : 10, cursor: "pointer", transition: "all 0.15s" }}>
                <span style={{ fontSize: 20 }}>{cat.icon}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: isOpen ? cat.color : T.text, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{cat.category}</span>
                {score.attempted > 0 && (
                  <span style={{ background: score.correct === score.attempted ? T.greenBg : T.amberBg, border: `1px solid ${score.correct === score.attempted ? T.greenBorder : T.amberBorder}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: score.correct === score.attempted ? T.green : T.amber, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                    {score.correct}/{score.attempted}
                  </span>
                )}
                <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{cat.exercises.length}q</span>
                <span style={{ fontSize: 16, color: T.textMuted, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>
              {isOpen && (
                <div style={{ border: `1px solid ${cat.color}40`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16, background: `${cat.color}05` }}>
                  {!canAnswer && !isPro && !timeExpired && (
                    <Card style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, textAlign: "center" }}>
                      <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>⏸ Timer is paused. Click <strong>Play</strong> above to start answering.</p>
                    </Card>
                  )}
                  {cat.exercises.map((ex, exIdx) => {
                    const key = `${catIdx}-${exIdx}`;
                    const answered = answers[key] !== undefined;
                    const isCorrect = answered && answers[key] === ex.correct;
                    return (
                      <div key={exIdx} style={{ background: T.bg, border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Q{exIdx + 1}</span>
                          {answered && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                              {isCorrect ? "✓ Correct" : "✗ Incorrect"}
                            </span>
                          )}
                        </div>
                        <p style={{ color: T.text, fontSize: 14, margin: "0 0 12px", lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{ex.sentence}</p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {ex.options.map((opt, optIdx) => {
                            let bg = T.bgGray, border = T.border, color = T.text;
                            if (answered) {
                              if (optIdx === ex.correct) { bg = T.greenBg; border = T.greenBorder; color = T.green; }
                              else if (optIdx === answers[key] && !isCorrect) { bg = T.redBg; border = T.redBorder; color = T.red; }
                              else { bg = T.bgGray; color = T.textMuted; }
                            }
                            return (
                              <button key={optIdx} onClick={() => handleAnswer(catIdx, exIdx, optIdx)}
                                disabled={answered || !canAnswer}
                                style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "8px 18px", fontSize: 14, fontWeight: 600, color, cursor: answered || !canAnswer ? "default" : "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", transition: "all 0.15s", opacity: answered && optIdx !== ex.correct && optIdx !== answers[key] ? 0.5 : 1 }}>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {showExplanation[key] && (
                          <div style={{ marginTop: 10, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                            <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>💡 {ex.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <span style={{ fontSize: 13, color: T.textMid, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                      Score: <strong style={{ color: score.correct === score.total ? T.green : T.text }}>{score.correct}</strong> / {score.total}
                      {score.correct === score.total && score.attempted === score.total && " — Perfect! 🎉"}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Paraphrasing Exercises ───────────────────
const PARAPHRASE_EXERCISES = [
  { original: "Many people believe that governments should spend more money on education.", options: ["A lot of people think governments need to pay for education more.", "It is widely held that public authorities ought to allocate greater funding to the education sector.", "Governments should invest in education because many people want this."], correct: 1, explanation: "'It is widely held that' is formal passive. 'Public authorities' upgrades 'governments'. 'Allocate greater funding' replaces 'spend more money'." },
  { original: "Climate change is a serious problem that affects the whole world.", options: ["Global warming is a big issue everywhere on Earth.", "Climate change is dangerous for everyone around the world.", "Climate change represents a critical global challenge with far-reaching consequences for all nations."], correct: 2, explanation: "'Represents a critical global challenge' is more academic than 'is a serious problem'. 'Far-reaching consequences' is IELTS-level vocabulary. 'All nations' replaces 'whole world'." },
  { original: "Young people nowadays spend too much time on social media.", options: ["In contemporary society, a significant proportion of young people devote an excessive amount of time to social media platforms.", "Kids these days use social media too often.", "Social media is used too much by today's youth."], correct: 0, explanation: "'In contemporary society' replaces 'nowadays'. 'Devote an excessive amount of time to' is more formal than 'spend too much time on'. 'Social media platforms' is more precise." },
  { original: "It is important for students to learn foreign languages.", options: ["Students need to study languages that are foreign to them.", "The acquisition of foreign languages is of considerable importance for learners.", "Learning foreign languages is a thing students should do."], correct: 1, explanation: "'Acquisition of foreign languages' nominalises the verb phrase. 'Of considerable importance' is formal. 'Learners' is more academic than 'students'." },
  { original: "More and more people are choosing to work from home.", options: ["A growing number of individuals are opting to work remotely, a trend that has gained considerable momentum in recent years.", "Lots of people now prefer working at home instead of the office.", "Working from home is becoming popular with many people today."], correct: 0, explanation: "'A growing number of individuals' replaces 'more and more people'. 'Opting to work remotely' is more formal. Adding context about the trend shows Task Achievement awareness." },
  { original: "The government should do something to reduce crime in cities.", options: ["The authorities ought to implement targeted measures to curb criminal activity in urban areas.", "Something must be done by governments about city crime.", "The government needs to stop crime happening in cities."], correct: 0, explanation: "'The authorities ought to implement measures' uses passive construction and formal verb. 'Curb criminal activity' replaces 'reduce crime'. 'Urban areas' is more academic than 'cities'." },
  { original: "Technology has changed the way people communicate with each other.", options: ["Technology has made communication between people very different.", "Technological advancements have fundamentally transformed interpersonal communication.", "People now communicate differently because of technology."], correct: 1, explanation: "'Technological advancements' is a better noun phrase. 'Fundamentally transformed' is stronger than 'changed'. 'Interpersonal communication' is academic and precise." },
  { original: "Some countries have a problem with obesity because people eat too much unhealthy food.", options: ["Several nations face an escalating obesity crisis, attributable in part to the widespread consumption of nutritionally poor diets.", "Some places have fat people because of bad food habits.", "Obesity is a problem in certain countries where unhealthy food is eaten."], correct: 0, explanation: "'Escalating obesity crisis' shows problem awareness. 'Attributable in part to' is formal causative language. 'Nutritionally poor diets' replaces 'unhealthy food'." },
];

// ── Linking Words Quiz ────────────────────────
const LINKING_QUIZ = [
  { sentence: "Crime rates are rising. ___, governments must take urgent action.", options: ["Therefore","However","Moreover"], correct: 0, explanation: "'Therefore' shows cause and effect — rising crime causes the need for action. 'However' shows contrast. 'Moreover' adds information." },
  { sentence: "Exercise improves physical health. ___, it boosts mental wellbeing.", options: ["Nevertheless","Furthermore","Although"], correct: 1, explanation: "'Furthermore' adds a related point. 'Nevertheless' shows contrast despite obstacles. 'Although' introduces a concession." },
  { sentence: "Some argue that technology isolates people. ___, others believe it strengthens connections.", options: ["Consequently","On the other hand","For instance"], correct: 1, explanation: "'On the other hand' introduces an opposing view — perfect for discuss both views tasks." },
  { sentence: "Many students fail to meet the word count. ___, their Task Achievement score is capped at Band 5.", options: ["As a result","In addition","Whereas"], correct: 0, explanation: "'As a result' signals a consequence. Writing under 250 words directly results in a lower score." },
  { sentence: "Finland has one of the best education systems in the world. ___, class sizes are small and teachers are highly trained.", options: ["In contrast","For example","Despite this"], correct: 1, explanation: "'For example' introduces a specific supporting detail — exactly what IELTS examiners want." },
  { sentence: "The proposal has some advantages. ___, there are significant drawbacks that must be considered.", options: ["Therefore","Admittedly","Nevertheless"], correct: 2, explanation: "'Nevertheless' concedes a point but pivots to contrast. It signals a balanced argument — key for high-band writing." },
  { sentence: "Urban populations are growing rapidly. ___, rural areas are experiencing a decline in residents.", options: ["In contrast","Furthermore","As a result"], correct: 0, explanation: "'In contrast' is used to compare two opposite trends — common in Task 1 Academic and Task 2." },
  { sentence: "___ the benefits of online learning, many students still prefer face-to-face teaching.", options: ["Despite","Because of","Due to the fact that"], correct: 0, explanation: "'Despite' is followed by a noun or gerund — 'Despite the benefits'. Never 'Despite of'. 'Although' would work instead if followed by a clause." },
  { sentence: "Governments should invest in public transport. ___, they should incentivise the use of bicycles.", options: ["In addition","However","On the other hand"], correct: 0, explanation: "'In addition' adds another recommendation of the same type. 'However' and 'On the other hand' would introduce a contrasting idea, which doesn't fit here." },
  { sentence: "The data shows a steady increase between 2010 and 2015. ___, figures declined sharply from 2015 to 2020.", options: ["Moreover","Subsequently","Therefore"], correct: 1, explanation: "'Subsequently' means 'after that' — ideal for Task 1 Academic trend descriptions. 'Moreover' adds rather than sequences. 'Therefore' shows cause." },
];

// ── Vocabulary Upgrade Exercises ─────────────
const VOCAB_EXERCISES = [
  { weak: "a lot of people", options: ["many individual humans", "a significant proportion of the population", "lots of human beings"], correct: 1, tip: "IELTS tip: 'A significant proportion of' or 'a considerable number of' — never 'a lot of' in academic writing." },
  { weak: "good for society", options: ["very nice for communities", "beneficial for the wider community", "helpful to social groups"], correct: 1, tip: "'Beneficial for' is the key academic upgrade. Also try: 'advantageous', 'conducive to social wellbeing'." },
  { weak: "went up a lot", options: ["rose significantly", "went up very much", "increased in a big way"], correct: 0, tip: "'Rose significantly' — use trend verbs (rose, surged, climbed) + adverbs (significantly, sharply, steadily) in Task 1." },
  { weak: "bad for the environment", options: ["not good for nature", "detrimental to the natural environment", "harmful to our Earth"], correct: 1, tip: "'Detrimental to' is a high-band collocation. Also: 'damaging to ecological systems', 'harmful to biodiversity'." },
  { weak: "the government should do something", options: ["authorities ought to implement targeted measures", "the government needs to act", "officials have to do things"], correct: 0, tip: "'Implement targeted measures' is specific and academic. Never write 'do something' in IELTS — it signals vague thinking." },
  { weak: "nowadays", options: ["in today's world", "in contemporary society", "currently in this day and age"], correct: 1, tip: "'In contemporary society' or 'In the modern era' — 'Nowadays' is an IELTS cliché that lowers your Lexical Resource score." },
  { weak: "important", options: ["crucial / paramount / indispensable", "really needed and significant", "very necessary indeed"], correct: 0, tip: "Upgrade ladder: important → significant → crucial → paramount → indispensable. Each step raises your band." },
  { weak: "rise in crime", options: ["escalation in criminal activity", "going up of lawbreaking", "increase in bad behaviour"], correct: 0, tip: "'Escalation in criminal activity' uses nominalisation — a key IELTS skill. Also: 'surge in offences', 'proliferation of antisocial behaviour'." },
];

// ── Error Correction Passages ─────────────────
const ERROR_PASSAGES = [
  {
    title: "Urban Development",
    text: "In many countries, the number of people who lives in cities have risen dramatically over the past few decades. This phenomena has led to a variety of social and environmental challenges. Governments must to address these issues if they want reduce urban poverty. Furthermore, the lack of affordable accommodation are a major concern for low-income families.",
    errors: [
      { wrong: "who lives", right: "who live", explanation: "Relative clause 'who live' agrees with 'people' (plural), not 'number'." },
      { wrong: "have risen", right: "has risen", explanation: "'The number of people' = singular. 'The number HAS risen.'" },
      { wrong: "This phenomena", right: "This phenomenon", explanation: "'Phenomena' is the plural form. The singular is 'phenomenon'." },
      { wrong: "must to address", right: "must address", explanation: "Modal verbs (must, should, can, will) are NEVER followed by 'to'. 'Must address.'" },
      { wrong: "want reduce", right: "want to reduce", explanation: "'Want' takes infinitive: 'want TO reduce'." },
      { wrong: "accommodation are", right: "accommodation is", explanation: "'Accommodation' is uncountable — always singular. 'Accommodation IS a major concern.'" },
    ]
  },
  {
    title: "Education & Technology",
    text: "Technology have transformed the way students learn in recently years. Many researchers argues that digital tools are more effective than the traditional teaching methods. Despite of the high cost, most schools have invest in new equipment. Moreover, student who use technology regular tend to perform more better in assessments.",
    errors: [
      { wrong: "Technology have", right: "Technology has", explanation: "'Technology' is uncountable — takes singular verb. 'Technology HAS transformed.'" },
      { wrong: "in recently years", right: "in recent years", explanation: "'Recent' is an adjective modifying 'years', not an adverb. 'In RECENT years.'" },
      { wrong: "researchers argues", right: "researchers argue", explanation: "Third person plural: 'researchers ARGUE' — no 's'." },
      { wrong: "Despite of", right: "Despite", explanation: "'Despite' is NEVER followed by 'of'. 'Despite the high cost.' Use 'In spite of' if you want a preposition." },
      { wrong: "have invest", right: "have invested", explanation: "Present perfect requires past participle: 'HAVE INVESTED'." },
      { wrong: "student who", right: "students who", explanation: "'Students' should be plural to match the general statement." },
      { wrong: "use technology regular", right: "use technology regularly", explanation: "Adverb needed to modify the verb 'use'. 'Use technology REGULARLY.'" },
      { wrong: "more better", right: "better", explanation: "Never double comparatives. 'Better' is already comparative. 'More better' is always wrong." },
    ]
  },
];

// ── Band Score Self-Check Quiz ────────────────
const BAND_QUIZ = [
  { q: "Do you consistently write over 250 words for Task 2?", yes: 0.5, no: 0, tip: "Under 250 words = Task Achievement capped at Band 5. This is one of the most common mistakes." },
  { q: "Do you paraphrase the question in your introduction (no copying)?", yes: 0.5, no: 0, tip: "Copying the question is penalised under Lexical Resource. Always rephrase." },
  { q: "Do you write a clear overview / thesis statement in your introduction?", yes: 0.5, no: 0, tip: "Examiners look for a clear position or overview from the first paragraph." },
  { q: "Do you use a variety of linking words (not just 'however' and 'furthermore')?", yes: 0.5, no: 0, tip: "Repeating the same connectors lowers Coherence & Cohesion. Vary them." },
  { q: "Do you support your points with specific examples or evidence?", yes: 0.5, no: 0, tip: "Generic statements without examples rarely score above Band 6 for Task Achievement." },
  { q: "Do you avoid informal language (a lot of, kids, things, stuff)?", yes: 0.5, no: 0, tip: "Informal language directly penalises Lexical Resource — one of the four scoring criteria." },
  { q: "Do you use a mix of simple AND complex sentences?", yes: 0.5, no: 0, tip: "All-simple sentences = Band 5 GRA. All-complex sentences with errors = Band 6. Balance is key." },
  { q: "Do you avoid contractions (don't → do not, can't → cannot)?", yes: 0.5, no: 0, tip: "Contractions are informal. Never use them in IELTS Academic writing." },
  { q: "Do you have a conclusion that restates your position clearly?", yes: 0.5, no: 0, tip: "A missing or weak conclusion costs Task Achievement marks — it's 25% of your score." },
  { q: "Do you check your work for spelling and punctuation errors?", yes: 0.5, no: 0, tip: "Spelling and punctuation errors reduce Lexical Resource and Grammatical Range scores." },
];

// ── ExercisesHub ──────────────────────────────
const ExercisesHub = ({isPro, onUpgrade}) => {
  const [activeExTab, setActiveExTab] = useState("grammar");
  const [timeLeft, setTimeLeft] = useState(()=> isPro ? Infinity : getExerciseTimer());
  const [paused, setPaused] = useState(true);
  const timerRef = useRef(null);

  const startTimer = useCallback(() => {
    if(isPro) return;
    setPaused(false);
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = prev - 1;
        if(next <= 0) { clearInterval(timerRef.current); setPaused(true); saveExerciseTimer(0); return 0; }
        saveExerciseTimer(next);
        return next;
      });
    }, 1000);
  }, [isPro]);

  const pauseTimer = useCallback(() => {
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setPaused(true);
    if(!isPro) saveExerciseTimer(timeLeft);
  }, [isPro, timeLeft]);

  useEffect(() => { return () => { if(timerRef.current) clearInterval(timerRef.current); }; }, []);

  const formatTime = (s) => {
    if(s === Infinity) return "∞";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec < 10 ? "0" : ""}${sec}`;
  };

  const canAnswer = isPro || (!paused && timeLeft > 0);
  const timeExpired = !isPro && timeLeft <= 0;

  const TABS = [
    { key:"grammar", icon:"📐", label:"Grammar Drills" },
    { key:"paraphrase", icon:"🔄", label:"Paraphrasing" },
    { key:"linking", icon:"🔗", label:"Linking Words" },
    { key:"vocab", icon:"📖", label:"Vocabulary Upgrade" },
    { key:"errors", icon:"🔍", label:"Error Correction" },
    { key:"bandcheck", icon:"🎯", label:"Band Self-Check" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 24, padding: "8px 0 0" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🏋️</div>
        <h2 style={{ fontFamily: "Georgia,serif", color: T.text, fontSize: 26, margin: "0 0 8px", fontWeight: 700 }}>Practice Exercises</h2>
        <p style={{ color: T.textMid, fontSize: 14, fontFamily: "'Source Sans Pro','Inter',system-ui", margin: 0, maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
          Sharpen your IELTS writing skills with targeted drills — grammar, paraphrasing, linking words, vocabulary upgrades, and more. All exercises are fully static with instant feedback.
        </p>
      </div>

      {/* Sticky Timer */}
      {!isPro && (
        <div style={{ position: "sticky", top: 64, zIndex: 100, marginBottom: 16 }}>
          <div style={{ background: timeExpired ? T.redBg : paused ? T.amberBg : T.greenBg, border: `1px solid ${timeExpired ? T.redBorder : paused ? T.amberBorder : T.greenBorder}`, borderRadius: 10, padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: timeLeft < 300 ? T.red : paused ? T.amber : T.green, fontFamily: "'Source Sans Pro','Inter',system-ui", minWidth: 54, flexShrink: 0 }}>
                  {formatTime(timeLeft)}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: timeExpired ? T.red : paused ? T.amber : T.green, fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.3 }}>
                    {timeExpired ? "⏰ Session expired — upgrade to Pro to continue" : paused ? "⏸ Timer paused — press Play to begin your session" : "▶ Session active — exercises unlocked"}
                  </div>
                  {!timeExpired && (
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui", marginTop: 2 }}>
                      Free plan: 30 minutes total · Pause at any time and resume later · Pro members get unlimited access
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {!timeExpired && (
                  <button onClick={paused ? startTimer : pauseTimer}
                    style={{ background: paused ? T.green : T.amber, color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                    {paused ? "▶ Play" : "⏸ Pause"}
                  </button>
                )}
                {timeExpired && (
                  <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                    🔓 Upgrade to Pro
                  </button>
                )}
              </div>
            </div>
            {!timeExpired && (
              <div style={{ marginTop: 8, background: "rgba(0,0,0,0.08)", borderRadius: 4, height: 5 }}>
                <div style={{ width: `${(timeLeft / EXERCISE_TIMER_LIMIT) * 100}%`, background: timeLeft < 300 ? T.red : paused ? T.amber : T.green, borderRadius: 4, height: 5, transition: "width 1s linear" }}/>
              </div>
            )}
          </div>
        </div>
      )}
      {isPro && (
        <div style={{ marginBottom: 16, background: T.greenBg, border: `1px solid ${T.greenBorder}`, borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>✅</span>
          <span style={{ fontSize: 13, color: T.green, fontWeight: 700, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Pro — Unlimited exercise access. No timer restrictions.</span>
        </div>
      )}

      {/* Exercise type tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveExTab(t.key)}
            style={{ background: activeExTab === t.key ? T.primaryLight : T.bgGray, border: `1px solid ${activeExTab === t.key ? T.primaryBorder : T.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: activeExTab === t.key ? 700 : 400, color: activeExTab === t.key ? T.primary : T.textMid, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", display: "flex", alignItems: "center", gap: 5 }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Expired overlay message */}
      {timeExpired && !isPro && (
        <Card style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, textAlign: "center", padding: "28px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏰</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.red, fontFamily: "'Source Sans Pro','Inter',system-ui", marginBottom: 8 }}>Your free 30-minute session has ended</div>
          <p style={{ color: T.textMid, fontSize: 13, fontFamily: "'Source Sans Pro','Inter',system-ui", margin: "0 0 16px", lineHeight: 1.6 }}>Upgrade to Pro for unlimited practice time — all exercise types, all categories, no restrictions.</p>
          <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>🔓 Upgrade to Pro — $25/mo</button>
        </Card>
      )}

      {/* Content area */}
      <div style={{ opacity: timeExpired && !isPro ? 0.4 : 1, pointerEvents: timeExpired && !isPro ? "none" : "auto", filter: !isPro && paused && !timeExpired ? "blur(4px)" : "none", transition: "filter 0.3s ease", userSelect: !isPro && paused && !timeExpired ? "none" : "auto", position: "relative" }}>
        {!isPro && paused && !timeExpired && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ background: "rgba(255,255,255,0.85)", borderRadius: 12, padding: "16px 28px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", backdropFilter: "blur(2px)" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⏸</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Timer paused</div>
              <div style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui", marginTop: 2 }}>Press Play to resume</div>
            </div>
          </div>
        )}
        {activeExTab === "grammar" && <GrammarExercisesInner isPro={isPro} canAnswer={canAnswer} onUpgrade={onUpgrade} />}
        {activeExTab === "paraphrase" && <ParaphraseExercises canAnswer={canAnswer} />}
        {activeExTab === "linking" && <LinkingWordsQuiz canAnswer={canAnswer} />}
        {activeExTab === "vocab" && <VocabUpgradeExercises canAnswer={canAnswer} />}
        {activeExTab === "errors" && <ErrorCorrectionExercises canAnswer={canAnswer} />}
        {activeExTab === "bandcheck" && <BandSelfCheck />}
      </div>
    </div>
  );
};

// ── GrammarExercisesInner (shared logic, used in ExercisesHub) ──
const GrammarExercisesInner = ({isPro, canAnswer, onUpgrade}) => {
  const [openCat, setOpenCat] = useState(null);
  const [answers, setAnswers] = useState({});
  const [showExplanation, setShowExplanation] = useState({});
  const totalQ = GRAMMAR_EXERCISES.reduce((sum,c)=>sum+c.exercises.length,0);
  const totalAnswered = Object.keys(answers).length;
  const totalCorrect = Object.entries(answers).filter(([key,val])=>{const [ci,ei]=key.split("-").map(Number);return val===GRAMMAR_EXERCISES[ci].exercises[ei].correct;}).length;
  const getCatScore = (catIdx) => {
    const cat = GRAMMAR_EXERCISES[catIdx];
    let correct = 0, attempted = 0;
    cat.exercises.forEach((_, exIdx) => { const key = `${catIdx}-${exIdx}`; if(answers[key]!==undefined){attempted++;if(answers[key]===cat.exercises[exIdx].correct)correct++;} });
    return { correct, attempted, total: cat.exercises.length };
  };
  const handleAnswer = (catIdx, exIdx, optIdx) => {
    if(!canAnswer) return;
    const key = `${catIdx}-${exIdx}`;
    if(answers[key]!==undefined) return;
    setAnswers(prev=>({...prev,[key]:optIdx}));
    setShowExplanation(prev=>({...prev,[key]:true}));
  };
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: T.textMid, fontFamily: "'Source Sans Pro','Inter',system-ui", marginBottom: 4 }}>
          <strong>14 categories · {totalQ} questions</strong> covering Subject-Verb Agreement, Articles, Tenses, Prepositions, Passives, Conditionals, Relative Clauses, and more.
        </div>
        {totalAnswered > 0 && (
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px", display: "inline-block" }}>
            <span style={{ fontSize: 13, color: T.textMid, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
              Score: <strong style={{ color: T.text }}>{totalCorrect}</strong>/{totalAnswered} answered
              <span style={{ color: totalCorrect/totalAnswered >= 0.8 ? T.green : totalCorrect/totalAnswered >= 0.6 ? T.amber : T.red, marginLeft: 8, fontWeight: 700 }}>({Math.round(totalCorrect/totalAnswered*100)}%)</span>
            </span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {GRAMMAR_EXERCISES.map((cat, catIdx) => {
          const score = getCatScore(catIdx);
          const isOpen = openCat === catIdx;
          return (
            <div key={catIdx}>
              <div onClick={() => setOpenCat(isOpen ? null : catIdx)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: isOpen ? `${cat.color}10` : T.bg, border: `1px solid ${isOpen ? cat.color + "40" : T.border}`, borderRadius: isOpen ? "10px 10px 0 0" : 10, cursor: "pointer", transition: "all 0.15s" }}>
                <span style={{ fontSize: 20 }}>{cat.icon}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: isOpen ? cat.color : T.text, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{cat.category}</span>
                {score.attempted > 0 && (
                  <span style={{ background: score.correct === score.attempted ? T.greenBg : T.amberBg, border: `1px solid ${score.correct === score.attempted ? T.greenBorder : T.amberBorder}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: score.correct === score.attempted ? T.green : T.amber, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                    {score.correct}/{score.attempted}
                  </span>
                )}
                <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{cat.exercises.length}q</span>
                <span style={{ fontSize: 16, color: T.textMuted, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>
              {isOpen && (
                <div style={{ border: `1px solid ${cat.color}40`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16, background: `${cat.color}05` }}>
                  {!canAnswer && !isPro && (
                    <Card style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, textAlign: "center" }}>
                      <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>⏸ Timer paused — click <strong>Play</strong> above to start answering.</p>
                    </Card>
                  )}
                  {cat.exercises.map((ex, exIdx) => {
                    const key = `${catIdx}-${exIdx}`;
                    const answered = answers[key] !== undefined;
                    const isCorrect = answered && answers[key] === ex.correct;
                    return (
                      <div key={exIdx} style={{ background: T.bg, border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Q{exIdx+1}</span>
                          {answered && <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{isCorrect ? "✓ Correct" : "✗ Incorrect"}</span>}
                        </div>
                        <p style={{ color: T.text, fontSize: 14, margin: "0 0 12px", lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{ex.sentence}</p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {ex.options.map((opt, optIdx) => {
                            let bg = T.bgGray, border = T.border, color = T.text;
                            if(answered){ if(optIdx===ex.correct){bg=T.greenBg;border=T.greenBorder;color=T.green;}else if(optIdx===answers[key]&&!isCorrect){bg=T.redBg;border=T.redBorder;color=T.red;}else{bg=T.bgGray;color=T.textMuted;} }
                            return (
                              <button key={optIdx} onClick={() => handleAnswer(catIdx, exIdx, optIdx)} disabled={answered||!canAnswer}
                                style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "8px 18px", fontSize: 14, fontWeight: 600, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", transition: "all 0.15s", opacity: answered&&optIdx!==ex.correct&&optIdx!==answers[key]?0.5:1 }}>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {showExplanation[key] && (
                          <div style={{ marginTop: 10, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                            <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>💡 {ex.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Paraphrase Exercises Component ────────────
const ParaphraseExercises = ({canAnswer}) => {
  const [answers, setAnswers] = useState({});
  const [shown, setShown] = useState({});
  return (
    <div>
      <Card style={{ background: T.blueBg, border: `1px solid ${T.blueBorder}`, marginBottom: 16 }}>
        <p style={{ color: T.blue, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          🔄 <strong>Paraphrasing</strong> — A core IELTS skill. For each sentence, choose the best academic paraphrase. Look for formal vocabulary, appropriate structure, and precise meaning.
        </p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {PARAPHRASE_EXERCISES.map((item, i) => {
          const answered = answers[i] !== undefined;
          const isCorrect = answered && answers[i] === item.correct;
          return (
            <Card key={i} style={{ border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}` }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Q{i+1} — Original sentence</span>
                <div style={{ background: T.bgGray, borderRadius: 8, padding: "10px 14px", marginTop: 6, border: `1px solid ${T.border}` }}>
                  <p style={{ color: T.text, fontSize: 14, margin: 0, fontFamily: "Georgia,serif", fontStyle: "italic" }}>{item.original}</p>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, fontFamily: "'Source Sans Pro','Inter',system-ui", marginBottom: 8 }}>Which option is the best academic paraphrase?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {item.options.map((opt, optIdx) => {
                  let bg = T.bgGray, border = T.border, color = T.text;
                  if(answered){ if(optIdx===item.correct){bg=T.greenBg;border=T.greenBorder;color=T.green;}else if(optIdx===answers[i]&&!isCorrect){bg=T.redBg;border=T.redBorder;color=T.red;}else{color=T.textMuted;} }
                  return (
                    <button key={optIdx} onClick={() => { if(!canAnswer||answered) return; setAnswers(p=>({...p,[i]:optIdx})); setShown(p=>({...p,[i]:true})); }} disabled={answered||!canAnswer}
                      style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", textAlign: "left", lineHeight: 1.5, transition: "all 0.15s" }}>
                      <strong style={{ marginRight: 6 }}>{String.fromCharCode(65+optIdx)}.</strong>{opt}
                    </button>
                  );
                })}
              </div>
              {shown[i] && (
                <div style={{ marginTop: 12, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>💡 {item.explanation}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ── Linking Words Quiz Component ──────────────
const LinkingWordsQuiz = ({canAnswer}) => {
  const [answers, setAnswers] = useState({});
  const [shown, setShown] = useState({});
  return (
    <div>
      <Card style={{ background: T.purpleBg, border: `1px solid ${T.purpleBorder}`, marginBottom: 16 }}>
        <p style={{ color: T.purple, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          🔗 <strong>Linking Words Quiz</strong> — Fill in the blank with the correct linking word. Tests your understanding of cohesion, contrast, cause-effect, and sequencing — all tested in IELTS Coherence & Cohesion.
        </p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {LINKING_QUIZ.map((item, i) => {
          const answered = answers[i] !== undefined;
          const isCorrect = answered && answers[i] === item.correct;
          const parts = item.sentence.split("___");
          return (
            <Card key={i} style={{ border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}` }}>
              <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Q{i+1}</span>
                {answered && <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Source Sans Pro','Inter',system-ui", marginLeft: 4 }}>{isCorrect ? "✓ Correct" : "✗ Incorrect"}</span>}
              </div>
              <p style={{ color: T.text, fontSize: 14, margin: "0 0 12px", lineHeight: 1.7, fontFamily: "Georgia,serif" }}>
                {parts[0]}<span style={{ background: answered ? (isCorrect ? "#dcfce7" : "#fee2e2") : T.primaryLight, padding: "1px 10px", borderRadius: 4, fontWeight: 700, color: answered ? (isCorrect ? T.green : T.red) : T.primary, fontStyle: "normal", minWidth: 80, display: "inline-block", textAlign: "center" }}>
                  {answered ? item.options[item.correct] : "___"}
                </span>{parts[1]}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {item.options.map((opt, optIdx) => {
                  let bg = T.bgGray, border = T.border, color = T.text;
                  if(answered){ if(optIdx===item.correct){bg=T.greenBg;border=T.greenBorder;color=T.green;}else if(optIdx===answers[i]&&!isCorrect){bg=T.redBg;border=T.redBorder;color=T.red;}else{color=T.textMuted;} }
                  return (
                    <button key={optIdx} onClick={() => { if(!canAnswer||answered) return; setAnswers(p=>({...p,[i]:optIdx})); setShown(p=>({...p,[i]:true})); }} disabled={answered||!canAnswer}
                      style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", transition: "all 0.15s" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {shown[i] && (
                <div style={{ marginTop: 10, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>💡 {item.explanation}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ── Vocabulary Upgrade Component ──────────────
const VocabUpgradeExercises = ({canAnswer}) => {
  const [answers, setAnswers] = useState({});
  const [shown, setShown] = useState({});
  return (
    <div>
      <Card style={{ background: "#f0fdf4", border: `1px solid ${T.greenBorder}`, marginBottom: 16 }}>
        <p style={{ color: T.green, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          📖 <strong>Vocabulary Upgrade</strong> — Each question shows a weak phrase. Pick the best academic replacement. These upgrades directly raise your Lexical Resource band score.
        </p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {VOCAB_EXERCISES.map((item, i) => {
          const answered = answers[i] !== undefined;
          const isCorrect = answered && answers[i] === item.correct;
          return (
            <Card key={i} style={{ border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}` }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Q{i+1}</span>
                <span style={{ background: "#fee2e2", borderRadius: 6, padding: "3px 12px", fontSize: 13, color: "#991b1b", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>✗ "{item.weak}"</span>
                <span style={{ color: T.textMuted, fontSize: 13 }}>→ choose best upgrade</span>
                {answered && <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>{isCorrect ? "✓ Correct" : "✗ Incorrect"}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {item.options.map((opt, optIdx) => {
                  let bg = T.bgGray, border = T.border, color = T.text;
                  if(answered){ if(optIdx===item.correct){bg="#dcfce7";border=T.greenBorder;color="#166534";}else if(optIdx===answers[i]&&!isCorrect){bg="#fee2e2";border=T.redBorder;color="#991b1b";}else{color=T.textMuted;} }
                  return (
                    <button key={optIdx} onClick={() => { if(!canAnswer||answered) return; setAnswers(p=>({...p,[i]:optIdx})); setShown(p=>({...p,[i]:true})); }} disabled={answered||!canAnswer}
                      style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", textAlign: "left", transition: "all 0.15s" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {shown[i] && (
                <div style={{ marginTop: 10, background: isCorrect ? "#f0fdf4" : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>🎓 {item.tip}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};

// ── Error Correction Component ─────────────────
const ErrorCorrectionExercises = ({canAnswer}) => {
  const [revealed, setRevealed] = useState({});
  const [showAll, setShowAll] = useState({});
  return (
    <div>
      <Card style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, marginBottom: 16 }}>
        <p style={{ color: T.red, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
          🔍 <strong>Error Correction</strong> — Read each passage carefully and find all the mistakes. Click "Reveal Errors" to see every error highlighted with explanations. Trains the same skill examiners use when marking your essay.
        </p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {ERROR_PASSAGES.map((passage, pi) => (
          <Card key={pi} style={{ border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui", textTransform: "uppercase", letterSpacing: "0.08em" }}>Passage {pi+1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "'Source Sans Pro','Inter',system-ui", marginLeft: 8 }}>{passage.title}</span>
                <span style={{ fontSize: 11, color: T.amber, fontFamily: "'Source Sans Pro','Inter',system-ui", marginLeft: 8 }}>({passage.errors.length} errors hidden)</span>
              </div>
              <button onClick={() => { if(!canAnswer) return; setShowAll(p=>({...p,[pi]:!p[pi]})); }}
                disabled={!canAnswer}
                style={{ background: showAll[pi] ? T.amberBg : T.primary, color: showAll[pi] ? T.amber : "white", border: `1px solid ${showAll[pi] ? T.amberBorder : T.primary}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: canAnswer?"pointer":"default", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>
                {showAll[pi] ? "Hide Errors" : "Reveal Errors"}
              </button>
            </div>
            <div style={{ background: T.bgGray, borderRadius: 8, padding: "14px 16px", border: `1px solid ${T.border}`, marginBottom: 12 }}>
              <p style={{ color: T.text, fontSize: 14, margin: 0, lineHeight: 1.9, fontFamily: "Georgia,serif" }}>
                {showAll[pi] ? (() => {
                  let text = passage.text;
                  const parts = [];
                  let remaining = text;
                  let idx = 0;
                  passage.errors.forEach((err, ei) => {
                    const pos = remaining.indexOf(err.wrong);
                    if(pos === -1) return;
                    if(pos > 0) parts.push(<span key={`n${idx++}`}>{remaining.slice(0, pos)}</span>);
                    parts.push(
                      <span key={`e${idx++}`} style={{ background: "#fee2e2", borderBottom: "2px solid #dc2626", borderRadius: 3, padding: "0 2px", color: "#991b1b", fontWeight: 700 }} title={`✗ → ${err.right}`}>{err.wrong}</span>
                    );
                    remaining = remaining.slice(pos + err.wrong.length);
                  });
                  if(remaining) parts.push(<span key={`n${idx++}`}>{remaining}</span>);
                  return parts;
                })() : passage.text}
              </p>
            </div>
            {showAll[pi] && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Errors Found ({passage.errors.length})</div>
                {passage.errors.map((err, ei) => (
                  <div key={ei} style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <span style={{ background: "#fee2e2", borderRadius: 6, padding: "3px 10px", fontSize: 13, color: "#991b1b", fontFamily: "'Source Sans Pro','Inter',system-ui", flexShrink: 0 }}>✗ "{err.wrong}"</span>
                    <span style={{ color: T.textMuted, fontSize: 14, flexShrink: 0 }}>→</span>
                    <span style={{ background: "#dcfce7", borderRadius: 6, padding: "3px 10px", fontSize: 13, color: "#166534", fontFamily: "'Source Sans Pro','Inter',system-ui", flexShrink: 0 }}>✓ "{err.right}"</span>
                    <span style={{ color: T.textMid, fontSize: 12, fontFamily: "'Source Sans Pro','Inter',system-ui", flex: 1, minWidth: 200 }}>💡 {err.explanation}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
};

// ── Band Self-Check Component ─────────────────
const BandSelfCheck = () => {
  const [answers, setAnswers] = useState({});
  const allAnswered = Object.keys(answers).length === BAND_QUIZ.length;
  const score = Object.entries(answers).reduce((sum,[i,val])=> sum + (val==="yes" ? BAND_QUIZ[i].yes : BAND_QUIZ[i].no), 0);
  const estimatedBand = Math.min(8.0, 4.5 + score * 2);
  const roundedBand = Math.round(estimatedBand * 2) / 2;
  return (
    <div>
      <Card style={{ background: T.primaryLight, border: `1px solid ${T.primaryBorder}`, marginBottom: 16 }}>
        <p style={{ color: T.primary, fontSize: 13, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.6 }}>
          🎯 <strong>Band Score Self-Check</strong> — Answer 10 honest questions about your current writing habits. You'll get an estimated band range based on your answers, plus targeted advice on what to fix. No timer needed — answer honestly!
        </p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {BAND_QUIZ.map((item, i) => {
          const answered = answers[i] !== undefined;
          return (
            <Card key={i} style={{ border: `1px solid ${answered ? T.greenBorder : T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Q{i+1} </span>
                  <span style={{ fontSize: 14, color: T.text, fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.5 }}>{item.q}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {["yes","no"].map(val => {
                    const active = answers[i] === val;
                    return (
                      <button key={val} onClick={() => setAnswers(p=>({...p,[i]:val}))}
                        style={{ background: active ? (val==="yes" ? T.greenBg : T.redBg) : T.bgGray, border: `1.5px solid ${active ? (val==="yes" ? T.greenBorder : T.redBorder) : T.border}`, borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 700, color: active ? (val==="yes" ? T.green : T.red) : T.textMid, cursor: "pointer", fontFamily: "'Source Sans Pro','Inter',system-ui", transition: "all 0.15s", textTransform: "capitalize" }}>
                        {val === "yes" ? "✓ Yes" : "✗ No"}
                      </button>
                    );
                  })}
                </div>
              </div>
              {answered && answers[i] === "no" && (
                <div style={{ marginTop: 10, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 8, padding: "8px 14px" }}>
                  <p style={{ color: T.amber, fontSize: 12, margin: 0, fontFamily: "'Source Sans Pro','Inter',system-ui", lineHeight: 1.5 }}>💡 {item.tip}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {allAnswered && (
        <Card style={{ marginTop: 20, background: `linear-gradient(135deg, ${T.primary} 0%, #003a99 100%)`, border: "none", textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontFamily: "'Source Sans Pro','Inter',system-ui" }}>Your Estimated Band</div>
          <div style={{ fontSize: 72, fontWeight: 900, color: "white", lineHeight: 1, fontFamily: "Georgia,serif", marginBottom: 8 }}>{roundedBand}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontFamily: "'Source Sans Pro','Inter',system-ui", marginBottom: 16, lineHeight: 1.6 }}>
            {roundedBand >= 7.5 ? "Excellent foundation — you're applying most key techniques. Focus on advanced vocabulary and complex structures to reach Band 8+." :
             roundedBand >= 6.5 ? "Good progress — you're following core principles but there are clear gaps. Target the areas where you answered 'No' above." :
             roundedBand >= 5.5 ? "Developing — several fundamentals need attention. Work through the 'No' answers above systematically." :
             "Foundation stage — focus on the basics first: word count, paraphrasing, linking words, and avoiding informal language."}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "'Source Sans Pro','Inter',system-ui", fontStyle: "italic" }}>
            This is a self-assessed estimate based on your reported habits. For a precise band score, use the Essay Analyzer above.
          </div>
        </Card>
      )}
    </div>
  );
};

// ── Admin Page ────────────────────────────────
const AdminPage = ({onBack}) => {
  const [unlocked, setUnlocked] = useState(false);
  const [passInput, setPassInput] = useState("");
  const [passErr, setPassErr] = useState("");
  const [adminData, setAdminData] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [lastConfirmed, setLastConfirmed] = useState(null);
  const [copied, setCopied] = useState(null);
  const [confirmError, setConfirmError] = useState(null);
  const [manualEmail, setManualEmail] = useState("");
  const [manualLoading, setManualLoading] = useState(false);
  const [manualResult, setManualResult] = useState(null);

  const inp = {width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"10px 12px",fontFamily:"'Source Sans Pro','Inter',system-ui",outline:"none",boxSizing:"border-box"};

  const tryUnlock = async () => {
    if(passInput !== ADMIN_KEY){ setPassErr("Incorrect password."); return; }
    setUnlocked(true); setPassErr(""); setAdminLoading(true);
    try{
      const res = await fetch("/api/admin/users", { headers:{"x-admin-key": passInput} });
      const data = await res.json();
      setAdminData(data);
    }catch(e){ console.error(e); }
    setAdminLoading(false);
  };

  const confirmPayment = async (payment) => {
    setConfirming(payment.id);
    setConfirmError(null);
    try{
      const res = await fetch("/api/admin/confirm", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-admin-key": ADMIN_KEY},
        body: JSON.stringify({ paymentId: payment.id, email: payment.email })
      });
      const data = await res.json();
      if(data.success){
        setLastConfirmed({ ...data, paymentName: payment.name, paymentEmail: payment.email, paymentMobile: payment.mobile });
      } else {
        setConfirmError(data.error || "Something went wrong");
      }
      const refresh = await fetch("/api/admin/users", { headers:{"x-admin-key": ADMIN_KEY} });
      setAdminData(await refresh.json());
    }catch(e){ console.error(e); setConfirmError(e.message); }
    setConfirming(null);
  };

  const copyText = (text, key) => {
    try{ navigator.clipboard.writeText(text); setCopied(key); setTimeout(()=>setCopied(null),2000); }catch{}
  };

  const activatePro = async () => {
    if(!manualEmail.trim()||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail.trim())){ setConfirmError("Enter a valid email."); return; }
    setManualLoading(true); setManualResult(null); setConfirmError(null);
    try{
      const res = await fetch("/api/admin/activate", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-admin-key": ADMIN_KEY},
        body: JSON.stringify({ email: manualEmail.trim() })
      });
      const data = await res.json();
      if(data.success){
        setManualResult(data);
        setManualEmail("");
        const refresh = await fetch("/api/admin/users", { headers:{"x-admin-key": ADMIN_KEY} });
        setAdminData(await refresh.json());
      } else {
        setConfirmError(data.error || "Activation failed");
      }
    }catch(e){ setConfirmError(e.message); }
    setManualLoading(false);
  };

  if(!unlocked) return (
    <div style={{maxWidth:400,margin:"60px auto",padding:"0 24px"}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",padding:"0 0 20px",display:"flex",alignItems:"center",gap:6}}>← Back</button>
      <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"36px 28px",boxShadow:T.shadowMd,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>🔐</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,margin:"0 0 20px"}}>Admin Access</h2>
        <input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&tryUnlock()}
          placeholder="Admin password" style={{...inp,marginBottom:10}}/>
        {passErr&&<div style={{color:T.red,fontSize:13,marginBottom:10}}>{passErr}</div>}
        <button onClick={tryUnlock}
          style={{width:"100%",background:T.primary,color:"white",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
          Unlock →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:740,margin:"0 auto",padding:"24px 20px 80px"}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",padding:"0 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to Englishfool</button>

      {adminLoading&&<div style={{textAlign:"center",padding:"40px",color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⏳ Loading dashboard...</div>}

      {/* SUCCESS BANNER — stays visible after confirming */}
      {lastConfirmed&&(
        <div style={{background:T.greenBg,border:`2px solid ${T.greenBorder}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:T.shadow,position:"relative"}}>
          <button onClick={()=>setLastConfirmed(null)} style={{position:"absolute",top:10,right:12,background:"none",border:"none",fontSize:18,color:T.textMuted,cursor:"pointer",lineHeight:1}}>✕</button>
          <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.green,margin:"0 0 10px"}}>✅ Payment Confirmed — {lastConfirmed.paymentName}</h3>
          <div style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:6}}>
            {lastConfirmed.paymentEmail} · 📱 {lastConfirmed.paymentMobile}
          </div>
          {lastConfirmed.accountCreated&&(
            <div style={{background:"white",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:6}}>🆕 Account created with credentials:</div>
              <div style={{fontSize:14,fontFamily:"monospace",color:T.text,lineHeight:1.8}}>
                📧 {lastConfirmed.paymentEmail}<br/>
                🔑 {lastConfirmed.tempPassword}
              </div>
            </div>
          )}
          <div style={{background:"white",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:6}}>💬 WhatsApp message to send:</div>
            <div style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{lastConfirmed.whatsappMessage}</div>
          </div>
          <button onClick={()=>copyText(lastConfirmed.whatsappMessage,"confirmed")}
            style={{background:copied==="confirmed"?T.greenBg:T.primaryLight,border:`1px solid ${copied==="confirmed"?T.greenBorder:T.primaryBorder}`,borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,color:copied==="confirmed"?T.green:T.primary,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
            {copied==="confirmed"?"✓ Copied!":"📋 Copy WhatsApp Message"}
          </button>
        </div>
      )}

      {/* Error banner */}
      {confirmError&&(
        <div style={{background:T.redBg,border:`2px solid ${T.redBorder}`,borderRadius:12,padding:"16px 20px",marginBottom:20,position:"relative"}}>
          <button onClick={()=>setConfirmError(null)} style={{position:"absolute",top:8,right:12,background:"none",border:"none",fontSize:18,color:T.textMuted,cursor:"pointer"}}>✕</button>
          <div style={{fontSize:14,color:T.red,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>❌ Confirmation failed</div>
          <div style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",marginTop:4}}>{confirmError}</div>
        </div>
      )}

      {adminData&&(
        <>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
            {[["👥 Total Users",adminData.stats?.totalUsers,T.text],["⭐ Pro Users",adminData.stats?.proUsers,T.green],["⏳ Pending",adminData.stats?.pendingPayments,T.amber]].map(([label,val,color])=>(
              <div key={label} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px",textAlign:"center",boxShadow:T.shadow}}>
                <div style={{fontSize:28,fontWeight:900,color,fontFamily:"Georgia,serif"}}>{val||0}</div>
                <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",marginTop:4}}>{label}</div>
              </div>
            ))}
          </div>

          {/* Pending CLIQ Payments */}
          {adminData.payments?.filter(p=>p.status==="pending").length > 0 && (
            <div style={{background:T.bg,border:`2px solid ${T.amberBorder}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:T.shadow}}>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.amber,margin:"0 0 14px"}}>⏳ Pending CLIQ Payments ({adminData.payments.filter(p=>p.status==="pending").length})</h3>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {adminData.payments.filter(p=>p.status==="pending").map(p=>(
                  <div key={p.id} style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"14px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
                      <div>
                        <div style={{fontWeight:700,color:T.text,fontSize:14,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{p.name}</div>
                        <div style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{p.email} · 📱 {p.mobile}</div>
                        <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",marginTop:2}}>{p.amount} {p.currency} · {new Date(p.created_at).toLocaleString("en-GB")}</div>
                      </div>
                      <button onClick={()=>confirmPayment(p)} disabled={confirming===p.id}
                        style={{background:confirming===p.id?T.bgGray:T.green,color:confirming===p.id?T.textMuted:"white",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:confirming===p.id?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>
                        {confirming===p.id?"⏳ Creating account...":"✓ Confirm Payment"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual Pro Activation */}
          <div style={{background:T.bg,border:`2px solid ${T.primaryBorder}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:T.shadow}}>
            <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.primary,margin:"0 0 6px"}}>⚡ Activate Pro for Any Email</h3>
            <p style={{color:T.textMuted,fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:"0 0 14px",lineHeight:1.5}}>
              If user already has an account → upgrades to Pro instantly.<br/>
              If user doesn't have an account → creates one with a temp password you can send them.
            </p>
            <div style={{display:"flex",gap:8}}>
              <input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&activatePro()}
                placeholder="user@email.com" style={{...inp,flex:1}}/>
              <button onClick={activatePro} disabled={manualLoading}
                style={{background:manualLoading?T.bgGray:T.primary,color:manualLoading?T.textMuted:"white",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:manualLoading?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>
                {manualLoading?"⏳ Activating...":"⚡ Activate Pro"}
              </button>
            </div>
            {manualResult&&(
              <div style={{marginTop:14,background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:8}}>
                  ✅ {manualResult.accountCreated?"Account created & Pro activated":"Pro activated for existing user"}
                </div>
                {manualResult.accountCreated&&(
                  <div style={{background:"white",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"10px 14px",marginBottom:10}}>
                    <div style={{fontSize:13,fontFamily:"monospace",color:T.text,lineHeight:1.8}}>
                      📧 {manualResult.email}<br/>🔑 {manualResult.tempPassword}
                    </div>
                  </div>
                )}
                <div style={{background:"white",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"10px 14px",marginBottom:10}}>
                  <div style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>💬 WhatsApp message:</div>
                  <div style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{manualResult.whatsappMessage}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>copyText(manualResult.whatsappMessage,"manual")}
                    style={{background:copied==="manual"?T.greenBg:T.primaryLight,border:`1px solid ${copied==="manual"?T.greenBorder:T.primaryBorder}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,color:copied==="manual"?T.green:T.primary,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                    {copied==="manual"?"✓ Copied!":"📋 Copy Message"}
                  </button>
                  <button onClick={()=>setManualResult(null)}
                    style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.textMuted,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* All Users */}
          <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",boxShadow:T.shadow}}>
            <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 14px"}}>👥 All Users ({adminData.profiles?.length||0})</h3>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {adminData.profiles?.map(p=>(
                <div key={p.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:p.is_pro?T.greenBg:T.bgGray,borderRadius:8,border:`1px solid ${p.is_pro?T.greenBorder:T.border}`}}>
                  <span style={{fontSize:16}}>{p.is_pro?"⭐":"👤"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{p.name||"—"}</div>
                    <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.email}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:p.is_pro?T.green:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>{p.is_pro?"PRO":"Free"}</span>
                  <span style={{fontSize:11,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0}}>{new Date(p.created_at).toLocaleDateString("en-GB")}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// ── IELTS Speaking Page ──────────────────────
const SPEAKING_PART1 = [
  {topic:"Hometown",questions:[
    {q:"Where is your hometown?",a:"My hometown is Amman, the capital of Jordan. It's a bustling city built on several hills, with a fascinating mix of ancient ruins and modern developments. I've lived there most of my life and I'm quite attached to it."},
    {q:"What do you like about your hometown?",a:"What I appreciate most is the warmth of the people — there's a real sense of community. I also love the food scene; you can find incredible traditional dishes like mansaf and falafel on practically every street. The city has a unique character that blends tradition with modernity."},
    {q:"Is there anything you would like to change about your hometown?",a:"I'd definitely improve the public transport system. Currently, most people rely heavily on private cars, which leads to terrible traffic congestion during rush hour. A proper metro or tram network would make a huge difference to daily life."}
  ]},
  {topic:"Work & Studies",questions:[
    {q:"Do you work or study?",a:"I currently work in the education sector. I've been involved in coordinating English language examinations for the past few years. It's quite rewarding because I get to help students achieve their academic goals through proper certification."},
    {q:"What do you enjoy about your work?",a:"I particularly enjoy the problem-solving aspect. Every day brings different challenges, whether it's resolving logistical issues or finding creative solutions to help students. The variety keeps things interesting and I rarely feel bored."},
    {q:"Would you like to change your job in the future?",a:"I'm actually considering transitioning into business development. I feel my experience has given me strong interpersonal and analytical skills that would transfer well. Ideally, I'd like to combine my education background with commercial strategy."}
  ]},
  {topic:"Technology",questions:[
    {q:"How often do you use your phone?",a:"Honestly, I use it constantly throughout the day — probably more than I should. It's essentially my connection to work emails, social media, news, and messaging apps. I'd estimate I spend at least four or five hours on it daily."},
    {q:"Do you think people spend too much time on technology?",a:"Absolutely. I think there's a growing dependency on screens that's quite concerning. People scroll through social media instead of having real conversations. That said, technology also enables incredible things like remote work and instant access to education."},
    {q:"What technology do you find most useful?",a:"I'd say translation apps and AI tools have been game-changers for me. They help me communicate across language barriers and automate repetitive tasks. GPS navigation is another one — I genuinely don't know how people managed without it."}
  ]},
  {topic:"Food & Cooking",questions:[
    {q:"Do you enjoy cooking?",a:"Yes, I do actually. I find it quite therapeutic after a long day at work. I particularly enjoy experimenting with different cuisines — I've recently been trying my hand at Asian dishes, which require techniques quite different from Middle Eastern cooking."},
    {q:"What kind of food do you usually eat?",a:"My diet is fairly typical for the region — lots of rice, grilled meats, fresh salads, and olive oil. I try to incorporate vegetables into most meals, though I have a weakness for street food like shawarma and falafel sandwiches."},
    {q:"Have your eating habits changed over the years?",a:"Definitely. When I was younger, I ate whatever was convenient without thinking about nutrition. Now I'm much more conscious about what I consume. I've reduced my sugar intake significantly and try to avoid processed foods where possible."}
  ]},
  {topic:"Environment",questions:[
    {q:"Are you interested in protecting the environment?",a:"Yes, increasingly so. I've become much more aware of environmental issues in recent years, partly through media coverage and partly through visible changes in my own city. I try to reduce waste and conserve water, though I know I could do more."},
    {q:"What environmental problems are common in your country?",a:"Water scarcity is probably the most pressing issue. Jordan is one of the most water-scarce countries in the world. Air pollution from traffic and industrial activity is another growing concern, particularly in urban areas like Amman and Zarqa."},
    {q:"Do you think individuals can make a difference to the environment?",a:"I believe individual actions matter collectively. If millions of people make small changes — reducing plastic use, conserving energy, choosing public transport — the cumulative impact is significant. However, systemic change through government policy is equally essential."}
  ]},
  {topic:"Social Media",questions:[
    {q:"Which social media platforms do you use?",a:"I mainly use Instagram for browsing content and WhatsApp for daily communication. I also check Facebook occasionally, though less than I used to. For professional networking, I sometimes browse LinkedIn to stay updated on industry trends."},
    {q:"Do you think social media has more advantages or disadvantages?",a:"It's a double-edged sword, honestly. The advantages include instant communication, access to global news, and networking opportunities. But the disadvantages — misinformation, addiction, and the negative impact on mental health — are equally significant."},
    {q:"How has social media changed the way people communicate?",a:"It's fundamentally transformed communication. People now prefer sending voice messages over making phone calls, and group chats have replaced many face-to-face social gatherings. While it's made staying in touch easier, I think the quality of interactions has somewhat diminished."}
  ]}
];

const SPEAKING_PART2 = [
  {topic:"Describe a book that left a lasting impression on you",
   cue:"You should say:\n• what the book is about\n• when and why you read it\n• what you learned from it\nAnd explain why it left a lasting impression.",
   model:"I'd like to talk about a book called 'Sapiens: A Brief History of Humankind' by Yuval Noah Harari. I first came across it about three years ago when a colleague recommended it during a casual conversation at work.\n\nThe book essentially traces the entire history of our species, from the earliest humans in East Africa to the present day. What makes it remarkable is how Harari connects seemingly unrelated events and ideas — agriculture, religion, capitalism, and science — into a single coherent narrative about human progress.\n\nI read it over the course of about two weeks, mostly during my commute and before bed. What struck me most was the chapter on the Agricultural Revolution, which Harari controversially calls 'history's biggest fraud.' He argues that farming actually made life harder for most humans, not easier, which completely challenged my assumptions.\n\nThe reason this book left such a lasting impression is that it fundamentally changed how I think about civilization. Before reading it, I took so many aspects of modern life for granted — money, nations, human rights. Harari showed me that these are all shared fictions that humans collectively agreed to believe in. That perspective shift has stayed with me ever since and influenced how I understand current events and social structures."},
  {topic:"Describe a memorable trip you have taken",
   cue:"You should say:\n• where you went\n• who you went with\n• what you did there\nAnd explain why it was memorable.",
   model:"I'd like to describe a trip I took to Istanbul, Turkey, about two years ago with a group of close friends. It was a five-day trip that we'd been planning for months, and it exceeded all our expectations.\n\nWe stayed in the Sultanahmet district, which is the historical heart of the city. During our time there, we visited iconic landmarks like the Blue Mosque, Hagia Sophia, and the Grand Bazaar. The architecture was absolutely breathtaking — I remember standing inside Hagia Sophia and being completely overwhelmed by the sheer scale and beauty of the dome.\n\nWhat made the trip particularly special was the food. Turkish cuisine is phenomenal — we ate our way through kebabs, baklava, and fresh fish by the Bosphorus. One evening, we took a boat cruise along the strait at sunset, and watching the sun go down behind the silhouette of minarets and modern skyscrapers was truly magical.\n\nThe reason this trip is so memorable is that it was the first time our friend group had travelled internationally together. There's something about sharing those 'wow' moments with people you care about that amplifies the experience. We still talk about that trip regularly, and it strengthened our friendships in a way that ordinary daily life simply can't."},
  {topic:"Describe a person who has influenced you",
   cue:"You should say:\n• who this person is\n• how you know them\n• what they have done\nAnd explain why they influenced you.",
   model:"The person who has influenced me most profoundly is my high school English teacher, Mr. Khalil. I first met him when I was around fifteen years old, and he taught me for three consecutive years until I graduated.\n\nWhat set Mr. Khalil apart from other teachers was his genuine passion for the English language and his unconventional teaching methods. Rather than simply following the textbook, he would bring in newspaper articles, song lyrics, and even stand-up comedy clips to make lessons engaging. He believed that language should be lived, not just memorised.\n\nOne thing he did that really impacted me was starting a debating club after school hours. He would stay late voluntarily, giving up his free time to help students like me build confidence in public speaking. Through those sessions, I went from being someone who dreaded speaking in front of others to actually enjoying it.\n\nThe reason he influenced me so significantly is that he showed me the power of effective communication. He taught me that being able to express your ideas clearly in English opens doors that would otherwise remain firmly shut. That lesson has guided many of my career decisions since, including my current work in the education sector. I genuinely believe that without his encouragement, my life trajectory would have been quite different."},
  {topic:"Describe a goal you want to achieve in the future",
   cue:"You should say:\n• what the goal is\n• when you hope to achieve it\n• what steps you need to take\nAnd explain why this goal is important to you.",
   model:"A goal I'm determined to achieve within the next two years is launching my own online education platform that helps Arabic-speaking students prepare for English proficiency exams like IELTS.\n\nThe idea has been brewing in my mind for quite some time, largely because I've seen firsthand how many students in the region struggle with test preparation. Many either can't afford expensive courses or don't have access to quality resources in their area.\n\nTo achieve this, I need to take several concrete steps. First, I need to develop the platform itself — the website, the content, and the AI-powered tools that would give students personalised feedback. Second, I need to create a sustainable business model, probably a freemium approach where basic features are free but advanced ones require a subscription. Finally, I need to market it effectively, particularly through social media channels that are popular in the Arab world.\n\nThis goal is important to me because I genuinely believe that education should be accessible regardless of your location or financial situation. Growing up in Jordan, I saw talented students whose potential was limited simply because they couldn't access the right resources. If my platform can bridge that gap even slightly, I'll consider it a success worth pursuing."},
  {topic:"Describe a useful skill you learned recently",
   cue:"You should say:\n• what the skill is\n• how you learned it\n• how long it took to learn\nAnd explain why it is useful.",
   model:"A skill I've recently picked up is basic web development — specifically, building websites using React and JavaScript. I started learning about six months ago, primarily through online tutorials and by working hands-on with actual projects.\n\nThe learning process was challenging but rewarding. I began with the fundamentals of HTML and CSS, which took about a month to feel comfortable with. Then I moved on to JavaScript, which was significantly more complex — understanding concepts like functions, arrays, and asynchronous programming required genuine effort and many late nights of trial and error.\n\nWhat motivated me to learn this skill was a specific need: I wanted to build an educational tool but couldn't afford to hire a professional developer. So I decided to teach myself. The process involved watching YouTube tutorials, reading documentation, and most importantly, building things and breaking them repeatedly until I understood how they worked.\n\nThis skill has been incredibly useful because it's given me a form of creative independence. Instead of waiting for someone else to build what I envision, I can prototype ideas myself. It's also improved my problem-solving abilities and logical thinking in ways that benefit me beyond just coding. I'd strongly recommend anyone in today's digital age to learn at least the basics of programming."},
  {topic:"Describe a place in your country that you would recommend to visitors",
   cue:"You should say:\n• where it is\n• what people can see and do there\n• how to get there\nAnd explain why you would recommend it.",
   model:"I would wholeheartedly recommend Petra to anyone visiting Jordan. It's located in the southern part of the country, about three hours by car from Amman, and it's genuinely one of the most awe-inspiring places I've ever visited.\n\nPetra is an ancient Nabataean city carved directly into rose-red cliff faces over two thousand years ago. The most famous structure is the Treasury, or Al-Khazneh, which most people recognise from Indiana Jones films. But there's so much more beyond that — monasteries, royal tombs, a Roman-style theatre, and kilometres of carved facades stretching through narrow canyons called the Siq.\n\nVisitors can explore on foot, or hire a local guide for a more informative experience. There are also options to ride horses or camels through certain sections. I'd recommend dedicating at least two full days, as there's far too much to see in a single day trip. The best time to visit is during spring or autumn when the weather is mild.\n\nThe reason I'd recommend Petra above all other places in Jordan is that it offers a genuinely unique experience that you simply cannot replicate anywhere else in the world. Standing in front of the Treasury at sunrise, watching the light gradually illuminate the carved stone, is a moment of pure wonder. It's a UNESCO World Heritage Site and one of the New Seven Wonders of the World for very good reason."}
];

const SPEAKING_PART3 = [
  {topic:"Books & Reading (related to Part 2: Book)",questions:[
    {q:"Do you think young people read less than previous generations?",a:"There's definitely been a shift in reading habits. Young people today consume enormous amounts of text through social media and online articles, but sustained reading of books has declined. I think the issue isn't that they read less overall — it's that they read differently, in shorter bursts rather than extended sessions."},
    {q:"How has technology changed the way people read?",a:"Technology has transformed reading fundamentally. E-readers and audiobooks have made literature more accessible, which is positive. However, the constant notifications and multitasking culture mean people's attention spans have shortened considerably. Many struggle to sit with a book for an hour without checking their phone."},
    {q:"Should governments do more to encourage reading?",a:"Absolutely. Public libraries should be better funded and modernised, and reading programmes in schools should be prioritised. In many developing countries, access to quality books remains limited. Government initiatives like free digital libraries or subsidised book fairs could make a real difference in fostering a reading culture."}
  ]},
  {topic:"Travel & Tourism (related to Part 2: Trip)",questions:[
    {q:"What are the benefits of international travel?",a:"International travel broadens your perspective enormously. It exposes you to different cultures, cuisines, and ways of thinking that challenge your assumptions. It also develops practical skills like adaptability, communication, and independence. There's something about navigating an unfamiliar country that builds confidence in ways that staying home simply cannot."},
    {q:"Do you think tourism can harm local communities?",a:"It certainly can, yes. Over-tourism can drive up property prices, displacing local residents. It can also lead to environmental degradation and the commodification of culture, where traditions are performed for tourists rather than practised authentically. However, with responsible planning and regulation, tourism can be a powerful economic driver without these negative effects."},
    {q:"How might travel change in the future?",a:"I think we'll see a significant shift towards sustainable and experiential travel. Travellers are increasingly conscious of their carbon footprint, so eco-tourism and slow travel will likely grow. Virtual reality might also play a role, allowing people to explore destinations remotely, though I doubt it will ever replace the real thing entirely."}
  ]},
  {topic:"Education & Learning (related to Part 2: Person who influenced you)",questions:[
    {q:"What qualities make a good teacher?",a:"Beyond subject knowledge, I think the most important quality is genuine enthusiasm. Students can immediately sense whether a teacher truly cares about their subject and their students' progress. Patience, creativity in explaining difficult concepts, and the ability to adapt to different learning styles are equally crucial."},
    {q:"Is the education system in your country effective?",a:"It has strengths and weaknesses. The emphasis on academic achievement produces students with strong foundational knowledge, particularly in mathematics and sciences. However, the system is heavily exam-focused, which can stifle creativity and critical thinking. There's also insufficient attention given to practical skills like financial literacy, coding, and public speaking."},
    {q:"How has education changed compared to 50 years ago?",a:"The transformation has been dramatic. Technology has made information universally accessible, whereas fifty years ago, knowledge was largely confined to classrooms and libraries. Teaching methods have also evolved from pure lecture-based instruction to more interactive, student-centred approaches. However, the fundamental goal remains the same — preparing young people for productive, fulfilling lives."}
  ]},
  {topic:"Technology & Society (related to Part 2: Useful skill)",questions:[
    {q:"Do you think AI will replace human workers?",a:"AI will certainly replace some jobs, particularly those involving repetitive, routine tasks. However, I believe it will also create entirely new roles that we can't even imagine yet. The key challenge is ensuring that workers who are displaced have access to retraining programmes. Jobs requiring creativity, emotional intelligence, and complex problem-solving will remain firmly human."},
    {q:"Should children learn programming in school?",a:"I strongly believe they should. Programming teaches logical thinking and problem-solving, which are valuable regardless of whether someone pursues a tech career. In today's digital world, understanding how technology works gives you a significant advantage. It should be introduced alongside traditional subjects like mathematics and science."},
    {q:"What are the dangers of relying too heavily on technology?",a:"The most concerning danger is the erosion of fundamental human skills — handwriting, mental arithmetic, navigation without GPS, even face-to-face social interaction. There's also the cybersecurity risk: as our lives become increasingly digital, we become more vulnerable to hacking, data breaches, and identity theft. A balanced approach is essential."}
  ]},
  {topic:"Environment & Sustainability (related to Part 2: Place in your country)",questions:[
    {q:"Who should take more responsibility for protecting the environment — individuals or governments?",a:"Both have crucial roles, but I believe governments bear the greater responsibility. They have the power to implement policies, regulate industries, and invest in renewable energy infrastructure. Individual actions matter, but they're insufficient without systemic change. You can't recycle your way out of climate change if corporations continue polluting unchecked."},
    {q:"What environmental issues will future generations face?",a:"Water scarcity will likely become the defining challenge. As populations grow and climate patterns shift, access to clean water will become increasingly contested. Rising sea levels threatening coastal cities, biodiversity loss, and extreme weather events are other major concerns. Future generations will need innovative solutions that we should be developing right now."},
    {q:"How can tourism become more environmentally friendly?",a:"Several approaches would help. Airlines need to transition to sustainable fuels, hotels should implement strict energy and water conservation practices, and tourists themselves should be educated about minimising their environmental footprint. Supporting local businesses rather than international chains also keeps economic benefits within the community while reducing the supply chain's carbon impact."}
  ]}
];

const SPEAKING_VOCABULARY = [
  {category:"Expressing Opinions",words:["In my view / From my perspective","I firmly believe that...","I'm inclined to think that...","As far as I'm concerned...","I'd argue that...","To my mind...","I'm of the opinion that...","It seems to me that..."]},
  {category:"Agreeing & Disagreeing",words:["I couldn't agree more","That's precisely my point","I see where you're coming from, but...","I'm not entirely convinced that...","With all due respect, I disagree","That's a fair point, however...","I take your point, but on the other hand..."]},
  {category:"Giving Examples",words:["A case in point is...","For instance / For example","To illustrate this point...","Take X, for example","This is evident in...","A prime example of this is...","One notable illustration is..."]},
  {category:"Comparing & Contrasting",words:["In contrast to / Unlike...","Similarly / Likewise / By the same token","On the other hand / Conversely","Whereas / While","Having said that...","Compared to / In comparison with","The main difference lies in..."]},
  {category:"Cause & Effect",words:["This has led to / resulted in...","As a consequence / As a result","The primary reason for this is...","This stems from / is rooted in...","One contributing factor is...","This has had a profound impact on...","Due to / Owing to / On account of..."]},
  {category:"Hedging & Softening",words:["It's generally considered that...","There's a tendency to...","This isn't necessarily the case","It depends on the circumstances","To some extent / To a certain degree","This is somewhat debatable","It's worth noting that..."]},
  {category:"Time & Frequency",words:["On a regular/daily basis","From time to time / Every now and then","Throughout my childhood/career","Over the past few years","In recent times / Nowadays","Back in the day / In the old days","For the foreseeable future"]},
  {category:"Describing Trends",words:["There's been a noticeable shift towards...","X has become increasingly popular","There's a growing tendency to...","X is on the rise / on the decline","X has undergone significant changes","The trend seems to be moving towards...","This phenomenon is becoming more widespread"]}
];

const SPEAKING_TIPS = [
  {title:"Extend your answers naturally",desc:"Never give one-word answers. Aim for 3-4 sentences in Part 1. Use the formula: Direct answer → Reason → Example or Detail. This shows the examiner your ability to speak at length."},
  {title:"Don't memorise scripts",desc:"Examiners are trained to detect memorised answers and will penalise you. Instead, practise talking about topics using your own words and experiences. Natural hesitations are perfectly acceptable."},
  {title:"Use a range of tenses",desc:"Demonstrate your grammatical range by naturally incorporating past, present, and future tenses. For example: 'I used to... but now I... and in the future I plan to...'"},
  {title:"Self-correct confidently",desc:"If you make a mistake, correct yourself naturally: 'I went to — sorry, I mean I have been to...' This actually shows the examiner you have good language awareness."},
  {title:"Don't be afraid of Part 2 preparation time",desc:"Use the full 1 minute to make notes. Jot down key points for each bullet on the card. Don't write full sentences — just trigger words that will remind you what to say."},
  {title:"Part 3 is a discussion, not an interrogation",desc:"Treat Part 3 like a conversation. Give developed answers with examples. It's fine to say 'That's an interesting question, let me think about that...' before responding."},
  {title:"Pronunciation matters more than accent",desc:"You won't be penalised for having any accent. Focus on clear pronunciation, proper word stress, and natural intonation patterns. Practise problematic sounds specific to your first language."},
  {title:"Ask for clarification if needed",desc:"It's perfectly acceptable to say 'Could you rephrase that?' or 'Do you mean...?' This is better than guessing and answering a different question entirely."}
];

const SPEAKING_MISTAKES = [
  {mistake:"Giving very short answers",fix:"Part 1: 3-4 sentences. Part 2: fill the full 2 minutes. Part 3: develop your answers with reasons and examples."},
  {mistake:"Speaking too fast or too slowly",fix:"Aim for a natural, conversational pace. If you speak too fast, you'll make more errors. Too slow suggests limited fluency."},
  {mistake:"Overusing 'I think'",fix:"Vary your opinion phrases: 'In my view,' 'I'd say,' 'From my experience,' 'As far as I'm concerned,' 'Personally speaking.'"},
  {mistake:"Not answering the question directly",fix:"Start with a direct response, then expand. Don't go off on tangents before addressing what was actually asked."},
  {mistake:"Using informal language exclusively",fix:"Show range by mixing formal and informal register: 'That totally depends' → 'That largely depends on the circumstances.'"},
  {mistake:"Panicking when you don't know a word",fix:"Paraphrase! Describe the concept: 'I can't think of the exact word, but it's like a...' This demonstrates communicative competence."},
  {mistake:"Repeating the question in your answer",fix:"Paraphrase instead: Q: 'Do you like reading?' → 'Yes, I'm quite an avid reader' NOT 'Yes, I like reading.'"},
  {mistake:"Not using linking words",fix:"Connect ideas with: 'However,' 'Moreover,' 'In addition,' 'On the other hand,' 'Having said that.' This improves coherence scores."}
];

const SPEAKING_VIDEOS = [
  {title:"IELTS Speaking Part 1 — Practice with IDP",url:"https://www.youtube.com/embed/VIDEO_PLACEHOLDER_1",desc:"Official IDP practice video showing Part 1 interview format and strategies."},
  {title:"IELTS Speaking Part 2 — Long Turn Practice",url:"https://www.youtube.com/embed/VIDEO_PLACEHOLDER_2",desc:"See how to prepare and deliver a 2-minute talk on a cue card topic."},
  {title:"IELTS Speaking Part 3 — Discussion Practice",url:"https://www.youtube.com/embed/VIDEO_PLACEHOLDER_3",desc:"Practice the two-way discussion format with abstract questions."},
  {title:"Band 9 IELTS Speaking — Full Test Example",url:"https://www.youtube.com/embed/V7oM7wG5Czg",desc:"Watch a complete IELTS Speaking test scored at Band 9 with examiner commentary."},
  {title:"Band 6 vs Band 8 — What's the Difference?",url:"https://www.youtube.com/embed/0zuMPRGnmkY",desc:"See the key differences between a Band 6 and Band 8 speaking performance."},
  {title:"Common Speaking Mistakes to Avoid",url:"https://www.youtube.com/embed/cRD6Fv3aAJY",desc:"Learn the most frequent mistakes that cost candidates marks in the speaking test."}
];

const SpeakingPage = ({isPro, onUpgrade}) => {
  const [tab, setTab] = useState("examples");
  const [expandedP1, setExpandedP1] = useState(null);
  const [expandedP2, setExpandedP2] = useState(null);
  const [expandedP3, setExpandedP3] = useState(null);
  const [showAnswer, setShowAnswer] = useState({});

  const tabs = [
    {id:"examples",label:"📝 Examples & Answers",free:true},
    {id:"vocabulary",label:"📚 Vocabulary",free:false},
    {id:"tips",label:"💡 Tips & Strategies",free:true},
    {id:"mistakes",label:"⚠️ Common Mistakes",free:true},
    {id:"videos",label:"🎬 Video Examples",free:true}
  ];
  const toggleAnswer = (key) => setShowAnswer(prev=>({...prev,[key]:!prev[key]}));
  const sty = {fontFamily:"'Source Sans Pro','Inter',system-ui"};
  const card = {background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",marginBottom:16,boxShadow:T.shadow};
  const locked = (free) => !free && !isPro;

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px 60px"}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:28,color:T.text,margin:"0 0 6px"}}>🗣️ IELTS Speaking</h1>
      <p style={{...sty,fontSize:14,color:T.textMuted,margin:"0 0 20px",lineHeight:1.5}}>Prepare for all three parts of the IELTS Speaking test with model answers, vocabulary, tips, and video examples.</p>

      {/* Tab bar */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:24,paddingBottom:4}} className="tab-row">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{if(locked(t.free)){onUpgrade();}else{setTab(t.id);}}}
            style={{background:tab===t.id?T.primaryLight:"white",border:`1px solid ${tab===t.id?T.primaryBorder:T.border}`,borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:tab===t.id?700:500,color:tab===t.id?T.primary:T.textMid,cursor:"pointer",...sty,whiteSpace:"nowrap",flexShrink:0}}>
            {locked(t.free)?"🔒 ":""}{t.label}
          </button>
        ))}
      </div>

      {/* EXAMPLES TAB */}
      {tab==="examples"&&(
        <div>
          {/* Part 1 */}
          <div style={card}>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 4px"}}>Part 1 — Introduction & Interview</h2>
            <p style={{...sty,fontSize:13,color:T.textMuted,margin:"0 0 16px"}}>4-5 minutes · Personal questions on familiar topics · Answer in 3-4 sentences</p>
            {SPEAKING_PART1.map((topic,i)=>(
              <div key={i} style={{marginBottom:12}}>
                <button onClick={()=>setExpandedP1(expandedP1===i?null:i)} style={{width:"100%",textAlign:"left",background:expandedP1===i?T.primaryLight:T.bgGray,border:`1px solid ${expandedP1===i?T.primaryBorder:T.border}`,borderRadius:8,padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",...sty,fontSize:14,fontWeight:600,color:expandedP1===i?T.primary:T.text}}>
                  {topic.topic} <span style={{fontSize:12}}>{expandedP1===i?"▼":"▶"}</span>
                </button>
                {expandedP1===i&&(
                  <div style={{padding:"12px 16px",borderLeft:`3px solid ${T.primaryBorder}`}}>
                    {topic.questions.map((qa,j)=>(
                      <div key={j} style={{marginBottom:14}}>
                        <div style={{...sty,fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Q: {qa.q}</div>
                        <button onClick={()=>toggleAnswer(`p1-${i}-${j}`)} style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:6,padding:"6px 12px",fontSize:12,fontWeight:600,color:T.green,cursor:"pointer",...sty,marginBottom:6}}>
                          {showAnswer[`p1-${i}-${j}`]?"Hide Model Answer":"Show Model Answer"}
                        </button>
                        {showAnswer[`p1-${i}-${j}`]&&(
                          <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 14px",...sty,fontSize:13,color:T.textMid,lineHeight:1.7}}>{qa.a}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Part 2 */}
          <div style={card}>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 4px"}}>Part 2 — Long Turn (Cue Card)</h2>
            <p style={{...sty,fontSize:13,color:T.textMuted,margin:"0 0 16px"}}>3-4 minutes · 1 minute preparation + 2 minutes speaking · Talk about a specific topic</p>
            {SPEAKING_PART2.slice(0, isPro?SPEAKING_PART2.length:3).map((item,i)=>(
              <div key={i} style={{marginBottom:12}}>
                <button onClick={()=>setExpandedP2(expandedP2===i?null:i)} style={{width:"100%",textAlign:"left",background:expandedP2===i?T.amberBg:T.bgGray,border:`1px solid ${expandedP2===i?T.amberBorder:T.border}`,borderRadius:8,padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",...sty,fontSize:14,fontWeight:600,color:expandedP2===i?T.amber:T.text}}>
                  {item.topic} <span style={{fontSize:12}}>{expandedP2===i?"▼":"▶"}</span>
                </button>
                {expandedP2===i&&(
                  <div style={{padding:"14px 16px",borderLeft:`3px solid ${T.amberBorder}`}}>
                    <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"14px",...sty,fontSize:13,color:T.textMid,lineHeight:1.7,whiteSpace:"pre-line",marginBottom:12}}>
                      <strong style={{color:T.amber}}>📋 Cue Card:</strong><br/>{item.cue}
                    </div>
                    <button onClick={()=>toggleAnswer(`p2-${i}`)} style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:6,padding:"6px 12px",fontSize:12,fontWeight:600,color:T.green,cursor:"pointer",...sty,marginBottom:6}}>
                      {showAnswer[`p2-${i}`]?"Hide Model Answer":"Show Band 8+ Model Answer"}
                    </button>
                    {showAnswer[`p2-${i}`]&&(
                      <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"14px",...sty,fontSize:13,color:T.textMid,lineHeight:1.7,whiteSpace:"pre-line"}}>{item.model}</div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!isPro&&<div style={{textAlign:"center",padding:"12px",...sty,fontSize:13,color:T.amber,fontWeight:600}}>🔒 {SPEAKING_PART2.length-3} more cue cards available with Pro · <button onClick={onUpgrade} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",...sty,fontSize:13,textDecoration:"underline"}}>Upgrade</button></div>}
          </div>

          {/* Part 3 */}
          <div style={card}>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 4px"}}>Part 3 — Two-Way Discussion</h2>
            <p style={{...sty,fontSize:13,color:T.textMuted,margin:"0 0 16px"}}>4-5 minutes · Abstract questions related to Part 2 topic · Give developed, analytical answers</p>
            {SPEAKING_PART3.slice(0, isPro?SPEAKING_PART3.length:2).map((set,i)=>(
              <div key={i} style={{marginBottom:12}}>
                <button onClick={()=>setExpandedP3(expandedP3===i?null:i)} style={{width:"100%",textAlign:"left",background:expandedP3===i?T.blueBg:T.bgGray,border:`1px solid ${expandedP3===i?T.blueBorder:T.border}`,borderRadius:8,padding:"12px 16px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",...sty,fontSize:14,fontWeight:600,color:expandedP3===i?T.blue:T.text}}>
                  {set.topic} <span style={{fontSize:12}}>{expandedP3===i?"▼":"▶"}</span>
                </button>
                {expandedP3===i&&(
                  <div style={{padding:"12px 16px",borderLeft:`3px solid ${T.blueBorder}`}}>
                    {set.questions.map((qa,j)=>(
                      <div key={j} style={{marginBottom:14}}>
                        <div style={{...sty,fontSize:14,fontWeight:700,color:T.text,marginBottom:6}}>Q: {qa.q}</div>
                        <button onClick={()=>toggleAnswer(`p3-${i}-${j}`)} style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:6,padding:"6px 12px",fontSize:12,fontWeight:600,color:T.green,cursor:"pointer",...sty,marginBottom:6}}>
                          {showAnswer[`p3-${i}-${j}`]?"Hide":"Show Model Answer"}
                        </button>
                        {showAnswer[`p3-${i}-${j}`]&&(
                          <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 14px",...sty,fontSize:13,color:T.textMid,lineHeight:1.7}}>{qa.a}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!isPro&&<div style={{textAlign:"center",padding:"12px",...sty,fontSize:13,color:T.amber,fontWeight:600}}>🔒 {SPEAKING_PART3.length-2} more discussion sets available with Pro · <button onClick={onUpgrade} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",...sty,fontSize:13,textDecoration:"underline"}}>Upgrade</button></div>}
          </div>
        </div>
      )}

      {/* VOCABULARY TAB */}
      {tab==="vocabulary"&&isPro&&(
        <div>
          {SPEAKING_VOCABULARY.map((cat,i)=>(
            <div key={i} style={card}>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.primary,margin:"0 0 12px"}}>{cat.category}</h3>
              <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                {cat.words.map((w,j)=>(
                  <span key={j} style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:6,padding:"6px 12px",...sty,fontSize:13,color:T.primary,fontWeight:500}}>{w}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TIPS TAB */}
      {tab==="tips"&&(
        <div>
          {SPEAKING_TIPS.map((tip,i)=>(
            <div key={i} style={card}>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:16,color:T.text,margin:"0 0 6px"}}>{i+1}. {tip.title}</h3>
              <p style={{...sty,fontSize:14,color:T.textMid,margin:0,lineHeight:1.6}}>{tip.desc}</p>
            </div>
          ))}
        </div>
      )}

      {/* MISTAKES TAB */}
      {tab==="mistakes"&&(
        <div>
          {SPEAKING_MISTAKES.map((m,i)=>(
            <div key={i} style={{...card,display:"flex",gap:16,alignItems:"flex-start"}}>
              <div style={{flexShrink:0,width:32,height:32,background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:T.red}}>{i+1}</div>
              <div>
                <div style={{...sty,fontSize:14,fontWeight:700,color:T.red,marginBottom:4}}>❌ {m.mistake}</div>
                <div style={{...sty,fontSize:14,color:T.green,fontWeight:600}}>✅ {m.fix}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIDEOS TAB */}
      {tab==="videos"&&(
        <div>
          <div style={{...card,background:T.amberBg,border:`1px solid ${T.amberBorder}`}}>
            <p style={{...sty,fontSize:13,color:T.amber,margin:0}}>💡 Watch these videos to understand the speaking test format, see real examples, and learn from examiner feedback. Try answering the questions yourself before watching the model answers.</p>
          </div>
          {SPEAKING_VIDEOS.map((v,i)=>(
            <div key={i} style={card}>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:16,color:T.text,margin:"0 0 6px"}}>{v.title}</h3>
              <p style={{...sty,fontSize:13,color:T.textMuted,margin:"0 0 12px"}}>{v.desc}</p>
              {v.url.includes("PLACEHOLDER")?(
                <div style={{background:T.bgGray,borderRadius:8,padding:"40px 20px",textAlign:"center",...sty,fontSize:13,color:T.textMuted}}>🎬 Video coming soon — search "{v.title}" on YouTube for similar content</div>
              ):(
                <div style={{position:"relative",paddingBottom:"56.25%",height:0,borderRadius:8,overflow:"hidden"}}>
                  <iframe src={v.url} title={v.title} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none"}} allowFullScreen/>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── IELTS Reading Page ──────────────────────
const READING_STRATEGIES = [
  {type:"True / False / Not Given",strategy:"Read the statement carefully. Find the relevant section in the passage. TRUE = the passage confirms the statement. FALSE = the passage contradicts the statement. NOT GIVEN = the passage doesn't mention this information at all. Don't use your own knowledge — only what's in the text.",tip:"'Not Given' means the information simply isn't there. If you can't find it after 2 minutes, it's probably Not Given."},
  {type:"Yes / No / Not Given",strategy:"Similar to T/F/NG but about the WRITER'S OPINIONS, not facts. YES = the writer agrees with the statement. NO = the writer disagrees. NOT GIVEN = the writer doesn't express an opinion on this. Look for opinion language: 'I believe', 'It is clear that', 'arguably', etc.",tip:"Pay close attention to who holds the opinion. The writer's view may differ from experts quoted in the passage."},
  {type:"Multiple Choice",strategy:"Read the question and all options before searching the text. Eliminate obviously wrong answers first. The correct answer is usually a paraphrase of the text, not an exact quote. Be careful of options that are true but don't answer the specific question asked.",tip:"Questions follow the order of the text. If Q3 answer is in paragraph 4, Q4 will be in paragraph 4 or later."},
  {type:"Matching Headings",strategy:"Read each paragraph and identify its MAIN IDEA (not just a detail). The heading should summarise the whole paragraph, not just one sentence. Cross out headings as you use them. Start with the easiest paragraphs first.",tip:"Beware of headings that match a detail in the paragraph rather than the main idea. Read the whole paragraph before choosing."},
  {type:"Sentence Completion",strategy:"Identify keywords in the incomplete sentence. Scan the passage for those keywords or their synonyms. The answer must be grammatically correct when inserted. Follow word count limits exactly (e.g., 'NO MORE THAN TWO WORDS').",tip:"Copy words exactly as they appear in the passage. Don't change the form (e.g., don't change 'increased' to 'increasing')."},
  {type:"Summary Completion",strategy:"Read the entire summary first to understand the topic. Identify the section of the passage it relates to. Fill in gaps using words from the passage or from a given list. Check grammar and word count limits.",tip:"If given a word list, eliminate options as you use them. If taking words from the passage, they must be exact."},
  {type:"Matching Information",strategy:"Read all the statements first and underline keywords. Scan each paragraph for the information described. A paragraph can be used more than once (unless stated otherwise). Focus on finding specific details, examples, or explanations.",tip:"This is a scanning exercise. Don't read every word — look for specific information that matches the statements."},
  {type:"Diagram / Flowchart / Table Completion",strategy:"Study the diagram/flowchart/table carefully first. Identify what type of information is missing (noun, verb, number). Find the relevant section of the passage. Answers usually come in order from the passage.",tip:"Look at what's already filled in to understand the pattern and what type of word is needed."}
];

const READING_TIME_TIPS = [
  "Use the 15-20-25 rule: spend 15 minutes on Passage 1, 20 on Passage 2, and 25 on Passage 3 (it's the hardest).",
  "Skim each passage for 2-3 minutes before looking at questions. Get the main idea of each paragraph.",
  "Read questions FIRST for detail-oriented types (T/F/NG, sentence completion) so you know what to look for.",
  "Read headings AFTER reading paragraphs for matching headings questions.",
  "Never leave a blank — there's no penalty for wrong answers. Always guess if unsure.",
  "If stuck on a question for more than 90 seconds, mark it and move on. Come back to it later.",
  "Don't read every word. Skim for main ideas and scan for specific keywords.",
  "Underline keywords in questions before searching the passage.",
  "Answers for most question types follow the order of the passage.",
  "Practice with a timer regularly. Time pressure is the #1 challenge in IELTS Reading."
];

const ACADEMIC_TESTS = [
  {id:1,title:"The Science of Sleep",passages:[
    {title:"The Architecture of Sleep",text:"Sleep, far from being a passive state of unconsciousness, is an active and highly structured neurological process that scientists are only now beginning to fully understand. Research over the past two decades has revealed that sleep consists of distinct stages, each serving unique biological functions essential for human health and cognitive performance.\n\nThe sleep cycle is divided into two main categories: non-rapid eye movement (NREM) sleep and rapid eye movement (REM) sleep. NREM sleep is further subdivided into three stages. Stage 1 is a transitional period lasting only a few minutes, during which the body begins to relax and brain activity starts to slow. Stage 2 represents a deeper level of sleep characterised by specific brain wave patterns known as sleep spindles and K-complexes. Stage 3, often called deep sleep or slow-wave sleep, is the most restorative phase, during which the body repairs tissues, strengthens the immune system, and consolidates memories.\n\nREM sleep typically occurs approximately 90 minutes after falling asleep and recurs in increasingly longer periods throughout the night. During REM sleep, the brain becomes remarkably active — in some respects more active than during waking hours. The eyes move rapidly beneath closed lids, breathing becomes irregular, and heart rate increases. Most vivid dreaming occurs during this stage. Paradoxically, the body's voluntary muscles become temporarily paralysed, a phenomenon called atonia, which prevents individuals from physically acting out their dreams.\n\nModern sleep research has established that adults typically require between seven and nine hours of sleep per night for optimal functioning. However, studies conducted by the University of California found that approximately one percent of the population carries a genetic mutation that allows them to function normally on just six hours of sleep. These so-called 'short sleepers' do not experience the cognitive impairments that affect most people who are sleep-deprived.\n\nThe consequences of chronic sleep deprivation extend far beyond simple tiredness. Research published in the journal Nature has demonstrated that even moderate sleep restriction — sleeping six hours instead of eight for two weeks — produces cognitive impairments equivalent to staying awake for 48 hours continuously. These impairments affect attention, working memory, and decision-making abilities, yet individuals who are chronically sleep-deprived often fail to recognise the extent of their own impairment.\n\nPerhaps most concerning is the relationship between sleep and long-term health. Epidemiological studies have consistently linked insufficient sleep to increased risk of cardiovascular disease, obesity, diabetes, and weakened immune function. Professor Matthew Walker of the University of California, Berkeley, whose research has been particularly influential in this field, has argued that sleep deprivation is now so widespread in industrialised societies that it constitutes a public health epidemic.",
    questions:[
      {type:"tfng",q:"Sleep is essentially a passive state where the body shuts down.",a:"FALSE"},
      {type:"tfng",q:"NREM sleep consists of four distinct stages.",a:"FALSE"},
      {type:"tfng",q:"Stage 3 sleep helps repair body tissues.",a:"TRUE"},
      {type:"tfng",q:"REM sleep first occurs about an hour and a half after sleep onset.",a:"TRUE"},
      {type:"tfng",q:"The brain is less active during REM sleep than during waking hours.",a:"FALSE"},
      {type:"tfng",q:"Muscle paralysis during REM sleep is considered a protective mechanism.",a:"TRUE"},
      {type:"tfng",q:"Most adults need exactly eight hours of sleep.",a:"FALSE"},
      {type:"mc",q:"What did the University of California study find?",options:["All adults need 7-9 hours of sleep","About 1% of people can thrive on 6 hours due to genetics","Short sleepers experience mild cognitive issues","Sleep requirements decrease with age"],a:"About 1% of people can thrive on 6 hours due to genetics"},
      {type:"mc",q:"According to the passage, sleeping six hours for two weeks has the same cognitive effect as:",options:["Missing one night of sleep","Staying awake for 24 hours","Staying awake for 48 hours","Sleeping only 4 hours per night"],a:"Staying awake for 48 hours"},
      {type:"mc",q:"Professor Matthew Walker has described widespread sleep deprivation as:",options:["A minor inconvenience","A genetic adaptation","A public health epidemic","An unavoidable consequence of modern life"],a:"A public health epidemic"},
      {type:"completion",q:"During REM sleep, the temporary paralysis of muscles is called ___.",a:"atonia"},
      {type:"completion",q:"Stage 2 NREM sleep features brain patterns known as sleep spindles and ___.",a:"K-complexes"},
      {type:"completion",q:"Chronic sleep deprivation has been linked to cardiovascular disease, obesity, diabetes, and weakened ___ function.",a:"immune"}
    ]}
  ]},
  {id:2,title:"Urban Green Spaces",passages:[
    {title:"The Value of Parks in Modern Cities",text:"As global urbanisation accelerates — with the United Nations projecting that 68% of the world's population will live in cities by 2050 — the role of green spaces in urban environments has become a subject of increasing scientific and political interest. Parks, gardens, urban forests, and even small patches of vegetation are now recognised not merely as aesthetic amenities but as critical infrastructure that delivers measurable benefits to public health, environmental quality, and social cohesion.\n\nResearch published in The Lancet demonstrated that residents living within 300 metres of green space showed significantly lower levels of cortisol, the body's primary stress hormone, compared to those without nearby access to nature. A large-scale study conducted across nine European cities found that people who spent at least 120 minutes per week in natural environments reported substantially better health and psychological wellbeing than those who did not, regardless of their socioeconomic status or pre-existing health conditions.\n\nThe environmental benefits of urban green spaces are equally compelling. Trees and vegetation act as natural air filters, absorbing pollutants including nitrogen dioxide, sulphur dioxide, and particulate matter. A single mature tree can absorb approximately 22 kilograms of carbon dioxide per year while releasing enough oxygen for two people. Furthermore, green spaces play a crucial role in managing urban stormwater. Permeable soil and plant root systems absorb rainfall that would otherwise overwhelm drainage systems, reducing flood risk in cities increasingly vulnerable to extreme weather events.\n\nThe concept of the 'urban heat island effect' — whereby cities are significantly warmer than surrounding rural areas due to heat-absorbing concrete and asphalt — can be substantially mitigated through strategic placement of green spaces. Research from the Technical University of Munich found that urban parks can reduce local temperatures by between 1 and 4 degrees Celsius, providing natural cooling that reduces energy consumption and protects vulnerable populations during heatwaves.\n\nSocially, urban parks serve as democratic spaces where people from different backgrounds interact. Unlike commercial venues that require spending money, parks are freely accessible, making them particularly important for lower-income communities. Studies have shown that well-maintained green spaces reduce crime rates in surrounding neighbourhoods, foster community engagement, and provide essential recreational opportunities for children whose homes lack private outdoor areas.\n\nDespite these well-documented benefits, urban green spaces face persistent threats from development pressure. In many rapidly growing cities, parks and gardens are being sacrificed to accommodate housing, commercial buildings, and transportation infrastructure. Singapore has emerged as a notable counterexample, implementing a comprehensive 'City in a Garden' strategy that has increased the city-state's green cover from 36% in the 1980s to nearly 50% today, demonstrating that urban density and abundant green space need not be mutually exclusive.",
    questions:[
      {type:"tfng",q:"By 2050, more than two-thirds of the world's population is expected to be urban.",a:"TRUE"},
      {type:"tfng",q:"The Lancet study measured blood pressure levels near green spaces.",a:"FALSE"},
      {type:"tfng",q:"Spending at least two hours weekly in nature improved wellbeing regardless of income.",a:"TRUE"},
      {type:"tfng",q:"A mature tree produces enough oxygen for five people annually.",a:"FALSE"},
      {type:"tfng",q:"Urban parks have been shown to lower local temperatures.",a:"TRUE"},
      {type:"tfng",q:"Commercial venues are more socially inclusive than parks.",a:"FALSE"},
      {type:"mc",q:"According to the passage, urban green spaces are now considered:",options:["Luxury amenities for wealthy neighbourhoods","Critical infrastructure with measurable benefits","Primarily recreational facilities","Obstacles to urban development"],a:"Critical infrastructure with measurable benefits"},
      {type:"mc",q:"Singapore's green cover has changed from:",options:["50% to 36%","36% to nearly 50%","20% to 36%","50% to 68%"],a:"36% to nearly 50%"},
      {type:"completion",q:"Trees absorb pollutants including nitrogen dioxide, sulphur dioxide, and ___ matter.",a:"particulate"},
      {type:"completion",q:"The phenomenon where cities are warmer than rural areas is called the 'urban ___ island effect'.",a:"heat"},
      {type:"completion",q:"Green spaces absorb rainfall through permeable soil and plant ___ systems.",a:"root"},
      {type:"mc",q:"Well-maintained green spaces have been linked to:",options:["Higher property taxes","Reduced crime rates","Increased traffic congestion","Lower school attendance"],a:"Reduced crime rates"},
      {type:"tfng",q:"Singapore's approach proves dense cities cannot have significant green space.",a:"FALSE"}
    ]}
  ]},
  {id:3,title:"The Psychology of Decision Making",passages:[
    {title:"Why We Choose What We Choose",text:"Every day, the average adult makes approximately 35,000 decisions, ranging from trivial choices about what to eat for breakfast to consequential ones affecting careers, relationships, and financial security. The field of behavioural economics, pioneered by psychologists Daniel Kahneman and Amos Tversky in the 1970s, has fundamentally challenged the classical economic assumption that humans are rational decision-makers who consistently act in their own best interest.\n\nKahneman's research, which earned him the Nobel Prize in Economics in 2002, identified two distinct systems of thinking that govern human decision-making. System 1 operates automatically and quickly, with little effort or sense of voluntary control. It is responsible for snap judgements, first impressions, and intuitive responses. System 2, by contrast, allocates attention to effortful mental activities, including complex calculations, logical reasoning, and careful analysis. While System 2 is more reliable, it is also considerably slower and requires significant cognitive resources, meaning people frequently default to System 1 even when complex decisions warrant more careful deliberation.\n\nOne of the most influential concepts to emerge from this research is 'loss aversion' — the finding that people experience the pain of losing something approximately twice as intensely as the pleasure of gaining something of equivalent value. This asymmetry explains a wide range of seemingly irrational behaviours. Investors hold onto losing stocks far too long, hoping to avoid realising a loss. Consumers are more motivated by the fear of missing a limited-time offer than by the prospect of a future discount of identical value.\n\nThe 'anchoring effect' represents another systematic bias in human judgement. When making estimates or decisions under uncertainty, people tend to rely heavily on the first piece of information they encounter — the 'anchor' — even when that information is arbitrary or irrelevant. In one famous experiment, participants who first saw a high random number subsequently estimated the percentage of African countries in the United Nations to be significantly higher than those who first saw a low random number. This effect has profound implications for salary negotiations, real estate pricing, and courtroom sentencing.\n\n'Choice overload,' a concept popularised by psychologist Barry Schwartz, describes the paradox that having more options often leads to worse decisions and less satisfaction. A landmark study by researchers Sheena Iyengar and Mark Lepper found that customers in a supermarket who were offered 24 varieties of jam were far less likely to make a purchase than those offered only 6 varieties. The abundance of options created decision paralysis, increased anxiety about making the wrong choice, and diminished post-decision satisfaction.\n\nUnderstanding these cognitive biases has practical applications far beyond academic interest. Governments worldwide have established behavioural insights teams — sometimes called 'nudge units' — that design policies leveraging these insights to encourage beneficial behaviours. By changing default options on pension enrolment forms, for instance, the UK government dramatically increased retirement savings rates without restricting individual choice. Such interventions demonstrate that small changes in how choices are presented can produce large shifts in human behaviour.",
    questions:[
      {type:"tfng",q:"Adults make roughly 35,000 decisions daily.",a:"TRUE"},
      {type:"tfng",q:"Kahneman won the Nobel Prize in Psychology.",a:"FALSE"},
      {type:"tfng",q:"System 1 thinking is slow and deliberate.",a:"FALSE"},
      {type:"tfng",q:"People feel losses about twice as strongly as equivalent gains.",a:"TRUE"},
      {type:"tfng",q:"The anchoring effect only works with relevant information.",a:"FALSE"},
      {type:"mc",q:"The jam study demonstrated that:",options:["Customers prefer more variety","Too many options can reduce purchasing","6 types of jam is insufficient","Supermarkets should stock fewer products"],a:"Too many options can reduce purchasing"},
      {type:"mc",q:"'Nudge units' in governments use behavioural insights to:",options:["Force citizens to make specific choices","Restrict consumer options","Encourage beneficial behaviours through choice design","Increase taxation on unhealthy products"],a:"Encourage beneficial behaviours through choice design"},
      {type:"mc",q:"The UK government increased pension savings by:",options:["Making saving mandatory","Offering financial incentives","Changing default enrolment options","Raising the retirement age"],a:"Changing default enrolment options"},
      {type:"completion",q:"System 2 thinking requires significant ___ resources.",a:"cognitive"},
      {type:"completion",q:"The tendency to rely on the first information encountered is called the '___ effect'.",a:"anchoring"},
      {type:"completion",q:"Choice overload was popularised by psychologist Barry ___.",a:"Schwartz"},
      {type:"completion",q:"Loss aversion explains why investors hold onto ___ stocks too long.",a:"losing"},
      {type:"tfng",q:"The jam study was conducted by Kahneman and Tversky.",a:"FALSE"}
    ]}
  ]}
];

const GT_TESTS = [
  {id:1,title:"Workplace Safety Notice",text:"ALL STAFF — IMPORTANT SAFETY UPDATE\n\nFollowing last month's fire drill assessment, several areas requiring improvement have been identified. All employees must read and acknowledge this notice by Friday 15 March.\n\nFire Exits: The emergency exit on the second floor near the marketing department has been found to be partially blocked by storage boxes. This has been cleared, but staff are reminded that fire exits must remain unobstructed at all times. Any employee who notices items blocking fire exits should report this to the facilities team immediately via the intranet portal.\n\nEvacuation Procedure: During the drill, it took 7 minutes and 42 seconds for all staff to reach the designated assembly point in the main car park. The target time is 5 minutes. Department heads are responsible for ensuring their teams know the nearest exit route and assembly point location. A new evacuation plan has been posted in every office.\n\nFirst Aid: We currently have 8 certified first aiders across our 4 floors. Health and Safety regulations require a minimum of 1 first aider per 50 employees. With our current headcount of 340 staff, we need at least 7 first aiders, meaning we are compliant. However, 2 first aiders are due to retire in June, so we are seeking 4 new volunteers to undergo training. The company will cover all training costs. Interested staff should contact HR by 1 April.\n\nFire Wardens: Each floor requires 2 trained fire wardens. Floors 1 and 3 currently have 2 wardens each, but Floor 2 has only 1 and Floor 4 has none. Volunteers are urgently needed for Floors 2 and 4. Fire warden training takes one half-day and will be held on 20 March.\n\nEquipment Checks: All fire extinguishers were inspected last week and are within their service date. Smoke detectors on the third floor were found to have low batteries and have been replaced. Staff should test the smoke detector in their immediate workspace monthly by pressing the test button.",
  questions:[
    {type:"tfng",q:"The fire drill met the target evacuation time.",a:"FALSE"},
    {type:"tfng",q:"The second floor fire exit was blocked by furniture.",a:"FALSE"},
    {type:"tfng",q:"The company currently meets first aider requirements.",a:"TRUE"},
    {type:"tfng",q:"Fire warden training lasts a full day.",a:"FALSE"},
    {type:"tfng",q:"Smoke detectors on the third floor needed new batteries.",a:"TRUE"},
    {type:"mc",q:"How many additional first aid volunteers does the company want?",options:["2","4","7","8"],a:"4"},
    {type:"mc",q:"Which floors need fire warden volunteers?",options:["Floors 1 and 3","Floors 2 and 4","All floors","Floors 1 and 2"],a:"Floors 2 and 4"},
    {type:"completion",q:"Staff should report blocked fire exits via the ___ portal.",a:"intranet"},
    {type:"completion",q:"The assembly point is in the main ___ ___.",a:"car park"},
    {type:"mc",q:"The deadline to volunteer for first aid training is:",options:["15 March","20 March","1 April","June"],a:"1 April"}
  ]},
  {id:2,title:"Tenant Information Guide",text:"GREENFIELD APARTMENTS — TENANT HANDBOOK (Extract)\n\nRent Payment: Rent is due on the 1st of each month and must be paid by bank transfer to the account details provided in your tenancy agreement. A late payment fee of £25 applies to any payment received after the 5th of the month. If you anticipate difficulty making a payment, contact the property management office before the due date to discuss options.\n\nMaintenance Requests: For non-urgent repairs (dripping taps, minor appliance faults, loose door handles), submit a request through the online resident portal. Requests are typically addressed within 5 working days. For urgent issues (burst pipes, gas leaks, electrical faults, heating failure in winter), call the 24-hour emergency line: 0800 555 7890. Do not attempt to carry out plumbing, electrical, or structural repairs yourself, as this may void your tenancy agreement.\n\nCommunal Areas: All residents share responsibility for keeping corridors, stairwells, and the laundry room clean and tidy. Bicycles must be stored in the designated ground-floor bike shed — not in corridors or stairwells. The communal garden on the roof terrace is open daily from 7am to 10pm. Barbecues and open flames are prohibited on the roof terrace due to fire regulations.\n\nNoise Policy: Normal household noise is expected during daytime hours (8am–10pm). Between 10pm and 8am, residents must keep noise to a minimum. Persistent noise complaints may result in a formal warning and, if unresolved, may constitute grounds for tenancy termination. If you wish to host a gathering, please inform your immediate neighbours in advance as a courtesy.\n\nPets: Small pets (cats, small dogs under 10kg, fish, caged birds) are permitted with prior written approval from the property management office. A refundable pet deposit of £200 is required. Pets must be kept on leads in all communal areas. Owners are responsible for cleaning up after their pets immediately. Exotic animals, reptiles, and any animal exceeding 10kg are not permitted.\n\nEnd of Tenancy: Tenants must provide a minimum of 2 months' written notice before vacating. The property must be returned in the same condition as at the start of the tenancy, allowing for reasonable wear and tear. A professional end-of-tenancy clean is recommended. Any damage beyond normal wear and tear will be deducted from the security deposit.",
  questions:[
    {type:"tfng",q:"Rent must be paid in cash at the management office.",a:"FALSE"},
    {type:"tfng",q:"Late payments are charged after the 5th of each month.",a:"TRUE"},
    {type:"tfng",q:"Residents can fix their own plumbing problems.",a:"FALSE"},
    {type:"tfng",q:"The roof garden closes at midnight.",a:"FALSE"},
    {type:"tfng",q:"Dogs weighing 15kg are allowed with approval.",a:"FALSE"},
    {type:"mc",q:"Non-urgent repairs are usually completed within:",options:["24 hours","3 working days","5 working days","10 working days"],a:"5 working days"},
    {type:"mc",q:"Where should bicycles be kept?",options:["In the corridor","On the roof terrace","In the ground-floor bike shed","In the tenant's apartment"],a:"In the ground-floor bike shed"},
    {type:"completion",q:"The pet deposit amount is £___.",a:"200"},
    {type:"completion",q:"Tenants must give at least ___ months' notice before leaving.",a:"2"},
    {type:"mc",q:"Quiet hours are between:",options:["8am and 10pm","10pm and 6am","10pm and 8am","11pm and 7am"],a:"10pm and 8am"}
  ]}
];

const ReadingPage = ({isPro, onUpgrade}) => {
  const [tab, setTab] = useState("academic");
  const [activeTest, setActiveTest] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});

  const tabs = [
    {id:"academic",label:"📖 Academic Tests",free:true},
    {id:"gt",label:"📄 General Training",free:true},
    {id:"strategies",label:"🎯 Question Strategies",free:true},
    {id:"timetips",label:"⏱️ Time Management",free:true}
  ];
  const sty = {fontFamily:"'Source Sans Pro','Inter',system-ui"};
  const card = {background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",marginBottom:16,boxShadow:T.shadow};

  const isTestLocked = (type, idx) => {
    if(isPro) return false;
    if(type==="academic") return idx > 0;
    if(type==="gt") return idx > 0;
    return false;
  };

  const renderQuestions = (questions, testKey) => (
    <div style={{marginTop:20}}>
      <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 14px"}}>Questions ({questions.length})</h3>
      {questions.map((q,i)=>{
        const key = `${testKey}-${i}`;
        return (
          <div key={i} style={{marginBottom:14,padding:"12px 14px",background:T.bgGray,borderRadius:8,border:`1px solid ${T.border}`}}>
            <div style={{...sty,fontSize:13,fontWeight:700,color:T.primary,marginBottom:2,textTransform:"uppercase",letterSpacing:"0.05em"}}>{q.type==="tfng"?"True / False / Not Given":q.type==="mc"?"Multiple Choice":"Sentence Completion"}</div>
            <div style={{...sty,fontSize:14,color:T.text,marginBottom:8,fontWeight:600}}>{i+1}. {q.q}</div>
            {q.type==="tfng"&&(
              <div style={{display:"flex",gap:6}}>
                {["TRUE","FALSE","NOT GIVEN"].map(opt=>(
                  <button key={opt} onClick={()=>setUserAnswers(prev=>({...prev,[key]:opt}))}
                    style={{padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,...sty,cursor:"pointer",
                      background:userAnswers[key]===opt?(showAnswers?(opt===q.a?T.greenBg:T.redBg):T.primaryLight):"white",
                      border:`1px solid ${userAnswers[key]===opt?(showAnswers?(opt===q.a?T.greenBorder:T.redBorder):T.primaryBorder):T.border}`,
                      color:userAnswers[key]===opt?(showAnswers?(opt===q.a?T.green:T.red):T.primary):T.textMid}}>
                    {opt}
                  </button>
                ))}
              </div>
            )}
            {q.type==="mc"&&(
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {q.options.map((opt,oi)=>(
                  <button key={oi} onClick={()=>setUserAnswers(prev=>({...prev,[key]:opt}))}
                    style={{textAlign:"left",padding:"8px 12px",borderRadius:6,fontSize:13,...sty,cursor:"pointer",
                      background:userAnswers[key]===opt?(showAnswers?(opt===q.a?T.greenBg:T.redBg):T.primaryLight):"white",
                      border:`1px solid ${userAnswers[key]===opt?(showAnswers?(opt===q.a?T.greenBorder:T.redBorder):T.primaryBorder):T.border}`,
                      color:userAnswers[key]===opt?(showAnswers?(opt===q.a?T.green:T.red):T.primary):T.textMid}}>
                    {String.fromCharCode(65+oi)}. {opt}
                  </button>
                ))}
              </div>
            )}
            {q.type==="completion"&&(
              <input value={userAnswers[key]||""} onChange={e=>setUserAnswers(prev=>({...prev,[key]:e.target.value}))}
                placeholder="Type your answer..." style={{...sty,fontSize:14,padding:"8px 12px",border:`1px solid ${showAnswers?(userAnswers[key]?.toLowerCase().trim()===q.a.toLowerCase()?T.greenBorder:T.redBorder):T.border}`,borderRadius:6,width:"100%",maxWidth:300,background:showAnswers?(userAnswers[key]?.toLowerCase().trim()===q.a.toLowerCase()?T.greenBg:T.redBg):"white",boxSizing:"border-box"}}/>
            )}
            {showAnswers&&(
              <div style={{marginTop:6,...sty,fontSize:12,fontWeight:700,color:T.green}}>✅ Correct answer: {q.a}</div>
            )}
          </div>
        );
      })}
      <div style={{display:"flex",gap:10,marginTop:16}}>
        <button onClick={()=>setShowAnswers(!showAnswers)}
          style={{background:showAnswers?T.redBg:T.greenBg,border:`1px solid ${showAnswers?T.redBorder:T.greenBorder}`,borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,color:showAnswers?T.red:T.green,cursor:"pointer",...sty}}>
          {showAnswers?"Hide Answers":"Check Answers"}
        </button>
        <button onClick={()=>{setUserAnswers({});setShowAnswers(false);}}
          style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",...sty}}>
          Reset
        </button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px 60px"}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:28,color:T.text,margin:"0 0 6px"}}>📖 IELTS Reading</h1>
      <p style={{...sty,fontSize:14,color:T.textMuted,margin:"0 0 20px",lineHeight:1.5}}>Practice with full reading tests, learn strategies for every question type, and master time management.</p>

      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:24,paddingBottom:4}} className="tab-row">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>{setTab(t.id);setActiveTest(null);setShowAnswers(false);setUserAnswers({});}}
            style={{background:tab===t.id?T.primaryLight:"white",border:`1px solid ${tab===t.id?T.primaryBorder:T.border}`,borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:tab===t.id?700:500,color:tab===t.id?T.primary:T.textMid,cursor:"pointer",...sty,whiteSpace:"nowrap",flexShrink:0}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Academic Tests */}
      {tab==="academic"&&!activeTest&&(
        <div>
          <div style={{...card,background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
            <p style={{...sty,fontSize:13,color:T.blue,margin:0}}>📝 Academic Reading: 3 passages of increasing difficulty · 40 questions · 60 minutes · Topics from books, journals, and magazines on academic subjects.</p>
          </div>
          {ACADEMIC_TESTS.map((test,i)=>(
            <div key={i} style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 4px"}}>Test {test.id}: {test.title}</h3>
                  <p style={{...sty,fontSize:13,color:T.textMuted,margin:0}}>{test.passages[0].questions.length} questions · {test.passages[0].title}</p>
                </div>
                {isTestLocked("academic",i)?(
                  <button onClick={onUpgrade} style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,color:T.amber,cursor:"pointer",...sty}}>🔒 Pro Only</button>
                ):(
                  <button onClick={()=>{setActiveTest({type:"academic",idx:i});setShowAnswers(false);setUserAnswers({});}} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",...sty}}>Start Test →</button>
                )}
              </div>
            </div>
          ))}
          {!isPro&&<p style={{...sty,fontSize:13,color:T.amber,textAlign:"center",fontWeight:600}}>🔒 Test 1 is free. Unlock all tests with Pro.</p>}
        </div>
      )}

      {/* GT Tests */}
      {tab==="gt"&&!activeTest&&(
        <div>
          <div style={{...card,background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
            <p style={{...sty,fontSize:13,color:T.green,margin:0}}>📄 General Training Reading: Texts from everyday English — notices, advertisements, handbooks, manuals · Same question types as Academic but different text styles.</p>
          </div>
          {GT_TESTS.map((test,i)=>(
            <div key={i} style={card}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 4px"}}>Test {test.id}: {test.title}</h3>
                  <p style={{...sty,fontSize:13,color:T.textMuted,margin:0}}>{test.questions.length} questions</p>
                </div>
                {isTestLocked("gt",i)?(
                  <button onClick={onUpgrade} style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,color:T.amber,cursor:"pointer",...sty}}>🔒 Pro Only</button>
                ):(
                  <button onClick={()=>{setActiveTest({type:"gt",idx:i});setShowAnswers(false);setUserAnswers({});}} style={{background:T.green,color:"white",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",...sty}}>Start Test →</button>
                )}
              </div>
            </div>
          ))}
          {!isPro&&<p style={{...sty,fontSize:13,color:T.amber,textAlign:"center",fontWeight:600}}>🔒 Test 1 is free. Unlock all tests with Pro.</p>}
        </div>
      )}

      {/* Active Test View */}
      {activeTest&&(
        <div>
          <button onClick={()=>{setActiveTest(null);setShowAnswers(false);setUserAnswers({});}} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",...sty,padding:"0 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to tests</button>
          {activeTest.type==="academic"&&(
            <div style={card}>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 16px"}}>{ACADEMIC_TESTS[activeTest.idx].passages[0].title}</h2>
              <div style={{background:T.bgGray,borderRadius:8,padding:"20px",marginBottom:16,lineHeight:1.8,...sty,fontSize:14,color:T.textMid,whiteSpace:"pre-line",maxHeight:500,overflowY:"auto"}}>
                {ACADEMIC_TESTS[activeTest.idx].passages[0].text}
              </div>
              {renderQuestions(ACADEMIC_TESTS[activeTest.idx].passages[0].questions, `ac-${activeTest.idx}`)}
            </div>
          )}
          {activeTest.type==="gt"&&(
            <div style={card}>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 16px"}}>{GT_TESTS[activeTest.idx].title}</h2>
              <div style={{background:T.bgGray,borderRadius:8,padding:"20px",marginBottom:16,lineHeight:1.8,...sty,fontSize:14,color:T.textMid,whiteSpace:"pre-line",maxHeight:500,overflowY:"auto"}}>
                {GT_TESTS[activeTest.idx].text}
              </div>
              {renderQuestions(GT_TESTS[activeTest.idx].questions, `gt-${activeTest.idx}`)}
            </div>
          )}
        </div>
      )}

      {/* Strategies */}
      {tab==="strategies"&&(
        <div>
          {READING_STRATEGIES.map((s,i)=>(
            <div key={i} style={card}>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:16,color:T.primary,margin:"0 0 8px"}}>{s.type}</h3>
              <p style={{...sty,fontSize:14,color:T.textMid,margin:"0 0 8px",lineHeight:1.6}}>{s.strategy}</p>
              <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:6,padding:"8px 12px",...sty,fontSize:13,color:T.amber,fontWeight:600}}>💡 Tip: {s.tip}</div>
            </div>
          ))}
        </div>
      )}

      {/* Time Management */}
      {tab==="timetips"&&(
        <div style={card}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 16px"}}>⏱️ Time Management for IELTS Reading</h2>
          <p style={{...sty,fontSize:14,color:T.textMid,margin:"0 0 16px",lineHeight:1.6}}>You have 60 minutes for 40 questions across 3 passages. Time management is the single biggest factor separating Band 6 from Band 7+.</p>
          {READING_TIME_TIPS.map((tip,i)=>(
            <div key={i} style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
              <div style={{flexShrink:0,width:28,height:28,background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:T.primary}}>{i+1}</div>
              <p style={{...sty,fontSize:14,color:T.textMid,margin:0,lineHeight:1.6}}>{tip}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
// ── Analytics Helper ─────────────────────────
const GA_ID = "G-9JN8WF1R0M";
const trackEvent = (eventName, params={}) => {
  try { if(window.gtag) window.gtag("event", eventName, params); } catch(e) {}
};

// ── Contact Page ─────────────────────────────
const EMAILJS_SERVICE_ID = "service_9es76g1";
const EMAILJS_TEMPLATE_ID = "template_jrd4i4n";
const EMAILJS_PUBLIC_KEY = "Wl_oo3VnUzPGW3MB4";

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
      });
      setStatus("success");
      setForm({ name:"", country:"", age:"", email:"", message:"" });
    } catch(e) { console.error("EmailJS error:", e); setStatus("error"); }
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
          <div className="contact-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div><label style={labelStyle}>Full Name *</label><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Your name" style={inputStyle}/></div>
            <div><label style={labelStyle}>Country</label><select value={form.country} onChange={e=>setForm({...form,country:e.target.value})} style={{...inputStyle,background:"white"}}><option value="">Select country...</option>{COUNTRIES.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          </div>
          <div className="contact-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
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
    <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",padding:"24px 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to Englishfool</button>
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
    <Section title="1. Acceptance of Terms"><p style={{margin:"0 0 12px"}}>By accessing or using Englishfool ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. Englishfool is operated by Ahmad Sartawi ("we", "us", "our").</p></Section>
    <Section title="2. Description of Service"><p style={{margin:"0 0 12px"}}>Englishfool is a smart IELTS Writing examination tool that provides automated band score assessment based on official IELTS band descriptors, mistake detection, vocabulary feedback, and model essay generation for IELTS Writing Tasks 1 and 2. The Service is intended for educational purposes only.</p></Section>
    <Section title="3. User Accounts and Subscriptions"><p style={{margin:"0 0 12px"}}>The Service offers a free tier with limited analyses and a Pro subscription at $25 USD per month. Subscription payments are processed securely by Paddle.com as our Merchant of Record. By subscribing, you authorize recurring monthly charges to your payment method.</p><p style={{margin:"0 0 12px"}}>You may cancel your subscription at any time through your account settings or by contacting Paddle directly. Cancellation takes effect at the end of the current billing period.</p><p style={{margin:"0 0 12px"}}>New subscribers are entitled to a full refund within 14 days of their initial purchase, in accordance with Paddle's Buyer Terms. See our Refund Policy for full details.</p></Section>
    <Section title="4. Acceptable Use"><p style={{margin:"0 0 12px"}}>You agree to use Englishfool only for lawful educational purposes. You must not: (a) attempt to reverse engineer or copy our systems; (b) submit content that is harmful, offensive, or violates any laws; (c) share account access with others; (d) use the Service in any way that could damage or overburden our systems.</p></Section>
    <Section title="5. Accuracy Disclaimer"><p style={{margin:"0 0 12px"}}>Englishfool uses advanced technology to provide IELTS writing feedback. While we strive for accuracy, scores and feedback are for guidance only and do not constitute official IELTS examination results. Actual IELTS scores are determined solely by certified IELTS examiners appointed by the British Council, IDP, or Cambridge Assessment English.</p></Section>
    <Section title="6. Intellectual Property"><p style={{margin:"0 0 12px"}}>All content, design, software, and materials on Englishfool are the property of Ahmad Sartawi and are protected by applicable intellectual property laws. Essays submitted by users remain the property of the user. We do not claim ownership over user-submitted content.</p></Section>
    <Section title="7. Limitation of Liability"><p style={{margin:"0 0 12px"}}>To the maximum extent permitted by law, Englishfool shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability to you shall not exceed the amount paid by you in the 12 months preceding the claim.</p></Section>
    <Section title="8. Modifications to Terms"><p style={{margin:"0 0 12px"}}>We reserve the right to modify these Terms at any time. We will notify users of material changes via email or prominent notice on the Service. Continued use after changes constitutes acceptance of the new Terms.</p></Section>
    <Section title="9. Governing Law"><p style={{margin:"0 0 12px"}}>These Terms shall be governed by the laws of the Hashemite Kingdom of Jordan. Any disputes shall be resolved in the courts of Amman, Jordan.</p></Section>
    <Section title="10. Contact"><p style={{margin:"0 0 12px"}}>For any questions regarding these Terms, please reach out via our <strong>Contact Us</strong> page on the website.</p></Section>
  </PolicyPage>
);
const PrivacyPage = ({onBack}) => (
  <PolicyPage title="Privacy Policy" onBack={onBack}>
    <Section title="1. Information We Collect"><p style={{margin:"0 0 12px"}}>We collect information you provide directly to us, including:</p><ul style={{margin:"0 0 12px",paddingLeft:20}}><li style={{marginBottom:6}}>Contact form submissions (name, email, country, age group, message)</li><li style={{marginBottom:6}}>Essay content submitted for analysis</li><li style={{marginBottom:6}}>Payment information (processed and stored by Paddle — we do not store card details)</li><li style={{marginBottom:6}}>Usage data collected via Google Analytics (anonymised)</li></ul></Section>
    <Section title="2. How We Use Your Information"><p style={{margin:"0 0 12px"}}>We use the information we collect to: provide and improve the Service; process subscription payments; respond to your enquiries; send service-related communications; and analyse usage patterns to improve user experience.</p><p style={{margin:"0 0 12px"}}>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p></Section>
    <Section title="3. Essay Data"><p style={{margin:"0 0 12px"}}>Essays you submit are processed securely by our technology partner for analysis. Essays are transmitted over encrypted connections and are not stored permanently on our servers. We do not use your essays to train any models.</p></Section>
    <Section title="4. Cookies and Analytics"><p style={{margin:"0 0 12px"}}>We use Google Analytics to collect anonymised data about how users interact with our Service. You can opt out of Google Analytics by installing the Google Analytics Opt-out Browser Add-on.</p></Section>
    <Section title="5. Data Security"><p style={{margin:"0 0 12px"}}>We implement appropriate technical and organisational measures to protect your personal data. All data is transmitted over HTTPS encryption.</p></Section>
    <Section title="6. Data Retention"><p style={{margin:"0 0 12px"}}>We retain your personal data only as long as necessary to provide the Service and comply with legal obligations.</p></Section>
    <Section title="7. Your Rights"><p style={{margin:"0 0 12px"}}>You have the right to: access your personal data; correct inaccurate data; request deletion of your data; withdraw consent at any time. Reach out via our <strong>Contact Us</strong> page to exercise these rights.</p></Section>
    <Section title="8. Third-Party Services"><p style={{margin:"0 0 12px"}}>Our Service integrates with: Paddle (payments); Google Analytics; EmailJS (contact form).</p></Section>
    <Section title="9. Contact"><p style={{margin:"0 0 12px"}}>For privacy-related enquiries, please use our <strong>Contact Us</strong> page.</p></Section>
  </PolicyPage>
);
const RefundPage = ({onBack}) => (
  <PolicyPage title="Refund Policy" onBack={onBack}>
    <Section title="1. Subscription Cancellation"><p style={{margin:"0 0 12px"}}>You may cancel your Englishfool Pro subscription at any time. Upon cancellation, you will retain access to Pro features until the end of your current billing period.</p></Section>
    <Section title="2. Refund Eligibility"><p style={{margin:"0 0 12px"}}>We offer a <strong>14-day money-back guarantee</strong> for new Pro subscribers, in accordance with Paddle's Buyer Terms and applicable consumer protection regulations. If you are not satisfied within 14 days of your initial subscription, you are entitled to a full refund.</p><p style={{margin:"0 0 12px"}}>Refund requests made after 14 days will be assessed on a case-by-case basis. Refunds may be prorated based on usage during the subscription period.</p></Section>
    <Section title="3. How to Request a Refund"><p style={{margin:"0 0 12px"}}>To request a refund, you may either contact Paddle directly through your purchase confirmation email, or reach out via our <strong>Contact Us</strong> page with your registered email, date of purchase, and reason for refund. All refund requests are processed within 5–10 business days.</p></Section>
    <Section title="4. Contact"><p style={{margin:"0 0 12px"}}>For refund enquiries, please use our <strong>Contact Us</strong> page.</p></Section>
  </PolicyPage>
);
const PricingPage = ({onBack, onUpgrade, isPro}) => (
  <PolicyPage title="Pricing" onBack={onBack}>
    <div style={{textAlign:"center",marginBottom:32}}>
      <p style={{fontSize:16,lineHeight:1.7,color:T.textMid}}>Englishfool offers a simple, transparent pricing model with no hidden fees.</p>
    </div>
    <div className="pricing-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,marginBottom:32}}>
      <div style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:12,padding:"28px 24px",textAlign:"center"}}>
        <div style={{fontSize:13,fontWeight:700,color:T.textMuted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>Free Plan</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:48,fontWeight:900,color:T.text,lineHeight:1,marginBottom:8}}>$0</div>
        <div style={{color:T.textMuted,fontSize:13,marginBottom:20}}>Get started — no credit card required</div>
        <ul style={{listStyle:"none",padding:0,textAlign:"left",display:"flex",flexDirection:"column",gap:8}}>
          {["1 free essay analysis (1 more after sign-up)","Task 1 & Task 2 support","Band scores for all 4 criteria","Basic mistake detection","Linking Words toolkit","Grammar reference guide","Grammar & Spell Checker (10/day)"].map((f,i)=>(
            <li key={i} style={{fontSize:13,color:T.textMid,display:"flex",gap:8}}><span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}</li>
          ))}
        </ul>
      </div>
      <div style={{background:"#fefdf8",border:`2px solid ${T.primary}`,borderRadius:12,padding:"28px 24px",textAlign:"center",position:"relative",boxShadow:T.shadowMd}}>
        <div style={{position:"absolute",top:-12,left:"50%",transform:"translateX(-50%)",background:T.primary,color:"white",borderRadius:20,padding:"3px 16px",fontSize:11,fontWeight:700,letterSpacing:"0.05em"}}>MOST POPULAR</div>
        <div style={{fontSize:13,fontWeight:700,color:T.primary,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:12}}>Pro Plan</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:48,fontWeight:900,color:T.text,lineHeight:1,marginBottom:4}}><sup style={{fontSize:20,verticalAlign:"super"}}>$</sup>25</div>
        <div style={{color:T.textMuted,fontSize:13,marginBottom:20}}>per month · cancel anytime</div>
        <ul style={{listStyle:"none",padding:0,textAlign:"left",display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {["Unlimited essay analyses","Complete mistake detection","Inline essay annotations","Band 8+ model responses","Progress tracker","Vocabulary upgrades from YOUR essay","Band Booster coaching","Full IELTS Toolkit access","Practice Mode with live coaching","Unlimited Grammar & Spell Checker","Graph image upload (Task 1 Academic)","6 scored model essays with commentary"].map((f,i)=>(
            <li key={i} style={{fontSize:13,color:T.textMid,display:"flex",gap:8}}><span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}</li>
          ))}
        </ul>
        {isPro?(
          <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px",fontSize:13,color:T.green,fontWeight:700}}>✓ You're on Pro — Unlimited Access</div>
        ):(
          <button onClick={onUpgrade} style={{width:"100%",background:STRIPE_CONFIGURED?T.primary:"#94a3b8",color:"white",fontWeight:700,fontSize:15,padding:"14px",borderRadius:8,border:"none",cursor:STRIPE_CONFIGURED?"pointer":"not-allowed",boxShadow:STRIPE_CONFIGURED?T.shadowMd:"none"}}>
            {STRIPE_CONFIGURED?"Start Pro — $25/month":"🔒 Payments Coming Soon"}
          </button>
        )}
      </div>
    </div>
    <Section title="Billing & Payments">
      <p style={{margin:"0 0 12px"}}>Payments are processed securely by <strong>Paddle.com</strong> as our Merchant of Record. Paddle handles all billing, VAT/tax collection, invoicing, and payment processing on behalf of Englishfool.</p>
      <p style={{margin:"0 0 12px"}}>We accept all major credit and debit cards, PayPal, Apple Pay, Google Pay, and selected local payment methods depending on your region.</p>
    </Section>
    <Section title="Cancellation">
      <p style={{margin:"0 0 12px"}}>You may cancel your subscription at any time. Upon cancellation, you will retain access to Pro features until the end of your current billing period. No further charges will be made after cancellation.</p>
    </Section>
    <Section title="Refunds">
      <p style={{margin:"0 0 12px"}}>We offer a <strong>14-day money-back guarantee</strong> for new subscribers, in accordance with Paddle's Buyer Terms. If you are not satisfied within 14 days of your initial purchase, you are entitled to a full refund via Paddle or through our <strong>Contact Us</strong> page. See our full <button onClick={()=>{const path="/refund";window.history.pushState({},"",path);window.location.reload();}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:15,fontFamily:"inherit",padding:0,textDecoration:"underline"}}>Refund Policy</button> for details.</p>
    </Section>
    <Section title="Questions?">
      <p style={{margin:"0 0 12px"}}>For any billing or pricing enquiries, please use our <strong>Contact Us</strong> page.</p>
    </Section>
  </PolicyPage>
);

// ── URL Routing ──────────────────────────────
const ROUTE_MAP = {"/":"analyze","/terms":"terms","/privacy":"privacy","/refund":"refund","/pricing":"pricing","/practice":"practice","/progress":"progress","/toolkit":"toolkit","/contact":"contact","/grammar":"grammar","/exercises":"exercises","/admin":"admin","/speaking":"speaking","/reading":"reading"};
const VIEW_TO_PATH = Object.fromEntries(Object.entries(ROUTE_MAP).map(([k,v])=>[v,k]));
const getViewFromPath = () => { const p = window.location.pathname.replace(/\/+$/,"") || "/"; return ROUTE_MAP[p] || "analyze"; };

// ── MAIN APP ──────────────────────────────────
export default function IELTSBot(){
  const [mainView,setMainView]=useState(()=>getViewFromPath());
  const [taskType,setTaskType]=useState(()=>getLastResult()?.taskType||"task2");
  const [topic,setTopic]=useState(()=>getLastResult()?.topic||"");
  const [essay,setEssay]=useState(()=>getLastResult()?.essay||"");
  const [image,setImage]=useState(null);
  const [imagePreview,setImagePreview]=useState(null);
  const [topicImage,setTopicImage]=useState(null);
  const [essayImage,setEssayImage]=useState(null);
  const [processingTopicImg,setProcessingTopicImg]=useState(false);
  const [processingEssayImg,setProcessingEssayImg]=useState(false);
  const fileRef=useRef();
  const topicImgRef=useRef();
  const essayImgRef=useRef();
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState(()=>getLastResult()?.result||null);
  const [error,setError]=useState("");
  const [activeTab,setActiveTab]=useState(()=>getLastResult()?.result?"annotated":"scores");
  const [showPaywall,setShowPaywall]=useState(false);
  const [paywallTab,setPaywallTab]=useState("cliq");
  const [showAuth,setShowAuth]=useState(false);
  const [showChangePassword,setShowChangePassword]=useState(false);
  const [session,setSession]=useState(null);
  const [uses,setUses]=useState(0);
  const [lang,setLang]=useState("en");
  const [menuOpen,setMenuOpen]=useState(false);
  const analyzeRef=useRef(null);
  const [proUser, setProUser] = useState(false);
  const usesLeft = FREE_USES_LIMIT - uses;

  // ── Supabase auth listener — runs on mount ────────────────
  useEffect(()=>{
    // Restore session from Supabase (works across devices and refreshes)
    supabase.auth.getSession().then(({ data:{ session:sbSess } })=>{
      if(sbSess?.user){
        const sess = toSession(sbSess.user);
        setSession(sess);
        setUses(getStoredUses(sess.email));
        fetchProStatus(sess.email).then(setProUser);
      }
    });
    // Listen for login/logout events
    const { data:{ subscription } } = supabase.auth.onAuthStateChange((_event, sbSess)=>{
      if(sbSess?.user){
        const sess = toSession(sbSess.user);
        setSession(sess);
        setUses(getStoredUses(sess.email));
        fetchProStatus(sess.email).then(setProUser);
      } else {
        setSession(null);
        setProUser(false);
        setUses(0);
      }
    });
    return ()=> subscription.unsubscribe();
  },[]);

  const handleAuthSuccess=(sess)=>{
    setSession(sess);
    setUses(getStoredUses(sess.email));
    fetchProStatus(sess.email).then(setProUser);
    setShowAuth(false);
    setShowPaywall(false);
  };

  const handleSignOut=async()=>{
    await supabase.auth.signOut();
    setSession(null);
    setUses(0);
    setResult(null);
    setProUser(false);
    setMenuOpen(false);
    switchView("analyze");
  };

  const switchLang=(newLang)=>{ setLang(newLang); if(result){ setError(newLang==="ar"?"تم تغيير اللغة. اضغط 'Analyze' مجدداً لرؤية التعليقات بالعربية.":"Language changed. Click 'Analyze' again to see feedback in English."); } };

  // Fix black screen: reload app if React crashes when returning from background
  useEffect(()=>{
    const onVisibility = () => {
      if(document.visibilityState === 'visible'){
        // If the root div is empty, React crashed — force reload
        setTimeout(()=>{
          const root = document.getElementById('root');
          if(root && root.children.length === 0){
            window.location.reload();
          }
        }, 500);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Safety net: if loading stays true for more than 90 seconds, force-clear it
  useEffect(()=>{
    if(!loading) return;
    const timer = setTimeout(()=>{ setLoading(false); setError("Analysis timed out. Please try again."); }, 90000);
    return ()=>clearTimeout(timer);
  }, [loading]);
  const PAGE_TITLES = {analyze:"Englishfool — IELTS Writing Examiner",practice:"Practice Mode — Englishfool",progress:"Progress Tracker — Englishfool",toolkit:"IELTS Toolkit — Englishfool",contact:"Contact Us — Englishfool",grammar:"Grammar & Spell Checker — Englishfool",exercises:"Practice Exercises — Englishfool",admin:"Admin — Englishfool",terms:"Terms of Service — Englishfool",privacy:"Privacy Policy — Englishfool",refund:"Refund Policy — Englishfool",pricing:"Pricing — Englishfool",speaking:"IELTS Speaking — Englishfool",reading:"IELTS Reading — Englishfool"};
  const switchView=(view)=>{ 
    setMainView(view); 
    const path = VIEW_TO_PATH[view] || "/";
    if(window.location.pathname !== path) window.history.pushState({view}, "", path);
    document.title = PAGE_TITLES[view] || "Englishfool";
    window.scrollTo({top:0,behavior:'smooth'}); 
  };

  // Handle browser back/forward buttons
  useEffect(()=>{
    const onPop = () => { 
      const view = getViewFromPath();
      setMainView(view); 
      document.title = PAGE_TITLES[view] || "Englishfool";
      window.scrollTo({top:0}); 
    };
    window.addEventListener('popstate', onPop);
    // Set title on initial load
    document.title = PAGE_TITLES[mainView] || "Englishfool";
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const minWords=TASK_TYPES[taskType].minWords;
  const wordCount=countWords(essay);
  const sampleWordCount=result?.sampleEssay?countWords(result.sampleEssay):0;

  const handleProSuccess=(activatedEmail)=>{
    // Re-fetch Pro status from Supabase to confirm server-side activation
    const emailToCheck = activatedEmail || session?.email;
    if(emailToCheck) fetchProStatus(emailToCheck).then(setProUser);
    else setProUser(true); // fallback
    setShowPaywall(false);
    trackEvent('upgrade_to_pro');
  };
  const handleImageUpload=(e)=>{ const file=e.target.files[0]; if(!file) return; const reader=new FileReader(); reader.onload=(ev)=>{ setImage(ev.target.result.split(",")[1]); setImagePreview(ev.target.result); }; reader.readAsDataURL(file); };

  const extractTextFromImage = async (file, target) => {
    const setProcessing = target==="topic" ? setProcessingTopicImg : setProcessingEssayImg;
    const setText = target==="topic" ? setTopic : setEssay;
    setProcessing(true);
    try {
      const base64 = await new Promise((res,rej)=>{ const r=new FileReader(); r.onload=(e)=>res(e.target.result.split(",")[1]); r.onerror=rej; r.readAsDataURL(file); });
      const resp = await fetch(API_URL, { method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:2000,
          messages:[{ role:"user", content:[
            { type:"image", source:{ type:"base64", media_type:file.type||"image/jpeg", data:base64 }},
            { type:"text", text: target==="topic"
              ? "Extract the IELTS question/task text from this image. Return ONLY the question text, nothing else, no preamble."
              : "Extract all the written essay/letter text from this image. Return ONLY the text as written, preserving paragraphs. No preamble or commentary." }
          ]}]
        })
      });
      const data = await resp.json();
      const extracted = data.content?.map(b=>b.text||"").join("").trim();
      if(extracted) setText(extracted);
    } catch(e) { console.error("Image extraction failed",e); }
    finally { setProcessing(false); }
  };

  const analyze=async()=>{
    if(!topic.trim()||!essay.trim()){ setError("Please provide both the task question and your response."); return; }
    if(wordCount<30){ setError("Response too short."); return; }
    if(taskType==="task1academic"&&!image){ setError("Please upload the graph/chart image for Academic Task 1."); return; }
    if(!proUser&&uses>=FREE_USES_LIMIT){ 
      if(!session){ setShowAuth(true); trackEvent('signup_prompt_shown',{task_type:taskType}); }
      else{ setShowPaywall(true); trackEvent('paywall_shown',{task_type:taskType}); }
      return; 
    }
    setError(""); setLoading(true); setResult(null); clearLastResult();
    try{
      const messageContent=taskType==="task1academic"&&image
        ?[{type:"image",source:{type:"base64",media_type:"image/jpeg",data:image}},{type:"text",text:`IELTS ${TASK_TYPES[taskType].label}\nQuestion: "${topic}"\nEssay:\n${essay}\n\nEvaluate thoroughly. Count words by splitting on spaces. Respond as JSON only.`}]
        :`IELTS ${TASK_TYPES[taskType].label}\nQuestion: "${topic}"\nEssay:\n${essay}\n\nEvaluate thoroughly. Count words by splitting on spaces. Respond as JSON only.`;
      const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-opus-4-6",max_tokens:4000,system:getSystemPrompt(taskType,lang),messages:[{role:"user",content:messageContent}]})});
      const data=await res.json();
      const text=data.content.map(b=>b.text||"").join("");
      const parsed=JSON.parse(text.replace(/```json|```/g,"").trim());
      if(!proUser){ const n=uses+1; setUses(n); saveUses(n,session?.email); }
      addToHistory({ band:parsed.overallBand, taskType, wordCount:wordCount, mistakeCount:parsed.mistakes?.length||0, criteria:{ taskAchievement:parsed.criteria?.taskAchievement?.band, coherenceCohesion:parsed.criteria?.coherenceCohesion?.band, lexicalResource:parsed.criteria?.lexicalResource?.band, grammaticalRange:parsed.criteria?.grammaticalRange?.band } },session?.email);
      saveLastResult({result:parsed, topic, essay, taskType, lang});
      trackEvent("essay_analyzed", { task_type: taskType, band_score: parsed.overallBand, language: lang, is_pro: proUser });
      setLoading(false);
      setResult(parsed);
      setActiveTab("annotated");
    }catch(e){ setLoading(false); setError("Something went wrong. Please try again."); }
  };

  return (
    <div style={{minHeight:"100vh",background:"#f9f9f9",fontFamily:"'Source Sans Pro','Inter',system-ui,sans-serif",color:T.text}}>
      {showPaywall&&<PaywallModal onClose={()=>{setShowPaywall(false);setPaywallTab("cliq");}} onSuccess={handleProSuccess} session={session} initialTab={paywallTab}/>}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onSuccess={handleAuthSuccess}/>}
      {showChangePassword&&<ChangePasswordModal onClose={()=>setShowChangePassword(false)}/>}



      {/* NAV BAR 2 */}
      <div className="sticky-nav" style={{position:"sticky",top:0,zIndex:200,background:T.bg,borderBottom:`1px solid ${T.border}`,boxShadow:T.shadowNav}}>
        <div className="nav-inner" style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
          <div style={{display:"flex",alignItems:"center",gap:24}}>
            <Logo size={26}/>
            {/* Hamburger — mobile only */}
            <button className="hamburger-btn" onClick={()=>setMenuOpen(true)} style={{display:"none",background:"none",border:`1px solid ${T.border}`,borderRadius:8,padding:"6px 10px",cursor:"pointer",fontSize:18,color:T.text}}>☰</button>
            <div className="nav-tabs" style={{display:"flex",gap:4,alignItems:"center"}}>
              <MainTab label="✍️ Writing" active={["analyze","practice","grammar","exercises"].includes(mainView)} onClick={()=>{switchView("analyze");trackEvent("nav_click",{page:"analyze"});}}/>
              <MainTab label="🗣️ Speaking" active={mainView==="speaking"} onClick={()=>{switchView("speaking");trackEvent("nav_click",{page:"speaking"});}}/>
              <MainTab label="📖 Reading" active={mainView==="reading"} onClick={()=>{switchView("reading");trackEvent("nav_click",{page:"reading"});}}/>
              <MainTab label="📚 Toolkit" active={mainView==="toolkit"} onClick={()=>{switchView("toolkit");trackEvent("nav_click",{page:"toolkit"});}}/>
              <MainTab label="📈 Progress" active={mainView==="progress"} onClick={()=>{switchView("progress");trackEvent("nav_click",{page:"progress"});}}/>
              <MainTab label="✉️ Contact" active={mainView==="contact"} onClick={()=>{switchView("contact");trackEvent("nav_click",{page:"contact"});}}/>
            </div>
          </div>
          <div className="nav-right" style={{display:"flex",alignItems:"center",gap:10}}>
            {proUser?(
              <span style={{fontSize:13,color:T.green,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✓ Pro — Unlimited</span>
            ):(
              <button className="upgrade-btn" onClick={()=>setShowPaywall(true)} style={{background:"linear-gradient(135deg,#0056d2,#0041a8)",color:"white",border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:"0 2px 8px rgba(0,86,210,0.35)",letterSpacing:"0.01em"}}>🔓 Upgrade to Pro</button>
            )}
            <div style={{width:1,height:20,background:T.border}}/>
            {session?(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:T.textMid,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>👤 {session.name||session.email.split("@")[0]}</span>
                <button onClick={()=>setShowChangePassword(true)} style={{background:"transparent",border:"none",fontSize:12,fontWeight:600,color:T.textMuted,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",textDecoration:"underline",padding:0}}>🔑</button>
                <button onClick={handleSignOut} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,padding:"6px 12px",fontSize:12,fontWeight:600,color:T.textMuted,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Sign Out</button>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>{ setPaywallTab("code"); setShowPaywall(true); }} style={{background:"transparent",color:T.textMuted,border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",textDecoration:"underline",padding:0,whiteSpace:"nowrap"}}>Have a code?</button>
                <button onClick={()=>setShowAuth(true)} style={{background:"transparent",color:T.primary,border:`1.5px solid ${T.primary}`,borderRadius:4,padding:"7px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Sign In →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Writing Sub-Nav — shows on writing-related pages */}
      {["analyze","practice","grammar","exercises"].includes(mainView)&&(
        <div style={{background:T.bgGray,borderBottom:`1px solid ${T.border}`,padding:"0 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:4,overflowX:"auto",padding:"8px 0"}} className="tab-row">
            {[{v:"analyze",l:"🎓 Analyze"},{v:"practice",l:"🖊️ Practice"},{v:"grammar",l:"✏️ Grammar & Spelling"},{v:"exercises",l:"🏋️ Exercises"}].map(t=>(
              <button key={t.v} onClick={()=>switchView(t.v)} style={{background:mainView===t.v?T.primaryLight:"white",border:`1px solid ${mainView===t.v?T.primaryBorder:T.border}`,borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:mainView===t.v?700:500,color:mainView===t.v?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",whiteSpace:"nowrap",flexShrink:0}}>{t.l}</button>
            ))}
          </div>
        </div>
      )}

      {/* HERO */}
      {!["terms","privacy","refund","pricing"].includes(mainView)&&(<>
      <div style={{background:"#f0f4ff",position:"relative"}}>
        <div className="hero-inner" style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"stretch",minHeight:340}}>
          <div className="hero-text" style={{flex:"0 0 55%",padding:"48px 40px 48px 0",display:"flex",flexDirection:"column",justifyContent:"center",zIndex:2}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(0,86,210,0.1)",border:"1px solid rgba(0,86,210,0.2)",borderRadius:4,padding:"4px 12px",marginBottom:18,alignSelf:"flex-start"}}>
              <span style={{color:T.primary,fontSize:12,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Your Smart IELTS Writing Examiner</span>
            </div>
            <h1 style={{margin:"0 0 14px",fontSize:"clamp(26px,3.2vw,42px)",fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui",color:"#1c1d1f",lineHeight:1.2,letterSpacing:"-0.3px"}}>
              Write better.<br/>Score higher.<br/><span style={{color:T.primary}}>Get the IELTS band you deserve.</span>
            </h1>
            <p style={{color:T.textMuted,fontSize:16,lineHeight:1.6,fontFamily:"'Source Sans Pro','Inter',system-ui",margin:"0 0 24px",maxWidth:460}}>
              Instant band scores · Complete mistake detection · Band 8+ model essays · Practice Mode with live coaching
            </p>
            <div className="hero-btns" style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <button onClick={()=>switchView("analyze")} style={{background:T.primary,color:"white",border:"none",borderRadius:4,padding:"13px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:"0 2px 8px rgba(0,86,210,0.3)"}}>Start Analyzing →</button>
              <button onClick={()=>switchView("practice")} style={{background:"transparent",color:T.primary,border:`2px solid ${T.primary}`,borderRadius:4,padding:"11px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Try Practice Mode</button>
              {!proUser&&(
                <button onClick={()=>setShowPaywall(true)} style={{background:"#f59e0b",color:"white",border:"none",borderRadius:4,padding:"13px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:"0 2px 8px rgba(245,158,11,0.4)"}}>🔓 Upgrade to Pro</button>
              )}
            </div>
            {!proUser&&(
              <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>🇯🇴 Jordan users: pay</span>
                <span style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:20,padding:"2px 10px",fontSize:12,color:T.primary,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>17 JOD via CLIQ</span>
                <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.primary,fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",textDecoration:"underline",padding:0}}>Learn more →</button>
              </div>
            )}
          </div>
          <div className="hero-image" style={{flex:"0 0 45%",position:"relative",overflow:"hidden",minHeight:320}}>
            <img src="https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&q=85&auto=format&fit=crop" alt="Student studying for IELTS" style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",objectPosition:"center top"}}/>
            <div style={{position:"absolute",inset:0,background:"linear-gradient(90deg, #f0f4ff 0%, transparent 30%)"}}/>
          </div>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"16px 24px"}}>
        <div className="stats-inner" style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:32,alignItems:"center",flexWrap:"wrap"}}>
          {[["9","Band levels covered"],["4","IELTS criteria scored"],["100%","Official band descriptors"],["Task 1 & 2","Academic + General Training"]].map(([num,label])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{color:T.primary,fontWeight:700,fontSize:18,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{num}</span>
              <span style={{color:T.textMuted,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* UPGRADE BANNER — shown to non-Pro users only */}
      {!proUser&&(
        <div style={{background:"linear-gradient(135deg,#0a1628 0%,#0056d2 100%)",padding:"14px 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
              <span style={{fontSize:13,color:"rgba(255,255,255,0.95)",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600}}>
                🎓 Unlimited analyses · Full toolkit · Practice Mode · All exercises
              </span>
              <span style={{background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:20,padding:"2px 12px",fontSize:12,color:"white",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>
                🇯🇴 Pay via CLIQ — 17 JOD/month
              </span>
            </div>
            <button onClick={()=>setShowPaywall(true)}
              style={{background:"white",color:T.primary,border:"none",borderRadius:6,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",flexShrink:0,boxShadow:"0 2px 8px rgba(0,0,0,0.2)"}}>
              🔓 Upgrade to Pro →
            </button>
          </div>
        </div>
      )}

      {/* CONTENT AREA */}
      <div className="content-outer" style={{maxWidth:1200,margin:"24px auto 80px",padding:"0 24px"}}>
        <div className="content-card" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"32px",boxShadow:T.shadow}}>

        {/* ANALYZE */}
        {mainView==="analyze"&&(
          <div className="analyze-box" style={{background:"#ffffff",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",padding:"32px 28px"}}>
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>Select Task Type</label>
              <p style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:10,marginTop:0}}>Choose the type of writing task you are submitting. Task 2 is the essay. Task 1 Academic is for graphs/charts. Task 1 General is for letters.</p>
              <div className="task-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {Object.entries(TASK_TYPES).map(([key,task])=>(
                  <button key={key} onClick={()=>{ setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); clearLastResult(); }}
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
                  {imagePreview?(<div><img src={imagePreview} alt="graph" style={{maxHeight:180,maxWidth:"100%",borderRadius:8,marginBottom:8}}/><div style={{fontSize:12,color:T.green,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✓ Uploaded — click to change</div></div>):(<div><div style={{fontSize:32,marginBottom:8}}>📊</div><div style={{fontSize:14,color:T.gold,fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:4}}>Click to upload graph/chart image</div><div style={{fontSize:12,color:T.textMuted,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>JPG, PNG — reads and evaluates the graph</div></div>)}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <label style={{fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>
                    {taskType==="task1general"?"Letter Task Instructions":taskType==="task1academic"?"Task Description":"Essay Question / Topic"}
                  </label>
                  <button type="button" onClick={()=>topicImgRef.current.click()}
                    style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"4px 10px",fontSize:11,color:T.blue,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    {processingTopicImg ? "⏳ Reading..." : "📷 Upload Image"}
                  </button>
                  <input ref={topicImgRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    onChange={e=>{ if(e.target.files[0]) extractTextFromImage(e.target.files[0],"topic"); }}/>
                </div>
                <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
                  placeholder={taskType==="task2"?"e.g. Some people think universities should focus on job skills. Discuss both views and give your opinion.":taskType==="task1academic"?"e.g. The graph below shows changes in energy consumption. Summarise the information and make comparisons.":"e.g. You recently bought a laptop online but it arrived damaged. Write a letter to the manager."}
                  style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              </div>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7,flexWrap:"wrap",gap:6}}>
                  <label style={{fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:700}}>
                    Student's Response
                    <span style={{fontSize:11,color:T.textMuted,fontWeight:400,textTransform:"none",letterSpacing:0}}> (minimum {minWords} words required)</span>
                    <span style={{color:wordCount>=minWords?T.green:wordCount>=(minWords*0.6)?T.amber:T.red,marginLeft:10,fontWeight:500}}>
                      {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords} required)`}
                    </span>
                  </label>
                  <button type="button" onClick={()=>essayImgRef.current.click()}
                    style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"4px 10px",fontSize:11,color:T.blue,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    {processingEssayImg ? "⏳ Reading..." : "📷 Upload Image"}
                  </button>
                  <input ref={essayImgRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    onChange={e=>{ if(e.target.files[0]) extractTextFromImage(e.target.files[0],"essay"); }}/>
                </div>
                <textarea value={essay} onChange={e=>setEssay(e.target.value)}
                  placeholder={taskType==="task1general"?"Dear Sir/Madam,\n\nI am writing to...":taskType==="task1academic"?"The graph illustrates...":"Paste the student's essay here..."}
                  rows={10}
                  style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              </div>
              {error&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:14,margin:0,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>{error}</p></Card>}
              {!proUser&&usesLeft===1&&!session&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ This is your free analysis. </span>
                  <button onClick={()=>setShowAuth(true)} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Sign up for 1 more</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}> or </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>upgrade to Pro</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}> for unlimited access.</span>
                </Card>
              )}
              {!proUser&&usesLeft===1&&session&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>⚠️ Last free analysis! </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Upgrade to Pro</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Source Sans Pro','Inter',system-ui"}}> for unlimited access.</span>
                </Card>
              )}
              <button ref={analyzeRef} onClick={analyze} disabled={loading}
                style={{background:loading?T.bgGray:T.primary,border:"none",borderRadius:4,color:loading?T.textMuted:"#fff",fontSize:15,fontWeight:700,padding:"14px 32px",cursor:loading?"not-allowed":"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",transition:"background 0.15s",display:"flex",alignItems:"center",gap:10,justifyContent:"center",letterSpacing:"0.01em"}}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?(session?"🔓 Upgrade to Continue":"🔓 Sign Up for 1 More Free"):`Analyze ${TASK_TYPES[taskType].label} →`}
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
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button onClick={()=>{ setResult(null); clearLastResult(); setTopic(""); setEssay(""); window.scrollTo({top:0,behavior:"smooth"}); }}
                    style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                    ✏️ New Analysis
                  </button>
                </div>
                {/* FIX 1: Overall band header — score now visible with proper contrasting colors */}
                <div className="result-header" style={{background:`linear-gradient(135deg, ${T.primary} 0%, #003a99 100%)`,borderRadius:12,padding:"28px 32px",marginBottom:24,display:"flex",alignItems:"center",gap:28,flexWrap:"wrap",boxShadow:"0 8px 32px rgba(0,0,0,0.2)",borderLeft:`6px solid ${bandColor(result.overallBand)}`}}>
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

                <div className="tab-row" style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap",background:T.bg,padding:6,borderRadius:10,border:"1px solid #e4e4e4"}}>
                  <TabBtn label="📝 Annotated Essay" active={activeTab==="annotated"} onClick={()=>setActiveTab("annotated")}/>
                  <TabBtn label="📊 Scores" active={activeTab==="scores"} onClick={()=>setActiveTab("scores")}/>
                  <TabBtn label="🔍 Mistakes" active={activeTab==="mistakes"} onClick={()=>setActiveTab("mistakes")} badge={result.mistakes?.length}/>
                  <TabBtn label="📈 Band Booster" active={activeTab==="booster"} onClick={()=>setActiveTab("booster")}/>
                  <TabBtn label="💬 Vocabulary" active={activeTab==="vocab"} onClick={()=>setActiveTab("vocab")}/>
                  <TabBtn label="🎓 Tips" active={activeTab==="tips"} onClick={()=>setActiveTab("tips")}/>
                  <TabBtn label="✨ Sample" active={activeTab==="sample"} onClick={()=>setActiveTab("sample")}/>
                </div>

                <div>
                {activeTab==="annotated"&&(
                  <Card>
                    <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <span>📝 Your Essay — 👆 Click underlined words for corrections</span>
                      <span style={{color:T.red,fontWeight:600}}>{result.mistakes?.length} mistakes found</span>
                    </div>
                    <MemoAnnotatedEssay essay={essay} mistakes={result.mistakes}/>
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
                </div>{/* end minHeight tab wrapper */}
              </div>
            )}
          </div>
        )}

        {mainView==="practice"&&<PracticeMode isPro={proUser} onUpgrade={()=>setShowPaywall(true)} email={session?.email}/>}
        {mainView==="progress"&&<ProgressTracker isPro={proUser} onUpgrade={()=>setShowPaywall(true)} email={session?.email}/>}
        {mainView==="toolkit"&&<ToolkitContent isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="grammar"&&<GrammarChecker isPro={proUser}/>}
        {mainView==="exercises"&&<ExercisesHub isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="speaking"&&<SpeakingPage isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="reading"&&<ReadingPage isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="contact"&&<ContactPage/>}
        </div>
      </div>
      </>)}

      {mainView==="terms"&&<TermsPage onBack={()=>switchView("analyze")}/>}
      {mainView==="privacy"&&<PrivacyPage onBack={()=>switchView("analyze")}/>}
      {mainView==="refund"&&<RefundPage onBack={()=>switchView("analyze")}/>}
      {mainView==="pricing"&&<PricingPage onBack={()=>switchView("analyze")} onUpgrade={()=>setShowPaywall(true)} isPro={proUser}/> }
      {mainView==="admin"&&<AdminPage onBack={()=>{ setMainView("analyze"); window.history.replaceState({view:"analyze"},""," /"); }}/>}

      {/* FOOTER */}
      <div style={{background:"#1c1d1f",borderTop:"1px solid #333",padding:"32px 24px",marginTop:40}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="footer-top" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16,marginBottom:20}}>
            <Logo size={20} style={{cursor:"default"}}/>
            <div className="footer-links" style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              {[["terms","Terms of Service"],["privacy","Privacy Policy"],["refund","Refund Policy"],["pricing","Pricing"]].map(([key,label])=>(
                <button key={key} onClick={()=>switchView(key)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:13,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",padding:0}}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:16,display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
            <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>© {new Date().getFullYear()} Englishfool. All rights reserved.</span>
            <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Your Smart IELTS Writing Examiner</span>
          </div>
        </div>
      </div>

      {/* ── LOADING OVERLAY ── */}
      {loading&&(
        <div style={{
          position:"fixed",inset:0,
          background:"rgba(0,0,0,0.6)",
          backdropFilter:"blur(4px)",
          zIndex:900,
          display:"flex",
          flexDirection:"column",
          alignItems:"center",
          justifyContent:"center",
          gap:20,
          padding:24,
          userSelect:"none"
        }}>
          <div style={{
            fontSize:64,
            lineHeight:1,
            pointerEvents:"none",
            animation:"spin 2s linear infinite",
            display:"block",
            transformOrigin:"center center"
          }}>⏳</div>
          <div style={{
            background:"white",
            borderRadius:16,
            padding:"24px 32px",
            textAlign:"center",
            boxShadow:"0 8px 40px rgba(0,0,0,0.3)",
            maxWidth:300,
            pointerEvents:"none"
          }}>
            <div style={{fontSize:17,fontWeight:700,color:"#1f1f1f",fontFamily:"'Source Sans Pro','Inter',system-ui",marginBottom:8}}>
              Analysing your essay...
            </div>
            <div style={{fontSize:13,color:"#636363",fontFamily:"'Source Sans Pro','Inter',system-ui",lineHeight:1.6}}>
              Please stay on this page.<br/>This usually takes 15–30 seconds.
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE HAMBURGER MENU OVERLAY ── */}
      {menuOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:500}} onClick={()=>setMenuOpen(false)}>
          <div style={{
            position:"absolute",top:0,right:0,width:280,height:"100%",
            background:"white",boxShadow:"-4px 0 24px rgba(0,0,0,0.18)",
            display:"flex",flexDirection:"column",padding:"0 0 32px"
          }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px",borderBottom:`1px solid ${T.border}`}}>
              <Logo size={20}/>
              <button onClick={()=>setMenuOpen(false)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:T.textMuted,padding:4}}>✕</button>
            </div>
            {/* Quick nav tabs at top of menu */}
            <div style={{display:"flex",gap:6,padding:"12px 16px",borderBottom:`1px solid ${T.border}`,flexWrap:"wrap"}}>
              {[{view:"analyze",icon:"✍️",label:"Writing"},{view:"speaking",icon:"🗣️",label:"Speaking"},{view:"reading",icon:"📖",label:"Reading"}].map(item=>(
                <button key={item.view} onClick={()=>{switchView(item.view);setMenuOpen(false);}}
                  style={{flex:1,background:mainView===item.view?T.primaryLight:T.bgGray,border:`1px solid ${mainView===item.view?T.primaryBorder:T.border}`,borderRadius:8,padding:"8px 4px",fontSize:11,fontWeight:700,color:mainView===item.view?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                  <span>{item.icon}</span>{item.label}
                </button>
              ))}
            </div>
            {/* Nav items */}
            <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
              {[
                {view:"analyze",icon:"🎓",label:"Writing: Analyze"},
                {view:"practice",icon:"🖊️",label:"Writing: Practice"},
                {view:"grammar",icon:"✏️",label:"Writing: Grammar"},
                {view:"exercises",icon:"🏋️",label:"Writing: Exercises"},
                {view:"speaking",icon:"🗣️",label:"IELTS Speaking"},
                {view:"reading",icon:"📖",label:"IELTS Reading"},
                {view:"toolkit",icon:"📚",label:"IELTS Toolkit"},
                {view:"progress",icon:"📈",label:"Progress Tracker"},
                {view:"contact",icon:"✉️",label:"Contact Us"},
              ].map(item=>(
                <button key={item.view} onClick={()=>{switchView(item.view);setMenuOpen(false);}}
                  style={{
                    width:"100%",background:mainView===item.view?T.primaryLight:"transparent",
                    border:"none",borderLeft:mainView===item.view?`4px solid ${T.primary}`:"4px solid transparent",
                    padding:"14px 20px",display:"flex",alignItems:"center",gap:12,
                    cursor:"pointer",textAlign:"left",
                    color:mainView===item.view?T.primary:T.text,
                    fontSize:15,fontWeight:mainView===item.view?700:400,
                    fontFamily:"'Source Sans Pro','Inter',system-ui"
                  }}>
                  <span style={{fontSize:18}}>{item.icon}</span>{item.label}
                </button>
              ))}
              <div style={{height:1,background:T.border,margin:"12px 20px"}}/>
              {/* Language switcher inside menu */}
              <div style={{padding:"8px 20px"}}>
                <div style={{fontSize:11,color:T.textMuted,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Feedback Language</div>
                <div style={{display:"flex",gap:8}}>
                  {["en","ar"].map(l=>(
                    <button key={l} onClick={()=>switchLang(l)} style={{
                      flex:1,background:lang===l?T.primaryLight:"transparent",
                      border:`1px solid ${lang===l?T.primaryBorder:T.border}`,
                      borderRadius:8,padding:"8px",fontSize:13,fontWeight:lang===l?700:400,
                      color:lang===l?T.primary:T.textMuted,cursor:"pointer",
                      fontFamily:"'Source Sans Pro','Inter',system-ui"
                    }}>{l==="en"?"🇬🇧 English":"🇸🇦 عربي"}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Upgrade button at bottom of menu */}
            {!proUser&&(
              <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>{setShowPaywall(true);setMenuOpen(false);}} style={{
                  width:"100%",background:"linear-gradient(135deg,#0056d2,#0041a8)",color:"white",border:"none",
                  borderRadius:8,padding:"14px",fontSize:14,fontWeight:700,
                  cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui",boxShadow:"0 2px 8px rgba(0,86,210,0.35)"
                }}>🔓 Upgrade to Pro — $25/mo</button>
                <button onClick={()=>{setShowPaywall(true);setMenuOpen(false);}} style={{
                  width:"100%",background:"#f0fdf4",color:T.green,border:`1px solid ${T.greenBorder}`,
                  borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,
                  cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"
                }}>🇯🇴 Jordan: Pay 17 JOD via CLIQ</button>
              </div>
            )}
            {proUser&&(
              <div style={{padding:"0 20px"}}>
                <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 16px",textAlign:"center",fontSize:13,color:T.green,fontWeight:700,fontFamily:"'Source Sans Pro','Inter',system-ui"}}>✓ Pro — Unlimited Access</div>
              </div>
            )}
            <div style={{padding:"12px 20px 0"}}>
              {session?(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>{setShowChangePassword(true);setMenuOpen(false);}} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                    🔑 Change Password
                  </button>
                  <button onClick={handleSignOut} style={{width:"100%",background:"#f3f3f3",border:`1px solid ${T.border}`,borderRadius:8,padding:"12px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>
                    🚪 Sign Out ({session.email})
                  </button>
                </div>
              ):(
                <button onClick={()=>{setShowAuth(true);setMenuOpen(false);}} style={{width:"100%",background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Source Sans Pro','Inter',system-ui"}}>Sign In / Register →</button>
              )}
            </div>
          </div>
        </div>
      )}


      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Rubik:wght@900&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; overflow-y: scroll; overscroll-behavior: none; }
        body { font-family: 'Source Sans 3','Inter',system-ui,sans-serif; margin: 0; -webkit-font-smoothing: antialiased; overscroll-behavior: none; -webkit-overflow-scrolling: touch; }
        textarea, input, select, button { font-family: 'Source Sans Pro','Inter',system-ui,sans-serif; }
        img { max-width: 100%; height: auto; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F3F4F6; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }

        @media (max-width: 768px) {
          .hamburger-btn { display: block !important; }
          .nav-tabs { display: none !important; }
          .nav-right { display: none !important; }
          .hero-inner { flex-direction: column !important; min-height: auto !important; padding: 28px 16px 32px !important; }
          .hero-text { flex: none !important; width: 100% !important; padding: 0 !important; }
          .hero-image { display: none !important; }
          .hero-btns { flex-direction: column !important; }
          .hero-btns button { width: 100% !important; }
          .stats-inner { gap: 16px !important; padding: 12px 16px !important; }
          .content-outer { padding: 0 10px !important; margin: 12px auto 40px !important; }
          .content-card { padding: 14px !important; }
          .analyze-box { padding: 16px 12px !important; }
          .task-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
          .result-header { padding: 18px 16px !important; gap: 12px !important; }
          .tab-row { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; scrollbar-width: none !important; }
          .tab-row::-webkit-scrollbar { display: none !important; }
          .contact-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }
          .footer-top { flex-direction: column !important; gap: 12px !important; }
          .footer-links { flex-wrap: wrap !important; gap: 12px !important; }
          .mobile-hide { display: none !important; }
          .upgrade-btn { display: none !important; }
          /* Sticky nav can cause scroll issues on Android - make relative on mobile */
          .sticky-nav { position: relative !important; top: auto !important; }
        }
        @media (hover: none) and (pointer: coarse) {
          html, body { overscroll-behavior-y: none; touch-action: pan-y; }
        }
      `}</style>
    </div>
  );
}
