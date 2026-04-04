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

const STRIPE_CONFIGURED = true;
const PADDLE_TOKEN = "live_ec699d44651befed9506c7e7bd2";
const PADDLE_PRICE_ID = "pri_01kmz7cbtkca44p95qp25jw59z";
// Admin key is NEVER stored in client-side code.
// Authentication is handled server-side via x-admin-key header.
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
  primary:      "#1e3a5f",   // Deep Navy
  primaryHover: "#152a45",
  primaryLight: "#e8eef5",
  primaryBorder:"#b3c6d9",
  accent:       "#d4af37",   // Muted Gold
  accentLight:  "#fdf6dc",
  accentBorder: "#e8d27a",
  bg:           "#f8f9fa",   // Warm Off-White
  bgSurface:    "#ffffff",
  bgMuted:      "#f1f5f9",
  bgGray:       "#f1f5f9",
  text:         "#1e293b",
  textMid:      "#334155",
  textMuted:    "#64748b",
  textLight:    "#94a3b8",
  border:       "#e2e8f0",
  borderMid:    "#cbd5e1",
  green:        "#059669", greenBg:"#d1fae5",  greenBorder:"#6ee7b7",
  red:          "#dc2626", redBg:"#fee2e2",    redBorder:"#fca5a5",
  amber:        "#d97706", amberBg:"#fef3c7",  amberBorder:"#fcd34d",
  blue:         "#2563eb", blueBg:"#dbeafe",   blueBorder:"#93c5fd",
  purple:       "#7c3aed", purpleBg:"#ede9fe", purpleBorder:"#c4b5fd",
  gold:         "#d4af37",
  shadow:    "0 2px 8px rgba(0,0,0,0.06)",
  shadowMd:  "0 4px 16px rgba(0,0,0,0.08)",
  shadowLg:  "0 8px 32px rgba(0,0,0,0.10)",
  shadowNav: "0 2px 4px rgba(0,0,0,0.08)",
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

const SAMPLE_ESSAY_TOPIC = "Some people believe that social media has a negative impact on society, while others think it has brought many benefits. Discuss both views and give your own opinion.";
const SAMPLE_ESSAY_TEXT = `In todays world, social media has became a very important part of our lifes. Some people think that it has bad effects on society, while others believe it has many benifits. In this essay, I will discuss both sides and give my opinion.

On the one hand, social media has many negative impacts. Firstly, people are spending too much time on their phones instead of talking to each other face to face. For example, in many familys, everyone is looking at their phone during dinner time and nobody is communicating. Secondly, social media can cause depression and anxiety, especially for young people who compare theirselves with others online. They see perfect pictures and feel bad about their own lifes.

On the other hand, there are many advantages of social media. It helps people to stay connected with friends and family members who live in diffrent countries. For instance, I can easily talk to my cousin who lives in Canada through WhatsApp and Instagram. Moreover, social media is a good tool for businesses. Many small business owners use it to advertise their products and reaching more customers without paying alot of money.

In my opinion, I think social media has both good and bad sides but the disadvantages are more than the advantages. People should try to reduce the time they spend on social media and focus on real life relationships. The goverments should also make laws to protect young people from the dangers of social media.

In conclusion, although social media has some benifits, I believe the negative effects is more significant and we need to use it more carefully.`;

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
              <span style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"white",borderRadius:10,padding:"10px 14px",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",width:260,zIndex:100,boxShadow:T.shadowLg,lineHeight:1.5,fontStyle:"normal",whiteSpace:"normal"}}>
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
const Logo=({size=26,style={},onClick=null})=>(
  <span onClick={onClick} style={{fontFamily:"'Rubik',sans-serif",fontWeight:900,fontSize:size,letterSpacing:"-1px",lineHeight:1,cursor:"pointer",...style}}>
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
      <span style={{color:T.textMuted,fontSize:12,fontWeight:600,letterSpacing:"0.05em",textTransform:"uppercase",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{label}</span>
      <span style={{background:bandBg(data.band),color:bandColor(data.band),fontWeight:700,fontSize:20,borderRadius:6,padding:"4px 14px",border:`1px solid ${bandColor(data.band)}30`}}>{data.band}</span>
    </div>
    <p style={{color:T.textMid,fontSize:15,lineHeight:1.65,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{data.feedback}</p>
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
      <span style={{fontSize:11,fontWeight:700,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>#{i+1}</span>
      <span style={{background:"white",border:`1px solid ${severityColor(mistake.severity)}60`,borderRadius:20,padding:"1px 8px",fontSize:11,color:severityColor(mistake.severity),fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>{mistake.severity}</span>
      <span style={{background:"white",border:`1px solid ${categoryColor(mistake.category)}50`,borderRadius:20,padding:"1px 8px",fontSize:11,color:categoryColor(mistake.category),fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>{mistake.category}</span>
      {!isLocated&&<span style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:20,padding:"1px 8px",fontSize:10,color:T.amber,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>⚠ not highlighted in essay</span>}
    </div>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>ORIGINAL</div><div style={{background:"#fee2e2",borderRadius:6,padding:"5px 10px",color:"#991b1b",fontSize:13,fontStyle:"italic"}}>"{mistake.original}"</div></div>
      <div style={{fontSize:16,color:T.textMuted,alignSelf:"center"}}>→</div>
      <div style={{flex:1,minWidth:130}}><div style={{fontSize:10,color:T.textMuted,marginBottom:3,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>CORRECTION</div><div style={{background:"#dcfce7",borderRadius:6,padding:"5px 10px",color:"#166534",fontSize:13}}>"{mistake.correction}"</div></div>
    </div>
    <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>💡 {mistake.explanation}</p>
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
    borderBottom: active ? `3px solid ${T.accent}` : "3px solid transparent",
    color: active ? T.accent : "rgba(255,255,255,0.75)",
    padding: "0 14px",
    height: 64,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 700 : 400,
    fontFamily: "'Cairo','Source Sans Pro',system-ui",
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

  const inp={width:"100%",background:"#f9f9f9",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"11px 14px",fontFamily:"'Cairo','Source Sans Pro',system-ui",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,overflowY:"auto"}}>
      <div style={{background:"white",borderRadius:20,padding:"36px 28px",maxWidth:400,width:"100%",position:"relative",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"#f3f3f3",border:"none",fontSize:16,cursor:"pointer",width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:T.text}}>✕</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:8}}>🎓</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,margin:"0 0 4px"}}>
            {mode==="login"?"Welcome back":mode==="register"?"Create account":"Reset password"}
          </h2>
          <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:0}}>
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
            <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
              <input type="checkbox" checked={rememberMe} onChange={e=>setRememberMe(e.target.checked)}
                style={{width:16,height:16,cursor:"pointer",accentColor:T.primary}}/>
              Remember my email
            </label>
          )}
          {error&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{error}</div>}
          {success&&<div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{success}</div>}
          <button onClick={handle} disabled={loading}
            style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",opacity:loading?0.7:1}}>
            {loading?"⏳ Please wait...":mode==="login"?"Sign In →":mode==="register"?"Create Account →":"Send Reset Link →"}
          </button>
        </div>
        <div style={{textAlign:"center",marginTop:16,fontSize:13,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",flexDirection:"column",gap:8}}>
          {mode==="login"&&(
            <>
              <div>Don't have an account? <button onClick={()=>{setMode("register");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Sign up free</button></div>
              <div><button onClick={()=>{setMode("forgot");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",textDecoration:"underline"}}>Forgot password?</button></div>
            </>
          )}
          {mode==="register"&&(
            <div>Already have an account? <button onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Sign in</button></div>
          )}
          {mode==="forgot"&&(
            <div><button onClick={()=>{setMode("login");setError("");setSuccess("");}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontWeight:700,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>← Back to sign in</button></div>
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

  const inp={width:"100%",background:"#f9f9f9",border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"11px 14px",fontFamily:"'Cairo','Source Sans Pro',system-ui",outline:"none",boxSizing:"border-box"};

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(6px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"white",borderRadius:20,padding:"36px 28px",maxWidth:400,width:"100%",position:"relative",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <button onClick={onClose} style={{position:"absolute",top:12,right:12,background:"#f3f3f3",border:"none",fontSize:16,cursor:"pointer",width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,color:T.text}}>✕</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:32,marginBottom:8}}>🔑</div>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,margin:"0 0 4px"}}>Change Password</h2>
          <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:0}}>Enter your new password below</p>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{position:"relative"}}>
            <input value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="New password (min 6 characters)" type={showPass?"text":"password"} style={{...inp,paddingRight:48}}/>
            <button type="button" onClick={()=>setShowPass(!showPass)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.textMuted,padding:4}}>{showPass?"🙈":"👁️"}</button>
          </div>
          <input value={confirmPass} onChange={e=>setConfirmPass(e.target.value)} placeholder="Confirm new password" type={showPass?"text":"password"} style={inp} onKeyDown={e=>e.key==="Enter"&&handleChange()}/>
          {error&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{error}</div>}
          {success&&<div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{success}</div>}
          <button onClick={handleChange} disabled={loading} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",opacity:loading?0.7:1}}>
            {loading?"⏳ Updating...":"Update Password →"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Paywall ───────────────────────────────────
const PaywallModal=({onClose,onSuccess,session,initialTab="cliq",onRegister})=>{
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
          message:`New CLIQ Pro upgrade request:\n\nName: ${cliqForm.name.trim()}\nEmail: ${cliqForm.email.trim()}\nMobile: ${cliqForm.mobile.trim()}\nAmount: 10 JOD\nCLIQ Alias: Efool2026`,
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
    <button onClick={()=>setTab(key)} style={{flex:1,minWidth:0,padding:"8px 4px",background:tab===key?T.primaryLight:"transparent",border:`1px solid ${tab===key?T.primaryBorder:T.border}`,borderRadius:8,fontSize:11,fontWeight:tab===key?700:400,color:tab===key?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",flexDirection:"column",alignItems:"center",gap:2,lineHeight:1.2,textAlign:"center",wordBreak:"break-word"}}>
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
            <p style={{color:T.textMid,fontSize:13,lineHeight:1.5,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:0}}>Unlimited analyses, full toolkit, and all exercises.</p>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{overflowY:"auto",padding:"0 20px 24px",flex:1}}>

        {/* Features list */}
        <div style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:10,padding:"12px 16px",marginBottom:20}}>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 0"}}>
            {FEATURES.map((f,i)=>(
              <div key={i} style={{width:"100%",display:"flex",gap:8,fontSize:12,color:T.primary,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                <span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}
              </div>
            ))}
          </div>
        </div>

        {/* Tab switcher */}
        <div style={{display:"flex",gap:6,marginBottom:20}}>
          {tabBtn("cliq","🏦","CLIQ 🇯🇴")}
          {tabBtn("international","💳","International")}
        </div>

        {/* ── CLIQ Tab ── */}
        {tab==="cliq"&&(
          <div>
            <div style={{background:"#f0fdf4",border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"14px 16px",marginBottom:16,textAlign:"center"}}>
              <div style={{fontSize:11,fontWeight:700,color:T.green,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:4}}>🇯🇴 دفع عن طريق كليك</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:T.text,lineHeight:1}}>10 <span style={{fontSize:20,fontWeight:700}}>دينار</span></div>
              <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>اشتراك لمدة 3 أشهر · الإلغاء في أي وقت</div>
            </div>

            {/* Arabic steps */}
            <div style={{direction:"rtl",textAlign:"right",marginBottom:16}}>
              {/* Step 1 */}
              <div style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{background:T.primary,color:"white",borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,flexShrink:0}}>١</span>
                  <span style={{fontSize:14,fontWeight:700,color:T.primary,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>سجّل حساب بالإيميل وكلمة السر</span>
                </div>
                {session?(
                  <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"8px 12px",fontSize:13,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>
                    ✅ أنت مسجل بـ {session.email}
                  </div>
                ):(
                  <button onClick={()=>{onClose();if(onRegister) setTimeout(onRegister,200);}} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",width:"100%"}}>
                    📧 سجّل الآن
                  </button>
                )}
              </div>

              {/* Step 2 */}
              <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:10}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{background:T.amber,color:"white",borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,flexShrink:0}}>٢</span>
                  <span style={{fontSize:14,fontWeight:700,color:T.amber,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>حوّل ١٠ دنانير عن طريق كليك</span>
                </div>
                <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.7}}>
                  افتح تطبيق البنك ← كليك ← أرسل أموال<br/>
                  أرسل <strong style={{color:T.text}}>١٠ دنانير</strong> إلى الاسم المستعار: <strong style={{color:T.primary,fontFamily:"monospace",fontSize:15,direction:"ltr",display:"inline-block"}}>Efool2026</strong>
                </div>
              </div>

              {/* Step 3 */}
              <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:16}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                  <span style={{background:T.green,color:"white",borderRadius:"50%",width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,flexShrink:0}}>٣</span>
                  <span style={{fontSize:14,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>بعد الدفع، عبّي النموذج وسيتم تفعيل حسابك</span>
                </div>
              </div>
            </div>

            {cliqStatus==="sent"?(
              <div style={{background:T.greenBg,border:`2px solid ${T.greenBorder}`,borderRadius:10,padding:"18px",textAlign:"center",direction:"rtl"}}>
                <div style={{fontSize:28,marginBottom:8}}>✅</div>
                <div style={{fontSize:15,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:4}}>تم استلام طلبك!</div>
                <p style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:0,lineHeight:1.6}}>سنتحقق من الدفع ونفعّل حسابك خلال ساعات قليلة. سنتواصل معك على الواتساب <strong>{cliqForm.mobile}</strong></p>
              </div>
            ):(
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[{field:"name",label:"الاسم الكامل",placeholder:"اسمك الكامل",type:"text"},{field:"email",label:"البريد الإلكتروني",placeholder:"نفس الإيميل اللي سجلت فيه",type:"email"},{field:"mobile",label:"رقم الجوال (واتساب)",placeholder:"مثال: 0791234567",type:"tel"}].map(({field,label,placeholder,type})=>(
                  <div key={field}>
                    <label style={{display:"block",fontSize:12,fontWeight:700,color:T.textMid,marginBottom:4,fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl",textAlign:"right"}}>{label}</label>
                    <input type={type} value={cliqForm[field]} onChange={e=>setCliqForm(p=>({...p,[field]:e.target.value}))} placeholder={placeholder}
                      style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"10px 12px",fontFamily:"'Cairo','Source Sans Pro',system-ui",outline:"none",boxSizing:"border-box",direction:type==="tel"?"ltr":"rtl",textAlign:type==="tel"?"left":"right"}}/>
                  </div>
                ))}
                {cliqStatus==="error"&&<div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red,fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl",textAlign:"right"}}>⚠️ الرجاء تعبئة جميع الحقول</div>}
                <button onClick={submitCliq} disabled={cliqStatus==="sending"}
                  style={{background:cliqStatus==="sending"?T.bgGray:T.green,color:cliqStatus==="sending"?T.textMuted:"white",border:"none",borderRadius:8,padding:"14px",fontSize:15,fontWeight:700,cursor:cliqStatus==="sending"?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                  {cliqStatus==="sending"?"⏳ جاري الإرسال...":"✅ دفعت — أرسل الطلب"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── International Tab ── */}
        {tab==="international"&&(
          <div style={{textAlign:"center"}}>
            <div style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px",marginBottom:16}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:T.text,lineHeight:1}}>$17 <span style={{fontSize:14,color:T.textMuted,fontWeight:400}}>/ 3 أشهر</span></div>
              <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>اشتراك 3 أشهر · يجدد بـ $25 · إلغاء في أي وقت</div>
            </div>
            <button onClick={()=>{
              if(window.Paddle){
                window.Paddle.Checkout.open({
                  items:[{priceId:PADDLE_PRICE_ID,quantity:1}],
                  customer: session?.email ? {email:session.email} : undefined,
                  settings:{displayMode:"overlay",theme:"light",locale:"en",successUrl:window.location.origin+"?checkout=success"}
                });
              } else {
                alert("Payment system is loading. Please try again in a moment.");
              }
            }} style={{width:"100%",background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:T.shadowMd}}>
              💳 احصل على Pro — $17 (3 أشهر)
            </button>
            <p style={{fontSize:11,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:10,lineHeight:1.5}}>
              Secure payment via Paddle. Accepts Visa, Mastercard, PayPal, Apple Pay, Google Pay and more. Paddle is the Merchant of Record.
            </p>
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
      <p style={{color:T.textMid,fontSize:14,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:20,lineHeight:1.6}}>Complete your first essay analysis to start tracking your band score improvement over time.</p>
    </Card>
  );
  if(history.length===0) return (
    <Card style={{textAlign:"center",padding:"40px 24px"}}>
      <div style={{fontSize:40,marginBottom:16}}>📈</div>
      <p style={{color:T.textMid,fontSize:14,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>No essays analysed yet. Complete your first analysis to start tracking progress!</p>
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
          {bandDiff!==null&&<div style={{fontSize:13,color:parseFloat(bandDiff)>=0?T.green:T.red,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:4}}>{parseFloat(bandDiff)>=0?`▲ +${bandDiff}`:`▼ ${bandDiff}`} vs previous</div>}
        </Card>
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:42,fontWeight:900,color:T.text,fontFamily:"Georgia,serif",lineHeight:1}}>{history.length}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Essays Analysed</div>
        </Card>
        <Card style={{textAlign:"center"}}>
          <div style={{fontSize:42,fontWeight:900,color:T.red,fontFamily:"Georgia,serif",lineHeight:1}}>{latest.mistakeCount}</div>
          <div style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase",marginTop:4}}>Latest Mistakes</div>
          {mistakeDiff!==null&&<div style={{fontSize:13,color:mistakeDiff<=0?T.green:T.red,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:4}}>{mistakeDiff<=0?`▲ ${Math.abs(mistakeDiff)} fewer`:`▼ ${mistakeDiff} more`} vs previous</div>}
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
          <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📊 Band Score History</div>
          <div style={{display:"flex",alignItems:"flex-end",gap:8,height:120,padding:"0 8px"}}>
            {[...history].reverse().map((h,i)=>{
              const heightPct=((h.band-4)/(9-4))*100;
              return (
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                  <div style={{fontSize:11,fontWeight:700,color:bandColor(h.band),fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{h.band}</div>
                  <div style={{width:"100%",background:bandColor(h.band),borderRadius:"4px 4px 0 0",height:`${heightPct}%`,minHeight:8,opacity:i===history.length-1?1:0.7,transition:"all 0.3s"}}/>
                  <div style={{fontSize:9,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",textAlign:"center"}}>{new Date(h.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {previous&&(
        <Card>
          <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📋 Criteria Comparison — Latest vs Previous</div>
          {[["Task Achievement","taskAchievement"],["Coherence & Cohesion","coherenceCohesion"],["Lexical Resource","lexicalResource"],["Grammatical Range","grammaticalRange"]].map(([label,key])=>{
            const curr=latest.criteria?.[key]||0;
            const prev=previous.criteria?.[key]||0;
            const diff=(curr-prev).toFixed(1);
            return (
              <div key={key} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                <div style={{width:160,fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>{label}</div>
                <div style={{flex:1,background:T.bgGray,borderRadius:6,height:8,position:"relative"}}>
                  <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${(curr/9)*100}%`,background:bandColor(curr),borderRadius:6,transition:"width 0.5s"}}/>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:bandColor(curr),fontFamily:"'Cairo','Source Sans Pro',system-ui",width:32}}>{curr}</div>
                <div style={{fontSize:12,fontWeight:700,color:parseFloat(diff)>0?T.green:parseFloat(diff)<0?T.red:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",width:40}}>
                  {parseFloat(diff)>0?`+${diff}`:diff}
                </div>
              </div>
            );
          })}
        </Card>
      )}
      <Card>
        <div style={{fontSize:12,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📝 Essay History</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {history.map((h,i)=>(
            <div key={h.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:i===0?bandBg(h.band):T.bg,borderRadius:10,border:i===0?`1px solid ${bandColor(h.band)}30`:`1px solid ${T.border}`}}>
              <div style={{fontSize:24,fontWeight:900,color:bandColor(h.band),fontFamily:"Georgia,serif",lineHeight:1,width:40}}>{h.band}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,color:T.text,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600,marginBottom:2}}>{h.taskType==="task2"?"Task 2 Essay":h.taskType==="task1academic"?"Task 1 Academic":"Task 1 General"} {i===0&&<span style={{background:"#fff5f5",border:"1px solid #ffcccc",borderRadius:20,padding:"1px 8px",fontSize:10,color:T.gold,fontWeight:700}}>Latest</span>}</div>
                <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{h.wordCount} words · {h.mistakeCount} mistakes · {new Date(h.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</div>
              </div>
              <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",textAlign:"right"}}>{bandLabel(h.band)}</div>
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
          <div style={{color:T.text,fontWeight:700,fontSize:15,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:4}}>Pro Feature</div>
          <button onClick={onUpgrade} style={{background:T.gold,color:"white",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Upgrade to Pro — $17</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <Card style={{marginBottom:16,background:"#fff5f5",border:"1px solid #ffcccc"}}>
        <p style={{color:T.red,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🎓 Your personal IELTS reference guide. {!isPro&&<span style={{color:T.textMid}}>Linking Words and Grammar are free. Upgrade for full access.</span>}</p>
      </Card>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        {sections.map(s=>(
          <button key={s.key} onClick={()=>setSection(s.key)}
            style={{background:section===s.key?T.primaryLight:T.bgGray,border:section===s.key?`1px solid ${T.primary}`:`1px solid ${T.border}`,color:section===s.key?T.primary:T.textMid,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",alignItems:"center",gap:5}}>
            {s.label}{!s.free&&!isPro&&<span style={{fontSize:10}}>🔒</span>}
          </button>
        ))}
      </div>
      {section==="linking"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.linkingWords.map((cat,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:cat.color,marginBottom:10,fontFamily:"'Cairo','Source Sans Pro',system-ui",textTransform:"uppercase",letterSpacing:"0.06em"}}>{cat.category}</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>{cat.words.map((w,j)=><span key={j} style={{background:`${cat.color}12`,border:`1px solid ${cat.color}40`,borderRadius:8,padding:"4px 12px",fontSize:13,color:cat.color,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{w}</span>)}</div></Card>)}</div>}
      {section==="vocab"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.vocabulary.map((topic,i)=><Card key={i}><div style={{fontSize:11,fontWeight:700,color:T.gold,marginBottom:10,fontFamily:"'Cairo','Source Sans Pro',system-ui",textTransform:"uppercase"}}>{topic.topic}</div><div style={{display:"flex",flexDirection:"column",gap:6}}>{topic.words.map((pair,j)=><div key={j} style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}><span style={{background:"#fee2e2",borderRadius:6,padding:"3px 10px",fontSize:13,color:"#991b1b",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✗ {pair[0]}</span><span style={{color:T.textMuted}}>→</span><span style={{background:"#dcfce7",borderRadius:6,padding:"3px 10px",fontSize:13,color:"#166534",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✓ {pair[1]}</span></div>)}</div></Card>)}</div>:<LockedSection/>)}
      {section==="grammar"&&<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.grammarRules.map((item,i)=><Card key={i} style={{border:`1px solid ${T.blueBorder}`,background:T.blueBg}}><div style={{fontSize:13,fontWeight:700,color:T.blue,marginBottom:6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📐 {item.rule}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{item.tip}</p></Card>)}</div>}
      {section==="peeves"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.petPeeves.map((item,i)=><Card key={i} style={{border:`1px solid ${T.redBorder}`,background:T.redBg}}><div style={{fontSize:13,fontWeight:700,color:T.red,marginBottom:6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>⚠️ {item.peeve}</div><p style={{color:T.textMid,fontSize:13,lineHeight:1.7,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✅ {item.fix}</p></Card>)}</div>:<LockedSection/>)}
      {section==="templates"&&(isPro?<div style={{display:"flex",flexDirection:"column",gap:10}}>{TOOLKIT.templates.map((item,i)=><Card key={i} style={{border:`1px solid ${T.amberBorder}`,background:T.amberBg}}><div style={{fontSize:11,fontWeight:700,color:T.amber,marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui",textTransform:"uppercase"}}>📝 {item.type}</div><p style={{color:T.text,fontSize:13,lineHeight:1.8,margin:0,fontFamily:"Georgia,serif",fontStyle:"italic",background:"white",padding:"10px 14px",borderRadius:8,whiteSpace:"pre-wrap",border:`1px solid ${T.amberBorder}`}}>{item.template}</p></Card>)}</div>:<LockedSection/>)}
      {section==="essays"&&(isPro?(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
            <p style={{color:T.green,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📖 Study these scored model essays to understand what examiners look for at each band level. Click any essay to expand the full response and examiner commentary.</p>
          </Card>
          {TOOLKIT.modelEssays.map((item,i)=>(
            <Card key={i} style={{border:`1px solid ${bandColor(item.band)}30`,cursor:"pointer",transition:"all 0.15s",boxShadow:expandedEssay===i?T.shadowMd:T.shadow}} onClick={()=>setExpandedEssay(expandedEssay===i?null:i)}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:200}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                    <span style={{background:bandBg(item.band),color:bandColor(item.band),fontWeight:800,fontSize:16,borderRadius:6,padding:"3px 12px",border:`1px solid ${bandColor(item.band)}30`,fontFamily:"Georgia,serif"}}>{item.band}</span>
                    <span style={{fontSize:12,color:bandColor(item.band),fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{bandLabel(item.band)}</span>
                    <span style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:20,padding:"2px 10px",fontSize:11,color:T.primary,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>{item.taskType}</span>
                  </div>
                  <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.5,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{item.topic.length>120?item.topic.slice(0,120)+"...":item.topic}</p>
                </div>
                <span style={{fontSize:18,color:T.textMuted,transform:expandedEssay===i?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s",flexShrink:0}}>▼</span>
              </div>
              {expandedEssay===i&&(
                <div style={{marginTop:16,borderTop:`1px solid ${T.border}`,paddingTop:16}} onClick={e=>e.stopPropagation()}>
                  <div style={{marginBottom:12}}>
                    <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📋 Question</div>
                    <div style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:8,padding:"10px 14px"}}>
                      <p style={{color:T.text,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{item.topic}</p>
                    </div>
                  </div>
                  <div style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:11,color:T.green,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✍️ Model Response — Band {item.band}</span>
                      <span style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{countWords(item.essay)} words</span>
                    </div>
                    <div style={{background:"#fafff8",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"14px 16px"}}>
                      <p style={{color:T.text,fontSize:14,margin:0,lineHeight:1.9,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap"}}>{item.essay}</p>
                    </div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:T.amber,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🎓 Examiner Commentary</div>
                    <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"10px 14px"}}>
                      <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.7,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{item.explanation}</p>
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
        <p style={{color:T.blue,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🎯 <strong>Practice Mode</strong> — Write freely and get live coaching every ~1.5 seconds. Mistakes are highlighted inline in your essay. Each feedback uses one free try.</p>
      </Card>
      {!started?(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{display:"flex",gap:8}}>
            {[["choose","📋 Choose a Question"],["custom","✏️ Write My Own"]].map(([mode,label])=>(
              <button key={mode} onClick={()=>setQuestionMode(mode)} style={{flex:1,background:questionMode===mode?T.primary:T.bgGray,border:`2px solid ${questionMode===mode?T.primary:T.border}`,borderRadius:10,padding:"10px",cursor:"pointer",color:questionMode===mode?"white":T.textMid,fontSize:13,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:questionMode===mode?T.shadowMd:'none',transition:'all 0.2s'}}>{label}</button>
            ))}
          </div>
          {questionMode==="choose"&&(
            <div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                {Object.keys(PRACTICE_QUESTIONS).map(topic=>(
                  <button key={topic} onClick={()=>{ setSelectedTopic(topic); setSelectedQuestion(""); }}
                    style={{background:selectedTopic===topic?T.primary:T.bgGray,border:`1px solid ${selectedTopic===topic?T.primary:T.border}`,borderRadius:20,padding:"6px 16px",cursor:"pointer",color:selectedTopic===topic?"white":T.textMid,fontSize:12,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:selectedTopic===topic?T.shadowMd:'none',transition:'all 0.18s'}}>{topic}</button>
                ))}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {PRACTICE_QUESTIONS[selectedTopic].map((q,i)=>(
                  <div key={i} onClick={()=>setSelectedQuestion(q)}
                    style={{background:selectedQuestion===q?T.primaryLight:T.bgGray,border:selectedQuestion===q?`2px solid ${T.primary}`:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",color:selectedQuestion===q?T.primary:T.textMid,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6,transition:"all 0.15s",boxShadow:T.shadow}}>
                    {i+1}. {q}
                  </div>
                ))}
              </div>
            </div>
          )}
          {questionMode==="custom"&&(
            <div>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>Your Question</label>
              <textarea value={customQuestion} onChange={e=>setCustomQuestion(e.target.value)} rows={3}
                placeholder="Paste your own IELTS question here..."
                style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
            </div>
          )}
          <button onClick={()=>{ if(question) setStarted(true); }} disabled={!question}
            style={{background:question?T.primary:T.bgGray,border:`1px solid ${question?T.primary:T.border}`,borderRadius:10,color:question?"white":T.textMuted,fontSize:15,fontWeight:700,padding:"15px",cursor:question?"pointer":"not-allowed",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:question?T.shadowMd:"none",transition:"all 0.2s"}}>
            {question?"🖊️ Start Practice Session":"Select a question to begin"}
          </button>
        </div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <Card style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
            <div style={{fontSize:11,color:T.blue,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Your Question</div>
            <p style={{color:T.text,fontSize:14,margin:0,lineHeight:1.6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{question}</p>
          </Card>
          <div style={{display:"flex",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{flex:2,minWidth:280,display:"flex",flexDirection:"column",gap:10}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>
                Your Essay
                <span style={{color:wordCount>=250?T.green:wordCount>=150?T.amber:T.red,marginLeft:10,fontWeight:400}}>{wordCount} words {wordCount>=250?"✓":wordCount>=150?"(keep going!)":"(too short)"}</span>
              </label>
              <textarea value={practiceEssay} onChange={handleEssayChange} rows={12}
                placeholder="Start writing here — live feedback and inline corrections appear as you pause!"
                style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              {showAnnotated&&liveFeedback&&practiceAnnotations.length>0&&(
                <Card style={{border:`1px solid ${T.amberBorder}`}}>
                  <div style={{fontSize:11,color:T.amber,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",justifyContent:"space-between"}}>
                    <span>✏️ Your Essay — Click underlined mistakes</span>
                    <span style={{color:T.red}}>{practiceAnnotations.length} spotted</span>
                  </div>
                  <AnnotatedEssay essay={practiceEssay} mistakes={practiceAnnotations}/>
                </Card>
              )}
              <button onClick={()=>{ setStarted(false); setPracticeEssay(""); setLiveFeedback(null); setShowAnnotated(false); setSelectedQuestion(""); setCustomQuestion(""); }}
                style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,color:T.textMid,fontSize:12,padding:"6px 14px",cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",alignSelf:"flex-start"}}>← Change Question</button>
            </div>
            <div style={{flex:1,minWidth:220,display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                {loadingFeedback?"🔍 Analysing...":"💬 Live Coaching"}
              </div>
              {loadingFeedback&&<Card style={{textAlign:"center",background:T.blueBg,border:`1px solid ${T.blueBorder}`}}><div style={{color:T.blue,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Reading your essay... 🎓</div></Card>}
              {liveFeedback&&!loadingFeedback&&(
                <>
                  <Card style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:36,fontWeight:900,color:bandColor(liveFeedback.estimatedBand),fontFamily:"Georgia,serif",lineHeight:1}}>{liveFeedback.estimatedBand}</div>
                    <div><div style={{fontSize:10,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",textTransform:"uppercase",letterSpacing:"0.08em"}}>Estimated Band</div><div style={{fontSize:13,color:bandColor(liveFeedback.estimatedBand),fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>{bandLabel(liveFeedback.estimatedBand)}</div></div>
                  </Card>
                  {liveFeedback.quickFix&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><div style={{fontSize:11,color:T.red,fontWeight:700,marginBottom:4,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🚨 QUICK FIX</div><p style={{color:"#991b1b",fontSize:13,margin:0,lineHeight:1.5,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{liveFeedback.quickFix}</p></Card>}
                  {liveFeedback.spotErrors?.length>0&&(
                    <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`}}>
                      <div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✏️ ERRORS SPOTTED ({liveFeedback.spotErrors.length})</div>
                      {liveFeedback.spotErrors.map((e,i)=>(
                        <div key={i} style={{marginBottom:8,paddingBottom:8,borderBottom:i<liveFeedback.spotErrors.length-1?`1px solid ${T.amberBorder}`:"none"}}>
                          <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                            <span style={{background:"#fee2e2",borderRadius:4,padding:"1px 6px",fontSize:12,color:"#991b1b",fontStyle:"italic"}}>"{e.original}"</span>
                            <span style={{color:T.textMuted,fontSize:12}}>→</span>
                            <span style={{background:"#dcfce7",borderRadius:4,padding:"1px 6px",fontSize:12,color:"#166534",fontWeight:600}}>"{e.correction}"</span>
                          </div>
                          <div style={{fontSize:11,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{e.explanation}</div>
                        </div>
                      ))}
                    </Card>
                  )}
                  <Card style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`}}>
                    <div style={{fontSize:11,color:T.blue,fontWeight:700,marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>💡 TIPS</div>
                    {liveFeedback.tips?.map((tip,i)=><div key={i} style={{color:T.textMid,fontSize:13,lineHeight:1.5,marginBottom:5,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>• {tip}</div>)}
                  </Card>
                  {liveFeedback.encouragement&&<Card style={{background:"#fff5f5",border:"1px solid #ffcccc"}}><p style={{color:T.gold,fontSize:12,margin:0,fontStyle:"italic",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>💬 {liveFeedback.encouragement}</p></Card>}
                </>
              )}
              {!liveFeedback&&!loadingFeedback&&<Card style={{textAlign:"center",padding:"24px 16px"}}><div style={{fontSize:28,marginBottom:8}}>🖊️</div><p style={{color:T.textMuted,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Start writing — feedback and corrections appear after a short pause!</p></Card>}
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
    if (!isPro && dailyUses >= GRAMMAR_DAILY_LIMIT) { setError("لقد استنفدت فحوصاتك المجانية (10 فحوصات). احصل على Pro للفحص غير المحدود."); return; }
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
        <p style={{ color: T.green, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
          ✏️ <strong>Grammar & Spell Checker</strong> — Enter any word, phrase, or sentence and get instant corrections with explanations. {isPro?"Unlimited checks with Pro.":(<><strong>{dailyLeft}</strong> of {GRAMMAR_DAILY_LIMIT} free checks remaining.</>)}
        </p>
      </Card>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        {/* Input side */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
            Your Text
          </div>
          <textarea value={input} onChange={e => setInput(e.target.value)}
            placeholder="Type a word, phrase, or full sentence here..."
            rows={6}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } }}
            style={{ width: "100%", background: T.bgGray, border: `1px solid ${T.border}`, borderRadius: 10, color: T.text, fontSize: 15, padding: "14px 16px", resize: "vertical", fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.7, outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }} />
          <button onClick={check} disabled={loading || !input.trim()}
            style={{ background: loading ? T.bgGray : T.primary, border: "none", borderRadius: 10, color: loading ? T.textMuted : "white", fontSize: 15, fontWeight: 700, padding: "14px", cursor: loading ? "not-allowed" : "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", boxShadow: loading ? "none" : T.shadowMd, transition: "all 0.2s" }}>
            {loading ? "⏳ Checking..." : "Check Grammar & Spelling →"}
          </button>
          {error && <div style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: T.red, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{error}</div>}
        </div>
        {/* Result side */}
        <div style={{ flex: 1, minWidth: 280, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: T.textMid, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
            Result
          </div>
          {!result && !loading && (
            <Card style={{ textAlign: "center", padding: "40px 24px", background: T.bgGray, border: `1px dashed ${T.border}` }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✏️</div>
              <p style={{ color: T.textMuted, fontSize: 14, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.6 }}>
                Type something on the left and click "Check" — your corrected text will appear here.
              </p>
            </Card>
          )}
          {loading && (
            <Card style={{ textAlign: "center", padding: "40px 24px", background: T.blueBg, border: `1px solid ${T.blueBorder}` }}>
              <div style={{ color: T.blue, fontSize: 14, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Checking your text... ✏️</div>
            </Card>
          )}
          {result && !result.hasErrors && (
            <Card style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>✅</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.green, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>No corrections needed!</span>
              </div>
              <div style={{ background: "white", borderRadius: 8, padding: "12px 16px", border: `1px solid ${T.greenBorder}`, marginBottom: 12 }}>
                <p style={{ color: T.text, fontSize: 15, margin: 0, lineHeight: 1.7, fontFamily: "Georgia,serif" }}>{result.corrected}</p>
              </div>
              <p style={{ color: T.green, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>💡 {result.noErrorReason}</p>
            </Card>
          )}
          {result && result.hasErrors && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Card style={{ background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
                <div style={{ fontSize: 11, color: T.green, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
                  ✅ Corrected Version
                </div>
                <p style={{ color: T.text, fontSize: 15, margin: 0, lineHeight: 1.7, fontFamily: "Georgia,serif" }}>{result.corrected}</p>
              </Card>
              {result.issues?.map((issue, i) => (
                <Card key={i} style={{ borderLeft: `3px solid ${issue.type === "Spelling" ? T.red : issue.type === "Punctuation" ? T.purple : issue.type === "Structure" ? T.blue : T.amber}`, background: issue.type === "Spelling" ? T.redBg : issue.type === "Punctuation" ? T.purpleBg : issue.type === "Structure" ? T.blueBg : T.amberBg }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                    <span style={{ background: "white", border: `1px solid ${T.border}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: issue.type === "Spelling" ? T.red : issue.type === "Punctuation" ? T.purple : issue.type === "Structure" ? T.blue : T.amber, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{issue.type}</span>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ background: "#fee2e2", borderRadius: 6, padding: "4px 12px", color: "#991b1b", fontSize: 14, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>"{issue.original}"</span>
                    <span style={{ color: T.textMuted, fontSize: 16 }}>→</span>
                    <span style={{ background: "#dcfce7", borderRadius: 6, padding: "4px 12px", color: "#166534", fontSize: 14, fontWeight: 600, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>"{issue.correction}"</span>
                  </div>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>💡 {issue.explanation}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <Card style={{ marginTop: 20, background: T.primaryLight, border: `1px solid ${T.primaryBorder}` }}>
        <p style={{ color: T.primary, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
          🎓 Want a full essay scored with band levels, vocabulary upgrades, and a model response? Try our <strong>Essay Analyzer</strong> — 1 free analysis, no sign-up needed.
        </p>
      </Card>
      <Card style={{ marginTop: 16, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
        <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
      { sentence: "We need to do more ___.", options: ["researches","research"], correct: 1, explanation: "In standard IELTS Academic English, 'research' is treated as uncountable — say 'further research' or 'research studies,' not 'researches.' Note: 'researches' occasionally appears in older British academic texts as a plural noun meaning 'investigations,' but IELTS marking follows modern academic convention where 'research' is uncountable." },
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
        <p style={{ color: T.textMid, fontSize: 14, fontFamily: "'Cairo','Source Sans Pro',system-ui", margin: "0 0 16px", lineHeight: 1.6, maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          Practice sentence structures, verb forms, articles, prepositions, and more. Tap a category to start — each exercise gives instant feedback with detailed explanations.
        </p>
      </div>

      {/* Sticky Timer bar */}
      {!isPro && (
        <div style={{ position: "sticky", top: 64, zIndex: 100, marginBottom: 16 }}>
          <div style={{ background: timeExpired ? T.redBg : paused ? T.amberBg : T.greenBg, border: `1px solid ${timeExpired ? T.redBorder : paused ? T.amberBorder : T.greenBorder}`, borderRadius: 10, padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22, fontWeight: 900, color: timeLeft < 300 ? T.red : paused ? T.amber : T.green, fontFamily: "'Cairo','Source Sans Pro',system-ui", minWidth: 52 }}>
                  {formatTime(timeLeft)}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: timeExpired ? T.red : paused ? T.amber : T.green, fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.3 }}>
                    {timeExpired ? "Time's up — upgrade to continue practising" : paused ? "⏸ Timer paused — press Play to begin" : "▶ Timer running — exercises unlocked"}
                  </div>
                  {!timeExpired && (
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginTop: 1 }}>
                      Free plan: 30 minutes of practice time · Pause anytime and pick up where you left off · Go Pro for unlimited access
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {!timeExpired && (
                  <button onClick={paused ? startTimer : pauseTimer}
                    style={{ background: paused ? T.green : T.amber, color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
                    {paused ? "▶ Play" : "⏸ Pause"}
                  </button>
                )}
                {timeExpired && (
                  <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
          <span style={{ fontSize: 13, color: T.textMid, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: isOpen ? cat.color : T.text, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{cat.category}</span>
                {score.attempted > 0 && (
                  <span style={{ background: score.correct === score.attempted ? T.greenBg : T.amberBg, border: `1px solid ${score.correct === score.attempted ? T.greenBorder : T.amberBorder}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: score.correct === score.attempted ? T.green : T.amber, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
                    {score.correct}/{score.attempted}
                  </span>
                )}
                <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{cat.exercises.length}q</span>
                <span style={{ fontSize: 16, color: T.textMuted, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>
              {isOpen && (
                <div style={{ border: `1px solid ${cat.color}40`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16, background: `${cat.color}05` }}>
                  {!canAnswer && !isPro && !timeExpired && (
                    <Card style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, textAlign: "center" }}>
                      <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>⏸ Timer is paused. Click <strong>Play</strong> above to start answering.</p>
                    </Card>
                  )}
                  {cat.exercises.map((ex, exIdx) => {
                    const key = `${catIdx}-${exIdx}`;
                    const answered = answers[key] !== undefined;
                    const isCorrect = answered && answers[key] === ex.correct;
                    return (
                      <div key={exIdx} style={{ background: T.bg, border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Q{exIdx + 1}</span>
                          {answered && (
                            <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
                              {isCorrect ? "✓ Correct" : "✗ Incorrect"}
                            </span>
                          )}
                        </div>
                        <p style={{ color: T.text, fontSize: 14, margin: "0 0 12px", lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{ex.sentence}</p>
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
                                style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "8px 18px", fontSize: 14, fontWeight: 600, color, cursor: answered || !canAnswer ? "default" : "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", transition: "all 0.15s", opacity: answered && optIdx !== ex.correct && optIdx !== answers[key] ? 0.5 : 1 }}>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {showExplanation[key] && (
                          <div style={{ marginTop: 10, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                            <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>💡 {ex.explanation}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ textAlign: "center", padding: "8px 0" }}>
                    <span style={{ fontSize: 13, color: T.textMid, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
        <p style={{ color: T.textMid, fontSize: 14, fontFamily: "'Cairo','Source Sans Pro',system-ui", margin: 0, maxWidth: 540, marginLeft: "auto", marginRight: "auto", lineHeight: 1.6 }}>
          Sharpen your IELTS writing skills with targeted drills — grammar, paraphrasing, linking words, vocabulary upgrades, and more. All exercises are fully static with instant feedback.
        </p>
      </div>

      {/* Sticky Timer */}
      {!isPro && (
        <div style={{ position: "sticky", top: 64, zIndex: 100, marginBottom: 16 }}>
          <div style={{ background: timeExpired ? T.redBg : paused ? T.amberBg : T.greenBg, border: `1px solid ${timeExpired ? T.redBorder : paused ? T.amberBorder : T.greenBorder}`, borderRadius: 10, padding: "10px 16px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: timeLeft < 300 ? T.red : paused ? T.amber : T.green, fontFamily: "'Cairo','Source Sans Pro',system-ui", minWidth: 54, flexShrink: 0 }}>
                  {formatTime(timeLeft)}
                </span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: timeExpired ? T.red : paused ? T.amber : T.green, fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.3 }}>
                    {timeExpired ? "⏰ Session expired — upgrade to Pro to continue" : paused ? "⏸ Timer paused — press Play to begin your session" : "▶ Session active — exercises unlocked"}
                  </div>
                  {!timeExpired && (
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginTop: 2 }}>
                      Free plan: 30 minutes total · Pause at any time and resume later · Pro members get unlimited access
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {!timeExpired && (
                  <button onClick={paused ? startTimer : pauseTimer}
                    style={{ background: paused ? T.green : T.amber, color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
                    {paused ? "▶ Play" : "⏸ Pause"}
                  </button>
                )}
                {timeExpired && (
                  <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
          <span style={{ fontSize: 13, color: T.green, fontWeight: 700, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Pro — Unlimited exercise access. No timer restrictions.</span>
        </div>
      )}

      {/* Exercise type tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveExTab(t.key)}
            style={{ background: activeExTab === t.key ? T.primaryLight : T.bgGray, border: `1px solid ${activeExTab === t.key ? T.primaryBorder : T.border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: activeExTab === t.key ? 700 : 400, color: activeExTab === t.key ? T.primary : T.textMid, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", display: "flex", alignItems: "center", gap: 5 }}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      {/* Expired overlay message */}
      {timeExpired && !isPro && (
        <Card style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, textAlign: "center", padding: "28px 24px", marginBottom: 16 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⏰</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.red, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginBottom: 8 }}>Your free 30-minute session has ended</div>
          <p style={{ color: T.textMid, fontSize: 13, fontFamily: "'Cairo','Source Sans Pro',system-ui", margin: "0 0 16px", lineHeight: 1.6 }}>Upgrade to Pro for unlimited practice time — all exercise types, all categories, no restrictions.</p>
          <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>🔓 Upgrade to Pro — $17</button>
        </Card>
      )}

      {/* Content area */}
      <div style={{ opacity: timeExpired && !isPro ? 0.4 : 1, pointerEvents: timeExpired && !isPro ? "none" : "auto", filter: !isPro && paused && !timeExpired ? "blur(4px)" : "none", transition: "filter 0.3s ease", userSelect: !isPro && paused && !timeExpired ? "none" : "auto", position: "relative" }}>
        {!isPro && paused && !timeExpired && (
          <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ background: "rgba(255,255,255,0.85)", borderRadius: 12, padding: "16px 28px", textAlign: "center", boxShadow: "0 4px 20px rgba(0,0,0,0.12)", backdropFilter: "blur(2px)" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>⏸</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Timer paused</div>
              <div style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginTop: 2 }}>Press Play to resume</div>
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
        <div style={{ fontSize: 13, color: T.textMid, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginBottom: 4 }}>
          <strong>14 categories · {totalQ} questions</strong> covering Subject-Verb Agreement, Articles, Tenses, Prepositions, Passives, Conditionals, Relative Clauses, and more.
        </div>
        {totalAnswered > 0 && (
          <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px", display: "inline-block" }}>
            <span style={{ fontSize: 13, color: T.textMid, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
                <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: isOpen ? cat.color : T.text, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{cat.category}</span>
                {score.attempted > 0 && (
                  <span style={{ background: score.correct === score.attempted ? T.greenBg : T.amberBg, border: `1px solid ${score.correct === score.attempted ? T.greenBorder : T.amberBorder}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700, color: score.correct === score.attempted ? T.green : T.amber, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
                    {score.correct}/{score.attempted}
                  </span>
                )}
                <span style={{ fontSize: 12, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{cat.exercises.length}q</span>
                <span style={{ fontSize: 16, color: T.textMuted, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▼</span>
              </div>
              {isOpen && (
                <div style={{ border: `1px solid ${cat.color}40`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 16, background: `${cat.color}05` }}>
                  {!canAnswer && !isPro && (
                    <Card style={{ background: T.amberBg, border: `1px solid ${T.amberBorder}`, textAlign: "center" }}>
                      <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>⏸ Timer paused — click <strong>Play</strong> above to start answering.</p>
                    </Card>
                  )}
                  {cat.exercises.map((ex, exIdx) => {
                    const key = `${catIdx}-${exIdx}`;
                    const answered = answers[key] !== undefined;
                    const isCorrect = answered && answers[key] === ex.correct;
                    return (
                      <div key={exIdx} style={{ background: T.bg, border: `1px solid ${answered ? (isCorrect ? T.greenBorder : T.redBorder) : T.border}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Q{exIdx+1}</span>
                          {answered && <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{isCorrect ? "✓ Correct" : "✗ Incorrect"}</span>}
                        </div>
                        <p style={{ color: T.text, fontSize: 14, margin: "0 0 12px", lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{ex.sentence}</p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {ex.options.map((opt, optIdx) => {
                            let bg = T.bgGray, border = T.border, color = T.text;
                            if(answered){ if(optIdx===ex.correct){bg=T.greenBg;border=T.greenBorder;color=T.green;}else if(optIdx===answers[key]&&!isCorrect){bg=T.redBg;border=T.redBorder;color=T.red;}else{bg=T.bgGray;color=T.textMuted;} }
                            return (
                              <button key={optIdx} onClick={() => handleAnswer(catIdx, exIdx, optIdx)} disabled={answered||!canAnswer}
                                style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "8px 18px", fontSize: 14, fontWeight: 600, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", transition: "all 0.15s", opacity: answered&&optIdx!==ex.correct&&optIdx!==answers[key]?0.5:1 }}>
                                {opt}
                              </button>
                            );
                          })}
                        </div>
                        {showExplanation[key] && (
                          <div style={{ marginTop: 10, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                            <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>💡 {ex.explanation}</p>
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
        <p style={{ color: T.blue, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Q{i+1} — Original sentence</span>
                <div style={{ background: T.bgGray, borderRadius: 8, padding: "10px 14px", marginTop: 6, border: `1px solid ${T.border}` }}>
                  <p style={{ color: T.text, fontSize: 14, margin: 0, fontFamily: "Georgia,serif", fontStyle: "italic" }}>{item.original}</p>
                </div>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.textMid, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginBottom: 8 }}>Which option is the best academic paraphrase?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {item.options.map((opt, optIdx) => {
                  let bg = T.bgGray, border = T.border, color = T.text;
                  if(answered){ if(optIdx===item.correct){bg=T.greenBg;border=T.greenBorder;color=T.green;}else if(optIdx===answers[i]&&!isCorrect){bg=T.redBg;border=T.redBorder;color=T.red;}else{color=T.textMuted;} }
                  return (
                    <button key={optIdx} onClick={() => { if(!canAnswer||answered) return; setAnswers(p=>({...p,[i]:optIdx})); setShown(p=>({...p,[i]:true})); }} disabled={answered||!canAnswer}
                      style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", textAlign: "left", lineHeight: 1.5, transition: "all 0.15s" }}>
                      <strong style={{ marginRight: 6 }}>{String.fromCharCode(65+optIdx)}.</strong>{opt}
                    </button>
                  );
                })}
              </div>
              {shown[i] && (
                <div style={{ marginTop: 12, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>💡 {item.explanation}</p>
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
        <p style={{ color: T.purple, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Q{i+1}</span>
                {answered && <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginLeft: 4 }}>{isCorrect ? "✓ Correct" : "✗ Incorrect"}</span>}
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
                      style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 600, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", transition: "all 0.15s" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {shown[i] && (
                <div style={{ marginTop: 10, background: isCorrect ? T.greenBg : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>💡 {item.explanation}</p>
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
        <p style={{ color: T.green, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Q{i+1}</span>
                <span style={{ background: "#fee2e2", borderRadius: 6, padding: "3px 12px", fontSize: 13, color: "#991b1b", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>✗ "{item.weak}"</span>
                <span style={{ color: T.textMuted, fontSize: 13 }}>→ choose best upgrade</span>
                {answered && <span style={{ fontSize: 11, fontWeight: 700, color: isCorrect ? T.green : T.red, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>{isCorrect ? "✓ Correct" : "✗ Incorrect"}</span>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {item.options.map((opt, optIdx) => {
                  let bg = T.bgGray, border = T.border, color = T.text;
                  if(answered){ if(optIdx===item.correct){bg="#dcfce7";border=T.greenBorder;color="#166534";}else if(optIdx===answers[i]&&!isCorrect){bg="#fee2e2";border=T.redBorder;color="#991b1b";}else{color=T.textMuted;} }
                  return (
                    <button key={optIdx} onClick={() => { if(!canAnswer||answered) return; setAnswers(p=>({...p,[i]:optIdx})); setShown(p=>({...p,[i]:true})); }} disabled={answered||!canAnswer}
                      style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 8, padding: "8px 14px", fontSize: 13, color, cursor: answered||!canAnswer?"default":"pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", textAlign: "left", transition: "all 0.15s" }}>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {shown[i] && (
                <div style={{ marginTop: 10, background: isCorrect ? "#f0fdf4" : T.amberBg, border: `1px solid ${isCorrect ? T.greenBorder : T.amberBorder}`, borderRadius: 8, padding: "10px 14px" }}>
                  <p style={{ color: T.textMid, fontSize: 13, margin: 0, lineHeight: 1.6, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>🎓 {item.tip}</p>
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
        <p style={{ color: T.red, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
          🔍 <strong>Error Correction</strong> — Read each passage carefully and find all the mistakes. Click "Reveal Errors" to see every error highlighted with explanations. Trains the same skill examiners use when marking your essay.
        </p>
      </Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {ERROR_PASSAGES.map((passage, pi) => (
          <Card key={pi} style={{ border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <div>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui", textTransform: "uppercase", letterSpacing: "0.08em" }}>Passage {pi+1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginLeft: 8 }}>{passage.title}</span>
                <span style={{ fontSize: 11, color: T.amber, fontFamily: "'Cairo','Source Sans Pro',system-ui", marginLeft: 8 }}>({passage.errors.length} errors hidden)</span>
              </div>
              <button onClick={() => { if(!canAnswer) return; setShowAll(p=>({...p,[pi]:!p[pi]})); }}
                disabled={!canAnswer}
                style={{ background: showAll[pi] ? T.amberBg : T.primary, color: showAll[pi] ? T.amber : "white", border: `1px solid ${showAll[pi] ? T.amberBorder : T.primary}`, borderRadius: 8, padding: "7px 16px", fontSize: 13, fontWeight: 700, cursor: canAnswer?"pointer":"default", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
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
                <div style={{ fontSize: 12, fontWeight: 700, color: T.red, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Errors Found ({passage.errors.length})</div>
                {passage.errors.map((err, ei) => (
                  <div key={ei} style={{ background: T.redBg, border: `1px solid ${T.redBorder}`, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <span style={{ background: "#fee2e2", borderRadius: 6, padding: "3px 10px", fontSize: 13, color: "#991b1b", fontFamily: "'Cairo','Source Sans Pro',system-ui", flexShrink: 0 }}>✗ "{err.wrong}"</span>
                    <span style={{ color: T.textMuted, fontSize: 14, flexShrink: 0 }}>→</span>
                    <span style={{ background: "#dcfce7", borderRadius: 6, padding: "3px 10px", fontSize: 13, color: "#166534", fontFamily: "'Cairo','Source Sans Pro',system-ui", flexShrink: 0 }}>✓ "{err.right}"</span>
                    <span style={{ color: T.textMid, fontSize: 12, fontFamily: "'Cairo','Source Sans Pro',system-ui", flex: 1, minWidth: 200 }}>💡 {err.explanation}</span>
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
        <p style={{ color: T.primary, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.6 }}>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Q{i+1} </span>
                  <span style={{ fontSize: 14, color: T.text, fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.5 }}>{item.q}</span>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  {["yes","no"].map(val => {
                    const active = answers[i] === val;
                    return (
                      <button key={val} onClick={() => setAnswers(p=>({...p,[i]:val}))}
                        style={{ background: active ? (val==="yes" ? T.greenBg : T.redBg) : T.bgGray, border: `1.5px solid ${active ? (val==="yes" ? T.greenBorder : T.redBorder) : T.border}`, borderRadius: 8, padding: "7px 18px", fontSize: 13, fontWeight: 700, color: active ? (val==="yes" ? T.green : T.red) : T.textMid, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui", transition: "all 0.15s", textTransform: "capitalize" }}>
                        {val === "yes" ? "✓ Yes" : "✗ No"}
                      </button>
                    );
                  })}
                </div>
              </div>
              {answered && answers[i] === "no" && (
                <div style={{ marginTop: 10, background: T.amberBg, border: `1px solid ${T.amberBorder}`, borderRadius: 8, padding: "8px 14px" }}>
                  <p style={{ color: T.amber, fontSize: 12, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui", lineHeight: 1.5 }}>💡 {item.tip}</p>
                </div>
              )}
            </Card>
          );
        })}
      </div>
      {allAnswered && (
        <Card style={{ marginTop: 20, background: `linear-gradient(135deg, ${T.primary} 0%, #003a99 100%)`, border: "none", textAlign: "center", padding: "32px 24px" }}>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>Your Estimated Band</div>
          <div style={{ fontSize: 72, fontWeight: 900, color: "white", lineHeight: 1, fontFamily: "Georgia,serif", marginBottom: 8 }}>{roundedBand}</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.85)", fontFamily: "'Cairo','Source Sans Pro',system-ui", marginBottom: 16, lineHeight: 1.6 }}>
            {roundedBand >= 7.5 ? "Excellent foundation — you're applying most key techniques. Focus on advanced vocabulary and complex structures to reach Band 8+." :
             roundedBand >= 6.5 ? "Good progress — you're following core principles but there are clear gaps. Target the areas where you answered 'No' above." :
             roundedBand >= 5.5 ? "Developing — several fundamentals need attention. Work through the 'No' answers above systematically." :
             "Foundation stage — focus on the basics first: word count, paraphrasing, linking words, and avoiding informal language."}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", fontFamily: "'Cairo','Source Sans Pro',system-ui", fontStyle: "italic" }}>
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

  const inp = {width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"10px 12px",fontFamily:"'Cairo','Source Sans Pro',system-ui",outline:"none",boxSizing:"border-box"};

  const tryUnlock = async () => {
    if(!passInput.trim()){ setPassErr("الرجاء إدخال كلمة المرور."); return; }
    setAdminLoading(true); setPassErr("");
    try{
      const res = await fetch("/api/admin/users", { headers:{"x-admin-key": passInput} });
      if(res.status===401||res.status===403){ setPassErr("كلمة المرور غير صحيحة."); setAdminLoading(false); return; }
      if(!res.ok){ setPassErr("خطأ في الاتصال بالخادم."); setAdminLoading(false); return; }
      const data = await res.json();
      setUnlocked(true); setPassErr(""); setAdminData(data);
    }catch(e){ setPassErr("خطأ في الاتصال. حاول مرة أخرى."); }
    setAdminLoading(false);
  };

  const confirmPayment = async (payment) => {
    setConfirming(payment.id);
    setConfirmError(null);
    try{
      const res = await fetch("/api/admin/confirm", {
        method:"POST",
        headers:{"Content-Type":"application/json","x-admin-key": passInput},
        body: JSON.stringify({ paymentId: payment.id, email: payment.email })
      });
      const data = await res.json();
      if(data.success){
        setLastConfirmed({ ...data, paymentName: payment.name, paymentEmail: payment.email, paymentMobile: payment.mobile });
      } else {
        setConfirmError(data.error || "Something went wrong");
      }
      const refresh = await fetch("/api/admin/users", { headers:{"x-admin-key": passInput} });
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
        headers:{"Content-Type":"application/json","x-admin-key": passInput},
        body: JSON.stringify({ email: manualEmail.trim() })
      });
      const data = await res.json();
      if(data.success){
        setManualResult(data);
        setManualEmail("");
        const refresh = await fetch("/api/admin/users", { headers:{"x-admin-key": passInput} });
        setAdminData(await refresh.json());
      } else {
        setConfirmError(data.error || "Activation failed");
      }
    }catch(e){ setConfirmError(e.message); }
    setManualLoading(false);
  };

  if(!unlocked) return (
    <div style={{maxWidth:400,margin:"60px auto",padding:"0 24px"}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",padding:"0 0 20px",display:"flex",alignItems:"center",gap:6}}>← Back</button>
      <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"36px 28px",boxShadow:T.shadowMd,textAlign:"center"}}>
        <div style={{fontSize:40,marginBottom:12}}>🔐</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,margin:"0 0 20px"}}>Admin Access</h2>
        <input type="password" value={passInput} onChange={e=>setPassInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&tryUnlock()}
          placeholder="Admin password" style={{...inp,marginBottom:10}}/>
        {passErr&&<div style={{color:T.red,fontSize:13,marginBottom:10}}>{passErr}</div>}
        <button onClick={tryUnlock}
          style={{width:"100%",background:T.primary,color:"white",border:"none",borderRadius:8,padding:"12px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
          Unlock →
        </button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:740,margin:"0 auto",padding:"24px 20px 80px"}}>
      <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",padding:"0 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to Englishfool</button>

      {adminLoading&&<div style={{textAlign:"center",padding:"40px",color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>⏳ Loading dashboard...</div>}

      {/* SUCCESS BANNER — stays visible after confirming */}
      {lastConfirmed&&(
        <div style={{background:T.greenBg,border:`2px solid ${T.greenBorder}`,borderRadius:12,padding:"20px",marginBottom:20,boxShadow:T.shadow,position:"relative"}}>
          <button onClick={()=>setLastConfirmed(null)} style={{position:"absolute",top:10,right:12,background:"none",border:"none",fontSize:18,color:T.textMuted,cursor:"pointer",lineHeight:1}}>✕</button>
          <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.green,margin:"0 0 10px"}}>✅ Payment Confirmed — {lastConfirmed.paymentName}</h3>
          <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:6}}>
            {lastConfirmed.paymentEmail} · 📱 {lastConfirmed.paymentMobile}
          </div>
          {lastConfirmed.accountCreated&&(
            <div style={{background:"white",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
              <div style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:6}}>🆕 Account created with credentials:</div>
              <div style={{fontSize:14,fontFamily:"monospace",color:T.text,lineHeight:1.8}}>
                📧 {lastConfirmed.paymentEmail}<br/>
                🔑 {lastConfirmed.tempPassword}
              </div>
            </div>
          )}
          <div style={{background:"white",border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 14px",marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:6}}>💬 WhatsApp message to send:</div>
            <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{lastConfirmed.whatsappMessage}</div>
          </div>
          <button onClick={()=>copyText(lastConfirmed.whatsappMessage,"confirmed")}
            style={{background:copied==="confirmed"?T.greenBg:T.primaryLight,border:`1px solid ${copied==="confirmed"?T.greenBorder:T.primaryBorder}`,borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,color:copied==="confirmed"?T.green:T.primary,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
            {copied==="confirmed"?"✓ Copied!":"📋 Copy WhatsApp Message"}
          </button>
        </div>
      )}

      {/* Error banner */}
      {confirmError&&(
        <div style={{background:T.redBg,border:`2px solid ${T.redBorder}`,borderRadius:12,padding:"16px 20px",marginBottom:20,position:"relative"}}>
          <button onClick={()=>setConfirmError(null)} style={{position:"absolute",top:8,right:12,background:"none",border:"none",fontSize:18,color:T.textMuted,cursor:"pointer"}}>✕</button>
          <div style={{fontSize:14,color:T.red,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>❌ Confirmation failed</div>
          <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:4}}>{confirmError}</div>
        </div>
      )}

      {adminData&&(
        <>
          {/* Stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
            {[["👥 Total Users",adminData.stats?.totalUsers,T.text],["⭐ Pro Users",adminData.stats?.proUsers,T.green],["⏳ Pending",adminData.stats?.pendingPayments,T.amber]].map(([label,val,color])=>(
              <div key={label} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:10,padding:"16px",textAlign:"center",boxShadow:T.shadow}}>
                <div style={{fontSize:28,fontWeight:900,color,fontFamily:"Georgia,serif"}}>{val||0}</div>
                <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:4}}>{label}</div>
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
                        <div style={{fontWeight:700,color:T.text,fontSize:14,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{p.name}</div>
                        <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{p.email} · 📱 {p.mobile}</div>
                        <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:2}}>{p.amount} {p.currency} · {new Date(p.created_at).toLocaleString("en-GB")}</div>
                      </div>
                      <button onClick={()=>confirmPayment(p)} disabled={confirming===p.id}
                        style={{background:confirming===p.id?T.bgGray:T.green,color:confirming===p.id?T.textMuted:"white",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:confirming===p.id?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>
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
            <p style={{color:T.textMuted,fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:"0 0 14px",lineHeight:1.5}}>
              If user already has an account → upgrades to Pro instantly.<br/>
              If user doesn't have an account → creates one with a temp password you can send them.
            </p>
            <div style={{display:"flex",gap:8}}>
              <input type="email" value={manualEmail} onChange={e=>setManualEmail(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&activatePro()}
                placeholder="user@email.com" style={{...inp,flex:1}}/>
              <button onClick={activatePro} disabled={manualLoading}
                style={{background:manualLoading?T.bgGray:T.primary,color:manualLoading?T.textMuted:"white",border:"none",borderRadius:8,padding:"10px 20px",fontSize:13,fontWeight:700,cursor:manualLoading?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>
                {manualLoading?"⏳ Activating...":"⚡ Activate Pro"}
              </button>
            </div>
            {manualResult&&(
              <div style={{marginTop:14,background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"14px 16px"}}>
                <div style={{fontSize:14,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:8}}>
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
                  <div style={{fontSize:12,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:4}}>💬 WhatsApp message:</div>
                  <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{manualResult.whatsappMessage}</div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>copyText(manualResult.whatsappMessage,"manual")}
                    style={{background:copied==="manual"?T.greenBg:T.primaryLight,border:`1px solid ${copied==="manual"?T.greenBorder:T.primaryBorder}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:700,color:copied==="manual"?T.green:T.primary,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    {copied==="manual"?"✓ Copied!":"📋 Copy Message"}
                  </button>
                  <button onClick={()=>setManualResult(null)}
                    style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:600,color:T.textMuted,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
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
                    <div style={{fontSize:13,fontWeight:600,color:T.text,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{p.name||"—"}</div>
                    <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.email}</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:p.is_pro?T.green:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>{p.is_pro?"PRO":"Free"}</span>
                  <span style={{fontSize:11,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>{new Date(p.created_at).toLocaleDateString("en-GB")}</span>
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
   model:"So the book I'd like to talk about is Sapiens by Yuval Noah Harari. I actually came across it about three years ago — a colleague mentioned it and I was curious, so I picked it up.\n\nRight, so basically it tells the whole story of humanity — you know, from the very earliest humans all the way to today. What I found really fascinating is the way he connects everything — farming, religion, money — and shows how they all fit together.\n\nI think what hit me the hardest was this idea he has about the Agricultural Revolution. He actually calls it 'history's biggest fraud' — which sounds crazy, right? But his argument is that farming made life harder, not easier, for most people. That completely changed how I thought about progress.\n\nAnd I suppose the reason it's stayed with me is that it made me question things I'd just taken for granted — like money, or nations, or human rights. Harari's point is that these are all kind of... stories we've collectively agreed to believe. That shift in perspective was genuinely quite powerful for me. I still think about it now."},
  {topic:"Describe a memorable trip you have taken",
   cue:"You should say:\n• where you went\n• who you went with\n• what you did there\nAnd explain why it was memorable.",
   model:"So I'd like to talk about a trip I took to Istanbul — this was about two years ago, and I went with a group of close friends. Five days, and honestly it was one of those trips that just exceeded every expectation.\n\nWe stayed in the old part of the city — Sultanahmet — which is right next to all the historical sites. So we visited the Blue Mosque, Hagia Sophia, the Grand Bazaar... the architecture is just stunning. I remember walking into Hagia Sophia and actually feeling quite overwhelmed — the scale of it is hard to describe.\n\nThe food was another highlight, definitely. We ate so much — kebabs, baklava, fresh fish right by the Bosphorus. And one evening we did this boat cruise at sunset, and just watching the skyline — the minarets mixed with modern buildings — it was genuinely magical.\n\nBut I think what made it truly memorable was the fact that it was the first time we'd all travelled internationally together as a group. There's something special about experiencing those moments with people you care about — it kind of amplifies everything. We still talk about that trip."},
  {topic:"Describe a person who has influenced you",
   cue:"You should say:\n• who this person is\n• how you know them\n• what they have done\nAnd explain why they influenced you.",
   model:"The person I'd like to talk about is my high school English teacher — Mr Khalil. I had him from around age fifteen, for about three years.\n\nWhat made him different from other teachers was, I think, the fact that he was genuinely passionate. Like, you could tell he actually loved the language. Instead of just following the textbook, he'd bring in newspaper articles, sometimes song lyrics, even stand-up comedy clips — whatever made the lesson interesting.\n\nThe thing that probably had the biggest impact on me was that he started a debating club. Completely voluntary — he stayed late after school to run it. And I was terrible at speaking in public at that age, really quite nervous. But through those sessions I actually started to enjoy it.\n\nI suppose the reason he had such a lasting influence is that he showed me what good communication can do for you. He used to say that expressing yourself clearly in English opens doors — and he was right. That's guided a lot of my decisions since then. Without him, honestly, I don't think my career would have taken the same direction."},
  {topic:"Describe a goal you want to achieve in the future",
   cue:"You should say:\n• what the goal is\n• when you hope to achieve it\n• what steps you need to take\nAnd explain why this goal is important to you.",
   model:"Right, so the goal I want to talk about is building my own online education platform — specifically for Arabic-speaking students preparing for IELTS. I'm hoping to get there within the next couple of years.\n\nThe idea came from something I noticed — a lot of students in this region really struggle with test prep, and it's often just a question of access. Either the courses are too expensive, or there aren't good resources available locally.\n\nIn terms of steps, I've already started on the technical side — learning web development, building prototypes. After that, it's really about creating the right content and then figuring out a sustainable pricing model. Something like a freemium approach — free for the basics, paid for the full experience.\n\nAnd why does it matter to me personally? I grew up seeing talented people whose potential was kind of held back just because they didn't have the right tools. If I can close that gap even a little — give students the kind of feedback and practice they'd otherwise have to pay thousands for — that feels worth pursuing. It's not just a business goal, it's something I genuinely care about."},
  {topic:"Describe a useful skill you learned recently",
   cue:"You should say:\n• what the skill is\n• how you learned it\n• how long it took to learn\nAnd explain why it is useful.",
   model:"So the skill I want to talk about is web development — specifically React and JavaScript. I started learning maybe six months ago, which isn't that long.\n\nThe reason I started was actually quite practical — I had an idea for an educational tool and I couldn't afford to hire a developer. So I thought, right, I'll just learn it myself. Which sounds straightforward, but it really wasn't.\n\nI started with HTML and CSS — that took about a month to feel comfortable with. Then JavaScript, which is a whole different level. Understanding things like functions and how data flows through an app — that took real effort. A lot of late nights, honestly, breaking things and figuring out why.\n\nBut it's been incredibly useful. The main thing is creative independence — instead of waiting for someone else to build what I'm imagining, I can just... do it myself. It's also changed how I think generally. Programming makes you much more systematic about problem-solving. I'd genuinely recommend it to anyone — even just the basics make a real difference in how you understand the digital world."},
  {topic:"Describe a place in your country that you would recommend to visitors",
   cue:"You should say:\n• where it is\n• what people can see and do there\n• how to get there\nAnd explain why you would recommend it.",
   model:"If I had to pick one place, it would definitely be Petra — in the south of Jordan, about three hours from Amman by car. I've been a few times and it honestly never gets old.\n\nSo Petra is this ancient city — the Nabataeans carved it directly into the rock face over two thousand years ago. The most famous structure is the Treasury — Al-Khazneh — which you've probably seen in films. But what surprises most visitors is how much there is beyond that. There are tombs, a Roman theatre, monasteries up in the mountains... it goes on for kilometres.\n\nIn terms of getting there, most people drive or take a bus from Amman. I'd really recommend getting a local guide for at least part of it — there's so much context you'd miss otherwise. And honestly, don't try to do it in one day. Two days minimum.\n\nThe reason I'd recommend it above anywhere else is that it's genuinely unlike anything else. I remember standing in front of the Treasury early in the morning before the crowds arrived, watching the light hit the stone — and it was just... I don't know, one of those moments where you feel quite small in the best way. It's a UNESCO site and a Wonder of the World, and in this case, those labels are completely deserved."}
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
    {id:"mistakes",label:"⚠️ Common Mistakes",free:true}
  ];
  const toggleAnswer = (key) => setShowAnswer(prev=>({...prev,[key]:!prev[key]}));
  const sty = {fontFamily:"'Cairo','Source Sans Pro',system-ui"};
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
                      <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:8,padding:"10px 14px",marginBottom:8,fontSize:12,color:"#713f12",lineHeight:1.5}}>
                        ⚠️ <strong>لا تحفظ هذه الإجابة حرفياً.</strong> الممتحن مدرَّب على اكتشاف الإجابات المحفوظة. استخدمها كمثال على الهيكل والمفردات، ثم تحدّث بأسلوبك الخاص عن تجربتك الشخصية.
                      </div>
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
    </div>
  );
};

// ── IELTS Reading Page ──────────────────────
const BAND_SCORE_AC = (correct) => {
  if(correct>=39) return 9.0; if(correct>=37) return 8.5; if(correct>=35) return 8.0;
  if(correct>=33) return 7.5; if(correct>=30) return 7.0; if(correct>=27) return 6.5;
  if(correct>=23) return 6.0; if(correct>=19) return 5.5; if(correct>=15) return 5.0;
  if(correct>=13) return 4.5; if(correct>=10) return 4.0; if(correct>=6) return 3.5;
  return 3.0;
};
const BAND_SCORE_GT = (correct) => {
  if(correct>=40) return 9.0; if(correct>=39) return 8.5; if(correct>=37) return 8.0;
  if(correct>=36) return 7.5; if(correct>=34) return 7.0; if(correct>=32) return 6.5;
  if(correct>=30) return 6.0; if(correct>=27) return 5.5; if(correct>=23) return 5.0;
  if(correct>=19) return 4.5; if(correct>=15) return 4.0; return 3.5;
};

const READING_STRATEGIES = [
  {type:"True / False / Not Given",strategy:"Read the statement carefully. Find the relevant section in the passage. TRUE = the passage confirms it. FALSE = the passage contradicts it. NOT GIVEN = the passage doesn't mention this at all. Only use information from the text.",tip:"'Not Given' means the information simply isn't there. If you can't find it after 2 minutes, it's probably Not Given."},
  {type:"Yes / No / Not Given",strategy:"About the WRITER'S OPINIONS, not facts. YES = the writer agrees. NO = the writer disagrees. NOT GIVEN = the writer doesn't express an opinion. Look for opinion language: 'I believe', 'arguably', etc.",tip:"The writer's view may differ from experts quoted in the passage."},
  {type:"Multiple Choice",strategy:"Read the question and all options before searching the text. Eliminate wrong answers first. The correct answer is usually a paraphrase, not an exact quote.",tip:"Questions follow the order of the text."},
  {type:"Matching Headings",strategy:"Read each paragraph and identify its MAIN IDEA. The heading should summarise the whole paragraph. Cross out headings as you use them.",tip:"Beware of headings that match a detail rather than the main idea."},
  {type:"Sentence Completion",strategy:"Identify keywords in the incomplete sentence. Scan for those keywords or synonyms. Follow word count limits exactly.",tip:"Copy words exactly as they appear in the passage."},
  {type:"Summary Completion",strategy:"Read the entire summary first. Identify the relevant passage section. Fill gaps using exact words from the passage or from a given list.",tip:"If given a word list, eliminate options as you use them."},
  {type:"Matching Information",strategy:"Read all statements first and underline keywords. Scan each paragraph for matching information. A paragraph can be used more than once.",tip:"This is a scanning exercise — look for specific details."},
  {type:"Diagram / Flowchart / Table",strategy:"Study the diagram carefully first. Identify what type of information is missing. Answers usually come in order from the passage.",tip:"Look at what's already filled in to understand the pattern."}
];

const READING_TIME_TIPS = [
  "Use the 15-20-25 rule: spend 15 minutes on Passage 1, 20 on Passage 2, and 25 on Passage 3.",
  "Skim each passage for 2-3 minutes before looking at questions.",
  "Read questions FIRST for T/F/NG and sentence completion so you know what to look for.",
  "Never leave a blank — there's no penalty for wrong answers.",
  "If stuck for more than 90 seconds, mark it and move on.",
  "Don't read every word. Skim for main ideas and scan for keywords.",
  "Underline keywords in questions before searching the passage.",
  "Answers for most question types follow the order of the passage.",
  "Practice with a timer regularly — time pressure is the #1 challenge.",
  "Transfer answers carefully — many marks are lost through careless transfer."
];

const AC_TESTS = [
  {id:1,title:"Science & Society",passages:[
    {title:"The Architecture of Sleep",text:"Sleep, far from being a passive state, is an active neurological process that scientists are only now beginning to fully understand. Research over the past two decades has revealed that sleep consists of distinct stages, each serving unique biological functions.\n\nThe sleep cycle is divided into non-rapid eye movement (NREM) and rapid eye movement (REM) sleep. NREM has three stages. Stage 1 is a transitional period lasting a few minutes. Stage 2 features specific brain wave patterns known as sleep spindles and K-complexes. Stage 3, called deep sleep or slow-wave sleep, is the most restorative phase, during which the body repairs tissues, strengthens the immune system, and consolidates memories.\n\nREM sleep occurs approximately 90 minutes after falling asleep and recurs in increasingly longer periods throughout the night. The brain becomes remarkably active during REM — in some respects more active than during waking hours. The eyes move rapidly beneath closed lids, and most vivid dreaming occurs. The body's voluntary muscles become temporarily paralysed, a phenomenon called atonia, preventing individuals from acting out dreams.\n\nModern research has established that adults require between seven and nine hours for optimal functioning. However, the University of California found that approximately one percent of the population carries a genetic mutation allowing them to function normally on just six hours — so-called 'short sleepers' who don't experience the cognitive impairments affecting most sleep-deprived people.\n\nThe consequences of chronic sleep deprivation extend far beyond tiredness. Research in Nature demonstrated that sleeping six hours instead of eight for two weeks produces cognitive impairments equivalent to staying awake for 48 hours continuously. These impairments affect attention, working memory, and decision-making, yet chronically sleep-deprived individuals often fail to recognise the extent of their own impairment.\n\nThe relationship between sleep and long-term health is perhaps most concerning. Epidemiological studies have linked insufficient sleep to cardiovascular disease, obesity, diabetes, and weakened immune function. Professor Matthew Walker of UC Berkeley has argued that sleep deprivation is now so widespread in industrialised societies that it constitutes a public health epidemic.",
     questions:[
      {type:"tfng",q:"Sleep is essentially a passive state where the body shuts down.",a:"FALSE",exp:"The passage states sleep is 'an active neurological process', contradicting 'passive state'."},
      {type:"tfng",q:"NREM sleep consists of four distinct stages.",a:"FALSE",exp:"The passage says 'NREM has three stages', not four."},
      {type:"tfng",q:"Stage 3 sleep helps repair body tissues.",a:"TRUE",exp:"The passage directly states Stage 3 is when 'the body repairs tissues'."},
      {type:"tfng",q:"REM sleep first occurs about an hour and a half after sleep onset.",a:"TRUE",exp:"The passage says 'approximately 90 minutes after falling asleep', which is 1.5 hours."},
      {type:"tfng",q:"The brain is less active during REM sleep than during waking hours.",a:"FALSE",exp:"The passage says the brain is 'more active than during waking hours' during REM."},
      {type:"tfng",q:"Most adults need exactly eight hours of sleep.",a:"FALSE",exp:"The passage says 'between seven and nine hours', not exactly eight."},
      {type:"mc",q:"What is described as a rare genetic trait in a small minority of people?",options:["The ability to remember every dream","Functioning well with significantly less sleep than most","Needing more than nine hours to feel rested","Experiencing no REM sleep"],a:"Functioning well with significantly less sleep than most",exp:"The passage describes 'approximately one percent' carrying a mutation enabling them to function on reduced sleep — paraphrased here as 'a small minority'."},
      {type:"mc",q:"Sleeping six hours for two weeks equals the cognitive effect of:",options:["Missing one night of sleep","Staying awake for 24 hours","Staying awake for 48 hours","Sleeping 4 hours per night"],a:"Staying awake for 48 hours",exp:"The passage explicitly states 'equivalent to staying awake for 48 hours continuously'."},
      {type:"completion",q:"The temporary paralysis of muscles during REM is called ___.",a:"atonia",exp:"The passage names this phenomenon 'atonia'."},
      {type:"completion",q:"Stage 2 NREM sleep features sleep spindles and ___.",a:"K-complexes",exp:"The passage lists 'sleep spindles and K-complexes' as Stage 2 features."},
      {type:"mc",q:"Professor Walker describes widespread sleep deprivation as:",options:["A minor inconvenience","A genetic adaptation","A public health epidemic","An unavoidable consequence"],a:"A public health epidemic",exp:"The passage quotes Walker arguing it 'constitutes a public health epidemic'."},
      {type:"completion",q:"Chronic sleep deprivation has been linked to cardiovascular disease, obesity, diabetes, and weakened ___ function.",a:"immune",exp:"The passage lists 'weakened immune function' among the health consequences."},
      {type:"tfng",q:"People who are chronically sleep-deprived always recognise their own impairment.",a:"FALSE",exp:"The passage says they 'often fail to recognise the extent of their own impairment'."}
    ]},
    {title:"Urban Green Spaces and Public Health",text:"As global urbanisation accelerates — with the UN projecting that 68% of the world's population will live in cities by 2050 — the role of green spaces in urban environments has become a subject of increasing scientific interest. Parks, gardens, and urban forests are now recognised as critical infrastructure delivering measurable benefits to public health, environmental quality, and social cohesion.\n\nResearch published in The Lancet demonstrated that residents living within 300 metres of green space showed significantly lower levels of cortisol, the body's primary stress hormone. A study across nine European cities found that people spending at least 120 minutes per week in natural environments reported substantially better health and psychological wellbeing, regardless of socioeconomic status.\n\nThe environmental benefits are equally compelling. Trees act as natural air filters, absorbing pollutants including nitrogen dioxide and particulate matter. A single mature tree absorbs approximately 22 kilograms of carbon dioxide per year while releasing enough oxygen for two people. Green spaces also play a crucial role in managing urban stormwater through permeable soil and plant root systems.\n\nThe 'urban heat island effect' — whereby cities are significantly warmer than surrounding rural areas — can be substantially mitigated through strategic green space placement. Research from the Technical University of Munich found that urban parks can reduce local temperatures by 1 to 4 degrees Celsius.\n\nSocially, urban parks serve as democratic spaces where people from different backgrounds interact. Unlike commercial venues, parks are freely accessible, making them particularly important for lower-income communities. Studies have shown that well-maintained green spaces reduce crime rates, foster community engagement, and provide essential recreational opportunities for children.\n\nDespite these benefits, urban green spaces face persistent threats from development pressure. Singapore has emerged as a notable counterexample, implementing a 'City in a Garden' strategy that increased green cover from 36% in the 1980s to nearly 50% today, demonstrating that urban density and abundant green space need not be mutually exclusive.",
     questions:[
      {type:"tfng",q:"By 2050, more than two-thirds of people will be urban.",a:"TRUE",exp:"68% is more than two-thirds (66.7%)."},
      {type:"tfng",q:"The Lancet study measured blood pressure near green spaces.",a:"FALSE",exp:"The study measured cortisol levels, not blood pressure."},
      {type:"tfng",q:"Spending 2 hours weekly in nature improved wellbeing regardless of income.",a:"TRUE",exp:"The passage states benefits occurred 'regardless of socioeconomic status'."},
      {type:"tfng",q:"A mature tree produces enough oxygen for five people annually.",a:"FALSE",exp:"The passage says 'enough oxygen for two people', not five."},
      {type:"mc",q:"Urban green spaces are now considered:",options:["Luxury amenities","Critical infrastructure with measurable benefits","Primarily recreational","Obstacles to development"],a:"Critical infrastructure with measurable benefits",exp:"The passage describes them as 'critical infrastructure delivering measurable benefits'."},
      {type:"mc",q:"Singapore's green cover changed from:",options:["50% to 36%","36% to nearly 50%","20% to 36%","50% to 68%"],a:"36% to nearly 50%",exp:"The passage states 'from 36% in the 1980s to nearly 50% today'."},
      {type:"completion",q:"Trees absorb pollutants including nitrogen dioxide and ___ matter.",a:"particulate",exp:"The passage lists 'particulate matter' among absorbed pollutants."},
      {type:"completion",q:"The phenomenon where cities are warmer than rural areas is the 'urban ___ island effect'.",a:"heat",exp:"The passage names it the 'urban heat island effect'."},
      {type:"mc",q:"Well-maintained green spaces have been linked to:",options:["Higher property taxes","Reduced crime rates","Increased traffic","Lower attendance"],a:"Reduced crime rates",exp:"The passage states green spaces 'reduce crime rates'."},
      {type:"tfng",q:"Commercial venues are more socially inclusive than parks.",a:"FALSE",exp:"Parks are 'freely accessible' unlike commercial venues that require spending money."},
      {type:"completion",q:"Green spaces manage stormwater through permeable soil and plant ___ systems.",a:"root",exp:"The passage mentions 'plant root systems' for stormwater management."},
      {type:"mc",q:"Urban parks reduce local temperatures by:",options:["5-10 degrees","1-4 degrees Celsius","Less than 1 degree","More than 10 degrees"],a:"1-4 degrees Celsius",exp:"The Munich study found parks 'reduce local temperatures by 1 to 4 degrees Celsius'."},
      {type:"tfng",q:"Singapore's approach proves dense cities cannot have green space.",a:"FALSE",exp:"Singapore demonstrates the opposite: 'density and abundant green space need not be mutually exclusive'."}
    ]},
    {title:"The Psychology of Decision Making",text:"Every day, the average adult makes approximately 35,000 decisions. The field of behavioural economics, pioneered by Daniel Kahneman and Amos Tversky in the 1970s, has fundamentally challenged the assumption that humans are rational decision-makers.\n\nKahneman's research, which earned him the Nobel Prize in Economics in 2002, identified two systems of thinking. System 1 operates automatically and quickly, responsible for snap judgements and intuitive responses. System 2 allocates attention to effortful activities including complex calculations and logical reasoning. While System 2 is more reliable, it's slower and requires significant cognitive resources, meaning people frequently default to System 1.\n\n'Loss aversion' is one of the most influential concepts — people experience the pain of losing something approximately twice as intensely as the pleasure of gaining something equivalent. This explains why investors hold losing stocks too long and consumers are motivated more by fear of missing offers than by equivalent future discounts.\n\nThe 'anchoring effect' shows that people rely heavily on the first information they encounter when making estimates. In one experiment, participants who saw a high random number subsequently estimated higher values for unrelated questions than those who saw a low number. This affects salary negotiations, real estate pricing, and courtroom sentencing.\n\n'Choice overload,' popularised by Barry Schwartz, describes the paradox that more options often lead to worse decisions. Researchers Sheena Iyengar and Mark Lepper found that customers offered 24 varieties of jam were far less likely to purchase than those offered 6. The abundance created decision paralysis and diminished satisfaction.\n\nGovernments worldwide have established 'nudge units' leveraging these insights. By changing default options on pension enrolment forms, the UK government dramatically increased retirement savings rates without restricting individual choice — demonstrating that small changes in how choices are presented can produce large shifts in behaviour.",
     questions:[
      {type:"tfng",q:"The number of daily decisions the average adult makes is in the tens of thousands.",a:"TRUE",exp:"The passage states 'approximately 35,000 decisions' — the question paraphrases this as 'tens of thousands' requiring meaning recognition, not number matching."},
      {type:"tfng",q:"Kahneman won the Nobel Prize in Psychology.",a:"FALSE",exp:"He won 'the Nobel Prize in Economics', not Psychology."},
      {type:"tfng",q:"System 1 thinking is slow and deliberate.",a:"FALSE",exp:"System 1 'operates automatically and quickly'. System 2 is the slow one."},
      {type:"tfng",q:"People feel losses about twice as strongly as equivalent gains.",a:"TRUE",exp:"The passage states 'approximately twice as intensely'."},
      {type:"mc",q:"The jam study demonstrated that:",options:["Customers prefer variety","Too many options can reduce purchasing","6 types is insufficient","Stores should stock fewer products"],a:"Too many options can reduce purchasing",exp:"Customers offered 24 varieties 'were far less likely to purchase than those offered 6'."},
      {type:"mc",q:"'Nudge units' use behavioural insights to:",options:["Force specific choices","Restrict options","Encourage beneficial behaviours through choice design","Increase taxation"],a:"Encourage beneficial behaviours through choice design",exp:"They leverage insights to encourage behaviour without restricting choice."},
      {type:"mc",q:"The UK increased pension savings by:",options:["Making saving mandatory","Offering incentives","Changing default enrolment options","Raising retirement age"],a:"Changing default enrolment options",exp:"The passage says 'changing default options on pension enrolment forms'."},
      {type:"completion",q:"System 2 thinking requires significant ___ resources.",a:"cognitive",exp:"The passage states it 'requires significant cognitive resources'."},
      {type:"completion",q:"The tendency to rely on first information is the '___ effect'.",a:"anchoring",exp:"The passage names it the 'anchoring effect'."},
      {type:"completion",q:"Choice overload was popularised by Barry ___.",a:"Schwartz",exp:"The passage names 'Barry Schwartz'."},
      {type:"completion",q:"Loss aversion explains why investors hold ___ stocks too long.",a:"losing",exp:"The passage states 'investors hold losing stocks too long'."},
      {type:"tfng",q:"The anchoring effect only works with relevant information.",a:"FALSE",exp:"It works even with 'a high random number' — arbitrary and irrelevant information."},
      {type:"tfng",q:"The jam study was conducted by Kahneman and Tversky.",a:"FALSE",exp:"It was conducted by 'Sheena Iyengar and Mark Lepper', not Kahneman and Tversky."},
      {type:"mc",q:"According to the passage, System 1 is responsible for:",options:["Complex calculations","Logical reasoning","Snap judgements and intuitive responses","Careful analysis"],a:"Snap judgements and intuitive responses",exp:"System 1 is described as 'responsible for snap judgements and intuitive responses'."}
    ]}
  ]},
  {id:2,title:"Language & Culture",passages:[
    {title:"The Death of Languages",text:"Of the approximately 7,000 languages currently spoken worldwide, linguists estimate that nearly half will become extinct by the end of this century. A language is considered endangered when children no longer learn it as their first language, and dead when its last native speaker passes away. The rate of language death has accelerated dramatically in recent decades, with one language disappearing approximately every two weeks.\n\nThe causes of language death are complex and interrelated. Economic globalisation has created powerful incentives for speakers of minority languages to adopt dominant languages — primarily English, Mandarin, Spanish, and Arabic — that provide access to education, employment, and international commerce. Urbanisation compounds this effect, as young people migrate to cities where minority languages carry no practical value. Government policies have historically played a devastating role; throughout the 20th century, many nations actively suppressed indigenous languages through education systems that punished children for speaking anything other than the national language.\n\nThe consequences of language loss extend far beyond the disappearance of words and grammar. Each language encodes unique knowledge about the natural world — medicinal plants, animal behaviour, ecological relationships — accumulated over thousands of years. The Inuit language, for example, contains dozens of words distinguishing different types of snow, reflecting observational precision that cannot be replicated in translation. When a language dies, this irreplaceable knowledge dies with it.\n\nFurthermore, linguistic diversity appears to correlate with biological diversity. Research published in the Proceedings of the National Academy of Sciences found that regions with the highest concentration of endemic species also tend to have the greatest diversity of languages. This suggests that the conditions supporting biological diversity — geographic isolation, varied ecosystems — simultaneously foster linguistic diversity.\n\nEfforts to revive endangered languages have produced some remarkable successes. Hebrew was essentially a dead language used only in religious texts before being revived as the everyday language of Israel in the early 20th century. Welsh, once in serious decline, has seen a significant resurgence through Welsh-medium education, with the number of Welsh speakers increasing for the first time in over a century. New Zealand's Maori language has similarly benefited from immersion schooling programmes.\n\nTechnology is increasingly playing a role in language preservation. Digital archives, mobile apps, and social media platforms allow speakers of endangered languages to create and share content, reaching diaspora communities that might otherwise lose connection with their linguistic heritage. However, linguists caution that technology alone cannot save a language — survival ultimately depends on whether communities choose to transmit it to their children.",
     questions:[
      {type:"tfng",q:"About half of the world's languages may disappear within 100 years.",a:"TRUE",exp:"'Nearly half will become extinct by the end of this century'."},
      {type:"tfng",q:"A language dies when fewer than 100 people speak it.",a:"NOT GIVEN",exp:"The passage defines death as when 'its last native speaker passes away', not a specific number."},
      {type:"tfng",q:"One language disappears roughly every fortnight.",a:"TRUE",exp:"'One language disappearing approximately every two weeks' — a fortnight is two weeks."},
      {type:"tfng",q:"Economic globalisation has encouraged minority language speakers to learn dominant languages.",a:"TRUE",exp:"Globalisation 'created powerful incentives for speakers of minority languages to adopt dominant languages'."},
      {type:"mc",q:"Government policies in the 20th century often:",options:["Encouraged multilingualism","Actively suppressed indigenous languages","Funded minority language education","Had no effect on language survival"],a:"Actively suppressed indigenous languages",exp:"Governments 'actively suppressed indigenous languages through education systems'."},
      {type:"mc",q:"The Inuit language example illustrates that:",options:["All languages have equal vocabulary","Languages encode unique environmental knowledge","Snow vocabulary is universal","Translation always preserves meaning"],a:"Languages encode unique environmental knowledge",exp:"The Inuit example shows 'observational precision that cannot be replicated in translation'."},
      {type:"tfng",q:"Regions with many endemic species tend to have fewer languages.",a:"FALSE",exp:"These regions 'tend to have the greatest diversity of languages', not fewer."},
      {type:"mc",q:"Hebrew was revived from:",options:["A minority spoken language","A language used only in religious texts","A widely spoken language","A trading language"],a:"A language used only in religious texts",exp:"Hebrew was 'essentially a dead language used only in religious texts'."},
      {type:"completion",q:"Welsh speakers increased for the first time in over a ___.",a:"century",exp:"'The number of Welsh speakers increasing for the first time in over a century'."},
      {type:"completion",q:"New Zealand's Maori language benefited from ___ schooling programmes.",a:"immersion",exp:"The passage mentions 'immersion schooling programmes'."},
      {type:"tfng",q:"Technology alone can save endangered languages.",a:"FALSE",exp:"Linguists 'caution that technology alone cannot save a language'."},
      {type:"completion",q:"Language survival depends on whether communities transmit it to their ___.",a:"children",exp:"Survival 'depends on whether communities choose to transmit it to their children'."},
      {type:"mc",q:"The main causes of language death include all EXCEPT:",options:["Economic globalisation","Urbanisation","Government suppression","Increased literacy rates"],a:"Increased literacy rates",exp:"Literacy rates are not mentioned as a cause of language death."}
    ]},
    {title:"The Rise of Artificial Intelligence in Education",text:"Artificial intelligence is transforming education at every level, from primary schools to universities and corporate training programmes. AI-powered tutoring systems can now adapt in real time to individual students' strengths and weaknesses, providing personalised instruction that was previously available only through expensive one-to-one human tutoring.\n\nOne of the most significant developments has been the emergence of intelligent tutoring systems (ITS). Research conducted at Carnegie Mellon University found that students using AI tutors achieved learning outcomes comparable to those receiving human tutoring, and significantly better than those in traditional classroom settings. The AI systems accomplished this by continuously analysing student responses, identifying misconceptions, and adjusting the difficulty and focus of subsequent questions accordingly.\n\nAutomated essay scoring represents another area where AI has made substantial inroads. Systems developed by organisations including Educational Testing Service (ETS) can evaluate written work for grammar, coherence, argument structure, and vocabulary range. Studies comparing AI scores with human examiner scores have found correlation rates exceeding 0.90, suggesting remarkable consistency. However, critics argue that current AI systems struggle to evaluate creativity, nuanced argumentation, and the genuine quality of ideas — focusing instead on surface-level linguistic features.\n\nThe integration of AI in education raises significant equity concerns. Students in well-funded schools and affluent families have greater access to sophisticated AI learning tools, potentially widening the achievement gap rather than narrowing it. A report by UNESCO warned that without deliberate policy intervention, AI in education could 'reinforce existing inequalities along economic, social, and cultural lines.'\n\nTeachers' roles are evolving rather than being eliminated. Most education experts reject the notion that AI will replace teachers entirely. Instead, they envision a model where AI handles routine tasks — grading, progress tracking, content delivery — while teachers focus on mentoring, creative instruction, and the social-emotional aspects of education that AI cannot replicate. A survey by McKinsey found that 72% of teachers who had used AI tools reported that the technology saved them significant time on administrative tasks.\n\nLooking ahead, the development of generative AI models presents both opportunities and challenges. These systems can create customised learning materials, generate practice questions, and provide instant feedback. However, concerns about academic integrity have intensified, as students can use the same technology to generate essays and complete assignments without genuine learning taking place.",
     questions:[
      {type:"tfng",q:"AI tutoring systems can adapt to individual students in real time.",a:"TRUE",exp:"The passage states AI systems 'adapt in real time to individual students' strengths and weaknesses'."},
      {type:"tfng",q:"Carnegie Mellon found AI tutoring was worse than human tutoring.",a:"FALSE",exp:"Students achieved 'outcomes comparable to those receiving human tutoring'."},
      {type:"mc",q:"Automated essay scoring systems evaluate all EXCEPT:",options:["Grammar","Coherence","Vocabulary range","Emotional depth"],a:"Emotional depth",exp:"The passage lists grammar, coherence, argument structure, and vocabulary — not emotional depth."},
      {type:"tfng",q:"AI essay scoring correlates with human scoring at over 90%.",a:"TRUE",exp:"'Correlation rates exceeding 0.90'."},
      {type:"mc",q:"Critics of AI essay scoring argue these systems cannot evaluate:",options:["Grammar accuracy","Spelling errors","Creativity and nuanced argumentation","Word count"],a:"Creativity and nuanced argumentation",exp:"Critics say systems 'struggle to evaluate creativity, nuanced argumentation, and genuine quality of ideas'."},
      {type:"tfng",q:"UNESCO believes AI will automatically reduce educational inequality.",a:"FALSE",exp:"UNESCO warned AI could 'reinforce existing inequalities' without policy intervention."},
      {type:"mc",q:"According to McKinsey, what percentage of teachers found AI saved time?",options:["52%","62%","72%","82%"],a:"72%",exp:"'72% of teachers who had used AI tools reported significant time savings'."},
      {type:"completion",q:"AI is expected to handle grading, progress tracking, and content ___.",a:"delivery",exp:"AI handles 'grading, progress tracking, content delivery'."},
      {type:"completion",q:"Teachers will focus more on mentoring and the ___-emotional aspects of education.",a:"social",exp:"Teachers focus on 'social-emotional aspects of education'."},
      {type:"tfng",q:"Most experts believe AI will completely replace teachers.",a:"FALSE",exp:"'Most education experts reject the notion that AI will replace teachers entirely'."},
      {type:"mc",q:"Generative AI raises concerns about:",options:["Teacher unemployment","Academic integrity","Hardware costs","Internet access"],a:"Academic integrity",exp:"'Concerns about academic integrity have intensified' with generative AI."},
      {type:"completion",q:"ITS works by analysing responses, identifying ___, and adjusting difficulty.",a:"misconceptions",exp:"AI tutors work by 'identifying misconceptions'."},
      {type:"tfng",q:"AI learning tools are equally accessible to all students.",a:"FALSE",exp:"Students in 'well-funded schools and affluent families have greater access'."}
    ]},
    {title:"The Ocean's Twilight Zone",text:"Between 200 and 1,000 metres below the ocean surface lies a vast realm known as the mesopelagic zone, or 'twilight zone.' Despite containing an estimated 10 billion tonnes of fish — more than the total catch of all the world's fisheries combined — this enormous ecosystem remains one of the least understood environments on Earth.\n\nThe twilight zone receives barely enough sunlight for photosynthesis, creating a dim world where organisms have evolved remarkable adaptations. Bioluminescence — the ability to produce light through chemical reactions — is nearly universal among twilight zone creatures. Some species use light to attract prey, others to communicate with potential mates, and still others to camouflage themselves against the faint light filtering from above through a process called counter-illumination.\n\nPerhaps the most extraordinary phenomenon in the twilight zone is the daily vertical migration, considered the largest animal migration on Earth. Each evening, billions of organisms — fish, squid, crustaceans, and jellyfish — ascend hundreds of metres to feed in the nutrient-rich surface waters under cover of darkness. Before dawn, they descend again to the relative safety of the deep. This migration moves an estimated 10 gigatons of carbon from the surface to the deep ocean annually, playing a significant but poorly quantified role in regulating atmospheric carbon dioxide levels.\n\nScientists are only now beginning to understand the twilight zone's importance to global climate regulation. The 'biological carbon pump' operates as organisms consume carbon-rich food at the surface and transport it to depth through their migrations, faecal matter, and eventual death. Without this mechanism, atmospheric CO2 levels could be 50% higher than they currently are, with catastrophic consequences for climate stability.\n\nCommercial interest in the twilight zone is growing, driven by the search for new protein sources to feed expanding human populations. Several nations have begun developing technologies to harvest mesopelagic fish at industrial scale. Marine biologists have expressed alarm at these developments, warning that the ecosystem is far too poorly understood to sustain commercial exploitation. The organisms of the twilight zone grow slowly and reproduce infrequently, making them extremely vulnerable to overfishing.\n\nThe challenges of studying this environment are formidable. Traditional nets are ineffective because many twilight zone organisms can detect and avoid them. New technologies including autonomous underwater vehicles, acoustic sensors, and environmental DNA sampling are beginning to reveal the true extent of life in this hidden realm, but comprehensive surveys remain years away.",
     questions:[
      {type:"tfng",q:"The mesopelagic zone lies between 200 and 1,000 metres deep.",a:"TRUE",exp:"The passage states 'between 200 and 1,000 metres below the ocean surface'."},
      {type:"tfng",q:"The twilight zone contains about 10 billion tonnes of fish.",a:"TRUE",exp:"'An estimated 10 billion tonnes of fish'."},
      {type:"mc",q:"Bioluminescence in the twilight zone is:",options:["Extremely rare","Found in a few species","Nearly universal","Only in fish"],a:"Nearly universal",exp:"Bioluminescence is described as 'nearly universal among twilight zone creatures'."},
      {type:"completion",q:"Some species camouflage against faint light through ___-illumination.",a:"counter",exp:"The passage names the process 'counter-illumination'."},
      {type:"mc",q:"The daily vertical migration is considered:",options:["A minor event","The largest animal migration on Earth","Limited to fish only","A monthly occurrence"],a:"The largest animal migration on Earth",exp:"It is described as 'the largest animal migration on Earth'."},
      {type:"tfng",q:"The vertical migration happens weekly.",a:"FALSE",exp:"It is a 'daily vertical migration', not weekly."},
      {type:"completion",q:"The migration moves about 10 gigatons of ___ annually.",a:"carbon",exp:"'10 gigatons of carbon from the surface to the deep ocean annually'."},
      {type:"mc",q:"Without the biological carbon pump, CO2 levels could be:",options:["10% higher","25% higher","50% higher","100% higher"],a:"50% higher",exp:"'Atmospheric CO2 levels could be 50% higher'."},
      {type:"tfng",q:"Twilight zone organisms reproduce quickly.",a:"FALSE",exp:"They 'grow slowly and reproduce infrequently'."},
      {type:"mc",q:"Traditional nets fail in the twilight zone because:",options:["They are too heavy","Organisms can detect and avoid them","The water pressure is too high","Currents are too strong"],a:"Organisms can detect and avoid them",exp:"'Many twilight zone organisms can detect and avoid them'."},
      {type:"completion",q:"New technologies for studying the zone include autonomous underwater vehicles, acoustic sensors, and environmental ___ sampling.",a:"DNA",exp:"The passage mentions 'environmental DNA sampling'."},
      {type:"tfng",q:"Comprehensive surveys of the twilight zone have been completed.",a:"FALSE",exp:"'Comprehensive surveys remain years away'."},
      {type:"completion",q:"Marine biologists warn the ecosystem cannot sustain commercial ___.",a:"exploitation",exp:"They warn against 'commercial exploitation'."},
      {type:"mc",q:"Interest in harvesting twilight zone fish is driven by:",options:["Scientific curiosity","The search for new protein sources","Environmental regulation","Tourism"],a:"The search for new protein sources",exp:"Driven by 'the search for new protein sources to feed expanding human populations'."}
    ]}
  ]},
  {id:3,title:"Technology & Innovation",passages:[
    {title:"The History and Future of Antibiotics",text:"The discovery of penicillin by Alexander Fleming in 1928 is widely regarded as one of the most significant medical breakthroughs in history. Before antibiotics, even minor wounds could lead to fatal infections, and surgical procedures carried enormous risks. The widespread introduction of antibiotics in the 1940s transformed medicine, extending average life expectancy by an estimated eight years and saving hundreds of millions of lives.\n\nHowever, the golden age of antibiotic discovery was remarkably brief. Most classes of antibiotics in use today were discovered between 1940 and 1962. Since then, the pipeline of new antibiotics has slowed to a trickle, partly because pharmaceutical companies find these drugs less profitable than medications for chronic conditions. An antibiotic course lasts days or weeks, whereas treatments for diabetes, heart disease, or depression generate revenue for years.\n\nThe emergence of antibiotic-resistant bacteria represents one of the gravest threats to global public health. The World Health Organisation has warned that without urgent action, the world faces a 'post-antibiotic era' in which common infections could once again become lethal. Methicillin-resistant Staphylococcus aureus (MRSA) alone kills an estimated 20,000 people annually in the United States. Globally, antibiotic-resistant infections are responsible for approximately 1.27 million deaths per year.\n\nResistance develops through natural selection. When bacteria are exposed to antibiotics, most are killed, but a small number with genetic mutations allowing them to survive will reproduce and pass on their resistance genes. The overuse of antibiotics in human medicine — particularly for viral infections against which they are ineffective — and their extensive use in agriculture have dramatically accelerated this process.\n\nSeveral promising approaches are being explored to combat resistance. Bacteriophage therapy uses viruses that specifically target bacteria, a technique pioneered in the Soviet Union but largely ignored in the West until recently. CRISPR gene-editing technology offers the theoretical possibility of disabling resistance genes directly. Meanwhile, researchers are investigating antimicrobial peptides — naturally occurring molecules in the immune systems of many organisms — as a fundamentally new class of antibacterial agents.\n\nPrevention remains crucial. Simple measures such as proper handwashing, appropriate antibiotic prescribing, and reducing antibiotic use in livestock can significantly slow the development of resistance, buying time for new therapeutic approaches to be developed.",
     questions:[
      {type:"tfng",q:"Penicillin was discovered in 1928.",a:"TRUE",exp:"The passage states Fleming discovered penicillin 'in 1928'."},
      {type:"tfng",q:"Antibiotics extended life expectancy by approximately eight years.",a:"TRUE",exp:"'Extending average life expectancy by an estimated eight years'."},
      {type:"mc",q:"The golden age of antibiotic discovery lasted:",options:["From 1928 to 1962","From 1940 to 1962","From 1940 to 1980","From 1928 to 1980"],a:"From 1940 to 1962",exp:"'Most classes were discovered between 1940 and 1962'."},
      {type:"mc",q:"Pharmaceutical companies find antibiotics less profitable because:",options:["They are cheap to make","Treatment courses are short","They are hard to develop","Patients don't need them"],a:"Treatment courses are short",exp:"'An antibiotic course lasts days or weeks' vs chronic treatments generating revenue for years."},
      {type:"completion",q:"MRSA kills an estimated ___ people annually in the US.",a:"20,000",exp:"'MRSA alone kills an estimated 20,000 people annually'."},
      {type:"tfng",q:"Antibiotic-resistant infections kill about 1.27 million people globally per year.",a:"TRUE",exp:"'Approximately 1.27 million deaths per year'."},
      {type:"mc",q:"Resistance develops because:",options:["Bacteria become immune over time","Surviving bacteria with mutations reproduce","Antibiotics become weaker","Viruses create resistance"],a:"Surviving bacteria with mutations reproduce",exp:"Bacteria 'with genetic mutations allowing them to survive will reproduce'."},
      {type:"tfng",q:"Antibiotics are effective against viral infections.",a:"FALSE",exp:"The passage says antibiotics are used for 'viral infections against which they are ineffective'."},
      {type:"completion",q:"Bacteriophage therapy uses ___ that specifically target bacteria.",a:"viruses",exp:"'Uses viruses that specifically target bacteria'."},
      {type:"mc",q:"Bacteriophage therapy was pioneered in:",options:["The United States","Western Europe","The Soviet Union","Japan"],a:"The Soviet Union",exp:"'A technique pioneered in the Soviet Union'."},
      {type:"completion",q:"CRISPR could theoretically disable ___ genes directly.",a:"resistance",exp:"CRISPR offers 'disabling resistance genes directly'."},
      {type:"completion",q:"Antimicrobial peptides are naturally occurring ___ in immune systems.",a:"molecules",exp:"'Naturally occurring molecules in the immune systems'."},
      {type:"tfng",q:"Reducing antibiotic use in livestock can help slow resistance.",a:"TRUE",exp:"'Reducing antibiotic use in livestock can significantly slow the development of resistance'."}
    ]},
    {title:"Renewable Energy: Progress and Challenges",text:"The global transition to renewable energy has accelerated beyond the most optimistic projections made just a decade ago. In 2023, renewable sources accounted for over 30% of global electricity generation for the first time, with solar and wind power leading the expansion. The cost of solar photovoltaic panels has fallen by approximately 90% since 2010, making solar power cheaper than coal in most regions of the world.\n\nChina has emerged as the dominant force in renewable energy deployment, installing more solar capacity in a single year than the United States has accumulated in its entire history. The country manufactures approximately 80% of the world's solar panels, creating both economic advantages and supply chain concerns for other nations seeking energy independence.\n\nWind energy has experienced similarly dramatic growth. Offshore wind farms, once considered prohibitively expensive, have seen costs drop by nearly 60% over the past decade. Countries with extensive coastlines, including the United Kingdom, Denmark, and the Netherlands, have invested heavily in offshore wind, with turbines now reaching heights exceeding 260 metres — taller than most skyscrapers.\n\nDespite this progress, significant challenges remain. The intermittency of solar and wind power — the sun doesn't always shine and the wind doesn't always blow — creates a fundamental problem for grid stability. Energy storage technologies, particularly lithium-ion batteries, have improved substantially but remain expensive at the scale needed to power entire cities overnight or through calm weather periods.\n\nThe environmental footprint of renewable energy technology itself requires careful consideration. Solar panel manufacturing involves toxic chemicals and significant energy consumption. Wind turbines have been linked to bird and bat mortality, and the decommissioning of ageing equipment creates waste management challenges. Lithium mining for batteries has caused significant environmental damage in countries including Chile, Bolivia, and the Democratic Republic of Congo.\n\nNuclear energy occupies a controversial position in the transition debate. Advocates argue that nuclear power provides reliable, low-carbon baseload electricity that perfectly complements intermittent renewables. Opponents cite unresolved issues of radioactive waste storage, the risk of catastrophic accidents, and the high cost of new nuclear construction. France, which generates approximately 70% of its electricity from nuclear power, demonstrates both the potential and the ongoing controversies of this approach.",
     questions:[
      {type:"tfng",q:"Renewables exceeded 30% of global electricity generation in 2023.",a:"TRUE",exp:"'Renewable sources accounted for over 30% of global electricity generation' in 2023."},
      {type:"completion",q:"Solar panel costs have fallen by approximately ___% since 2010.",a:"90",exp:"'Fallen by approximately 90% since 2010'."},
      {type:"mc",q:"China manufactures roughly what percentage of global solar panels?",options:["50%","60%","70%","80%"],a:"80%",exp:"'China manufactures approximately 80% of the world's solar panels'."},
      {type:"tfng",q:"Offshore wind costs have increased over the past decade.",a:"FALSE",exp:"Costs have 'dropped by nearly 60%'."},
      {type:"completion",q:"Modern offshore wind turbines can exceed ___ metres in height.",a:"260",exp:"'Turbines now reaching heights exceeding 260 metres'."},
      {type:"mc",q:"The main challenge with solar and wind power is:",options:["High costs","Intermittency","Noise pollution","Land requirements"],a:"Intermittency",exp:"'The intermittency of solar and wind power' is the fundamental problem described."},
      {type:"tfng",q:"Lithium-ion battery storage is already cheap enough for city-scale use.",a:"FALSE",exp:"Batteries 'remain expensive at the scale needed to power entire cities'."},
      {type:"mc",q:"Solar panel manufacturing involves:",options:["No environmental impact","Toxic chemicals and energy consumption","Only recyclable materials","Zero emissions"],a:"Toxic chemicals and energy consumption",exp:"Manufacturing 'involves toxic chemicals and significant energy consumption'."},
      {type:"completion",q:"Wind turbines have been linked to ___ and bat mortality.",a:"bird",exp:"'Linked to bird and bat mortality'."},
      {type:"tfng",q:"France generates about 70% of its electricity from nuclear power.",a:"TRUE",exp:"'France generates approximately 70% of its electricity from nuclear power'."},
      {type:"mc",q:"Opponents of nuclear energy cite all EXCEPT:",options:["Radioactive waste","Accident risk","High construction costs","Low energy output"],a:"Low energy output",exp:"Low output is not mentioned; nuclear provides 'reliable baseload electricity'."},
      {type:"completion",q:"Lithium mining has caused environmental damage in Chile, Bolivia, and the Democratic Republic of ___.",a:"Congo",exp:"The passage lists 'the Democratic Republic of Congo'."},
      {type:"tfng",q:"Nuclear advocates say it complements intermittent renewables well.",a:"TRUE",exp:"'Nuclear power provides reliable, low-carbon baseload electricity that perfectly complements intermittent renewables'."},
      {type:"tfng",q:"Denmark has invested heavily in offshore wind.",a:"TRUE",exp:"Denmark is listed among countries that 'have invested heavily in offshore wind'."}
    ]},
    {title:"The Neuroscience of Creativity",text:"Creativity has long been shrouded in mystique — the province of tortured artists and eccentric geniuses. Modern neuroscience, however, is revealing that creative thinking is a fundamental cognitive process accessible to everyone, governed by identifiable neural mechanisms rather than divine inspiration.\n\nBrain imaging studies have overturned the popular myth that creativity resides exclusively in the right hemisphere. Research by cognitive neuroscientist Roger Beaty at Penn State University has demonstrated that creative thinking involves dynamic interaction between three large-scale brain networks: the default mode network, activated during imagination and spontaneous thought; the executive control network, responsible for focused attention and evaluation; and the salience network, which mediates between the two, determining which ideas merit further attention.\n\nHighly creative individuals appear to have stronger connections between these three networks, allowing them to generate novel ideas while simultaneously evaluating their usefulness. This finding explains why creativity requires both the uninhibited flow of ideas and the disciplined judgement to select the best ones — a process psychologists call 'divergent' and 'convergent' thinking, respectively.\n\nEnvironmental factors significantly influence creative output. Research at the University of Chicago found that a moderate level of ambient noise — approximately 70 decibels, equivalent to a busy coffee shop — enhances creative thinking compared to both silence and loud noise. This may explain the common experience of generating ideas in cafes and public spaces rather than in quiet isolation.\n\nSleep plays a crucial role in creative problem-solving. Studies have shown that REM sleep, during which the brain consolidates memories and forms unexpected connections between distant concepts, significantly enhances creative insight. The chemist August Kekulé famously attributed his discovery of the benzene ring structure to a dream, and numerous artists and scientists have reported similar experiences of creative breakthroughs emerging from sleep.\n\nThe relationship between constraints and creativity presents a counterintuitive finding. While freedom might seem conducive to creativity, research consistently shows that moderate constraints — limited time, materials, or resources — actually stimulate more creative solutions than complete freedom. This 'constraint theory of creativity' suggests that boundaries force the mind to explore unconventional approaches it might otherwise overlook.",
     questions:[
      {type:"tfng",q:"Modern science shows creativity is limited to certain gifted individuals.",a:"FALSE",exp:"Creativity is 'a fundamental cognitive process accessible to everyone'."},
      {type:"tfng",q:"Creativity resides exclusively in the right brain hemisphere.",a:"FALSE",exp:"Brain imaging studies have 'overturned' this popular myth."},
      {type:"mc",q:"Creative thinking involves how many brain networks?",options:["One","Two","Three","Four"],a:"Three",exp:"Three networks: default mode, executive control, and salience."},
      {type:"completion",q:"The salience network determines which ideas merit further ___.",a:"attention",exp:"The salience network determines 'which ideas merit further attention'."},
      {type:"mc",q:"Highly creative people have:",options:["Larger brains","Stronger connections between brain networks","More neurons","Higher IQ scores"],a:"Stronger connections between brain networks",exp:"They 'have stronger connections between these three networks'."},
      {type:"completion",q:"Generating many ideas freely is called '___ thinking'.",a:"divergent",exp:"The passage calls idea generation 'divergent thinking'."},
      {type:"mc",q:"The optimal noise level for creativity is about:",options:["30 decibels","50 decibels","70 decibels","90 decibels"],a:"70 decibels",exp:"'Approximately 70 decibels, equivalent to a busy coffee shop'."},
      {type:"tfng",q:"Complete silence is the best environment for creative thinking.",a:"FALSE",exp:"Moderate noise 'enhances creative thinking compared to both silence and loud noise'."},
      {type:"completion",q:"REM sleep helps the brain form connections between ___ concepts.",a:"distant",exp:"REM sleep allows 'unexpected connections between distant concepts'."},
      {type:"mc",q:"Kekulé discovered the benzene ring structure through:",options:["Years of experiments","A dream","A mathematical formula","A colleague's suggestion"],a:"A dream",exp:"He 'attributed his discovery to a dream'."},
      {type:"tfng",q:"Complete freedom produces the most creative results.",a:"FALSE",exp:"'Moderate constraints actually stimulate more creative solutions than complete freedom'."},
      {type:"completion",q:"The '___ theory of creativity' says boundaries encourage unconventional approaches.",a:"constraint",exp:"The passage names the 'constraint theory of creativity'."},
      {type:"mc",q:"Roger Beaty's research was conducted at:",options:["Harvard","MIT","Penn State University","University of Chicago"],a:"Penn State University",exp:"'Cognitive neuroscientist Roger Beaty at Penn State University'."},
      {type:"tfng",q:"The University of Chicago found that loud noise helps creativity.",a:"FALSE",exp:"Moderate noise helps, while loud noise does not — the benefit is 'compared to both silence and loud noise'."}
    ]}
  ]},
  {id:4,title:"History & Environment",passages:[
    {title:"The Silk Road: More Than Trade",text:"The Silk Road — a network of trade routes connecting East Asia with the Mediterranean world — has been romanticised as a single highway traversed by camel caravans laden with exotic goods. In reality, it was a complex web of interconnected paths spanning over 6,400 kilometres, through which not only silk and spices but also ideas, religions, technologies, and diseases travelled between civilisations for nearly two millennia.\n\nThe term 'Silk Road' was coined in 1877 by German geographer Ferdinand von Richthofen, though the routes themselves had been in use since at least the 2nd century BCE when the Chinese Han Dynasty opened diplomatic and commercial relations with Central Asian kingdoms. Silk was indeed a prized commodity — so valued in Rome that the Senate repeatedly attempted to ban its purchase to prevent the outflow of gold — but it was far from the only merchandise exchanged.\n\nThe cultural transmission along these routes was arguably more significant than the commercial exchange. Buddhism spread from India to China, Central Asia, and eventually Korea and Japan via Silk Road connections. Islam later travelled eastward along the same paths. Artistic styles blended in remarkable ways: Gandharan Buddhist sculpture, produced in modern-day Pakistan and Afghanistan, displays unmistakable Greek influence from Alexander the Great's campaigns.\n\nTechnological transfer was equally transformative. Papermaking, invented in China around 105 CE, reached the Islamic world by the 8th century and Europe by the 12th century, revolutionising the preservation and dissemination of knowledge. Gunpowder, the compass, and printing — China's 'Four Great Inventions' (alongside paper) — all reached Europe via Silk Road intermediaries, fundamentally altering the course of Western civilisation.\n\nThe Silk Road also served as a conduit for disease. The Black Death, which killed an estimated one-third of Europe's population between 1347 and 1353, is believed to have originated in Central Asia and travelled westward along trade routes. Earlier pandemics, including the Plague of Justinian in the 6th century, likely followed similar paths.\n\nToday, China's Belt and Road Initiative, launched in 2013, explicitly invokes the historical Silk Road to frame a massive infrastructure and investment programme spanning Asia, Africa, and Europe. Whether this modern iteration will produce the same richness of cultural and intellectual exchange as its predecessor remains to be seen.",
     questions:[
      {type:"tfng",q:"The Silk Road was a single highway.",a:"FALSE",exp:"It was 'a complex web of interconnected paths', not a single highway."},
      {type:"completion",q:"The term 'Silk Road' was coined by Ferdinand von ___ in 1877.",a:"Richthofen",exp:"'German geographer Ferdinand von Richthofen'."},
      {type:"tfng",q:"The routes had been used since at least the 2nd century BCE.",a:"TRUE",exp:"'In use since at least the 2nd century BCE'."},
      {type:"mc",q:"The Roman Senate tried to ban silk purchases because:",options:["Silk was considered immoral","To prevent gold outflow","Silk caused allergies","Chinese trade was banned"],a:"To prevent gold outflow",exp:"'To prevent the outflow of gold'."},
      {type:"mc",q:"Gandharan Buddhist sculpture shows influence from:",options:["Roman art","Persian art","Greek art","Indian art"],a:"Greek art",exp:"It 'displays unmistakable Greek influence from Alexander the Great's campaigns'."},
      {type:"completion",q:"Papermaking was invented in China around ___ CE.",a:"105",exp:"'Invented in China around 105 CE'."},
      {type:"tfng",q:"Paper reached Europe in the 8th century.",a:"FALSE",exp:"Paper reached the Islamic world by the 8th century but 'Europe by the 12th century'."},
      {type:"mc",q:"The Black Death is believed to have originated in:",options:["Europe","Africa","Central Asia","East Asia"],a:"Central Asia",exp:"'Believed to have originated in Central Asia'."},
      {type:"completion",q:"The Black Death killed an estimated one-___ of Europe's population.",a:"third",exp:"'One-third of Europe's population'."},
      {type:"tfng",q:"China's Belt and Road Initiative was launched in 2013.",a:"TRUE",exp:"'Launched in 2013'."},
      {type:"mc",q:"China's 'Four Great Inventions' include all EXCEPT:",options:["Paper","Gunpowder","The telescope","The compass"],a:"The telescope",exp:"The four are paper, gunpowder, compass, and printing — not the telescope."},
      {type:"tfng",q:"Buddhism spread from China to India via the Silk Road.",a:"FALSE",exp:"Buddhism spread 'from India to China', not the other way."},
      {type:"completion",q:"The cultural transmission along the Silk Road was arguably more significant than the ___ exchange.",a:"commercial",exp:"Cultural transmission was 'arguably more significant than the commercial exchange'."}
    ]},
    {title:"Coral Reefs Under Threat",text:"Coral reefs, often called the 'rainforests of the sea,' occupy less than 0.1% of the ocean floor yet support approximately 25% of all known marine species. These extraordinary ecosystems, built over thousands of years by tiny coral polyps depositing calcium carbonate skeletons, are now facing an existential crisis driven primarily by rising ocean temperatures.\n\nMass coral bleaching events have increased dramatically in frequency and severity since the 1980s. Bleaching occurs when ocean temperatures rise just 1-2 degrees Celsius above the normal summer maximum, causing corals to expel the symbiotic algae called zooxanthellae that provide them with up to 90% of their energy through photosynthesis. Without these algae, the coral turns white and, if conditions persist for several weeks, dies.\n\nThe Great Barrier Reef, the world's largest coral reef system stretching over 2,300 kilometres along Australia's northeast coast, has experienced five mass bleaching events since 2016. A study published in Current Biology found that the reef lost approximately 50% of its coral cover between 1995 and 2017. Scientists warn that if global temperatures rise by 2 degrees Celsius above pre-industrial levels — the upper limit set by the Paris Agreement — virtually all tropical coral reefs will be severely degraded.\n\nOcean acidification presents a second existential threat. As oceans absorb approximately 30% of human-produced carbon dioxide, seawater becomes more acidic. This reduces the concentration of carbonate ions that corals need to build their skeletons, effectively dissolving the structural foundation of reef ecosystems. Current projections suggest that ocean acidity will increase by 100-150% by 2100 under high-emission scenarios.\n\nThe economic consequences of reef degradation are substantial. Coral reefs provide ecosystem services valued at an estimated $375 billion annually, including coastal protection from storms, fisheries supporting over 500 million people, and tourism revenue. The Great Barrier Reef alone generates approximately $6.4 billion per year for the Australian economy and supports 64,000 jobs.\n\nReef restoration efforts are expanding but face enormous challenges of scale. Coral gardening — growing fragments in nurseries and transplanting them to degraded reefs — has shown promise but can only restore tiny fractions of what has been lost. Some scientists are experimenting with selectively breeding heat-resistant coral strains, essentially attempting to accelerate natural evolution to keep pace with climate change.",
     questions:[
      {type:"tfng",q:"Coral reefs cover about 0.1% of the ocean floor.",a:"TRUE",exp:"'Occupy less than 0.1% of the ocean floor'."},
      {type:"completion",q:"Coral reefs support approximately ___% of all known marine species.",a:"25",exp:"'Support approximately 25% of all known marine species'."},
      {type:"mc",q:"Bleaching occurs when temperatures rise above normal by:",options:["0.5 degrees","1-2 degrees Celsius","3-4 degrees","5+ degrees"],a:"1-2 degrees Celsius",exp:"'Just 1-2 degrees Celsius above the normal summer maximum'."},
      {type:"completion",q:"Symbiotic algae called ___ provide corals with up to 90% of their energy.",a:"zooxanthellae",exp:"The passage names 'symbiotic algae called zooxanthellae'."},
      {type:"tfng",q:"The Great Barrier Reef has experienced five bleaching events since 2016.",a:"TRUE",exp:"'Five mass bleaching events since 2016'."},
      {type:"mc",q:"The Great Barrier Reef lost approximately what percentage of coral cover?",options:["25%","50%","75%","90%"],a:"50%",exp:"'Lost approximately 50% of its coral cover between 1995 and 2017'."},
      {type:"completion",q:"Oceans absorb about ___% of human-produced CO2.",a:"30",exp:"'Oceans absorb approximately 30%'."},
      {type:"mc",q:"Ocean acidity may increase by 2100 by:",options:["10-20%","50-75%","100-150%","200-300%"],a:"100-150%",exp:"'Acidity will increase by 100-150% by 2100'."},
      {type:"tfng",q:"Coral reef ecosystem services are worth about $375 billion annually.",a:"TRUE",exp:"'Valued at an estimated $375 billion annually'."},
      {type:"completion",q:"The Great Barrier Reef supports ___ jobs.",a:"64,000",exp:"'Supports 64,000 jobs'."},
      {type:"mc",q:"Coral gardening involves:",options:["Feeding corals artificially","Growing fragments in nurseries and transplanting them","Removing damaged coral","Adding chemicals to water"],a:"Growing fragments in nurseries and transplanting them",exp:"'Growing fragments in nurseries and transplanting them to degraded reefs'."},
      {type:"tfng",q:"Scientists are trying to breed heat-resistant coral strains.",a:"TRUE",exp:"'Selectively breeding heat-resistant coral strains'."},
      {type:"completion",q:"The Great Barrier Reef stretches over ___ kilometres.",a:"2,300",exp:"'Stretching over 2,300 kilometres'."},
      {type:"tfng",q:"Coral restoration can easily replace what has been lost.",a:"FALSE",exp:"It 'can only restore tiny fractions of what has been lost'."}
    ]},
    {title:"The Economics of Happiness",text:"For decades, economists measured national progress almost exclusively through Gross Domestic Product (GDP) — the total value of goods and services produced within a country. However, a growing body of research has challenged the assumption that economic growth automatically translates into improved wellbeing, prompting governments to explore alternative measures of national success.\n\nThe 'Easterlin Paradox,' proposed by economist Richard Easterlin in 1974, observed that within a country, wealthier individuals tend to be happier than poorer ones, yet average happiness levels do not increase as the country as a whole grows richer over time. This paradox has been partially explained by the concept of 'hedonic adaptation' — humans' tendency to quickly return to a baseline level of happiness after positive or negative changes in circumstances.\n\nResearch consistently shows that beyond a certain income threshold — estimated at approximately $75,000 per year in the United States by Nobel laureate Daniel Kahneman — additional income produces diminishing returns in day-to-day emotional wellbeing, though life satisfaction continues to rise with income. This distinction between emotional wellbeing and life evaluation has important policy implications.\n\nBhutan pioneered the concept of Gross National Happiness (GNH) in the 1970s, explicitly prioritising collective happiness over economic productivity. The GNH index measures nine domains including psychological wellbeing, health, education, governance, and ecological diversity. While critics argue that GNH is difficult to measure objectively and can mask genuine economic hardship, the concept has influenced policy discussions worldwide.\n\nThe United Nations World Happiness Report, published annually since 2012, ranks countries based on self-reported life satisfaction. Nordic countries — Finland, Denmark, Norway, and Iceland — consistently occupy the top positions. The report identifies six key factors explaining approximately 75% of the variation in happiness between countries: GDP per capita, social support, healthy life expectancy, freedom to make life choices, generosity, and perceptions of corruption.\n\nSeveral countries have begun integrating wellbeing metrics into policy-making. New Zealand's 'Wellbeing Budget,' introduced in 2019, allocates government spending based on measures including mental health, child poverty, and domestic violence rather than purely economic indicators. Scotland, Iceland, and Wales have formed the Wellbeing Economy Governments network, committed to prioritising wellbeing over GDP growth.",
     questions:[
      {type:"completion",q:"The Easterlin Paradox was proposed in ___.",a:"1974",exp:"'Proposed by economist Richard Easterlin in 1974'."},
      {type:"mc",q:"Hedonic adaptation means:",options:["People always want more money","People return to baseline happiness after changes","Economic growth causes happiness","Wealth guarantees happiness"],a:"People return to baseline happiness after changes",exp:"'Tendency to quickly return to a baseline level of happiness'."},
      {type:"completion",q:"Beyond approximately $___,000 per year, extra income has diminishing emotional returns.",a:"75",exp:"'Approximately $75,000 per year' is the threshold."},
      {type:"tfng",q:"Bhutan introduced Gross National Happiness in the 1990s.",a:"FALSE",exp:"Bhutan 'pioneered the concept in the 1970s', not 1990s."},
      {type:"mc",q:"The GNH index measures how many domains?",options:["Five","Seven","Nine","Twelve"],a:"Nine",exp:"'Nine domains including psychological wellbeing, health, education'."},
      {type:"tfng",q:"The World Happiness Report has been published since 2012.",a:"TRUE",exp:"'Published annually since 2012'."},
      {type:"mc",q:"Which countries consistently rank highest in happiness?",options:["Asian countries","Nordic countries","North American countries","South American countries"],a:"Nordic countries",exp:"'Finland, Denmark, Norway, and Iceland consistently occupy the top positions'."},
      {type:"completion",q:"Six factors explain about ___% of happiness variation between countries.",a:"75",exp:"'Approximately 75% of the variation'."},
      {type:"mc",q:"New Zealand's Wellbeing Budget was introduced in:",options:["2015","2017","2019","2021"],a:"2019",exp:"'Introduced in 2019'."},
      {type:"tfng",q:"Scotland is part of the Wellbeing Economy Governments network.",a:"TRUE",exp:"'Scotland, Iceland, and Wales have formed the Wellbeing Economy Governments network'."},
      {type:"completion",q:"Kahneman found the distinction between emotional wellbeing and life ___.",a:"evaluation",exp:"The passage discusses 'emotional wellbeing and life evaluation'."},
      {type:"tfng",q:"All critics agree that GNH is a superior measure to GDP.",a:"FALSE",exp:"'Critics argue that GNH is difficult to measure objectively and can mask genuine economic hardship'."},
      {type:"mc",q:"The six happiness factors include all EXCEPT:",options:["GDP per capita","Social support","Climate quality","Freedom to make life choices"],a:"Climate quality",exp:"Climate quality is not listed among the six factors."}
    ]}
  ]},
  {id:5,title:"Health & Nature",passages:[
    {title:"The Microbiome Revolution",text:"The human body hosts approximately 38 trillion microorganisms — bacteria, fungi, viruses, and other microscopic life forms — collectively known as the microbiome. This microbial community, weighing roughly 200 grams in total, contains an estimated 3.3 million unique genes, outnumbering human genes by approximately 150 to 1. Over the past two decades, advances in DNA sequencing technology have transformed our understanding of these invisible inhabitants from mere passengers to active participants in human health.\n\nThe gut microbiome, containing the greatest concentration and diversity of microbes, has received the most scientific attention. Research has established that gut bacteria play essential roles in digesting food, synthesising vitamins including K and B12, training the immune system, and protecting against pathogenic organisms. The composition of an individual's gut microbiome is influenced by numerous factors including mode of birth, breastfeeding, diet, antibiotic use, and environmental exposures.\n\nPerhaps the most surprising discovery has been the gut-brain axis — a bidirectional communication system linking the gut microbiome to the central nervous system. Studies in mice have demonstrated that altering gut bacteria can affect behaviour, anxiety levels, and even cognitive function. Human research, while still in its early stages, has found associations between certain gut bacteria profiles and conditions including depression, autism spectrum disorder, and Parkinson's disease.\n\nThe therapeutic potential of microbiome manipulation is generating enormous interest. Faecal microbiota transplantation (FMT), in which gut bacteria from a healthy donor are transferred to a patient, has proven remarkably effective for treating recurrent Clostridioides difficile infections, with cure rates exceeding 90%. Researchers are now investigating whether similar approaches could treat conditions ranging from inflammatory bowel disease to metabolic syndrome.\n\nThe probiotics industry has capitalised on growing public awareness of the microbiome, with global sales exceeding $60 billion annually. However, scientists caution that most commercial probiotic products have limited evidence supporting their health claims. The specific strains, dosages, and conditions under which probiotics might be beneficial remain poorly defined, and regulatory oversight varies significantly between countries.\n\nDiet appears to be the single most influential factor in shaping the gut microbiome. Research has consistently shown that plant-rich diets high in fibre promote microbial diversity, while Western diets high in processed food and sugar are associated with reduced diversity — a state linked to increased risk of obesity, diabetes, and autoimmune conditions.",
     questions:[
      {type:"tfng",q:"The human body hosts about 38 trillion microorganisms.",a:"TRUE",exp:"'Approximately 38 trillion microorganisms'."},
      {type:"completion",q:"The microbiome's genetic material vastly ___ that of its human host.",a:"outnumbers",exp:"The passage says microbial genes outnumber human genes roughly 150 to 1 — the question tests understanding of this relationship, not recall of the exact figure."},
      {type:"mc",q:"The relationship between microbial genes and human genes in the body is best described as:",options:["Roughly equal","Microbial genes slightly outnumber human genes","Human genes significantly outnumber microbial genes","Microbial genes vastly outnumber human genes"],a:"Microbial genes vastly outnumber human genes",exp:"The passage states '150 to 1' — but the question tests whether you understand the direction and scale of the relationship, not recall of the exact ratio."},
      {type:"mc",q:"Gut bacteria help with all EXCEPT:",options:["Digesting food","Synthesising vitamins","Regulating body temperature","Training the immune system"],a:"Regulating body temperature",exp:"Temperature regulation is not mentioned among gut bacteria functions."},
      {type:"completion",q:"The bidirectional link between gut and brain is called the gut-___ axis.",a:"brain",exp:"'The gut-brain axis'."},
      {type:"tfng",q:"Human microbiome research has conclusively proven gut bacteria cause depression.",a:"FALSE",exp:"Human research 'has found associations' — correlations, not proven causation."},
      {type:"mc",q:"FMT cure rates for C. difficile infections exceed:",options:["50%","70%","80%","90%"],a:"90%",exp:"'Cure rates exceeding 90%'."},
      {type:"completion",q:"Global probiotic sales exceed $___ billion annually.",a:"60",exp:"'Global sales exceeding $60 billion annually'."},
      {type:"tfng",q:"Most commercial probiotics have strong scientific evidence behind them.",a:"FALSE",exp:"'Most commercial probiotic products have limited evidence supporting their health claims'."},
      {type:"mc",q:"The most influential factor in shaping the gut microbiome is:",options:["Exercise","Genetics","Diet","Sleep"],a:"Diet",exp:"'Diet appears to be the single most influential factor'."},
      {type:"tfng",q:"Western diets high in processed food promote microbial diversity.",a:"FALSE",exp:"Western diets are 'associated with reduced diversity'."},
      {type:"completion",q:"Plant-rich diets high in ___ promote microbial diversity.",a:"fibre",exp:"'Diets high in fibre promote microbial diversity'."},
      {type:"completion",q:"An individual's microbiome is influenced by mode of birth, breastfeeding, diet, ___ use, and environment.",a:"antibiotic",exp:"'Antibiotic use' is listed among influencing factors."}
    ]},
    {title:"The Future of Water",text:"Freshwater represents just 2.5% of all water on Earth, and only 1% of that is readily accessible in rivers, lakes, and shallow aquifers. As global population approaches 10 billion by 2050 and climate change disrupts rainfall patterns, water scarcity is emerging as one of the defining challenges of the 21st century. The United Nations estimates that by 2025, 1.8 billion people will live in regions facing absolute water scarcity.\n\nAgriculture accounts for approximately 70% of global freshwater withdrawals, making it the single largest consumer. Inefficient irrigation methods — including flood irrigation, which can lose up to 50% of water to evaporation — remain widespread in developing countries. Drip irrigation technology, which delivers water directly to plant roots, can reduce agricultural water use by 30-70% while simultaneously increasing crop yields, yet adoption remains limited due to initial costs.\n\nUrban water infrastructure presents its own challenges. In many cities, ageing pipe networks lose 20-40% of treated water to leaks before it reaches consumers. London's Victorian-era water mains lose approximately one billion litres daily. Upgrading these systems requires enormous capital investment, but the cost of inaction — in terms of wasted treated water and the energy used to treat it — may be greater.\n\nDesalination — removing salt from seawater — has emerged as a critical water source for arid regions. The Middle East leads globally, with Saudi Arabia alone operating more than 30 desalination plants. Modern reverse osmosis technology has reduced the energy cost of desalination by approximately 80% since the 1970s. However, the process still requires significant energy, and the disposal of concentrated brine byproduct poses environmental challenges to marine ecosystems.\n\nWater recycling represents another promising approach. Singapore's NEWater programme purifies treated wastewater to drinking-water standards using advanced membrane filtration and ultraviolet disinfection. The programme now meets approximately 40% of Singapore's water demand. Namibia's capital, Windhoek, has been practising direct potable water recycling since 1968, demonstrating that the technology is both safe and viable.\n\nTransboundary water disputes are intensifying as scarcity increases. Major river systems including the Nile, Tigris-Euphrates, Jordan, and Mekong are shared by multiple nations with competing demands. The construction of dams and diversion projects by upstream nations has created diplomatic tensions and, in some cases, threats of military conflict. International water law remains underdeveloped compared to the scale of the challenge.",
     questions:[
      {type:"completion",q:"Only ___% of all water on Earth is freshwater.",a:"2.5",exp:"'Freshwater represents just 2.5% of all water on Earth'."},
      {type:"mc",q:"By 2025, how many people will face absolute water scarcity?",options:["800 million","1.2 billion","1.8 billion","2.5 billion"],a:"1.8 billion",exp:"'1.8 billion people will live in regions facing absolute water scarcity'."},
      {type:"completion",q:"Agriculture accounts for about ___% of global freshwater withdrawals.",a:"70",exp:"'Approximately 70% of global freshwater withdrawals'."},
      {type:"mc",q:"Drip irrigation can reduce water use by:",options:["10-20%","20-30%","30-70%","80-90%"],a:"30-70%",exp:"'Reduce agricultural water use by 30-70%'."},
      {type:"tfng",q:"London's water system loses about one billion litres daily.",a:"TRUE",exp:"'London's Victorian-era water mains lose approximately one billion litres daily'."},
      {type:"completion",q:"Saudi Arabia operates more than ___ desalination plants.",a:"30",exp:"'More than 30 desalination plants'."},
      {type:"mc",q:"Desalination energy costs have been reduced by:",options:["30%","50%","60%","80%"],a:"80%",exp:"'Reduced the energy cost by approximately 80% since the 1970s'."},
      {type:"tfng",q:"Brine disposal from desalination has no environmental impact.",a:"FALSE",exp:"'Disposal of concentrated brine byproduct poses environmental challenges'."},
      {type:"completion",q:"Singapore's NEWater meets approximately ___% of water demand.",a:"40",exp:"'Meets approximately 40% of Singapore's water demand'."},
      {type:"mc",q:"Which city has practised water recycling since 1968?",options:["Singapore","Dubai","Windhoek","Cape Town"],a:"Windhoek",exp:"'Windhoek has been practising direct potable water recycling since 1968'."},
      {type:"tfng",q:"International water law is well-developed for transboundary disputes.",a:"FALSE",exp:"'International water law remains underdeveloped'."},
      {type:"completion",q:"Urban pipe networks can lose ___-40% of treated water to leaks.",a:"20",exp:"'Lose 20-40% of treated water to leaks'."},
      {type:"mc",q:"Flood irrigation can lose up to what percentage of water?",options:["20%","30%","40%","50%"],a:"50%",exp:"'Can lose up to 50% of water to evaporation'."},
      {type:"tfng",q:"The Jordan River is mentioned as a source of transboundary disputes.",a:"TRUE",exp:"The Jordan is listed among rivers 'shared by multiple nations with competing demands'."}
    ]},
    {title:"The Science of Memory",text:"Memory is not a single unified system but rather a collection of distinct processes, each governed by different neural mechanisms and serving different functions. Understanding these distinctions has been one of the most important advances in cognitive neuroscience over the past fifty years.\n\nShort-term memory, also known as working memory, holds information temporarily for immediate use — typically for 15 to 30 seconds without rehearsal. Its capacity is remarkably limited: psychologist George Miller's famous 1956 paper established that most people can hold approximately seven items in working memory simultaneously. More recent research suggests the true capacity may be even smaller — closer to four independent items — with the apparent ability to hold seven arising from chunking, the grouping of individual items into meaningful units.\n\nLong-term memory is subdivided into two major categories. Explicit (or declarative) memory involves conscious recollection and includes episodic memory — personal experiences anchored in time and place — and semantic memory — general knowledge about the world. Implicit memory operates below conscious awareness and includes procedural memory (how to ride a bicycle), classical conditioning, and priming effects.\n\nThe hippocampus plays a central role in converting short-term memories into long-term ones, a process called consolidation. The famous case of patient H.M., who had both hippocampi surgically removed to treat epilepsy in 1953, demonstrated this dramatically: H.M. could hold normal conversations and recall his distant past but was completely unable to form new long-term memories. He would meet his doctors anew each day, with no recollection of previous encounters.\n\nMemory is reconstructive rather than reproductive — we don't replay recordings but actively rebuild memories each time we recall them. This reconstruction process introduces the possibility of error. Psychologist Elizabeth Loftus has demonstrated through decades of research that memories can be easily distorted by suggestion, leading questions, and post-event information. Her work has had profound implications for the legal system, particularly regarding the reliability of eyewitness testimony.\n\nSleep is essential for memory consolidation. During slow-wave sleep, the hippocampus replays the day's experiences and transfers them to the neocortex for long-term storage. Studies have shown that students who sleep after learning new material retain significantly more information than those who remain awake for the same duration. Even brief naps of 20-30 minutes have been shown to improve memory performance.",
     questions:[
      {type:"tfng",q:"Memory is a single unified system in the brain.",a:"FALSE",exp:"Memory is 'a collection of distinct processes'."},
      {type:"mc",q:"Working memory holds information for approximately:",options:["1-5 seconds","15-30 seconds","1-2 minutes","5-10 minutes"],a:"15-30 seconds",exp:"'15 to 30 seconds without rehearsal'."},
      {type:"completion",q:"George Miller found working memory holds about ___ items.",a:"seven",exp:"'Approximately seven items'."},
      {type:"mc",q:"More recent research suggests true working memory capacity is:",options:["About two items","About four items","About seven items","About ten items"],a:"About four items",exp:"'Closer to four independent items'."},
      {type:"completion",q:"Grouping individual items into meaningful units is called ___.",a:"chunking",exp:"The passage names this process 'chunking'."},
      {type:"mc",q:"Episodic memory involves:",options:["General knowledge","Personal experiences in time and place","Motor skills","Unconscious conditioning"],a:"Personal experiences in time and place",exp:"'Personal experiences anchored in time and place'."},
      {type:"completion",q:"Converting short-term memories to long-term is called ___.",a:"consolidation",exp:"The passage names this process 'consolidation'."},
      {type:"mc",q:"Patient H.M.'s surgery demonstrated that the hippocampus is crucial for:",options:["Speech production","Visual processing","Forming new long-term memories","Motor coordination"],a:"Forming new long-term memories",exp:"H.M. 'was completely unable to form new long-term memories'."},
      {type:"tfng",q:"Memory works like replaying a recording.",a:"FALSE",exp:"Memory is 'reconstructive rather than reproductive — we don't replay recordings'."},
      {type:"completion",q:"Elizabeth Loftus showed that memories can be distorted by suggestion and ___ questions.",a:"leading",exp:"'Distorted by suggestion, leading questions, and post-event information'."},
      {type:"mc",q:"During slow-wave sleep, which brain region replays experiences?",options:["Neocortex","Amygdala","Hippocampus","Cerebellum"],a:"Hippocampus",exp:"'The hippocampus replays the day's experiences'."},
      {type:"tfng",q:"Brief naps can improve memory performance.",a:"TRUE",exp:"'Even brief naps of 20-30 minutes have been shown to improve memory performance'."},
      {type:"tfng",q:"Students who stay awake after learning retain more than those who sleep.",a:"FALSE",exp:"Students who sleep 'retain significantly more' than those who remain awake."}
    ]}
  ]}
];

const GT_TESTS_DATA = [
  {id:1,title:"Workplace & Community",passages:[
    {title:"Workplace Safety Notice",text:"ALL STAFF — IMPORTANT SAFETY UPDATE\n\nFollowing last month's fire drill assessment, several areas requiring improvement have been identified. All employees must read and acknowledge this notice by Friday 15 March.\n\nFire Exits: The emergency exit on the second floor near marketing has been found partially blocked by storage boxes. This has been cleared, but fire exits must remain unobstructed at all times. Report any blockages to facilities via the intranet portal.\n\nEvacuation: During the drill, it took 7 minutes 42 seconds for all staff to reach the assembly point in the main car park. The target is 5 minutes. Department heads must ensure their teams know the nearest exit route.\n\nFirst Aid: We have 8 certified first aiders across 4 floors. Regulations require 1 per 50 employees. With 340 staff, we need at least 7 — we are compliant. However, 2 first aiders retire in June, so we seek 4 new volunteers. Training costs covered by the company. Contact HR by 1 April.\n\nFire Wardens: Each floor requires 2 wardens. Floors 1 and 3 have 2 each, Floor 2 has 1, Floor 4 has none. Volunteers urgently needed. Training: half-day on 20 March.\n\nEquipment: All extinguishers inspected and current. Third floor smoke detectors had low batteries — replaced. Staff should test their workspace detector monthly.",
     questions:[
      {type:"tfng",q:"The fire drill met the target evacuation time.",a:"FALSE",exp:"It took 7:42 but the target was 5 minutes."},
      {type:"tfng",q:"The second floor exit was blocked by furniture.",a:"FALSE",exp:"It was blocked by 'storage boxes', not furniture."},
      {type:"tfng",q:"The company currently meets first aider requirements.",a:"TRUE",exp:"'We are compliant' with 8 first aiders for 340 staff (need 7)."},
      {type:"mc",q:"How many additional first aid volunteers are wanted?",options:["2","4","7","8"],a:"4",exp:"'We seek 4 new volunteers'."},
      {type:"mc",q:"Which floors need fire warden volunteers?",options:["1 and 3","2 and 4","All floors","1 and 2"],a:"2 and 4",exp:"Floor 2 has only 1, Floor 4 has none."},
      {type:"completion",q:"Staff should report blocked exits via the ___ portal.",a:"intranet",exp:"'Report any blockages to facilities via the intranet portal'."},
      {type:"completion",q:"Fire warden training is a ___ on 20 March.",a:"half-day",exp:"'Training: half-day on 20 March'."},
      {type:"mc",q:"The deadline for first aid volunteering is:",options:["15 March","20 March","1 April","June"],a:"1 April",exp:"'Contact HR by 1 April'."},
      {type:"tfng",q:"Fire warden training takes a full day.",a:"FALSE",exp:"It's a 'half-day', not a full day."},
      {type:"tfng",q:"Third floor smoke detectors needed new batteries.",a:"TRUE",exp:"'Third floor smoke detectors had low batteries — replaced'."},
      {type:"completion",q:"The assembly point is in the main ___ ___.",a:"car park",exp:"'Assembly point in the main car park'."},
      {type:"mc",q:"How many first aiders will retire in June?",options:["1","2","3","4"],a:"2",exp:"'2 first aiders retire in June'."},
      {type:"tfng",q:"All fire extinguishers passed inspection.",a:"TRUE",exp:"'All extinguishers inspected and current'."}
    ]},
    {title:"Tenant Information Guide",text:"GREENFIELD APARTMENTS — TENANT HANDBOOK\n\nRent: Due on the 1st of each month by bank transfer. A £25 late fee applies after the 5th. Contact management before the due date if you anticipate difficulty.\n\nMaintenance: For non-urgent repairs (dripping taps, loose handles), use the online resident portal — addressed within 5 working days. For urgent issues (burst pipes, gas leaks, electrical faults, heating failure in winter), call 0800 555 7890 (24-hour). Do not attempt plumbing, electrical, or structural repairs yourself — this may void your tenancy.\n\nCommunal Areas: Keep corridors and stairwells clean. Bicycles go in the ground-floor bike shed only — not corridors. The roof terrace garden is open 7am-10pm daily. Barbecues and open flames are prohibited on the roof terrace.\n\nNoise: Normal household noise is acceptable 8am-10pm. Between 10pm and 8am, keep noise minimal. Persistent complaints may lead to formal warning or tenancy termination. Inform neighbours before hosting gatherings.\n\nPets: Small pets (cats, dogs under 10kg, fish, caged birds) permitted with written approval. £200 refundable pet deposit required. Pets on leads in all communal areas. Owners must clean up immediately. Exotic animals and animals over 10kg not permitted.\n\nEnd of Tenancy: Minimum 2 months' written notice. Property returned in original condition (allowing reasonable wear). Professional clean recommended. Damage beyond normal wear deducted from deposit.",
     questions:[
      {type:"tfng",q:"Rent must be paid in cash.",a:"FALSE",exp:"Rent is paid 'by bank transfer'."},
      {type:"tfng",q:"Late fees apply after the 5th of each month.",a:"TRUE",exp:"'A £25 late fee applies after the 5th'."},
      {type:"mc",q:"Non-urgent repairs are usually done within:",options:["24 hours","3 days","5 working days","10 days"],a:"5 working days",exp:"'Addressed within 5 working days'."},
      {type:"tfng",q:"Residents can fix their own plumbing.",a:"FALSE",exp:"'Do not attempt plumbing repairs yourself'."},
      {type:"completion",q:"Bicycles must be kept in the ground-floor ___ ___.",a:"bike shed",exp:"'Bicycles go in the ground-floor bike shed'."},
      {type:"mc",q:"The roof garden closes at:",options:["8pm","9pm","10pm","midnight"],a:"10pm",exp:"'Open 7am-10pm daily'."},
      {type:"tfng",q:"Dogs weighing 15kg are allowed with approval.",a:"FALSE",exp:"Only 'dogs under 10kg' are permitted."},
      {type:"completion",q:"The pet deposit is £___.",a:"200",exp:"'£200 refundable pet deposit'."},
      {type:"mc",q:"Quiet hours are:",options:["8am-10pm","10pm-6am","10pm-8am","11pm-7am"],a:"10pm-8am",exp:"'Between 10pm and 8am, keep noise minimal'."},
      {type:"completion",q:"Tenants must give ___ months' written notice.",a:"2",exp:"'Minimum 2 months' written notice'."},
      {type:"tfng",q:"Barbecues are allowed on the roof terrace.",a:"FALSE",exp:"'Barbecues and open flames are prohibited on the roof terrace'."},
      {type:"mc",q:"The emergency maintenance line operates:",options:["9am-5pm","8am-8pm","24 hours","Weekdays only"],a:"24 hours",exp:"'Call 0800 555 7890 (24-hour)'."},
      {type:"tfng",q:"A professional end-of-tenancy clean is mandatory.",a:"FALSE",exp:"It is 'recommended', not mandatory."}
    ]},
    {title:"Community Library Services",text:"WESTFIELD PUBLIC LIBRARY — SERVICES GUIDE\n\nMembership: Free for all residents of the Westfield borough. Bring proof of address (utility bill or council tax statement) and photo ID to register. Children under 16 must be registered by a parent or guardian. Membership cards are issued on the same day.\n\nBorrowing: Members may borrow up to 12 items at once. Standard loan period is 3 weeks for books and 1 week for DVDs and magazines. Renewals can be made online, by phone, or in person — up to 2 renewals per item unless another member has placed a reservation. Overdue fines: 20p per day per item for adults, 10p for children, capped at the replacement cost of the item.\n\nComputer Access: 15 public computers available on a first-come, first-served basis. Sessions are limited to 1 hour when others are waiting. Free Wi-Fi throughout the building — ask staff for the password. Printing: 10p per black-and-white page, 50p per colour page.\n\nEvents: Weekly story time for under-5s (Tuesdays, 10:30am). Monthly book club for adults (first Thursday of each month, 7pm). Free digital skills workshops for over-60s (Wednesdays, 2-4pm). Homework club for ages 8-16 (Thursdays, 3:30-5:30pm after school). All events are free but some require advance booking.\n\nRoom Hire: The meeting room (capacity 30) is available for community groups at £15 per hour. Non-profit organisations receive a 50% discount. Bookings must be made at least 48 hours in advance. The room includes a projector and whiteboard.\n\nAccessibility: The library is fully wheelchair accessible with a lift to all floors. Large-print and audiobook collections are available. Hearing loop installed at the main desk. Home delivery service available for members who are housebound — contact the library to arrange.",
     questions:[
      {type:"tfng",q:"Library membership costs £10 per year.",a:"FALSE",exp:"Membership is 'free for all residents'."},
      {type:"mc",q:"To register, you need:",options:["Just photo ID","Proof of address and photo ID","A reference from another member","Only a utility bill"],a:"Proof of address and photo ID",exp:"'Bring proof of address and photo ID'."},
      {type:"completion",q:"Members can borrow up to ___ items at once.",a:"12",exp:"'Up to 12 items at once'."},
      {type:"mc",q:"The DVD loan period is:",options:["1 week","2 weeks","3 weeks","4 weeks"],a:"1 week",exp:"'1 week for DVDs and magazines'."},
      {type:"tfng",q:"Items can be renewed unlimited times.",a:"FALSE",exp:"'Up to 2 renewals per item'."},
      {type:"completion",q:"Adult overdue fines are ___p per day per item.",a:"20",exp:"'20p per day per item for adults'."},
      {type:"mc",q:"Computer sessions are limited when:",options:["Always limited to 30 minutes","Others are waiting","After 5pm","Only on weekends"],a:"Others are waiting",exp:"'Limited to 1 hour when others are waiting'."},
      {type:"completion",q:"Colour printing costs ___p per page.",a:"50",exp:"'50p per colour page'."},
      {type:"mc",q:"Story time for under-5s is on:",options:["Mondays","Tuesdays","Wednesdays","Thursdays"],a:"Tuesdays",exp:"'Tuesdays, 10:30am'."},
      {type:"tfng",q:"The meeting room holds up to 50 people.",a:"FALSE",exp:"'Capacity 30', not 50."},
      {type:"mc",q:"Non-profit groups get what discount on room hire?",options:["25%","33%","50%","Free"],a:"50%",exp:"'Non-profit organisations receive a 50% discount'."},
      {type:"completion",q:"Room bookings must be made at least ___ hours in advance.",a:"48",exp:"'At least 48 hours in advance'."},
      {type:"tfng",q:"The library offers a home delivery service for housebound members.",a:"TRUE",exp:"'Home delivery service available for members who are housebound'."},
      {type:"mc",q:"Digital skills workshops are for:",options:["Children","Teenagers","Over-60s","All ages"],a:"Over-60s",exp:"'Free digital skills workshops for over-60s'."}
    ]}
  ]},
  {id:2,title:"Travel & Services",passages:[
    {title:"Airport Transfer Services",text:"SKYLINK AIRPORT TRANSFERS — TERMS AND CONDITIONS\n\nBooking: All transfers must be booked at least 24 hours in advance via our website or by calling 0345 600 8800. Same-day bookings are available subject to vehicle availability and attract a 25% surcharge. Group bookings of 6 or more passengers receive a 15% discount.\n\nVehicle Types: Standard saloon (up to 4 passengers, 2 large suitcases), Executive saloon (up to 4 passengers, 3 large suitcases, complimentary water), MPV/Minivan (up to 7 passengers, 7 large suitcases), Minibus (up to 16 passengers, 16 suitcases). Child seats available on request at no additional charge — specify when booking.\n\nPricing: Prices are fixed at the time of booking and include all tolls, congestion charges, and parking fees. No hidden extras. Payment by credit/debit card only — cash is not accepted. Full payment taken at time of booking. Prices do not include gratuities.\n\nPickup — Airport Arrivals: Drivers monitor your flight and adjust for early/late arrivals at no charge. Driver will wait in the arrivals hall with a name board for up to 45 minutes after your flight lands. After 45 minutes, a waiting charge of £10 per 30 minutes applies. If your flight is cancelled, contact us for a full refund or rebooking.\n\nPickup — Home/Hotel: Driver arrives 15 minutes before the scheduled pickup time. A 10-minute grace period is allowed, after which waiting charges of £10 per 30 minutes apply. If you are not contactable and do not appear within 30 minutes, the booking is cancelled and a 50% cancellation fee applies.\n\nCancellations: Free cancellation up to 12 hours before pickup. 50% charge for cancellations within 12 hours. No refund for no-shows. Amendments to booking details (time, location) are free if made more than 6 hours before pickup.",
     questions:[
      {type:"tfng",q:"Bookings must be made at least 48 hours in advance.",a:"FALSE",exp:"'At least 24 hours in advance', not 48."},
      {type:"mc",q:"Same-day bookings have a surcharge of:",options:["10%","15%","20%","25%"],a:"25%",exp:"'Attract a 25% surcharge'."},
      {type:"completion",q:"Groups of 6+ passengers get a ___% discount.",a:"15",exp:"'15% discount'."},
      {type:"mc",q:"The MPV/Minivan holds up to:",options:["4 passengers","6 passengers","7 passengers","16 passengers"],a:"7 passengers",exp:"'Up to 7 passengers'."},
      {type:"tfng",q:"Child seats cost extra.",a:"FALSE",exp:"'At no additional charge'."},
      {type:"tfng",q:"Cash payments are accepted.",a:"FALSE",exp:"'Cash is not accepted'."},
      {type:"completion",q:"At the airport, the driver waits up to ___ minutes after landing.",a:"45",exp:"'Up to 45 minutes after your flight lands'."},
      {type:"mc",q:"Waiting charges at the airport are:",options:["£5 per 15 minutes","£10 per 30 minutes","£15 per hour","£20 per hour"],a:"£10 per 30 minutes",exp:"'£10 per 30 minutes'."},
      {type:"tfng",q:"Cancelled flights receive a full refund.",a:"TRUE",exp:"'Contact us for a full refund or rebooking'."},
      {type:"mc",q:"For home pickups, the driver arrives:",options:["On time","5 minutes early","10 minutes early","15 minutes early"],a:"15 minutes early",exp:"'Arrives 15 minutes before the scheduled pickup'."},
      {type:"completion",q:"Free cancellation is available up to ___ hours before pickup.",a:"12",exp:"'Free cancellation up to 12 hours before pickup'."},
      {type:"tfng",q:"No-shows receive a 50% refund.",a:"FALSE",exp:"'No refund for no-shows'."},
      {type:"mc",q:"Free booking amendments must be made more than how many hours before?",options:["3 hours","6 hours","12 hours","24 hours"],a:"6 hours",exp:"'Free if made more than 6 hours before pickup'."},
      {type:"tfng",q:"Prices include congestion charges and tolls.",a:"TRUE",exp:"'Include all tolls, congestion charges, and parking fees'."}
    ]},
    {title:"Gym Membership Guide",text:"PEAK FITNESS — MEMBERSHIP OPTIONS\n\nStandard: £35/month. Access to gym floor and cardio equipment, Monday-Friday 6am-9pm, weekends 8am-6pm. Free parking. No access to swimming pool or group classes.\n\nPremium: £55/month. Full 24/7 access to all facilities including swimming pool, sauna, and steam room. Unlimited group classes (yoga, spinning, HIIT, pilates). Free towel service. 2 free guest passes per month.\n\nStudent: £25/month (valid student ID required, verified annually). Same access as Standard but including 4 group classes per month. Available to full-time students aged 16-25 only.\n\nCorporate: From £30/month per employee (minimum 10 employees). Premium access for all enrolled staff. Quarterly health assessments included. Dedicated account manager.\n\nJoining Fee: £50 for all memberships — waived during January and September promotional periods.\n\nContract: Minimum 3-month commitment for Standard and Premium. Student memberships are month-to-month. Cancellation requires 30 days' written notice after the minimum period.\n\nPersonal Training: Available at £40 per hour or in packages of 10 sessions for £350. All trainers are Level 3 qualified. Initial fitness assessment (30 minutes) is complimentary for new members.\n\nFacilities: 120-station gym floor, 25-metre swimming pool, 2 group exercise studios, changing rooms with lockers (bring your own padlock), café serving healthy meals and protein shakes. Free Wi-Fi throughout.\n\nHealth & Safety: Members must complete an induction before using gym equipment for the first time. Under-16s must be accompanied by an adult at all times. No glass containers in the pool area. Appropriate sportswear and clean indoor trainers required.",
     questions:[
      {type:"mc",q:"Standard membership costs:",options:["£25/month","£30/month","£35/month","£55/month"],a:"£35/month",exp:"'Standard: £35/month'."},
      {type:"tfng",q:"Standard members can use the swimming pool.",a:"FALSE",exp:"'No access to swimming pool or group classes'."},
      {type:"mc",q:"Premium members get how many free guest passes monthly?",options:["1","2","4","Unlimited"],a:"2",exp:"'2 free guest passes per month'."},
      {type:"completion",q:"Student membership is available for full-time students aged ___-25.",a:"16",exp:"'Aged 16-25 only'."},
      {type:"tfng",q:"Corporate membership requires minimum 5 employees.",a:"FALSE",exp:"'Minimum 10 employees'."},
      {type:"mc",q:"The joining fee is waived during:",options:["March and June","January and September","Summer months","Any promotional period"],a:"January and September",exp:"'Waived during January and September promotional periods'."},
      {type:"completion",q:"The minimum contract is ___ months for Standard and Premium.",a:"3",exp:"'Minimum 3-month commitment'."},
      {type:"mc",q:"A package of 10 personal training sessions costs:",options:["£300","£350","£400","£450"],a:"£350",exp:"'10 sessions for £350'."},
      {type:"tfng",q:"The swimming pool is 50 metres long.",a:"FALSE",exp:"It's a '25-metre swimming pool'."},
      {type:"completion",q:"Members must bring their own ___ for lockers.",a:"padlock",exp:"'Bring your own padlock'."},
      {type:"tfng",q:"New members get a free initial fitness assessment.",a:"TRUE",exp:"'Initial fitness assessment is complimentary for new members'."},
      {type:"mc",q:"Under-16s at the gym must be:",options:["Members","Accompanied by an adult","In a group class","Pre-registered"],a:"Accompanied by an adult",exp:"'Under-16s must be accompanied by an adult at all times'."},
      {type:"tfng",q:"Student memberships require a 3-month commitment.",a:"FALSE",exp:"'Student memberships are month-to-month'."},
      {type:"mc",q:"Cancellation requires:",options:["7 days notice","14 days notice","30 days written notice","60 days notice"],a:"30 days written notice",exp:"'30 days' written notice after the minimum period'."}
    ]},
    {title:"City Bus Network Information",text:"METRO CITY BUS — PASSENGER GUIDE\n\nRoutes: The Metro City Bus network operates 42 routes across the metropolitan area, covering all major suburbs, the city centre, hospitals, universities, and shopping districts. Route maps are available at all bus stops, on our website, and via the Metro Bus app.\n\nTimetable: Most routes operate from 5:30am to 11:30pm Monday to Saturday, and 7am to 10pm on Sundays and public holidays. Night buses (routes N1-N5) operate hourly from midnight to 5am on Friday and Saturday nights only, covering the five main corridors.\n\nFares: Single journey £2.50 (cash or contactless). Day pass £5.50 (unlimited journeys until midnight). Weekly pass £22. Monthly pass £78. Children aged 5-15 travel at half price. Under-5s travel free. Senior citizens (over 65) with a Metro Senior Card travel free on all services before 9:30am and after 3:30pm on weekdays, and all day on weekends.\n\nPayment: Contactless payment (card or phone) is accepted on all buses. Cash is accepted but exact change is required — drivers cannot give change. Passes can be purchased online, via the app, or at Metro ticket offices located at Central Station, Westgate Mall, and University Campus.\n\nAccessibility: All buses are low-floor vehicles with wheelchair ramps. Priority seating near the front is reserved for elderly passengers, pregnant women, and those with disabilities. Two wheelchair spaces are available on each bus. Audio announcements indicate the next stop on all routes.\n\nLost Property: Items found on buses are held at the Central Station lost property office for 30 days. To enquire, call 0345 600 9900 or visit in person (Monday-Friday, 9am-5pm). A £5 administration fee applies for returned items. Perishable items and any items posing a health risk are disposed of after 24 hours.",
     questions:[
      {type:"completion",q:"The network operates ___ routes.",a:"42",exp:"'42 routes across the metropolitan area'."},
      {type:"mc",q:"Sunday services run from:",options:["5:30am to 11:30pm","7am to 10pm","6am to 11pm","8am to 9pm"],a:"7am to 10pm",exp:"'7am to 10pm on Sundays'."},
      {type:"tfng",q:"Night buses run every night of the week.",a:"FALSE",exp:"'Friday and Saturday nights only'."},
      {type:"mc",q:"A weekly pass costs:",options:["£15","£18","£22","£28"],a:"£22",exp:"'Weekly pass £22'."},
      {type:"completion",q:"Children aged 5-15 pay ___ price.",a:"half",exp:"'Travel at half price'."},
      {type:"tfng",q:"Under-5s must pay a reduced fare.",a:"FALSE",exp:"'Under-5s travel free'."},
      {type:"mc",q:"Seniors travel free on weekdays:",options:["All day","Before 9:30am only","After 3:30pm only","Before 9:30am and after 3:30pm"],a:"Before 9:30am and after 3:30pm",exp:"'Free before 9:30am and after 3:30pm on weekdays'."},
      {type:"tfng",q:"Bus drivers give change for cash payments.",a:"FALSE",exp:"'Exact change is required — drivers cannot give change'."},
      {type:"mc",q:"Metro ticket offices are located at how many locations?",options:["1","2","3","4"],a:"3",exp:"Three locations: Central Station, Westgate Mall, University Campus."},
      {type:"completion",q:"Lost items are held for ___ days.",a:"30",exp:"'Held for 30 days'."},
      {type:"tfng",q:"There is no charge for collecting lost property.",a:"FALSE",exp:"'A £5 administration fee applies'."},
      {type:"mc",q:"Perishable lost items are disposed of after:",options:["6 hours","12 hours","24 hours","48 hours"],a:"24 hours",exp:"'Disposed of after 24 hours'."},
      {type:"completion",q:"Each bus has ___ wheelchair spaces.",a:"2",exp:"'Two wheelchair spaces on each bus'."}
    ]}
  ]}
];

const ReadingPage = ({isPro, onUpgrade}) => {
  const [tab, setTab] = useState("academic");
  const [activeTest, setActiveTest] = useState(null);
  const [activePsg, setActivePsg] = useState(0);
  const [showAnswers, setShowAnswers] = useState(false);
  const [userAnswers, setUserAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [finalTime, setFinalTime] = useState(null);

  // Timer effect
  useEffect(()=>{
    if(!timerRunning) return;
    const interval = setInterval(()=>setTimerSeconds(s=>s+1),1000);
    return ()=>clearInterval(interval);
  },[timerRunning]);

  // Start timer when test opens
  useEffect(()=>{
    if(activeTest && !submitted){ setTimerSeconds(0); setTimerRunning(true); setFinalTime(null); }
    else { setTimerRunning(false); }
  },[activeTest, submitted]);

  const formatTime = (s) => {
    const m = Math.floor(s/60); const sec = s%60;
    return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}`;
  };
  const timerColor = timerSeconds<3600 ? (timerSeconds>3300?T.amber:T.green) : T.red;

  const tabs = [
    {id:"academic",label:"📖 Academic Tests ("+AC_TESTS.length+")"},
    {id:"gt",label:"📄 General Training ("+GT_TESTS_DATA.length+")"},
    {id:"strategies",label:"🎯 Question Strategies"},
    {id:"timetips",label:"⏱️ Time Management"}
  ];
  const sty = {fontFamily:"'Cairo','Source Sans Pro',system-ui"};
  const card = {background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",marginBottom:16,boxShadow:T.shadow};
  const isLocked = (idx) => !isPro && idx > 0;

  const getAllQuestions = (test) => {
    return test.passages.flatMap((p,pi)=>p.questions.map((q,qi)=>({...q,key:`${pi}-${qi}`,pIdx:pi})));
  };

  const calcScore = (test, type) => {
    const allQ = getAllQuestions(test);
    let correct = 0;
    allQ.forEach((q)=>{
      const ua = userAnswers[q.key];
      if(!ua) return;
      if(q.type==="completion"){ if(ua.toLowerCase().trim()===q.a.toLowerCase()) correct++; }
      else { if(ua===q.a) correct++; }
    });
    const band = type==="ac"?BAND_SCORE_AC(correct):BAND_SCORE_GT(correct);
    return {correct, total:allQ.length, band};
  };

  const typeInstruction = (type) => {
    if(type==="tfng") return "Do the following statements agree with the information given in the reading passage? Write TRUE if the statement agrees with the information, FALSE if the statement contradicts the information, or NOT GIVEN if there is no information on this.";
    if(type==="mc") return "Choose the correct letter, A, B, C or D.";
    if(type==="completion") return "Complete the sentences below. Choose NO MORE THAN TWO WORDS from the passage for each answer.";
    return "";
  };

  const renderQ = (q, i, showTypeHeader) => {
    const key = q.key;
    return (
      <div key={key}>
        {showTypeHeader&&(
          <div style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:8,padding:"12px 16px",marginBottom:10,marginTop:i>0?18:0}}>
            <div style={{...sty,fontSize:13,fontWeight:700,color:T.primary,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{q.type==="tfng"?"True / False / Not Given":q.type==="mc"?"Multiple Choice":"Sentence Completion"}</div>
            <div style={{...sty,fontSize:12,color:T.textMid,lineHeight:1.5,fontStyle:"italic"}}>{typeInstruction(q.type)}</div>
          </div>
        )}
        <div style={{marginBottom:14,padding:"12px 14px",background:T.bgGray,borderRadius:8,border:`1px solid ${T.border}`}}>
          <div style={{...sty,fontSize:14,color:T.text,marginBottom:8,fontWeight:600}}>{i+1}. {q.q}</div>
          {q.type==="tfng"&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {["TRUE","FALSE","NOT GIVEN"].map(opt=>(
                <button key={opt} onClick={()=>{if(!submitted)setUserAnswers(prev=>({...prev,[key]:opt}));}}
                  style={{padding:"6px 14px",borderRadius:6,fontSize:12,fontWeight:600,...sty,cursor:submitted?"default":"pointer",
                    background:userAnswers[key]===opt?(submitted?(opt===q.a?T.greenBg:T.redBg):T.primaryLight):"white",
                    border:`1px solid ${userAnswers[key]===opt?(submitted?(opt===q.a?T.greenBorder:T.redBorder):T.primaryBorder):T.border}`,
                    color:userAnswers[key]===opt?(submitted?(opt===q.a?T.green:T.red):T.primary):T.textMid}}>
                  {opt}
                </button>
              ))}
            </div>
          )}
          {q.type==="mc"&&(
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {q.options.map((opt,oi)=>(
                <button key={oi} onClick={()=>{if(!submitted)setUserAnswers(prev=>({...prev,[key]:opt}));}}
                  style={{textAlign:"left",padding:"8px 12px",borderRadius:6,fontSize:13,...sty,cursor:submitted?"default":"pointer",
                    background:userAnswers[key]===opt?(submitted?(opt===q.a?T.greenBg:T.redBg):T.primaryLight):"white",
                    border:`1px solid ${userAnswers[key]===opt?(submitted?(opt===q.a?T.greenBorder:T.redBorder):T.primaryBorder):T.border}`,
                    color:userAnswers[key]===opt?(submitted?(opt===q.a?T.green:T.red):T.primary):T.textMid}}>
                  {String.fromCharCode(65+oi)}. {opt}
                </button>
              ))}
            </div>
          )}
          {q.type==="completion"&&(
            <input value={userAnswers[key]||""} onChange={e=>{if(!submitted)setUserAnswers(prev=>({...prev,[key]:e.target.value}));}}
              placeholder="Type your answer..." readOnly={submitted}
              style={{...sty,fontSize:14,padding:"8px 12px",border:`1px solid ${submitted?(userAnswers[key]?.toLowerCase().trim()===q.a.toLowerCase()?T.greenBorder:T.redBorder):T.border}`,borderRadius:6,width:"100%",maxWidth:300,background:submitted?(userAnswers[key]?.toLowerCase().trim()===q.a.toLowerCase()?T.greenBg:T.redBg):"white",boxSizing:"border-box"}}/>
          )}
          {submitted&&(
            <div style={{marginTop:8}}>
              <div style={{...sty,fontSize:12,fontWeight:700,color:T.green,marginBottom:2}}>✅ Answer: {q.a}</div>
              {q.exp&&<div style={{...sty,fontSize:12,color:T.textMuted,fontStyle:"italic"}}>{q.exp}</div>}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTestList = (tests, type) => (
    <div>
      <div style={{...card,background:type==="ac"?T.blueBg:T.greenBg,border:`1px solid ${type==="ac"?T.blueBorder:T.greenBorder}`}}>
        <p style={{...sty,fontSize:13,color:type==="ac"?T.blue:T.green,margin:0}}>{type==="ac"?"📖 Academic Reading: 3 passages · 40 questions · 60 minutes. Band score calculated at the end.":"📄 General Training: 3 sections · 40 questions · 60 minutes. Band score calculated at the end."}</p>
      </div>
      {tests.map((test,i)=>(
        <div key={i} style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
            <div>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 4px"}}>Test {test.id}: {test.title}</h3>
              <p style={{...sty,fontSize:13,color:T.textMuted,margin:0}}>{test.passages.length} passages · {test.passages.reduce((s,p)=>s+p.questions.length,0)} questions</p>
            </div>
            {isLocked(i)?(
              <button onClick={onUpgrade} style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,color:T.amber,cursor:"pointer",...sty}}>🔒 Pro Only</button>
            ):(
              <button onClick={()=>{setActiveTest({type,idx:i});setActivePsg(0);setShowAnswers(false);setSubmitted(false);setUserAnswers({});}} style={{background:type==="ac"?T.primary:T.green,color:"white",border:"none",borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:700,cursor:"pointer",...sty}}>Start Test →</button>
            )}
          </div>
        </div>
      ))}
      {!isPro&&<p style={{...sty,fontSize:13,color:T.amber,textAlign:"center",fontWeight:600}}>🔒 Test 1 is free. Unlock all {tests.length} tests with Pro.</p>}
    </div>
  );

  const renderActiveTest = () => {
    const tests = activeTest.type==="ac"?AC_TESTS:GT_TESTS_DATA;
    const test = tests[activeTest.idx];
    const allQ = getAllQuestions(test);
    const psg = test.passages[activePsg];
    const psgQuestions = allQ.filter(q=>q.pIdx===activePsg);
    const globalOffset = allQ.filter(q=>q.pIdx<activePsg).length;

    return (
      <div>
        <button onClick={()=>{setActiveTest(null);setSubmitted(false);setUserAnswers({});setTimerRunning(false);}} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",...sty,padding:"0 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to tests</button>

        {/* Sticky Timer Bar */}
        {!submitted&&(
          <div style={{position:"sticky",top:64,zIndex:100,background:"white",border:`1px solid ${timerSeconds>3300?T.amberBorder:T.border}`,borderRadius:10,padding:"8px 16px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:T.shadow}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>⏱️</span>
              <div>
                <div style={{...sty,fontSize:22,fontWeight:900,color:timerColor,fontFamily:"monospace",letterSpacing:"0.05em"}}>{formatTime(timerSeconds)}</div>
                <div style={{...sty,fontSize:11,color:T.textMuted}}>Target: 60:00</div>
              </div>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {timerSeconds>=3600&&<span style={{...sty,fontSize:12,fontWeight:700,color:T.red}}>⚠️ Over time!</span>}
              <div style={{...sty,fontSize:12,color:T.textMid}}>Passage {activePsg+1} of {test.passages.length}</div>
            </div>
          </div>
        )}

        {/* Score banner */}
        {submitted&&(
          <div style={{background:T.greenBg,border:`2px solid ${T.greenBorder}`,borderRadius:12,padding:"20px",marginBottom:20,textAlign:"center"}}>
            <div style={{fontSize:48,fontWeight:900,color:T.green,fontFamily:"Georgia,serif"}}>{calcScore(test,activeTest.type).band}</div>
            <div style={{...sty,fontSize:16,fontWeight:700,color:T.green}}>Estimated Band Score</div>
            <div style={{...sty,fontSize:14,color:T.textMid,marginTop:4}}>{calcScore(test,activeTest.type).correct} / {calcScore(test,activeTest.type).total} correct answers</div>
            {finalTime&&<div style={{...sty,fontSize:14,color:finalTime<=3600?T.green:T.red,marginTop:6,fontWeight:700}}>⏱️ Time taken: {formatTime(finalTime)} {finalTime<=3600?"✅ Within time limit":"⚠️ Over the 60-minute limit"}</div>}
          </div>
        )}

        {/* Passage tabs */}
        <div style={{display:"flex",gap:8,marginBottom:16,overflowX:"auto"}} className="tab-row">
          {test.passages.map((p,pi)=>(
            <button key={pi} onClick={()=>setActivePsg(pi)} style={{background:activePsg===pi?T.primaryLight:"white",border:`1px solid ${activePsg===pi?T.primaryBorder:T.border}`,borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:activePsg===pi?700:500,color:activePsg===pi?T.primary:T.textMid,cursor:"pointer",...sty,whiteSpace:"nowrap",flexShrink:0}}>
              Passage {pi+1}: {p.title.slice(0,25)}{p.title.length>25?"...":""}
            </button>
          ))}
        </div>

        <div style={card}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 16px"}}>{psg.title}</h2>
          <div style={{background:T.bgGray,borderRadius:8,padding:"20px",marginBottom:20,lineHeight:1.8,...sty,fontSize:14,color:T.textMid,whiteSpace:"pre-line",maxHeight:450,overflowY:"auto",border:`1px solid ${T.border}`}}>
            {psg.text}
          </div>
          <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 14px"}}>Questions {globalOffset+1}–{globalOffset+psgQuestions.length}</h3>
          {psgQuestions.map((q,qi)=>{
            const prevType = qi>0?psgQuestions[qi-1].type:null;
            const showHeader = q.type!==prevType;
            return renderQ(q,globalOffset+qi,showHeader);
          })}
        </div>

        {/* Navigation + Submit */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",gap:8}}>
            {activePsg>0&&<button onClick={()=>setActivePsg(activePsg-1)} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",...sty}}>← Previous Passage</button>}
            {activePsg<test.passages.length-1&&<button onClick={()=>setActivePsg(activePsg+1)} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",...sty}}>Next Passage →</button>}
          </div>
          {!submitted?(
            activePsg===test.passages.length-1?(
              <button onClick={()=>{setFinalTime(timerSeconds);setSubmitted(true);setTimerRunning(false);setActivePsg(0);window.scrollTo({top:0,behavior:'smooth'});}}
                style={{background:T.green,color:"white",border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
                📝 Submit Test & See Score
              </button>
            ):null
          ):(
            <button onClick={()=>{setUserAnswers({});setSubmitted(false);setActivePsg(0);setTimerSeconds(0);setTimerRunning(true);setFinalTime(null);}}
              style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",...sty}}>
              🔄 Retake Test
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 16px 60px"}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:28,color:T.text,margin:"0 0 6px"}}>📖 IELTS Reading</h1>
      <p style={{...sty,fontSize:14,color:T.textMuted,margin:"0 0 20px",lineHeight:1.5}}>Full practice tests with scoring, answer keys with explanations, and strategies for every question type.</p>

      {!activeTest&&(
        <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:24,paddingBottom:4}} className="tab-row">
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{background:tab===t.id?T.primaryLight:"white",border:`1px solid ${tab===t.id?T.primaryBorder:T.border}`,borderRadius:8,padding:"10px 16px",fontSize:13,fontWeight:tab===t.id?700:500,color:tab===t.id?T.primary:T.textMid,cursor:"pointer",...sty,whiteSpace:"nowrap",flexShrink:0}}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {!activeTest&&tab==="academic"&&renderTestList(AC_TESTS,"ac")}
      {!activeTest&&tab==="gt"&&renderTestList(GT_TESTS_DATA,"gt")}
      {activeTest&&renderActiveTest()}

      {!activeTest&&tab==="strategies"&&(
        <div>
          {/* Key insight about real IELTS questions */}
          <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,color:"#1e40af",marginBottom:6}}>🔑 The Paraphrasing Principle — most important skill in IELTS Reading</div>
            <p style={{margin:0,fontSize:13,color:"#1e3a5f",lineHeight:1.7}}>
              Real IELTS questions almost never lift exact words from the passage. They use <strong>synonyms and paraphrases</strong>. For example: if the passage says "approximately 35,000 decisions," the question might say "tens of thousands of choices." If the passage says "a small genetic minority," the question might say "a tiny fraction of the population." Train yourself to spot meaning, not match words. This separates Band 6 from Band 7+.
            </p>
          </div>
          {READING_STRATEGIES.map((s,i)=>(
            <div key={i} style={card}>
              <h3 style={{fontFamily:"Georgia,serif",fontSize:16,color:T.primary,margin:"0 0 8px"}}>{s.type}</h3>
              <p style={{...sty,fontSize:14,color:T.textMid,margin:"0 0 8px",lineHeight:1.6}}>{s.strategy}</p>
              <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:6,padding:"8px 12px",...sty,fontSize:13,color:T.amber,fontWeight:600}}>💡 {s.tip}</div>
            </div>
          ))}
        </div>
      )}

      {!activeTest&&tab==="timetips"&&(
        <div style={card}>
          <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 16px"}}>⏱️ Time Management</h2>
          <p style={{...sty,fontSize:14,color:T.textMid,margin:"0 0 16px",lineHeight:1.6}}>60 minutes for 40 questions across 3 passages. Time management is the biggest factor separating Band 6 from Band 7+.</p>
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
  const inputStyle = { width:"100%", background:"white", border:`1px solid ${T.border}`, borderRadius:10, color:T.text, fontSize:14, padding:"12px 14px", fontFamily:"'Cairo','Source Sans Pro',system-ui", outline:"none", boxSizing:"border-box", boxShadow:T.shadow, transition:"border-color 0.2s" };
  const labelStyle = { display:"block", fontSize:11, color:T.textMid, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:6, fontFamily:"'Cairo','Source Sans Pro',system-ui", fontWeight:600 };
  return (
    <div style={{maxWidth:600,margin:"0 auto",padding:"24px 16px 0"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:48,marginBottom:12}}>✉️</div>
        <h2 style={{fontFamily:"Arial Black,system-ui",color:T.text,fontSize:28,margin:"0 0 8px 0",fontWeight:900}}>Contact Us</h2>
        <p style={{color:T.textMid,fontSize:15,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:0,lineHeight:1.6}}>Have a question, feedback or need support? We'd love to hear from you.</p>
        <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:4,direction:"rtl"}}>هل لديك سؤال أو ملاحظة؟ تواصل معنا بكل سرور.</p>
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
          {status==="error"&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>⚠️ Please fill in all required fields (Name, Email, Message).</p></Card>}
          {status==="success"&&<Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}><p style={{color:T.green,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✅ Message sent successfully! We'll get back to you soon.</p></Card>}
          <button onClick={handleSubmit} disabled={status==="sending"} style={{background:status==="sending"?T.bgGray:T.primary,border:"none",borderRadius:4,color:status==="sending"?T.textMuted:"white",fontSize:14,fontWeight:600,padding:"14px",cursor:status==="sending"?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:T.shadow}}>
            {status==="sending"?"⏳ Sending...":"Send Message →"}
          </button>
          {EMAILJS_PUBLIC_KEY==="YOUR_PUBLIC_KEY"&&(<p style={{textAlign:"center",color:T.amber,fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontStyle:"italic",margin:0}}>📧 EmailJS verification pending — messages will be delivered once account is verified (up to 48hrs).</p>)}
        </div>
      </Card>
    </div>
  );
};

// ── POLICY PAGES ─────────────────────────────
const PolicyPage = ({ title, children, onBack }) => (
  <div style={{maxWidth:800, margin:"0 auto", padding:"0 24px 80px"}}>
    <button onClick={onBack} style={{background:"none",border:"none",color:T.primary,fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",padding:"24px 0 16px",display:"flex",alignItems:"center",gap:6}}>← Back to Englishfool</button>
    <div style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"40px 48px",boxShadow:T.shadow}}>
      <h1 style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:28,fontWeight:700,color:T.text,marginBottom:8,marginTop:0}}>{title}</h1>
      <p style={{color:T.textMuted,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:32}}>Last updated: {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})}</p>
      <div style={{color:T.textMid,fontSize:15,lineHeight:1.8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{children}</div>
    </div>
  </div>
);
const Section = ({title, children}) => (
  <div style={{marginBottom:28}}>
    <h2 style={{fontSize:17,fontWeight:700,color:"#1c1d1f",marginBottom:10,marginTop:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{title}</h2>
    {children}
  </div>
);
const TermsPage = ({onBack}) => (
  <PolicyPage title="Terms of Service" onBack={onBack}>
    <Section title="1. Acceptance of Terms"><p style={{margin:"0 0 12px"}}>By accessing or using Englishfool ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service. Englishfool is operated by Ahmad Sartawi ("we", "us", "our").</p></Section>
    <Section title="2. Description of Service"><p style={{margin:"0 0 12px"}}>Englishfool is a smart IELTS Writing examination tool that provides automated band score assessment based on official IELTS band descriptors, mistake detection, vocabulary feedback, and model essay generation for IELTS Writing Tasks 1 and 2. The Service is intended for educational purposes only.</p></Section>
    <Section title="3. User Accounts and Subscriptions"><p style={{margin:"0 0 12px"}}>The Service offers a free tier with limited analyses and a Pro plan at $17 USD (one-time payment). Payments are processed securely by Paddle.com as our Merchant of Record.</p><p style={{margin:"0 0 12px"}}>Pro access is granted permanently after a one-time payment.</p><p style={{margin:"0 0 12px"}}>Buyers are entitled to a full refund within 14 days of purchase, in accordance with Paddle's Buyer Terms. See our Refund Policy for full details.</p></Section>
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
    <Section title="2. How We Use Your Information"><p style={{margin:"0 0 12px"}}>We use the information we collect to: provide and improve the Service; process payments; respond to your enquiries; send service-related communications; and analyse usage patterns to improve user experience.</p><p style={{margin:"0 0 12px"}}>We do not sell, rent, or share your personal information with third parties for marketing purposes.</p></Section>
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
    <Section title="2. Refund Eligibility"><p style={{margin:"0 0 12px"}}>We offer a <strong>14-day money-back guarantee</strong> for new Pro buyers, in accordance with Paddle's Buyer Terms and applicable consumer protection regulations. If you are not satisfied within 14 days of your initial purchase, you are entitled to a full refund.</p><p style={{margin:"0 0 12px"}}>Refund requests made after 14 days will be assessed on a case-by-case basis. Refunds are assessed based on usage.</p></Section>
    <Section title="3. How to Request a Refund"><p style={{margin:"0 0 12px"}}>To request a refund, you may either contact Paddle directly through your purchase confirmation email, or reach out via our <strong>Contact Us</strong> page with your registered email, date of purchase, and reason for refund. All refund requests are processed within 5–10 business days.</p></Section>
    <Section title="4. Contact"><p style={{margin:"0 0 12px"}}>For refund enquiries, please use our <strong>Contact Us</strong> page.</p></Section>
  </PolicyPage>
);
const PricingPage = ({onBack, onUpgrade, isPro, onManageSub=()=>{}}) => (
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
        <div style={{fontFamily:"Georgia,serif",fontSize:48,fontWeight:900,color:T.text,lineHeight:1,marginBottom:4}}><sup style={{fontSize:20,verticalAlign:"super"}}>$</sup>17</div>
        <div style={{color:T.textMuted,fontSize:13,marginBottom:20}}>اشتراك 3 أشهر · يجدد تلقائياً</div>
        <ul style={{listStyle:"none",padding:0,textAlign:"left",display:"flex",flexDirection:"column",gap:8,marginBottom:20}}>
          {["Unlimited essay analyses","Complete mistake detection","Inline essay annotations","Band 8+ model responses","Progress tracker","Vocabulary upgrades from YOUR essay","Band Booster coaching","Full IELTS Toolkit access","Practice Mode with live coaching","Unlimited Grammar & Spell Checker","Graph image upload (Task 1 Academic)","6 scored model essays with commentary"].map((f,i)=>(
            <li key={i} style={{fontSize:13,color:T.textMid,display:"flex",gap:8}}><span style={{color:T.green,fontWeight:700,flexShrink:0}}>✓</span>{f}</li>
          ))}
        </ul>
        {isPro?(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px",fontSize:13,color:T.green,fontWeight:700}}>✓ أنت على Pro — وصول غير محدود</div>
            <button onClick={()=>onManageSub()}
              style={{display:"block",width:"100%",textAlign:"center",background:"white",border:`1.5px solid ${T.border}`,borderRadius:8,padding:"11px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",direction:"rtl",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxSizing:"box-sizing"}}>
              ⚙️ إدارة اشتراكك أو إلغاؤه
            </button>
            <div style={{fontSize:11,color:T.textMuted,textAlign:"center",direction:"rtl",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>ستحتاج إلى البريد الإلكتروني الذي دفعت به</div>
          </div>
        ):(
          <button onClick={onUpgrade} style={{width:"100%",background:T.primary,color:"white",fontWeight:700,fontSize:15,padding:"14px",borderRadius:8,border:"none",cursor:"pointer",boxShadow:T.shadowMd}}>
            احصل على Pro — $17 (3 أشهر)
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
      <p style={{margin:"0 0 12px"}}>لإلغاء اشتراكك، اضغط <button onClick={()=>onManageSub()} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",fontFamily:"inherit",padding:0,fontSize:"inherit",textDecoration:"underline"}}>هنا</button> وسنرشدك خطوة بخطوة.</p>
    </Section>
    <Section title="Refunds">
      <p style={{margin:"0 0 12px"}}>المدفوعات تُعالَج بأمان عبر <strong>Paddle.com</strong> بوصفها وكيل البيع المعتمد. تقبل المنصة بطاقات الائتمان والخصم الرئيسية، وPayPal، وApple Pay، وGoogle Pay. لأي استفسارات متعلقة بالفواتير، يمكنك التواصل معنا عبر صفحة <strong>Contact</strong>.</p>
    </Section>
    <Section title="Questions?">
      <p style={{margin:"0 0 12px"}}>For any billing or pricing enquiries, please use our <strong>Contact Us</strong> page.</p>
    </Section>
  </PolicyPage>
);

// ─────────────────────────────────────────────────────────────
// IELTS GAME — DATA
// ─────────────────────────────────────────────────────────────
const IELTS_GAME_CATS=[
  {id:"spelling", arabic:"لعبة التهجئة",    emoji:"🔤", free:true,  color:"#059669", bg:"#d1fae5", desc:"هل تعرف كيف تكتب الكلمات الإنجليزية صح؟"},
  {id:"grammar",  arabic:"لعبة القواعد",    emoji:"📖", free:true,  color:"#2563eb", bg:"#dbeafe", desc:"تحدَّ نفسك في قواعد اللغة الإنجليزية"},
  {id:"writing",  arabic:"لعبة الكتابة",    emoji:"✍️", free:false, color:"#d97706", bg:"#fef3c7", desc:"مفردات وتعابير الكتابة الأكاديمية"},
  {id:"reading",  arabic:"لعبة القراءة",    emoji:"📚", free:false, color:"#7c3aed", bg:"#ede9fe", desc:"فهم النصوص والمفردات القرائية"},
  {id:"vocab",    arabic:"لعبة المفردات",   emoji:"💡", free:false, color:"#dc2626", bg:"#fee2e2", desc:"وسّع قاموسك لمستوى الدرجة 8"},
];
const IELTS_GAME_QS={
  spelling:[
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["accommodate","accomodate","acommodate","accomadate"],a:0},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["neccessary","necessary","necesary","necessery"],a:1},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["definately","definitly","definitely","defenitely"],a:2},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["separate","seperate","separrate","seperrate"],a:0},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["occurence","occurrance","occurance","occurrence"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["begining","beggining","beginning","beginnning"],a:2},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["environment","enviornment","enviroment","environement"],a:0},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["goverment","governement","govenment","government"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["knowlege","knoweldge","knolwedge","knowledge"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["immediately","immediatly","imediately","immeditley"],a:0},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["particullary","particularly","particulerly","partucularly"],a:1},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["succesfully","successfuly","successefully","successfully"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["opportunites","oppertunities","opportunities","opportunittes"],a:2},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["comunication","communicaton","communication","communicaiton"],a:2},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["responsability","responsibilty","responsibiliy","responsibility"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["aproximately","approximatly","approximately","approximatley"],a:2},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["developement","devlopment","devellopment","development"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["internatonal","internatioanl","internationel","international"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["signifcant","signifigant","significant","significent"],a:2},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["acheivment","achievment","achevement","achievement"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["assesment","assessement","assesement","assessment"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["recomended","recommened","reccommended","recommended"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["througout","throuought","throughut","throughout"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["disadavantage","disadvantege","disadvntage","disadvantage"],a:3},
    {q:"أي كلمة مكتوبة بشكل صحيح؟",opts:["concluson","conclussion","conclusoin","conclusion"],a:3},
  ],
  grammar:[
    {q:"اختر الجملة الصحيحة:",opts:["She don't like studying","She doesn't like studying","She not like studying","She isn't like studying"],a:1,exp:"مع he/she/it نستخدم doesn't وليس don't"},
    {q:"The number of students ___ increasing.",opts:["are","were","is","have been"],a:2,exp:"'The number of' تُعامل كمفرد دائماً → is"},
    {q:"Despite ___ tired, she kept studying.",opts:["to be","be","been","being"],a:3,exp:"بعد Despite/preposition نستخدم الـ gerund (being)"},
    {q:"He suggested that she ___ more carefully.",opts:["reads","read","reading","to read"],a:1,exp:"بعد suggest/recommend نستخدم المصدر البسيط (subjunctive) بدون s → read وليس reads"},
    {q:"Neither the teachers nor the student ___ ready.",opts:["are","were","have been","was"],a:3,exp:"مع Neither...nor الفعل يتفق مع أقرب اسم (the student = مفرد) → was"},
    {q:"By 2030, scientists ___ a cure.",opts:["will find","find","have found","will have found"],a:3,exp:"By + وقت مستقبلي = Future Perfect → will have found"},
    {q:"The report, along with its appendices, ___ submitted.",opts:["were","have been","was","are"],a:2,exp:"'along with' لا تغير المبتدأ. The report = مفرد → was"},
    {q:"She is used to ___ long hours.",opts:["work","worked","working","works"],a:2,exp:"بعد 'used to' بمعنى معتادة على نستخدم gerund → working"},
    {q:"If I ___ you, I would apologise.",opts:["am","was","were","had been"],a:2,exp:"في Second Conditional نستخدم were مع جميع الضمائر → If I were"},
    {q:"The data ___ clearly show a rising trend.",opts:["do","does","is","has"],a:0,exp:"'data' اسم جمع في الكتابة الأكاديمية → do"},
    {q:"___ the rain, the event continued.",opts:["Although","Despite","However","Because"],a:1,exp:"Despite + اسم/gerund بدون جملة كاملة → Despite the rain"},
    {q:"There has been a significant ___ in pollution.",opts:["raise","rise","risen","arose"],a:1,exp:"rise (اسم) = ارتفاع. raise = يرفع شيئاً آخر. a significant rise"},
    {q:"The government ___ new policies since last year.",opts:["implemented","has implemented","implements","implement"],a:1,exp:"since = Present Perfect → has implemented"},
    {q:"The findings suggest that exercise ___ mental health.",opts:["improves","improve","improving","improved"],a:0,exp:"المبتدأ exercise = مفرد → improves"},
    {q:"She asked me ___ the window.",opts:["close","to close","closing","closed"],a:1,exp:"ask + شخص + to do → asked me to close"},
    {q:"This is the report ___ I mentioned yesterday.",opts:["which","who","whom","whose"],a:0,exp:"which للأشياء، who للأشخاص → the report which"},
    {q:"___ more research is needed, the results are promising.",opts:["Despite","However","Although","Because"],a:2,exp:"Although + جملة كاملة = على الرغم من أن"},
    {q:"The population has ___ doubled in 20 years.",opts:["near","nearly","nearest","nearer"],a:1,exp:"nearly = تقريباً وصف للفعل → nearly doubled"},
    {q:"He made a number of ___ mistakes.",opts:["grammar","grammatic","grammatical","grammarically"],a:2,exp:"الصفة تسبق الاسم → grammatical mistakes"},
    {q:"The evidence ___ that diets affect mood.",opts:["suggest","suggests","suggesting","suggested"],a:1,exp:"The evidence = مفرد → suggests"},
    {q:"It is ___ that students revise regularly.",opts:["advise","advised","advisable","advisory"],a:2,exp:"It is + صفة + that... → advisable (مستحسن)"},
    {q:"The solution ___ by the team last week.",opts:["discover","was discovered","discovered","has discovered"],a:1,exp:"last week = Past Simple Passive → was discovered"},
    {q:"She has been living here ___ five years.",opts:["since","for","during","while"],a:1,exp:"for + مدة زمنية → for five years. since + نقطة زمنية"},
    {q:"The majority of students ___ passed the exam.",opts:["has","is","have","was"],a:2,exp:"'the majority of' + اسم جمع → have"},
    {q:"He works ___ a teacher in a local school.",opts:["like","as","for","with"],a:1,exp:"as = بصفته وظيفة. like = يشبه → works as a teacher"},
  ],
  writing:[
    {q:"أي كلمة تعبّر عن التناقض؟",opts:["Furthermore","Therefore","However","Consequently"],a:2},
    {q:"'To what extent do you agree?' تعني:",opts:["وافق أو اعترض فقط","اعطِ الجانبين فقط","أبدِ رأيك وبرّره","ناقش المشكلات والحلول"],a:2},
    {q:"أفضل paraphrase لـ 'Cities are becoming overcrowded':",opts:["Cities have people","Urban areas are experiencing population growth","People live in cities","Cities are big"],a:1},
    {q:"أي كلمة أكثر رسمية؟",opts:["big","large","huge","enormous"],a:1},
    {q:"'Coherent essay' يعني:",opts:["يستخدم مفردات كثيرة","الأفكار مترابطة ومنظمة","يحتوي فقرات كثيرة","طويل جداً"],a:1},
    {q:"أي جملة تستخدم cohesive device بشكل صحيح؟",opts:["In addition, however, some disagree","Furthermore, this trend has led to social problems","Despite, the situation is improving","Although however, both sides have merit"],a:1},
    {q:"'The graph shows an upward trend.' يعني:",opts:["البيانات تنخفض","تبقى ثابتة","ترتفع","غير منتظمة"],a:2},
    {q:"أفضل عبارة لتقديم رأي:",opts:["In my humble opinion I think","It is widely argued that","I believe that personally","From my personal individual opinion"],a:1},
    {q:"Lexical resource تعني:",opts:["دقة القواعد","نطاق ودقة المفردات","تنظيم المقالة","الإملاء فقط"],a:1},
    {q:"أفضل بديل لكلمة 'show' في الكتابة الأكاديمية:",opts:["demonstrate","tell","say","prove"],a:0},
    {q:"أي نوع ليس من أنواع Task 2؟",opts:["Opinion essay","Discussion essay","Narrative essay","Problem-solution essay"],a:2},
    {q:"'Despite the challenges, solutions exist.' هذا مثال على:",opts:["Topic sentence","Concession statement","Thesis statement","Conclusion"],a:1},
    {q:"Task 2 يتطلب حداً أدنى من الكلمات:",opts:["150","200","250","300"],a:2},
    {q:"أفضل عبارة لخاتمة:",opts:["In a nutshell basically","In conclusion, it is clear that","To sum it all up finally","At the end of everything"],a:1},
    {q:"أي جملة أكثر تعقيداً؟",opts:["People work hard","Although work can be stressful, it provides financial stability","Working is good","People need jobs"],a:1},
    {q:"'Affluent' تعني:",opts:["فقير","غني","ريفي","متعلم"],a:1},
    {q:"أي كلمة تشير إلى مثال؟",opts:["However","Therefore","For instance","In contrast"],a:2},
    {q:"'The data indicates a gradual ___.' أي كلمة تناسب؟",opts:["increase","increased","increasing","increases"],a:0},
    {q:"أفضل topic sentence لفقرة opinion essay:",opts:["There are many reasons","One significant reason is the impact on public health","I will discuss this","People have opinions"],a:1},
    {q:"Coherence في الكتابة تعني:",opts:["استخدام جمل طويلة","تدفق الأفكار بشكل منطقي","وجود مفردات كثيرة","الكتابة بسرعة"],a:1},
    {q:"'Pollution ___ a major threat.' الفعل الصحيح:",opts:["make","poses","do","creates a"],a:1},
    {q:"فقرة الحجة المضادة يجب أن:",opts:["تتجاهل الآراء المعارضة","تطرح الرأي المعارض ثم تردّ عليه","توافق الحجة الرئيسية فقط","تكون أطول من الحجة الأساسية"],a:1},
    {q:"أي جملة compound sentence؟",opts:["She studied hard.","She studied hard and passed the exam.","Although she studied hard, she failed.","Having studied hard, she passed."],a:1},
    {q:"'Mitigate' تعني:",opts:["يجعل أسوأ","يتجاهل","يخفف من حدة","يمنع كلياً"],a:2},
    {q:"Task 1 Academic يتطلب:",opts:["حجة","وصف بيانات مرئية","رسالة","رأي شخصي"],a:1},
  ],
  reading:[
    {q:"'The author implies...' — 'implies' تعني:",opts:["يصرّح مباشرة","يشير ضمنياً","يجادل ضد","يثبت"],a:1},
    {q:"الفكرة الرئيسية للفقرة توجد في:",opts:["الجملة الأخيرة","أي جملة","عادةً الجملة الموضوعية","التفاصيل الداعمة"],a:2},
    {q:"'Ubiquitous' تعني:",opts:["نادر","موجود في كل مكان","خطير","مكلف"],a:1},
    {q:"في أسئلة True/False/Not Given، 'Not Given' تعني:",opts:["العبارة خاطئة","المعلومة غير موجودة في النص","العبارة صحيحة جزئياً","الكاتب يعارض"],a:1},
    {q:"'Despite rapid urbanisation, rural traditions persist.' العلاقة بين الجملتين:",opts:["سبب ونتيجة","تناقض","تسلسل","مثال"],a:1},
    {q:"Skimming يعني:",opts:["قراءة كل كلمة بعناية","قراءة سريعة للمعنى العام","البحث عن معلومة محددة","تجاهل النص"],a:1},
    {q:"'The study corroborates earlier findings.' — 'corroborates' تعني:",opts:["يتناقض مع","يؤكد","يتحدى","يتجاهل"],a:1},
    {q:"Scanning يعني:",opts:["قراءة بطيئة كلمة بكلمة","قراءة للمعنى العام","البحث عن معلومة محددة","تلخيص النص"],a:2},
    {q:"'The government's stance on immigration' — 'stance' تعني:",opts:["قانون","موقف/اتجاه","سياسة","ميزانية"],a:1},
    {q:"كم قسماً في اختبار IELTS Reading؟",opts:["2","3","4","5"],a:1},
    {q:"'Empirical evidence' تشير إلى:",opts:["حجج نظرية","أدلة مبنية على الملاحظة/التجربة","آراء شخصية","سجلات تاريخية"],a:1},
    {q:"'The author's tone is sceptical' يعني:",opts:["المؤلف يوافق تماماً","المؤلف متشكك أو غير متأكد","المؤلف متحمس","المؤلف محايد"],a:1},
    {q:"'Furthermore' تشير إلى:",opts:["تناقض","نقطة إضافية","خاتمة","سبب"],a:1},
    {q:"'Detrimental effects' تعني:",opts:["تأثيرات إيجابية","محايدة","ضارة","مؤقتة"],a:2},
    {q:"'Rhetorical question' في نص:",opts:["تتطلب إجابة مكتوبة","تُطرح للتأثير وليس للإجابة الحرفية","سؤال بحثي","دائماً في النهاية"],a:1},
    {q:"'The policy was implemented gradually.' — 'gradually' تعني:",opts:["فجأة","خطوة بخطوة","فوراً","عشوائياً"],a:1},
    {q:"'Controversial' تعني:",opts:["مقبول على نطاق واسع","يسبب خلافاً","مثبت علمياً","قديم"],a:1},
    {q:"في 'matching headings'، تقيس قدرتك على:",opts:["إيجاد أرقام محددة","تحديد الفكرة الرئيسية للفقرات","مطابقة المترادفات","القراءة السريعة"],a:1},
    {q:"'The research is inconclusive.' تعني:",opts:["النتائج واضحة جداً","النتائج لا تثبت شيئاً محدداً","البحث خاطئ","البحث ممتاز"],a:1},
    {q:"'Predominantly' تعني:",opts:["بالتساوي","في معظمه","جزئياً","نادراً"],a:1},
    {q:"'The central argument' في النص:",opts:["أي جملة في النص","النقطة الرئيسية للمؤلف","الجملة الأولى فقط","جملة الخاتمة"],a:1},
    {q:"'Unprecedented' تعني:",opts:["شائع","متوقع","لم يحدث من قبل","موثق جيداً"],a:2},
    {q:"'The author concedes that...' تعني المؤلف:",opts:["يجادل بقوة","يعترف بنقطة ضد رأيه","يتجاهل المسألة","يثبت وجهة نظره"],a:1},
    {q:"'Sustainable development' تشير إلى:",opts:["نمو اقتصادي سريع","نمو يلبي الحاضر دون الإضرار بالمستقبل","تدمير البيئة","التطوير الصناعي"],a:1},
    {q:"في IELTS Reading، يجب أن:",opts:["تقرأ النص كله أولاً دائماً","تقرأ الأسئلة أولاً لتعرف ما تبحث عنه","لا تقرأ النص أبداً","تقرأ الفقرة الأولى فقط"],a:1},
  ],
  vocab:[
    {q:"أفضل مرادف لـ 'abundant':",opts:["scarce","plentiful","moderate","average"],a:1},
    {q:"'To alleviate' تعني:",opts:["يزيد سوءاً","يتجاهل","يخفف/يُريح","يُسبّب"],a:2},
    {q:"أي عبارة صحيحة مع كلمة 'significant'؟",opts:["significant make","significant improvement","significant do","significant go"],a:1},
    {q:"'Inevitable' تعني:",opts:["يمكن تجنبه","محتمل","لا مفر منه","غير محتمل"],a:2},
    {q:"'Exacerbate' تعني:",opts:["يحسّن","يجعل أسوأ","يوقف","يبدأ"],a:1},
    {q:"مرادف لـ 'crucial':",opts:["trivial","optional","essential","common"],a:2},
    {q:"'A surge in demand' تعني:",opts:["انخفضت ببطء","بقيت كما هي","ارتفعت بسرعة","أصبحت غير قابلة للتنبؤ"],a:2},
    {q:"'Diverse' تعني:",opts:["متشابه","محدود","متنوع","بسيط"],a:2},
    {q:"'To implement a policy' يعني:",opts:["اقتراحها","مناقشتها","تطبيقها عملياً","إلغاؤها"],a:2},
    {q:"'Subsequent' تعني:",opts:["سابق","لاحق","متزامن","غير مرتبط"],a:1},
    {q:"'The disparity between rich and poor' تعني:",opts:["التشابه","الفجوة/الفرق","الرابط","النمو"],a:1},
    {q:"'Feasible' تعني:",opts:["مستحيل","صعب","ممكن/قابل للتحقيق","مكلف"],a:2},
    {q:"الكلمة الأكاديمية لـ 'to find out':",opts:["discover","investigate","look into","check"],a:1},
    {q:"'Detrimental' تقترب من معنى:",opts:["مفيد","ضار","محايد","مؤقت"],a:1},
    {q:"'The trend has plateaued.' يعني:",opts:["ترتفع","تنخفض","ثبتت عند مستوى","غير قابلة للتنبؤ"],a:2},
    {q:"'To advocate for' تعني:",opts:["يعارض","يتجاهل","يدعم علناً","يتساءل"],a:2},
    {q:"'Ambiguous' تعني:",opts:["واضح جداً","ذو أكثر من معنى","غلط","رسمي"],a:1},
    {q:"'Proliferate' تعني:",opts:["يتناقص","ينمو بسرعة","يبقى كما هو","يختفي"],a:1},
    {q:"أي عبارة صحيحة؟",opts:["do a mistake","make a mistake","commit a mistake","take a mistake"],a:1},
    {q:"'To tackle a problem' تعني:",opts:["يخلق المشكلة","يتجاهلها","يتعامل معها","يناقشها فقط"],a:2},
    {q:"'Comprehensive' تعني:",opts:["جزئي","مختصر","شامل وكامل","معقد"],a:2},
    {q:"'Volatile' تصف شيئاً:",opts:["مستقر ومتوقع","يتغير فجأة/بشكل غير متوقع","يتحسن","بطيء جداً"],a:1},
    {q:"'To mitigate' تعني:",opts:["يجعل أسوأ","يدرس","يخفف من التأثير","يمنع كلياً"],a:2},
    {q:"'Leverage' كفعل تعني:",opts:["يتجاهل","يستغل لأقصى فائدة","يخفض","يقترض"],a:1},
    {q:"'Consensus' تعني:",opts:["خلاف","اتفاق عام","رأي أقلية","قانون رسمي"],a:1},
  ],
};

// ─────────────────────────────────────────────────────────────
// IELTS GAME — AUDIO ENGINE
// ─────────────────────────────────────────────────────────────
const gameAudio={
  _ctx:null,
  _bgPlaying:false,
  _muted:false,
  _bgTimer:null,
  ctx(){
    if(!this._ctx){
      try{ this._ctx=new(window.AudioContext||window.webkitAudioContext)(); }catch(e){}
    }
    return this._ctx;
  },
  note(freq,start,dur,type='sine',vol=0.07){
    if(this._muted) return;
    const c=this.ctx(); if(!c) return;
    try{
      const o=c.createOscillator(),g=c.createGain(),rev=c.createGain();
      o.connect(g); g.connect(rev); rev.connect(c.destination);
      o.frequency.value=freq; o.type=type;
      g.gain.setValueAtTime(vol,c.currentTime+start);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+start+dur);
      rev.gain.value=0.85;
      o.start(c.currentTime+start); o.stop(c.currentTime+start+dur+0.05);
    }catch(e){}
  },
  chord(freqs,start,dur,vol=0.05){
    freqs.forEach(f=>this.note(f,start,dur,'sine',vol));
  },
  // Triumphant correct — ascending fanfare
  correct(){
    [[523,0,0.15],[659,0.1,0.15],[784,0.2,0.15],[1047,0.3,0.35],[784,0.32,0.25],[1047,0.5,0.4]].forEach(([f,t,d])=>this.note(f,t,d,'sine',0.08));
  },
  // Wrong — somber descending minor
  wrong(){
    [[392,0,0.25],[330,0.15,0.25],[262,0.3,0.35]].forEach(([f,t,d])=>this.note(f,t,d,'triangle',0.06));
  },
  // Complete — full triumphant fanfare
  complete(){
    const seq=[[523,0],[659,0.12],[784,0.24],[1047,0.38],[880,0.52],[1047,0.62],[1319,0.76]];
    seq.forEach(([f,t])=>this.note(f,t,0.28,'sine',0.09));
    [[523,659,784],].forEach(([a,b,cc])=>this.chord([a,b,cc],1.0,0.5,0.05));
  },
  // Background — Yanni-inspired arpeggios in C major
  startBg(){
    if(this._bgPlaying) return;
    const c=this.ctx(); if(!c) return;
    this._bgPlaying=true;
    // Arpeggiated chord progression: C-Am-F-G
    const progressions=[
      [523,659,784],[440,523,659],[349,440,523],[392,494,587],
    ];
    let prog=0,note=0;
    const tick=()=>{
      if(!this._bgPlaying) return;
      if(!this._muted){
        const chord=progressions[prog%progressions.length];
        const f=chord[note%chord.length];
        this.note(f,0,0.6,'sine',0.025);
        // Bass note every 3
        if(note%3===0) this.note(chord[0]/2,0,0.55,'sine',0.03);
      }
      note++;
      if(note%3===0) prog++;
      this._bgTimer=setTimeout(tick,280);
    };
    tick();
  },
  stopBg(){ this._bgPlaying=false; clearTimeout(this._bgTimer); },
  toggleMute(){ this._muted=!this._muted; return this._muted; },
  isMuted(){ return this._muted; },
};

// ─────────────────────────────────────────────────────────────
// IELTS GAME — LOBBY
// ─────────────────────────────────────────────────────────────
function IELTSGameLobby({proUser,onSelect}){
  return(
    <div style={{minHeight:"calc(100vh - 64px)",background:"linear-gradient(160deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)",padding:"40px 20px",position:"relative",overflow:"hidden"}}>
      {/* Stars background */}
      <div style={{position:"absolute",inset:0,pointerEvents:"none"}}>
        {Array.from({length:40}).map((_,i)=>(
          <div key={i} style={{position:"absolute",width:i%5===0?3:2,height:i%5===0?3:2,borderRadius:"50%",background:"white",
            left:`${(i*37)%100}%`,top:`${(i*53)%80}%`,
            opacity:0.3+Math.random()*0.5,
            animation:`starTwinkle ${2+i%3}s ease-in-out ${i%4*0.5}s infinite alternate`}}/>
        ))}
      </div>

      <div style={{maxWidth:900,margin:"0 auto",position:"relative",zIndex:1}}>
        {/* Title */}
        <div style={{textAlign:"center",marginBottom:48}}>
          <div style={{fontSize:"clamp(36px,5vw,60px)",marginBottom:8}}>🎮</div>
          <div style={{fontFamily:"'Cairo',system-ui",fontWeight:900,fontSize:"clamp(26px,4vw,44px)",color:"white",marginBottom:10,letterSpacing:"-0.5px"}}>
            IELTS Game
          </div>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:"clamp(14px,2vw,18px)",color:"rgba(255,255,255,0.6)",direction:"rtl"}}>
            تعلّم وتمرّن على الآيلتس بطريقة ممتعة وتفاعلية 🌟
          </div>
          <div style={{marginTop:12,display:"inline-flex",gap:16,background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"8px 20px",border:"1px solid rgba(255,255,255,0.12)"}}>
            {[["25","سؤالاً في كل لعبة"],["🏆","نقاط وتقييم"],["🔊","موسيقى تفاعلية"]].map(([ic,lb])=>(
              <div key={lb} style={{textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:900,color:"#fbbf24",fontFamily:"'Cairo',system-ui"}}>{ic}</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.5)",fontFamily:"'Cairo',system-ui"}}>{lb}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Category grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:16}}>
          {IELTS_GAME_CATS.map(cat=>{
            const locked=!cat.free&&!proUser;
            return(
              <div key={cat.id}
                onClick={()=>!locked&&onSelect(cat)}
                style={{
                  background:locked?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.07)",
                  border:`2px solid ${locked?"rgba(255,255,255,0.08)":cat.color+"99"}`,
                  borderRadius:20,padding:"28px 24px",
                  cursor:locked?"not-allowed":"pointer",
                  opacity:locked?0.55:1,
                  backdropFilter:"blur(12px)",
                  transition:"transform 0.2s,background 0.2s,box-shadow 0.2s",
                  position:"relative",overflow:"hidden",
                }}
                onMouseOver={e=>{if(!locked){e.currentTarget.style.transform="translateY(-5px)";e.currentTarget.style.background="rgba(255,255,255,0.14)";e.currentTarget.style.boxShadow=`0 12px 40px ${cat.color}44`;}}}
                onMouseOut={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.background=locked?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.07)";e.currentTarget.style.boxShadow="none";}}
              >
                {locked&&<div style={{position:"absolute",top:12,right:12,fontSize:18}}>🔒</div>}
                <div style={{fontSize:44,marginBottom:12}}>{cat.emoji}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:20,color:"white",marginBottom:6,direction:"rtl"}}>{cat.arabic}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:16,direction:"rtl"}}>{cat.desc}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,direction:"rtl"}}>
                  <span style={{background:cat.free?"#059669":"rgba(255,255,255,0.1)",borderRadius:20,padding:"4px 14px",fontFamily:"'Cairo',system-ui",fontSize:12,fontWeight:700,color:cat.free?"white":"rgba(255,255,255,0.5)"}}>
                    {cat.free?"✅ مجاني":"👑 Pro"}
                  </span>
                  <span style={{fontFamily:"'Cairo',system-ui",fontSize:12,color:"rgba(255,255,255,0.35)"}}>25 سؤال</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{textAlign:"center",marginTop:32,fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.3)"}}>
          🎮 اختر لعبة وابدأ رحلتك نحو الدرجة ٨ 🚀
        </div>
      </div>
      <style>{`@keyframes starTwinkle{from{opacity:0.2}to{opacity:0.9}}`}</style>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// IELTS GAME — COMPLETE SCREEN
// ─────────────────────────────────────────────────────────────
function IELTSGameComplete({answers,score,category,onReplay,onLobby,history=[],reviewIdx,setReviewIdx}){
  useEffect(()=>{ gameAudio.stopBg(); setTimeout(()=>gameAudio.complete(),200); },[]);
  const pct=Math.round((score/25)*100);
  const band=
    score===25?{medal:"🏆",title:"أنت البطل الحقيقي!",sub:"درجة كاملة! أنت أكثر من جاهز للايلتس 🔥",color:"#d4af37"}:
    score>=20?{medal:"🌟",title:"أداء رائع جداً!",sub:"مستوى ممتاز! خطوة صغيرة وتصبح البطل",color:"#10b981"}:
    score>=15?{medal:"💪",title:"تقريباً!",sub:"مستوى جيد — لكن يجب مراجعة المزيد قبل الامتحان",color:"#3b82f6"}:
    score>=10?{medal:"📚",title:"تحتاج إلى مزيد من التدريب",sub:"ما شاء الله على البداية — كرّر اللعبة ولاحظ الفرق",color:"#f97316"}:
    score>=7?{medal:"😅",title:"أنت في بداية الطريق!",sub:"جهد جيد — لكن الطريق لا يزال طويلاً، استمر!",color:"#8b5cf6"}:
    {medal:"😢",title:"لم تنجح هذه المرة!",sub:"لا تيأس! كل بطل بدأ من الصفر — العب مرةً أخرى 💪",color:"#ef4444"};
  const [tab,setTab]=useState("review"); // review | history
  // For answer review: navigate between questions
  const [ri,setRi]=useState(0);
  const ra=answers[ri];

  return(
    <div style={{minHeight:"calc(100vh - 64px)",background:"linear-gradient(160deg,#0a0f2e,#1e1b4b,#0a0f2e)",padding:"28px 16px",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Cairo',system-ui"}}>
      <div style={{maxWidth:680,width:"100%"}}>
        {/* Result header */}
        <div style={{textAlign:"center",marginBottom:20}}>
          <div style={{fontSize:64,marginBottom:6,animation:"celebratePop 0.6s cubic-bezier(0.16,1,0.3,1)"}}>{band.medal}</div>
          <div style={{fontWeight:900,fontSize:"clamp(18px,3vw,26px)",color:"white",marginBottom:5,direction:"rtl"}}>{band.title}</div>
          <div style={{fontSize:"clamp(12px,1.4vw,14px)",color:"rgba(255,255,255,0.5)",direction:"rtl",marginBottom:10}}>{band.sub}</div>
          <div style={{fontSize:"clamp(32px,5vw,52px)",fontWeight:900,color:band.color,lineHeight:1}}>{score}<span style={{fontSize:"0.5em",color:"rgba(255,255,255,0.3)"}}>/25</span></div>
        </div>
        {/* Progress bar */}
        <div style={{background:"rgba(255,255,255,0.08)",borderRadius:50,height:10,marginBottom:18,overflow:"hidden"}}>
          <div style={{height:"100%",background:band.color,width:`${pct}%`,borderRadius:50,transition:"width 1.2s cubic-bezier(0.22,1,0.36,1)",boxShadow:`0 0 10px ${band.color}88`}}/>
        </div>
        {/* Stats */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:18}}>
          {[[`${score}✅`,"صحيح"],[`${25-score}❌`,"خطأ"],[`${pct}%`,"نسبتك"]].map(([val,lbl])=>(
            <div key={lbl} style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{fontWeight:900,fontSize:18,color:"white",marginBottom:3}}>{val}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{lbl}</div>
            </div>
          ))}
        </div>
        {/* Tabs: Review / History */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["review","📋 مراجعة الإجابات"],["history","📈 سجل تقدمك"]].map(([t,l])=>(
            <button key={t} onClick={()=>setTab(t)} style={{flex:1,background:tab===t?"rgba(212,175,55,0.2)":"rgba(255,255,255,0.04)",border:tab===t?"1.5px solid #d4af37":"1px solid rgba(255,255,255,0.1)",borderRadius:10,padding:"10px",fontFamily:"'Cairo',system-ui",fontWeight:tab===t?700:500,fontSize:13,color:tab===t?"#d4af37":"rgba(255,255,255,0.5)",cursor:"pointer",direction:"rtl"}}>{l}</button>
          ))}
        </div>

        {/* ── REVIEW TAB ── with prev/next navigation */}
        {tab==="review"&&answers.length>0&&(
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:16,padding:"16px",border:"1px solid rgba(255,255,255,0.08)",marginBottom:18}}>
            {/* Navigator */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,direction:"rtl"}}>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",flex:1,justifyContent:"flex-start"}}>
                {answers.map((a,i)=>(
                  <button key={i} onClick={()=>setRi(i)} style={{width:26,height:26,borderRadius:6,border:"none",cursor:"pointer",fontWeight:800,fontSize:10,
                    background:ri===i?(a.ok?"#10b981":"#ef4444"):a.ok?"rgba(16,185,129,0.2)":"rgba(239,68,68,0.2)",
                    color:ri===i?"white":a.ok?"#6ee7b7":"#fca5a5",
                    boxShadow:ri===i?"0 0 0 2px white":""}}>{i+1}</button>
                ))}
              </div>
              <div style={{fontSize:12,color:"rgba(255,255,255,0.4)",flexShrink:0,marginRight:8}}>
                {ri+1}/{answers.length}
              </div>
            </div>
            {/* Current answer card */}
            {ra&&(
              <div style={{background:ra.ok?"rgba(16,185,129,0.08)":"rgba(239,68,68,0.08)",borderRadius:12,padding:"14px",border:`1px solid ${ra.ok?"rgba(16,185,129,0.25)":"rgba(239,68,68,0.25)"}`,direction:"rtl"}}>
                <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10}}>
                  <span style={{fontSize:16,flexShrink:0}}>{ra.ok?"✅":"❌"}</span>
                  <div style={{fontWeight:700,fontSize:"clamp(12px,1.4vw,14px)",color:"rgba(255,255,255,0.9)",lineHeight:1.5}}>{ra.q}</div>
                </div>
                {/* All options shown with highlights */}
                <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:ra.exp&&!ra.ok?10:0}}>
                  {ra.opts&&ra.opts.map((opt,oi)=>{
                    let bg="rgba(255,255,255,0.04)",border="1px solid rgba(255,255,255,0.1)",col="rgba(255,255,255,0.6)";
                    if(oi===ra.correct){bg="rgba(16,185,129,0.2)";border="1.5px solid #10b981";col="#6ee7b7";}
                    else if(oi===ra.chosen&&!ra.ok){bg="rgba(239,68,68,0.15)";border="1.5px solid #ef4444";col="#fca5a5";}
                    return(
                      <div key={oi} style={{background:bg,border,borderRadius:8,padding:"8px 12px",display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{color:"#d4af37",fontSize:11,fontWeight:700,width:16,flexShrink:0}}>{["أ","ب","ج","د"][oi]}</span>
                        <span style={{fontSize:"clamp(11px,1.3vw,13px)",color:col,fontWeight:oi===ra.correct?700:400}}>{opt}</span>
                        {oi===ra.correct&&<span style={{marginRight:"auto",fontSize:12}}>✓</span>}
                        {oi===ra.chosen&&!ra.ok&&<span style={{marginRight:"auto",fontSize:12}}>✗</span>}
                      </div>
                    );
                  })}
                </div>
                {!ra.ok&&ra.exp&&(
                  <div style={{background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.25)",borderRadius:8,padding:"8px 12px",fontSize:"clamp(11px,1.2vw,13px)",color:"#fde68a",lineHeight:1.5}}>💡 {ra.exp}</div>
                )}
              </div>
            )}
            {/* Prev / Next buttons */}
            <div style={{display:"flex",gap:8,marginTop:12,justifyContent:"center"}}>
              <button onClick={()=>setRi(r=>Math.max(0,r-1))} disabled={ri===0} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 20px",color:ri===0?"rgba(255,255,255,0.2)":"white",fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:13,cursor:ri===0?"not-allowed":"pointer"}}>→ السابق</button>
              <button onClick={()=>setRi(r=>Math.min(answers.length-1,r+1))} disabled={ri===answers.length-1} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 20px",color:ri===answers.length-1?"rgba(255,255,255,0.2)":"white",fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:13,cursor:ri===answers.length-1?"not-allowed":"pointer"}}>← التالي</button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab==="history"&&(
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:16,padding:"16px",border:"1px solid rgba(255,255,255,0.08)",marginBottom:18,maxHeight:300,overflowY:"auto"}}>
            {history.length===0?(
              <div style={{textAlign:"center",color:"rgba(255,255,255,0.3)",padding:"24px",direction:"rtl"}}>لم تلعب أي لعبة بعد — هذه هي أولى جلساتك! 🎮</div>
            ):(
              <>
                <div style={{fontWeight:700,color:"rgba(255,255,255,0.6)",fontSize:12,marginBottom:10,direction:"rtl",textAlign:"center"}}>آخر {history.length} جلسة</div>
                {history.map((h,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 12px",background:"rgba(255,255,255,0.04)",borderRadius:10,marginBottom:7,border:"1px solid rgba(255,255,255,0.06)",direction:"rtl"}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:13,color:"white"}}>{h.catName}</div>
                      <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:2}}>{h.date}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontWeight:900,fontSize:20,color:h.score>=20?"#d4af37":h.score>=15?"#10b981":h.score>=10?"#3b82f6":"#ef4444"}}>{h.score}<span style={{fontSize:12,color:"rgba(255,255,255,0.3)"}}>/{h.total}</span></div>
                      <div style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>{Math.round((h.score/h.total)*100)}%</div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
          <button onClick={onReplay} style={{background:band.color,border:"none",borderRadius:14,padding:"13px 24px",fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:14,color:band.color==="#d4af37"?"#0f172a":"white",cursor:"pointer",boxShadow:`0 4px 14px ${band.color}44`,transition:"opacity 0.2s"}}
            onMouseOver={e=>e.currentTarget.style.opacity="0.85"} onMouseOut={e=>e.currentTarget.style.opacity="1"}>
            🔄 العب مرةً أخرى
          </button>
          <button onClick={onLobby} style={{background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.18)",borderRadius:14,padding:"13px 24px",fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:14,color:"white",cursor:"pointer",transition:"background 0.2s"}}
            onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"} onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}>
            🎮 اختر لعبةً أخرى
          </button>
        </div>
      </div>
      <style>{`@keyframes celebratePop{from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}`}</style>
    </div>
  );
}

function IELTSGame({proUser,onNavigate}){
  const [screen,setScreen]=useState("lobby");
  const [cat,setCat]=useState(null);
  const [qIdx,setQIdx]=useState(0);
  const [gState,setGState]=useState("running");
  const [chosen,setChosen]=useState(null);
  const [correct,setCorrect]=useState(null);
  const [score,setScore]=useState(0);
  const [lives,setLives]=useState(3);
  const [answers,setAnswers]=useState([]);
  const [blockKey,setBlockKey]=useState(0);
  const [muted,setMuted]=useState(false);
  const [paused,setPaused]=useState(false);
  const [reviewIdx,setReviewIdx]=useState(null);
  const [showPrev,setShowPrev]=useState(false); // view-only previous question peek
  const getHistory=()=>{try{return JSON.parse(localStorage.getItem("ef_game_history")||"[]");}catch{return[];}};
  const saveHistory=(entry)=>{try{const h=getHistory();h.unshift(entry);localStorage.setItem("ef_game_history",JSON.stringify(h.slice(0,50)));}catch{}};

  const qs=cat?IELTS_GAME_QS[cat.id]:[];
  const cq=qs[qIdx]||qs[0];

  useEffect(()=>{
    if(screen==="playing"&&!paused) gameAudio.startBg();
    else gameAudio.stopBg();
    return()=>gameAudio.stopBg();
  },[screen,paused]);

  const toggleMute=()=>{ const m=gameAudio.toggleMute(); setMuted(m); };
  const togglePause=()=>setPaused(p=>!p);
  const startGame=(c)=>{ setCat(c); setScreen("intro"); };

  const beginPlaying=()=>{
    setScreen("playing"); setQIdx(0); setScore(0); setLives(3);
    setAnswers([]); setChosen(null); setCorrect(null);
    setGState("running"); setBlockKey(k=>k+1); setPaused(false);
  };

  const handleAnswer=(i)=>{
    if(chosen!==null||paused) return;
    setChosen(i);
    const ok=i===cq.a;
    setCorrect(ok);
    if(ok) gameAudio.correct(); else gameAudio.wrong();
    const newLives=ok?lives:lives-1;
    if(!ok) setLives(l=>l-1);
    if(ok) setScore(s=>s+1);
    const newAnswers=[...answers,{q:cq.q,opts:cq.opts,chosen:i,correct:cq.a,correctText:cq.opts[cq.a],exp:cq.exp||"",ok}];
    setAnswers(newAnswers);
    setTimeout(()=>{
      setChosen(null); setCorrect(null);
      if(qIdx+1>=25||newLives<=0){
        const finalScore=(ok?score+1:score);
        const entry={cat:cat.id,catName:cat.arabic,score:finalScore,total:qIdx+1,date:new Date().toLocaleDateString("ar-SA"),ts:Date.now()};
        const h=getHistory(); h.unshift(entry);
        try{localStorage.setItem("ef_game_history",JSON.stringify(h.slice(0,50)));}catch{}
        setScreen("complete");
      } else { setQIdx(j=>j+1); setGState("running"); setBlockKey(k=>k+1); setShowPrev(false); }
    },1500);
  };

  if(screen==="lobby") return <IELTSGameLobby proUser={proUser} onSelect={startGame}/>;

  if(screen==="intro"&&cat) return(
    <div style={{minHeight:"calc(100vh - 64px)",background:"linear-gradient(160deg,#0a0f2e,#1e1b4b)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"'Cairo',system-ui"}}>
      <div style={{maxWidth:480,width:"100%",background:"rgba(255,255,255,0.07)",border:`2px solid ${cat.color}55`,borderRadius:24,padding:"36px 32px",textAlign:"center",boxShadow:`0 0 60px ${cat.color}22`}}>
        <div style={{fontSize:56,marginBottom:12}}>{cat.emoji}</div>
        <div style={{fontWeight:900,fontSize:"clamp(20px,3vw,28px)",color:"white",marginBottom:6,direction:"rtl"}}>{cat.arabic}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:28,direction:"rtl"}}>هل أنت مستعد؟ إليك القواعد:</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28,direction:"rtl"}}>
          {[["🎯","25 سؤال في كل لعبة"],["❤️","3 أخطاء فقط — بعدها Game Over"],["🏃","اللوحة تأتي إليك تلقائياً"],["🔇","يمكنك كتم الموسيقى في أي وقت"],["⏸️","يمكنك إيقاف اللعبة مؤقتاً والعودة لها"],["💡","شرح الإجابات الخاطئة في النهاية"]].map(([ic,txt])=>(
            <div key={txt} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 14px"}}>
              <span style={{fontSize:18,flexShrink:0}}>{ic}</span>
              <span style={{fontWeight:600,fontSize:13,color:"rgba(255,255,255,0.85)"}}>{txt}</span>
            </div>
          ))}
        </div>
        <button onClick={beginPlaying} style={{width:"100%",background:cat.color,border:"none",borderRadius:14,padding:"16px",fontFamily:"'Cairo',system-ui",fontWeight:900,fontSize:17,color:"white",cursor:"pointer",boxShadow:`0 6px 20px ${cat.color}55`,transition:"transform 0.15s"}}
          onMouseOver={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseOut={e=>e.currentTarget.style.transform="scale(1)"}>
          🚀 ابدأ اللعبة!
        </button>
        <button onClick={()=>setScreen("lobby")} style={{marginTop:10,background:"transparent",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>← رجوع</button>
      </div>
    </div>
  );

  if(screen==="complete") return <IELTSGameComplete answers={answers} score={score} category={cat} reviewIdx={reviewIdx} setReviewIdx={setReviewIdx} onReplay={()=>{setCat(cat);setScreen("intro");}} onLobby={()=>setScreen("lobby")} history={getHistory()}/>;

  const stars=Array.from({length:55},(_,i)=>({x:(i*37+13)%100,y:(i*53+7)%55,r:i%7===0?3.5:i%3===0?2.5:1.5,dur:2+(i%4)*0.7,delay:i%5*0.4}));

  return(
    <div style={{position:"relative",height:"calc(100vh - 64px)",overflow:"hidden",userSelect:"none",fontFamily:"'Cairo',system-ui"}}>
      {/* Van Gogh Night Sky */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#0a0f2e 0%,#0d1a4a 20%,#1a2a6c 45%,#253b7e 60%,#2d5016 76%,#1a3a0d 100%)"}}/>
      <svg style={{position:"absolute",inset:0,width:"100%",height:"62%",opacity:0.3,pointerEvents:"none"}} viewBox="0 0 100 60" preserveAspectRatio="none">
        {["M10 30 Q25 10 40 30 Q55 50 70 30","M20 20 Q40 0 60 20 Q80 40 100 20","M0 40 Q20 20 40 40 Q60 60 80 40"].map((d,i)=>(
          <path key={i} d={d} stroke={["#d4af37","#7aa7e0","#c8b8f0"][i]} strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.8"/>
        ))}
        <circle cx="78" cy="12" r="7" fill="#fef9c3" opacity="0.95"/>
        <circle cx="75" cy="11" r="6.5" fill="#fdf6a0" opacity="0.55"/>
        {[10,14,18].map((r,i)=><circle key={i} cx="78" cy="12" r={r} fill="none" stroke="#d4af37" strokeWidth="0.4" opacity={0.28-i*0.07}/>)}
      </svg>
      {stars.map((s,i)=>(
        <div key={i} style={{position:"absolute",left:`${s.x}%`,top:`${s.y}%`,width:s.r*2,height:s.r*2,borderRadius:"50%",background:i%5===0?"#fef9c3":i%3===0?"#c8d8f8":"white",boxShadow:s.r>2?`0 0 ${s.r*4}px ${s.r}px ${i%5===0?"#d4af37aa":"#7aa7e055"}`:"none",animation:`twinkle ${s.dur}s ease-in-out ${s.delay}s infinite alternate`,pointerEvents:"none",zIndex:1}}/>
      ))}
      <svg style={{position:"absolute",bottom:72,left:0,right:0,width:"100%",height:100,pointerEvents:"none",zIndex:2}} viewBox="0 0 400 100" preserveAspectRatio="none">
        <path d="M0 80 Q50 40 100 60 Q150 80 200 50 Q250 20 300 55 Q350 80 400 60 L400 100 L0 100Z" fill="#1e4a10" opacity="0.85"/>
        <path d="M0 90 Q60 65 120 75 Q180 85 240 65 Q300 45 360 70 L400 75 L400 100 L0 100Z" fill="#2d5016"/>
        {[60,160,280,340].map((x,i)=><ellipse key={i} cx={x} cy={60-(i%2)*10} rx={5} ry={22-(i%2)*4} fill="#0f3d0a" opacity="0.9"/>)}
      </svg>
      {/* Ground */}
      <div style={{position:"absolute",bottom:0,left:0,right:0,height:72,zIndex:3}}>
        <div style={{height:10,background:"#3a6b1a",borderTop:"2px solid rgba(212,175,55,0.3)"}}/>
        <div style={{height:62,background:"linear-gradient(180deg,#1e3d0d,#0f2008)"}}/>
        <div style={{position:"absolute",top:10,left:0,right:0,height:6,overflow:"hidden"}}>
          <div style={{display:"flex",gap:0,animation:"groundScroll2 0.8s linear infinite",whiteSpace:"nowrap"}}>
            {Array.from({length:40}).map((_,i)=><div key={i} style={{width:32,height:3,background:i%2===0?"rgba(212,175,55,0.45)":"transparent",marginRight:20,flexShrink:0,borderRadius:2}}/>)}
          </div>
        </div>
      </div>
      {/* Walking question wall */}
      {gState==="running"&&!paused&&(
        <div key={blockKey} style={{position:"absolute",bottom:72,zIndex:6,animation:"blockWalkIn 1.6s linear forwards"}} onAnimationEnd={()=>setGState("question")}>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center"}}>
            <div style={{background:"#d4af37",border:"3px solid #92400e",borderRadius:8,width:48,height:48,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:24,color:"#0f172a",boxShadow:"0 4px 20px rgba(212,175,55,0.8)",animation:"blockBounce 0.5s ease-in-out infinite",marginBottom:4}}>?</div>
            <div style={{display:"flex",flexDirection:"column",gap:1}}>
              {Array.from({length:4}).map((_,row)=>(
                <div key={row} style={{display:"flex",gap:1}}>
                  {Array.from({length:3}).map((_,col)=><div key={col} style={{width:14,height:11,background:row%2===0&&col===1?"#1e3a5f":"#2d5a8e",border:"1px solid #0f2a4f",borderRadius:1}}/>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Character */}
      <div style={{position:"absolute",bottom:72,left:"18%",zIndex:10,animation:paused?"none":gState==="running"?"charBob 0.45s ease-in-out infinite":"charThink 1.2s ease-in-out infinite",filter:gState==="question"?"drop-shadow(0 0 12px #d4af37)":"none",transition:"filter 0.3s"}}>
        <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
          {gState==="question"&&<div style={{position:"absolute",top:-44,left:"50%",transform:"translateX(-50%)",background:"white",borderRadius:12,padding:"4px 10px",fontSize:16,fontWeight:900,color:cat.color,border:`2px solid ${cat.color}`,animation:"qBubble 0.8s ease-in-out infinite",whiteSpace:"nowrap",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>؟</div>}
          {correct===true&&<div style={{position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)",fontSize:20,animation:"coinBurst 0.5s ease-out forwards"}}>⭐</div>}
          <div style={{fontSize:0,lineHeight:0}}>
            <div style={{width:28,height:10,background:cat?cat.color:"#1e3a5f",borderRadius:"4px 4px 0 0",margin:"0 auto",marginBottom:-2}}/>
            <div style={{width:36,height:6,background:cat?cat.color:"#1e3a5f",borderRadius:2,margin:"0 auto"}}/>
          </div>
          <div style={{width:34,height:30,background:"#fde68a",borderRadius:"50% 50% 40% 40%",border:"2px solid #d97706",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
            {paused?"😴":gState==="question"?"🤔":correct===true?"😄":correct===false?"😬":"😊"}
          </div>
          <div style={{width:30,height:28,background:cat?cat.color:"#1e3a5f",border:`2px solid ${cat?(cat.color+"bb"):"#152a45"}`,borderRadius:4}}/>
          <div style={{display:"flex",gap:4,marginTop:1}}>
            <div style={{width:12,height:20,background:"#1e3a5f",borderRadius:"0 0 3px 3px",animation:(!paused&&gState==="running")?"legL 0.45s ease-in-out infinite":"none",transformOrigin:"top center"}}/>
            <div style={{width:12,height:20,background:"#1e3a5f",borderRadius:"0 0 3px 3px",animation:(!paused&&gState==="running")?"legR 0.45s ease-in-out infinite 0.225s":"none",transformOrigin:"top center"}}/>
          </div>
        </div>
      </div>
      {/* HUD */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:20,background:"rgba(10,15,46,0.85)",backdropFilter:"blur(8px)",borderBottom:"1px solid rgba(212,175,55,0.2)"}}>
        {/* Main row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px"}}>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            {Array.from({length:3}).map((_,i)=><span key={i} style={{fontSize:16,opacity:i<lives?1:0.2}}>❤️</span>)}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flex:1,padding:"0 8px"}}>
            <div style={{color:"rgba(255,255,255,0.85)",fontWeight:700,fontSize:"clamp(9px,1.2vw,11px)",direction:"rtl"}}>{cat.arabic} · {qIdx+1}/25</div>
            <div style={{width:"min(180px,38vw)",height:3,background:"rgba(255,255,255,0.1)",borderRadius:50,overflow:"hidden"}}>
              <div style={{height:"100%",background:"#d4af37",width:`${(qIdx/25)*100}%`,transition:"width 0.5s",borderRadius:50}}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{color:"#d4af37",fontWeight:800,fontSize:"clamp(12px,1.6vw,15px)"}}>⭐{score}</div>
            <button onClick={toggleMute} style={{background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:13,color:"white",display:"flex",alignItems:"center",justifyContent:"center"}}>{muted?"🔇":"🔊"}</button>
            <button onClick={togglePause} style={{background:paused?"#d4af37":"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:6,width:28,height:28,cursor:"pointer",fontSize:13,color:paused?"#0f172a":"white",display:"flex",alignItems:"center",justifyContent:"center"}}>{paused?"▶":"⏸"}</button>
          </div>
        </div>
        {/* Prev question button — full width strip below main row, only after Q1 */}
        {answers.length>0&&(
          <button onClick={()=>setShowPrev(p=>!p)} style={{width:"100%",background:showPrev?"rgba(212,175,55,0.25)":"rgba(255,255,255,0.05)",border:"none",borderTop:"1px solid rgba(255,255,255,0.08)",padding:"5px 10px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:6,fontFamily:"'Cairo',system-ui",fontSize:12,color:showPrev?"#d4af37":"rgba(255,255,255,0.45)",fontWeight:showPrev?700:400,transition:"all 0.2s"}}>
            {showPrev?"🔼 إخفاء السؤال السابق":"🔽 السؤال السابق — للمراجعة فقط"}
          </button>
        )}
      </div>
      {/* Pause overlay */}
      {paused&&(
        <div style={{position:"absolute",inset:0,zIndex:50,background:"rgba(10,15,46,0.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"rgba(255,255,255,0.07)",border:"2px solid rgba(212,175,55,0.4)",borderRadius:24,padding:"40px 32px",textAlign:"center",maxWidth:300}}>
            <div style={{fontSize:48,marginBottom:12}}>⏸️</div>
            <div style={{fontFamily:"'Cairo',system-ui",fontWeight:900,fontSize:22,color:"white",marginBottom:8,direction:"rtl"}}>اللعبة متوقفة مؤقتاً</div>
            <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:24,direction:"rtl"}}>سؤال {qIdx+1} من ٢٥ · نقاط: {score}</div>
            <button onClick={togglePause} style={{width:"100%",background:"#d4af37",border:"none",borderRadius:12,padding:"14px",fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:16,color:"#0f172a",cursor:"pointer",marginBottom:10}}>▶ متابعة اللعبة</button>
            <button onClick={()=>{gameAudio.stopBg();setScreen("lobby");}} style={{width:"100%",background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"11px",fontFamily:"'Cairo',system-ui",fontWeight:600,fontSize:14,color:"rgba(255,255,255,0.6)",cursor:"pointer"}}>🏠 رجوع للقائمة</button>
          </div>
        </div>
      )}
      {/* Previous Question Peek — view only, no re-answering */}
      {showPrev&&answers.length>0&&(()=>{
        const prev=answers[answers.length-1];
        const pq=qs[qIdx-1]||qs[0];
        return(
          <div style={{position:"absolute",top:52,left:"3%",right:"3%",zIndex:40,background:"rgba(15,23,46,0.98)",border:"1.5px solid rgba(212,175,55,0.5)",borderRadius:16,padding:"14px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.7)",animation:"feedbackPop 0.25s ease-out"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,direction:"rtl"}}>
              <div style={{fontFamily:"'Cairo',system-ui",fontSize:12,fontWeight:700,color:"#d4af37"}}>👁 السؤال السابق — للمراجعة فقط</div>
              <button onClick={()=>setShowPrev(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.5)",fontSize:18,cursor:"pointer",lineHeight:1}}>✕</button>
            </div>
            <div style={{fontFamily:"'Cairo',system-ui",fontSize:"clamp(12px,1.5vw,14px)",fontWeight:700,color:"white",direction:"rtl",marginBottom:10,lineHeight:1.4}}>{pq.q}</div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {pq.opts.map((opt,oi)=>{
                let bg="rgba(255,255,255,0.05)",border="1px solid rgba(255,255,255,0.1)",col="rgba(255,255,255,0.6)";
                if(oi===prev.correct){bg="rgba(16,185,129,0.2)";border="1.5px solid #10b981";col="#6ee7b7";}
                else if(oi===prev.chosen&&!prev.ok){bg="rgba(239,68,68,0.15)";border="1.5px solid #ef4444";col="#fca5a5";}
                return(
                  <div key={oi} style={{background:bg,border,borderRadius:8,padding:"7px 12px",display:"flex",alignItems:"center",gap:8,direction:"rtl"}}>
                    <span style={{color:"#d4af37",fontSize:10,fontWeight:700,width:14,flexShrink:0}}>{["أ","ب","ج","د"][oi]}</span>
                    <span style={{fontFamily:"'Cairo',system-ui",fontSize:"clamp(11px,1.2vw,13px)",color:col,flex:1}}>{opt}</span>
                    {oi===prev.correct&&<span style={{fontSize:12,flexShrink:0}}>✓</span>}
                    {oi===prev.chosen&&!prev.ok&&<span style={{fontSize:12,flexShrink:0}}>✗</span>}
                  </div>
                );
              })}
            </div>
            {!prev.ok&&prev.exp&&(
              <div style={{marginTop:8,background:"rgba(212,175,55,0.08)",border:"1px solid rgba(212,175,55,0.25)",borderRadius:8,padding:"7px 12px",fontSize:"clamp(10px,1.1vw,12px)",color:"#fde68a",direction:"rtl",lineHeight:1.5}}>💡 {prev.exp}</div>
            )}
          </div>
        );
      })()}

      {/* Question panel */}
      {gState==="question"&&!paused&&(
        <div style={{position:"absolute",bottom:72,left:"3%",right:"3%",zIndex:30,background:"rgba(15,23,46,0.97)",borderRadius:"20px 20px 0 0",boxShadow:"0 -8px 40px rgba(0,0,0,0.6)",animation:"panelSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)",padding:"16px 16px 12px",border:"1px solid rgba(212,175,55,0.3)",borderBottom:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12,direction:"rtl"}}>
            <div style={{background:cat.color,color:"white",borderRadius:50,width:26,height:26,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0}}>{qIdx+1}</div>
            <div style={{fontWeight:800,fontSize:"clamp(13px,1.7vw,15px)",color:"white",flex:1,direction:"rtl",textAlign:"right",lineHeight:1.4}}>{cq.q}</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            {cq.opts.map((opt,i)=>{
              let bg="rgba(255,255,255,0.07)",border="1px solid rgba(255,255,255,0.15)",col="rgba(255,255,255,0.9)";
              if(chosen!==null){
                if(i===cq.a){bg="rgba(16,185,129,0.25)";border="2px solid #10b981";col="#6ee7b7";}
                else if(i===chosen&&!correct){bg="rgba(239,68,68,0.2)";border="2px solid #ef4444";col="#fca5a5";}
              }
              return(
                <button key={i} onClick={()=>handleAnswer(i)} disabled={chosen!==null}
                  style={{background:bg,border,borderRadius:12,padding:"10px 12px",cursor:chosen===null?"pointer":"default",transition:"all 0.18s",display:"flex",alignItems:"center",gap:8,direction:"rtl"}}
                  onMouseOver={e=>{if(chosen===null) e.currentTarget.style.background="rgba(212,175,55,0.15)";}}
                  onMouseOut={e=>{if(chosen===null) e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
                >
                  <span style={{background:"rgba(212,175,55,0.2)",color:"#d4af37",borderRadius:50,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,flexShrink:0}}>{["أ","ب","ج","د"][i]}</span>
                  <span style={{fontFamily:"'Cairo',system-ui",fontSize:"clamp(11px,1.3vw,13px)",fontWeight:600,color:col,lineHeight:1.3,flex:1}}>{opt}</span>
                </button>
              );
            })}
          </div>
          {chosen!==null&&(
            <div style={{marginTop:10,direction:"rtl",animation:"feedbackPop 0.3s cubic-bezier(0.16,1,0.3,1)"}}>
              <div style={{textAlign:"center",fontWeight:800,fontSize:"clamp(12px,1.6vw,14px)",color:correct?"#10b981":"#ef4444",marginBottom:(!correct&&cq.exp)?5:0}}>
                {correct?"🎉 ممتاز! إجابة صحيحة!":"❌ الإجابة الصحيحة: "+cq.opts[cq.a]}
              </div>
              {!correct&&cq.exp&&(
                <div style={{background:"rgba(251,191,36,0.1)",border:"1px solid rgba(251,191,36,0.3)",borderRadius:8,padding:"7px 12px",fontSize:"clamp(11px,1.2vw,12px)",color:"#fde68a",fontWeight:600,textAlign:"right",lineHeight:1.5}}>💡 {cq.exp}</div>
              )}
            </div>
          )}
        </div>
      )}
      <style>{`
        @keyframes charBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
        @keyframes charThink{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-4px) rotate(-3deg)}}
        @keyframes legL{0%,100%{transform:rotate(-20deg)}50%{transform:rotate(20deg)}}
        @keyframes legR{0%,100%{transform:rotate(20deg)}50%{transform:rotate(-20deg)}}
        @keyframes groundScroll2{from{transform:translateX(0)}to{transform:translateX(-112px)}}
        @keyframes panelSlideUp{from{transform:translateY(110%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes qBubble{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-5px)}}
        @keyframes coinBurst{from{transform:translateX(-50%) translateY(0);opacity:1}to{transform:translateX(-50%) translateY(-45px);opacity:0}}
        @keyframes feedbackPop{from{transform:scale(0.85);opacity:0}to{transform:scale(1);opacity:1}}
        @keyframes blockWalkIn{from{left:105%}to{left:26%}}
        @keyframes blockBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes twinkle{from{opacity:0.2;transform:scale(0.8)}to{opacity:1;transform:scale(1.3)}}
      `}</style>
    </div>
  );
}


// ── TESTIMONIALS ─────────────────────────────────
const TESTIMONIALS=[
  {name:"سارة المطيري",country:"🇸🇦 الرياض",before:5.5,after:7.0,time:"6 أسابيع",quote:"كنت عالقة في 5.5 لأكثر من سنة. بعد ما حللت 20 مقالة على المنصة وفهمت أخطائي تحديداً، وصلت للدرجة 7 في المحاولة التالية. التحليل التفصيلي هو ما غيّر الأمر."},
  {name:"أحمد الشمري",country:"🇦🇪 دبي",before:6.0,after:7.5,time:"8 أسابيع",quote:"استخدمت المنصة للتدريب على الكتابة والقراءة معاً. الاختبارات التدريبية كانت قريبة جداً من مستوى الامتحان الحقيقي. حصلت على 7.5 وهذا تجاوز توقعاتي."},
  {name:"نور العبدالله",country:"🇯🇴 عمّان",before:5.0,after:6.5,time:"10 أسابيع",quote:"كنت ضعيفة في القواعد وما كنت أعرف لماذا. التمارين المصنّفة حسب النوع ساعدتني أركّز على نقاط ضعفي تحديداً. فرق كبير عن الكتب العادية."},
  {name:"محمد الحارثي",country:"🇸🇦 جدة",before:6.5,after:7.5,time:"5 أسابيع",quote:"أحتاج 7.5 للقبول في الدراسات العليا. جربت كتاباً بعد كتاب دون نتيجة. هنا فهمت أخيراً الفرق بين Band 7 و8 في الكتابة. المنصة موفّرة للوقت والمال مقارنةً بالكورسات."},
];

function TestimonialsSection(){
  const [active,setActive]=useState(0);
  const t=TESTIMONIALS[active];
  return(
    <div style={{background:"#f8fafc",borderTop:`1px solid #e2e8f0`,padding:"48px 24px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:"clamp(20px,2.5vw,28px)",color:"#1e3a5f",marginBottom:8}}>نتائج حقيقية من طلاب حقيقيين</div>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:14,color:"#64748b"}}>متوسط رفع الدرجة: +1.2 band خلال 6 أسابيع</div>
        </div>
        {/* Score improvement display */}
        <div style={{background:"white",borderRadius:16,padding:"28px 32px",boxShadow:"0 2px 12px rgba(0,0,0,0.07)",border:"1px solid #e2e8f0",marginBottom:20,direction:"rtl"}}>
          <div style={{display:"flex",alignItems:"flex-start",gap:16,marginBottom:20,flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:12,flex:1,minWidth:220}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:"#94a3b8",fontFamily:"'Cairo',system-ui",marginBottom:2}}>قبل</div>
                <div style={{fontSize:40,fontWeight:900,color:"#ef4444",fontFamily:"Inter,sans-serif",lineHeight:1}}>{t.before}</div>
              </div>
              <div style={{fontSize:24,color:"#d4af37",fontWeight:900}}>→</div>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:11,color:"#94a3b8",fontFamily:"'Cairo',system-ui",marginBottom:2}}>بعد</div>
                <div style={{fontSize:40,fontWeight:900,color:"#059669",fontFamily:"Inter,sans-serif",lineHeight:1}}>{t.after}</div>
              </div>
              <div style={{background:"#d1fae5",borderRadius:8,padding:"4px 12px",fontSize:13,fontWeight:700,color:"#059669",fontFamily:"'Cairo',system-ui",alignSelf:"center"}}>+{(t.after-t.before).toFixed(1)}</div>
            </div>
            <div style={{textAlign:"right",flex:1,minWidth:180}}>
              <div style={{fontWeight:700,fontSize:16,color:"#1e293b",fontFamily:"'Cairo',system-ui"}}>{t.name}</div>
              <div style={{fontSize:13,color:"#64748b",fontFamily:"'Cairo',system-ui",marginTop:2}}>{t.country} · خلال {t.time}</div>
              <div style={{display:"flex",gap:2,marginTop:4,justifyContent:"flex-end"}}>
                {Array.from({length:5}).map((_,i)=><span key={i} style={{fontSize:14,color:"#d4af37"}}>★</span>)}
              </div>
            </div>
          </div>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:15,color:"#334155",lineHeight:1.8,direction:"rtl",borderRight:"3px solid #d4af37",paddingRight:16}}>
            "{t.quote}"
          </div>
        </div>
        {/* Selector dots */}
        <div style={{display:"flex",justifyContent:"center",gap:8}}>
          {TESTIMONIALS.map((_,i)=>(
            <button key={i} onClick={()=>setActive(i)} style={{width:i===active?28:10,height:10,borderRadius:5,background:i===active?"#1e3a5f":"#cbd5e1",border:"none",cursor:"pointer",transition:"all 0.3s",padding:0}}/>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── FREE VS PRO COMPARISON ────────────────────────
function PricingComparisonStrip({onUpgrade}){
  const free=[
    "تقييم مقالة واحدة مجاناً (مقالتان بعد التسجيل)",
    "اختبار قراءة واحد فقط",
    "لعبتا الإملاء والقواعد",
    "30 دقيقة تدريب إجمالية (غير متجددة)",
    "10 فحوصات قواعد",
  ];
  const pro=[
    "تقييم غير محدود — Task 1 و Task 2",
    "جميع اختبارات القراءة الـ 7",
    "جميع الألعاب الـ 5 مفتوحة",
    "تدريبات غير محدودة — كل الفئات",
    "تحليل مفردات مع ترقية مقالتك لـ Band 8",
    "نماذج إجابة Band 8+ كاملة",
    "متابعة التقدم أسبوعياً",
    "فحص قواعد غير محدود",
  ];
  return(
    <div style={{background:"#1e3a5f",padding:"40px 24px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:"clamp(18px,2.5vw,26px)",color:"white",marginBottom:6}}>المجاني مقابل Pro — الفرق في ثانية</div>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)"}}>عرض الإطلاق: 3 أشهر بـ 10 دينار / $17 فقط</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,direction:"rtl"}}>
          {/* Free */}
          <div style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"20px 20px",border:"1px solid rgba(255,255,255,0.12)"}}>
            <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:16,color:"rgba(255,255,255,0.6)",marginBottom:16}}>المجاني</div>
            {free.map((f,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10,direction:"rtl"}}>
                <span style={{color:"#94a3b8",fontSize:13,flexShrink:0,marginTop:2}}>✗</span>
                <span style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)",lineHeight:1.5}}>{f}</span>
              </div>
            ))}
          </div>
          {/* Pro */}
          <div style={{background:"rgba(212,175,55,0.12)",borderRadius:12,padding:"20px 20px",border:"1.5px solid rgba(212,175,55,0.4)"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span style={{background:"#d4af37",color:"#1e3a5f",borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:800,fontFamily:"'Cairo',system-ui"}}>Pro</span>
              <span style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:16,color:"#d4af37"}}>كل شيء مفتوح</span>
            </div>
            {pro.map((f,i)=>(
              <div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:10,direction:"rtl"}}>
                <span style={{color:"#d4af37",fontSize:13,flexShrink:0,marginTop:2}}>✓</span>
                <span style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.85)",lineHeight:1.5}}>{f}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{textAlign:"center",marginTop:24}}>
          <button onClick={onUpgrade} style={{background:"#d4af37",color:"#1e3a5f",border:"none",borderRadius:10,padding:"14px 40px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui",boxShadow:"0 4px 16px rgba(212,175,55,0.4)"}}>
            احصل على Pro الآن ←
          </button>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:8}}>الإلغاء في أي وقت · دفع آمن عبر Paddle</div>
        </div>
      </div>
    </div>
  );
}

// ── ONBOARDING FIRST-VISIT BANNER ────────────────
function OnboardingBanner({onStart,onClose}){
  const [band,setBand]=useState(null);
  const bands=["أقل من 5","5.0 – 5.5","6.0 – 6.5","7.0+","لم أمتحن بعد"];
  if(band!==null) return(
    <div style={{background:"linear-gradient(135deg,#1e3a5f,#0d2347)",borderBottom:"2px solid rgba(212,175,55,0.3)",padding:"16px 24px",direction:"rtl"}}>
      <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:14,color:"white"}}>
          🎯 ابدأ بتقييم مقالتك الآن — الأول مجاناً تماماً
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onStart} style={{background:"#d4af37",color:"#1e3a5f",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>قيّم مقالتي ←</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"9px 14px",fontSize:13,color:"rgba(255,255,255,0.5)",cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>لاحقاً</button>
        </div>
      </div>
    </div>
  );
  return(
    <div style={{background:"linear-gradient(135deg,#1e3a5f,#0d2347)",borderBottom:"2px solid rgba(212,175,55,0.3)",padding:"20px 24px",direction:"rtl"}}>
      <div style={{maxWidth:700,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
          <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:"clamp(14px,2vw,18px)",color:"white"}}>👋 أهلاً! ما هي درجتك الحالية في الآيلتس؟</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"rgba(255,255,255,0.4)",fontSize:20,cursor:"pointer",padding:0,lineHeight:1}}>✕</button>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          {bands.map((b,i)=>(
            <button key={i} onClick={()=>setBand(i)} style={{background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"9px 16px",fontSize:13,fontWeight:600,color:"white",cursor:"pointer",fontFamily:"'Cairo',system-ui",transition:"all 0.2s"}}
              onMouseOver={e=>{e.currentTarget.style.background="rgba(212,175,55,0.2)";e.currentTarget.style.borderColor="#d4af37";}}
              onMouseOut={e=>{e.currentTarget.style.background="rgba(255,255,255,0.08)";e.currentTarget.style.borderColor="rgba(255,255,255,0.2)";}}>
              {b}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── MANAGE SUBSCRIPTION MODAL ──────────────────
function ManageSubModal({onClose,email=""}){
  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.55)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"white",borderRadius:16,padding:"32px 28px",maxWidth:440,width:"100%",boxShadow:"0 8px 40px rgba(0,0,0,0.18)",position:"relative",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
        <button onClick={onClose} style={{position:"absolute",top:14,right:14,background:"none",border:"none",fontSize:22,cursor:"pointer",color:"#94a3b8",lineHeight:1}}>✕</button>
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{fontSize:44,marginBottom:8}}>⚙️</div>
          <div style={{fontWeight:800,fontSize:20,color:"#1e293b",marginBottom:6,direction:"rtl"}}>إدارة اشتراكك</div>
          <div style={{fontSize:13,color:"#64748b",direction:"rtl",lineHeight:1.6}}>لإدارة أو إلغاء اشتراكك، ستحتاج للدخول على بوابة Paddle عبر إيميل إيصال الدفع.</div>
        </div>

        {/* Step by step */}
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:24,direction:"rtl"}}>
          {[
            ["1","افتح بريدك الإلكتروني","ابحث عن إيميل من Paddle (موضوعه: Your Englishfool receipt)"],
            ["2","اضغط على الرابط","داخل الإيميل ستجد زر أو رابط 'Manage subscription' أو 'Cancel'"],
            ["3","أكّد الإلغاء","ستُحتفظ بصلاحية Pro حتى نهاية الفترة المدفوعة"],
          ].map(([n,title,desc])=>(
            <div key={n} style={{display:"flex",gap:12,alignItems:"flex-start",background:"#f8fafc",borderRadius:10,padding:"12px 14px"}}>
              <div style={{background:"#1e3a5f",color:"white",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0,marginTop:1}}>{n}</div>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:"#1e293b",marginBottom:2}}>{title}</div>
                <div style={{fontSize:12,color:"#64748b",lineHeight:1.5}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Didn't get email? */}
        <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:8,padding:"10px 14px",marginBottom:20,direction:"rtl"}}>
          <div style={{fontSize:12,color:"#713f12",lineHeight:1.5}}>
            <strong>إذا لم تجد البريد الإلكتروني؟</strong> تحقق من مجلد Spam، أو تواصل معنا عبر صفحة <strong>Contact</strong> وسنساعدك في الإلغاء خلال 24 ساعة.
          </div>
        </div>

        <button onClick={onClose} style={{width:"100%",background:"#1e3a5f",color:"white",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          حسناً، فهمت
        </button>
      </div>
    </div>
  );
}

// ── URL Routing ──────────────────────────────
const ROUTE_MAP = {"/":"analyze","/terms":"terms","/privacy":"privacy","/refund":"refund","/pricing":"pricing","/practice":"practice","/progress":"progress","/toolkit":"toolkit","/contact":"contact","/grammar":"grammar","/exercises":"exercises","/admin":"admin","/speaking":"speaking","/reading":"reading","/game":"game"};
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
  const [showManageSub,setShowManageSub]=useState(false);
  const [showOnboarding,setShowOnboarding]=useState(()=>{try{return!localStorage.getItem("ef_onboarded");}catch{return true;}});
  const [showAuth,setShowAuth]=useState(false);
  const [showChangePassword,setShowChangePassword]=useState(false);
  const [session,setSession]=useState(null);
  const [uses,setUses]=useState(0);
  const [lang,setLang]=useState("en");
  const [menuOpen,setMenuOpen]=useState(false);
  const analyzeRef=useRef(null);
  const [proUser, setProUser] = useState(false);
  const [heroTab, setHeroTab] = useState(0);
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

  // ── Initialize Paddle.js ──
  useEffect(()=>{
    if(window.Paddle) return; // already loaded
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      if(window.Paddle){
        window.Paddle.Initialize({
          token: PADDLE_TOKEN,
          eventCallback: (ev) => {
            if(ev.name === "checkout.completed"){
              // Checkout succeeded — Pro will be activated by webhook
              // But also try to activate immediately via client-side
              const email = ev.data?.customer?.email || session?.email;
              if(email){
                fetch("/api/paddle/activate", {
                  method:"POST",
                  headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({email})
                }).then(()=>{
                  fetchProStatus(email).then(setProUser);
                  setShowPaywall(false);
                }).catch(console.error);
              } else {
                setProUser(true);
                setShowPaywall(false);
              }
            }
          }
        });
      }
    };
    document.head.appendChild(script);
  },[session]);

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

  const trySampleEssay=()=>{
    setTaskType("task2");
    setTopic(SAMPLE_ESSAY_TOPIC);
    setEssay(SAMPLE_ESSAY_TEXT);
    setResult(null);
    clearLastResult();
    setError("");
    switchView("analyze");
    // Auto-click analyze after a brief delay to let state update
    setTimeout(()=>{
      if(analyzeRef.current){
        analyzeRef.current.scrollIntoView({behavior:"smooth",block:"center"});
        setTimeout(()=>{ if(analyzeRef.current) analyzeRef.current.click(); },400);
      }
    },300);
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
  const PAGE_TITLES = {analyze:"Englishfool — منصة الآيلتس الشاملة | تقييم مقالات + ألعاب + اختبارات",practice:"تدريب الكتابة — Englishfool",progress:"متابعة التقدم — Englishfool",toolkit:"أدوات الآيلتس — Englishfool",contact:"تواصل معنا — Englishfool",grammar:"مدقق القواعد والإملاء — Englishfool",exercises:"تمارين الآيلتس — Englishfool",admin:"Admin — Englishfool",terms:"شروط الخدمة — Englishfool",privacy:"سياسة الخصوصية — Englishfool",refund:"سياسة الاسترداد — Englishfool",pricing:"الأسعار — Englishfool",speaking:"تدريب المحادثة — Englishfool",reading:"اختبارات القراءة — Englishfool",game:"ألعاب الآيلتس — Englishfool"};
  const PAGE_DESCS = {analyze:"احصل على تقييم فوري لمقالتك بناءً على معايير كامبريدج الأربعة. مع نماذج إجابة، تصحيح أخطاء، وخطة لرفع درجتك. جرّب مجاناً.",practice:"تدرّب على كتابة الآيلتس مع تغذية راجعة فورية لكل جملة. Task 1 و Task 2 بدعم من معايير Band 8+.",reading:"7 اختبارات قراءة آيلتس كاملة (Academic + General) مع مؤقت رسمي وتصحيح فوري.",speaking:"نماذج إجابة Band 8 لجميع أجزاء الآيلتس Speaking: Part 1, 2, 3 مع مفردات وأخطاء شائعة.",game:"تعلّم الآيلتس من خلال ألعاب تفاعلية: إملاء، قواعد، مفردات، كتابة، وقراءة.",pricing:"اشتراك Pro لمدة 3 أشهر بـ 10 دينار (الأردن) أو $17 (دولي). وصول كامل لجميع الأدوات.",default:"منصة Englishfool للتحضير للآيلتس — تقييم مقالات احترافي، اختبارات قراءة، ألعاب تدريبية، وتمارين قواعد."};
  const PAGE_PATHS = {analyze:"/",practice:"/practice",reading:"/reading",speaking:"/speaking",game:"/game",pricing:"/pricing",grammar:"/grammar",exercises:"/exercises",progress:"/progress",toolkit:"/toolkit",contact:"/contact"};

  const updateSEO=(view)=>{
    const title=PAGE_TITLES[view]||"Englishfool";
    const desc=PAGE_DESCS[view]||PAGE_DESCS.default;
    const path=PAGE_PATHS[view]||"/";
    const url=`https://www.englishfool.com${path}`;
    // Title
    document.title=title;
    // Description
    let metaDesc=document.querySelector("meta[name='description']");
    if(!metaDesc){metaDesc=document.createElement("meta");metaDesc.name="description";document.head.appendChild(metaDesc);}
    metaDesc.content=desc;
    // Canonical
    let canonical=document.querySelector("link[rel='canonical']");
    if(!canonical){canonical=document.createElement("link");canonical.rel="canonical";document.head.appendChild(canonical);}
    canonical.href=url;
    // Open Graph
    const ogTags={
      "og:title":title,
      "og:description":desc,
      "og:url":url,
      "og:type":"website",
      "og:image":"https://www.englishfool.com/og-image.png",
      "og:site_name":"Englishfool",
      "og:locale":"ar_AR",
    };
    Object.entries(ogTags).forEach(([prop,content])=>{
      let el=document.querySelector(`meta[property='${prop}']`);
      if(!el){el=document.createElement("meta");el.setAttribute("property",prop);document.head.appendChild(el);}
      el.content=content;
    });
    // Twitter Card
    const twitterTags={"twitter:card":"summary_large_image","twitter:title":title,"twitter:description":desc,"twitter:image":"https://www.englishfool.com/og-image.png"};
    Object.entries(twitterTags).forEach(([name,content])=>{
      let el=document.querySelector(`meta[name='${name}']`);
      if(!el){el=document.createElement("meta");el.name=name;document.head.appendChild(el);}
      el.content=content;
    });
  };

  const switchView=(view)=>{ 
    setMainView(view); 
    const path = VIEW_TO_PATH[view] || "/";
    if(window.location.pathname !== path) window.history.pushState({view}, "", path);
    updateSEO(view);
    window.scrollTo({top:0,behavior:'smooth'}); 
  };

  // Handle browser back/forward buttons
  useEffect(()=>{
    const onPop = () => { 
      const view = getViewFromPath();
      setMainView(view); 
      updateSEO(view);
      window.scrollTo({top:0}); 
    };
    window.addEventListener('popstate', onPop);
    updateSEO(mainView);
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
    <div style={{minHeight:"100vh",background:"#f9f9f9",fontFamily:"'Cairo','Source Sans Pro',system-ui,sans-serif",color:T.text}}>
      {showPaywall&&<PaywallModal onClose={()=>{setShowPaywall(false);setPaywallTab("cliq");}} onSuccess={handleProSuccess} session={session} initialTab={paywallTab} onRegister={()=>setShowAuth(true)}/>}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onSuccess={handleAuthSuccess}/>}
      {showChangePassword&&<ChangePasswordModal onClose={()=>setShowChangePassword(false)}/>}
      {showManageSub&&<ManageSubModal onClose={()=>setShowManageSub(false)} email={session?.email||""}/>}



      {/* NAV BAR 2 */}
      <div className="sticky-nav" style={{position:"sticky",top:0,zIndex:200,background:T.primary,borderBottom:`1px solid rgba(255,255,255,0.1)`,boxShadow:"0 2px 8px rgba(30,58,95,0.2)"}}>
        <div className="nav-inner" style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:64}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Logo size={26} style={{cursor:"pointer"}} onClick={()=>switchView("analyze")}/>
            {/* Mobile Home button — only shows on mobile */}
            <button className="mobile-home-btn" onClick={()=>switchView("analyze")} style={{display:"none",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.25)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:13,color:"white",fontFamily:"'Cairo',system-ui",fontWeight:700,alignItems:"center",gap:5,whiteSpace:"nowrap"}}>🏠 الرئيسية</button>
            {/* Hamburger — mobile only */}
            <button className="hamburger-btn" onClick={()=>setMenuOpen(true)} style={{display:"none",background:"none",border:"1.5px solid rgba(255,255,255,0.3)",borderRadius:10,padding:"8px 12px",cursor:"pointer",fontSize:20,color:"white",minWidth:44,minHeight:44,justifyContent:"center",alignItems:"center"}}>☰</button>
            <div className="nav-tabs" style={{display:"flex",gap:4,alignItems:"center"}}>
              <MainTab label="✍️ Writing" active={["analyze","practice","grammar","exercises"].includes(mainView)} onClick={()=>{switchView("analyze");trackEvent("nav_click",{page:"analyze"});}}/>
              <MainTab label="🗣️ Speaking" active={mainView==="speaking"} onClick={()=>{switchView("speaking");trackEvent("nav_click",{page:"speaking"});}}/>
              <MainTab label="📖 Reading" active={mainView==="reading"} onClick={()=>{switchView("reading");trackEvent("nav_click",{page:"reading"});}}/>
              <MainTab label="📚 Toolkit" active={mainView==="toolkit"} onClick={()=>{switchView("toolkit");trackEvent("nav_click",{page:"toolkit"});}}/>
              <MainTab label="📈 Progress" active={mainView==="progress"} onClick={()=>{switchView("progress");trackEvent("nav_click",{page:"progress"});}}/>
              <MainTab label="✉️ Contact" active={mainView==="contact"} onClick={()=>{switchView("contact");trackEvent("nav_click",{page:"contact"});}}/>
              <MainTab label="🎮 IELTS Game" active={mainView==="game"} onClick={()=>{switchView("game");trackEvent("nav_click",{page:"game"});}}/>
            </div>
          </div>
          <div className="nav-right" style={{display:"flex",alignItems:"center",gap:10}}>
            {proUser?(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:"#6ee7b7",fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✓ Pro</span>
                <button onClick={()=>setShowManageSub(true)} style={{fontSize:11,color:"rgba(255,255,255,0.45)",fontFamily:"'Cairo','Source Sans Pro',system-ui",textDecoration:"underline",cursor:"pointer",background:"none",border:"none",padding:0}}>إدارة الاشتراك</button>
              </div>
            ):(
              <button className="upgrade-btn" onClick={()=>setShowPaywall(true)} style={{background:T.accent,color:T.primary,border:"none",borderRadius:6,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:"0 2px 8px rgba(212,175,55,0.4)",letterSpacing:"0.01em"}}>🔓 احصل على Pro</button>
            )}
            <div style={{width:1,height:20,background:"rgba(255,255,255,0.15)"}}/>
            {session?(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:"rgba(255,255,255,0.8)",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>👤 {session.name||session.email.split("@")[0]}</span>
                <button onClick={()=>setShowChangePassword(true)} style={{background:"transparent",border:"none",fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.5)",cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",padding:0}}>🔑</button>
                <button onClick={handleSignOut} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.25)",borderRadius:4,padding:"6px 12px",fontSize:12,fontWeight:600,color:"rgba(255,255,255,0.7)",cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Sign Out</button>
              </div>
            ):(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={()=>setShowAuth(true)} style={{background:"transparent",color:"rgba(255,255,255,0.9)",border:"1.5px solid rgba(255,255,255,0.4)",borderRadius:4,padding:"7px 16px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Sign In →</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ONBOARDING — first visit only, on analyze page */}
      {showOnboarding&&mainView==="analyze"&&(
        <OnboardingBanner
          onStart={()=>{setShowOnboarding(false);try{localStorage.setItem("ef_onboarded","1");}catch{}window.scrollTo({top:600,behavior:"smooth"});}}
          onClose={()=>{setShowOnboarding(false);try{localStorage.setItem("ef_onboarded","1");}catch{};}}
        />
      )}

      {/* Writing Sub-Nav — shows on writing-related pages */}
      {["analyze","practice","grammar","exercises"].includes(mainView)&&(
        <div className="writing-subnav" style={{background:T.bgGray,borderBottom:`1px solid ${T.border}`,padding:"0 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:4,overflowX:"auto",padding:"8px 0"}} className="tab-row">
            {[{v:"analyze",l:"🎓 Analyze"},{v:"practice",l:"🖊️ Practice"},{v:"grammar",l:"✏️ Grammar & Spelling"},{v:"exercises",l:"🏋️ Exercises"}].map(t=>(
              <button key={t.v} onClick={()=>switchView(t.v)} style={{background:mainView===t.v?T.primaryLight:"white",border:`1px solid ${mainView===t.v?T.primaryBorder:T.border}`,borderRadius:6,padding:"6px 14px",fontSize:12,fontWeight:mainView===t.v?700:500,color:mainView===t.v?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",whiteSpace:"nowrap",flexShrink:0}}>{t.l}</button>
            ))}
          </div>
        </div>
      )}

      {/* Mobile Game Strip — replaces writing sub-nav on mobile, only on analyze page */}
      {mainView==="analyze"&&(
        <div className="mobile-game-strip" style={{display:"none",background:`linear-gradient(135deg,${T.primary},#0d2347)`,borderBottom:"2px solid rgba(212,175,55,0.3)",padding:"10px 16px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,direction:"rtl"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:20}}>🎮</span>
              <div>
                <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:13,color:"white"}}>IELTS Game</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontSize:11,color:"rgba(255,255,255,0.5)"}}>الإملاء · القواعد · المفردات · الكتابة · القراءة</div>
              </div>
            </div>
            <button onClick={()=>switchView("game")} style={{background:T.accent,color:T.primary,border:"none",borderRadius:8,padding:"8px 16px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui",whiteSpace:"nowrap"}}>
              العب 🕹️
            </button>
          </div>
        </div>
      )}

      {/* HERO — only on main writing page */}
      {mainView==="analyze"&&(<>
      <div style={{background:T.primary,position:"relative"}}>
        <div className="hero-inner" style={{maxWidth:1200,margin:"0 auto",padding:"0 24px",display:"flex",alignItems:"stretch",minHeight:340}}>
          <div className="hero-text" style={{flex:"0 0 55%",padding:"36px 40px 36px 0",display:"flex",flexDirection:"column",justifyContent:"center",zIndex:2}}>

            {/* Headline */}
            <div style={{direction:"rtl",textAlign:"right",marginBottom:16}}>
              <div style={{fontSize:"clamp(20px,2.5vw,30px)",fontWeight:800,color:"white",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.4,marginBottom:6}}>
                منصة الآيلتس الشاملة
              </div>
              <div style={{fontSize:"clamp(13px,1.5vw,16px)",color:"rgba(255,255,255,0.7)",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6,marginBottom:16}}>
                تقييم فوري · ألعاب تدريب · اختبارات قراءة · محادثة وقواعد
              </div>
              {/* Launch offer badges */}
              <div className="hero-prices" style={{display:"flex",gap:12,justifyContent:"flex-end",flexWrap:"wrap",marginBottom:16}}>
                <div style={{background:"rgba(255,255,255,0.08)",border:`1.5px solid ${T.accent}55`,borderRadius:14,padding:"12px 20px",textAlign:"center",flex:"0 0 auto"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600,marginBottom:4}}>🇯🇴 داخل الأردن · عرض إطلاق</div>
                  <div style={{fontFamily:"Inter,sans-serif",fontSize:32,fontWeight:900,color:T.accent,lineHeight:1}}>10 <span style={{fontSize:15,fontWeight:600}}>دينار</span></div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:3}}>3 أشهر · يجدد بـ ١٥ دينار</div>
                </div>
                <div style={{background:"rgba(255,255,255,0.08)",border:`1.5px solid ${T.accent}55`,borderRadius:14,padding:"12px 20px",textAlign:"center",flex:"0 0 auto"}}>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.6)",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600,marginBottom:4}}>🌍 دولي · عرض إطلاق</div>
                  <div style={{fontFamily:"Inter,sans-serif",fontSize:32,fontWeight:900,color:T.accent,lineHeight:1}}>$17</div>
                  <div style={{fontSize:10,color:"rgba(255,255,255,0.4)",fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:3}}>3 months · renews at $25</div>
                </div>
              </div>
            </div>

            {/* What you get */}
            <div style={{direction:"rtl",textAlign:"right",marginBottom:18}}>
              <div style={{fontSize:"clamp(14px,1.6vw,17px)",fontWeight:700,color:"rgba(255,255,255,0.85)",fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:10}}>
                ماذا ستحصل عليه؟
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {[
                  "تقييم فوري لمقالتك وفق معايير كامبريدج الأربعة",
                  "اختبارات قراءة كاملة مع مؤقت وتصحيح فوري",
                  "مواضيع محادثة مع نماذج إجابة بمستوى الدرجة ٨",
                  "تدريبات قواعد ومفردات — أكثر من ١٢٠ تمرين",
                  "كل غلطة في مقالتك محددة بالألوان مع التصحيح والشرح",
                  "ترقية مفردات من مقالتك نفسها لمستوى الدرجة ٨",
                  "نموذج إجابة كامل لنفس سؤالك",
                  "خطة واضحة لرفع درجتك — ليس تحليلاً فحسب"
                ].map((item,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,justifyContent:"flex-end",fontSize:"clamp(12px,1.3vw,14px)",color:"rgba(255,255,255,0.8)",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.5}}>
                    {item} <span style={{color:T.accent,fontSize:13,flexShrink:0}}>◆</span>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA buttons */}
            <div className="hero-btns" style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:12}}>
              <button onClick={trySampleEssay} style={{background:T.accent,color:T.primary,border:"none",borderRadius:10,padding:"14px 24px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:`0 4px 16px ${T.accent}55`,flex:1,minWidth:180,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.15s"}}
                onMouseOver={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 6px 20px ${T.accent}66`;}} onMouseOut={e=>{e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`0 4px 16px ${T.accent}55`;}}>
                🎯 قيّم مقالتك مجاناً
              </button>
              {!proUser&&(
                <button onClick={()=>setShowPaywall(true)} style={{background:"rgba(255,255,255,0.1)",color:"white",border:"1.5px solid rgba(255,255,255,0.35)",borderRadius:10,padding:"14px 24px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",flex:1,minWidth:180,display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all 0.15s"}}
                  onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.18)"} onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,0.1)"}>
                  🔓 احصل على Pro
                </button>
              )}
            </div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl"}}>
              💡 يجري تطوير المنصة باستمرار لتكون مرجعاً شاملاً للتحضير للآيلتس
            </div>

            {/* Mobile disclaimer */}
            <div style={{marginTop:10,background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:8,padding:"8px 14px",display:"none"}} className="mobile-disclaimer">
              <span style={{fontSize:12,color:"rgba(255,255,255,0.6)",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>📱 للحصول على أفضل تجربة، استخدم جهاز كمبيوتر أو لابتوب.</span>
            </div>
          </div>
          <div className="hero-image" style={{flex:"0 0 45%",position:"relative",display:"flex",alignItems:"center",justifyContent:"center",padding:"28px 0 28px 24px"}}>
            {(()=>{
              const tabs=[
                {icon:"✍️",label:"تحليل الكتابة",color:"#1e3a5f",points:["تقييم فوري وفق معايير كامبريدج الأربعة","تحديد كل غلطة بالألوان مع التصحيح","ترقية مفرداتك لمستوى الدرجة ٨","نموذج إجابة كامل لنفس سؤالك"]},
                {icon:"📖",label:"اختبارات القراءة",color:"#1d4ed8",points:["٧ اختبارات كاملة Academic وGeneral","مؤقت رسمي ٦٠ دقيقة مع تنبيهات","تصحيح فوري وحساب الدرجة","أسئلة T/F/NG، MCQ، وإكمال جمل"]},
                {icon:"🎤",label:"تدريب المحادثة",color:"#7c3aed",points:["Part 1, 2, 3 مع نماذج Band 8","مواضيع مفصّلة مع إجابات كاملة","مفردات مصنّفة حسب الوظيفة","أخطاء شائعة وكيف تتجنبها"]},
                {icon:"✏️",label:"قواعد وتدريبات",color:"#065f46",points:["أكثر من ١٢٠ تمرين متنوع","قواعد Grammar وإملاء فوري","تدريبات Paraphrasing وربط الجمل","تتبع تقدمك وتابع تطوّر درجتك"]},
              ];
              const t=tabs[heroTab];
              return(
                <div style={{width:"100%",direction:"rtl"}}>
                  {/* Tab headers — 2×2 grid so all 4 fit on mobile */}
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:0}}>
                    {tabs.map((tb,i)=>{
                      const active=heroTab===i;
                      return(
                        <button key={i} onClick={()=>setHeroTab(i)} style={{
                          background:active?"white":"rgba(255,255,255,0.15)",
                          border:active?"2px solid white":"2px solid rgba(255,255,255,0.3)",
                          borderBottom:active?"2px solid white":"2px solid rgba(255,255,255,0.3)",
                          borderRadius:active?"10px 10px 0 0":"10px 10px 0 0",
                          padding:"9px 10px",
                          cursor:"pointer",
                          color:active?t.color:"rgba(255,255,255,0.8)",
                          fontFamily:"'Cairo','Source Sans Pro',system-ui",
                          fontSize:"clamp(11px,1vw,13px)",
                          fontWeight:active?800:500,
                          transition:"all 0.2s",
                          transform:active?"translateY(3px)":"translateY(0)",
                          boxShadow:active?"0 -3px 10px rgba(0,0,0,0.15)":"none",
                          textAlign:"center",
                          display:"flex",alignItems:"center",justifyContent:"center",gap:5,
                        }}>
                          <span>{tb.icon}</span><span>{tb.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* Tab content card — white bg, red text */}
                  <div style={{
                    background:"white",
                    border:"2px solid white",
                    borderTop:"none",
                    borderRadius:"0 0 16px 16px",
                    padding:"20px 22px",
                    boxShadow:"0 8px 32px rgba(0,0,0,0.2)",
                  }}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,justifyContent:"flex-end"}}>
                      <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:"clamp(14px,1.5vw,17px)",fontWeight:800,color:t.color}}>{t.label}</div>
                      <div style={{fontSize:26,lineHeight:1}}>{t.icon}</div>
                    </div>

                    {heroTab===0?(
                      /* Writing tab — 4 sub-nav buttons */
                      <div style={{display:"flex",flexDirection:"column",gap:8}}>
                        {[
                          {label:"📝 حلّل مقالتك",action:()=>{switchView("analyze");setTimeout(()=>{if(analyzeRef.current){analyzeRef.current.scrollIntoView({behavior:"smooth",block:"center"});}},300);}},
                          {label:"🖊️ تدريب",action:()=>switchView("practice")},
                          {label:"✏️ قواعد وإملاء",action:()=>switchView("grammar")},
                          {label:"🏋️ تدريبات",action:()=>switchView("exercises")},
                        ].map((btn,i)=>(
                          <button key={i} onClick={btn.action} style={{
                            width:"100%",
                            background:"white",
                            border:`2px solid ${t.color}33`,
                            borderRadius:8,
                            padding:"11px 16px",
                            color:t.color,
                            fontFamily:"'Cairo','Source Sans Pro',system-ui",
                            fontSize:"clamp(13px,1.2vw,15px)",
                            fontWeight:700,
                            cursor:"pointer",
                            textAlign:"right",
                            direction:"rtl",
                            transition:"all 0.18s",
                          }}
                          onMouseOver={e=>{e.currentTarget.style.background=t.color;e.currentTarget.style.color="white";}}
                          onMouseOut={e=>{e.currentTarget.style.background="white";e.currentTarget.style.color=t.color;}}
                          >{btn.label}</button>
                        ))}
                      </div>
                    ):(
                      /* Other tabs — bullet points + Try Now button */
                      <>
                        <div style={{display:"flex",flexDirection:"column",gap:9}}>
                          {t.points.map((p,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:8,justifyContent:"flex-end"}}>
                              <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:"clamp(12px,1.2vw,14px)",color:"#1f2937",lineHeight:1.5,textAlign:"right"}}>{p}</div>
                              <span style={{color:t.color,fontSize:14,flexShrink:0,marginTop:3}}>◆</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={()=>{
                          const views=["analyze","reading","speaking","exercises"];
                          switchView(views[heroTab]);
                        }} style={{
                          marginTop:16,width:"100%",
                          background:t.color,
                          border:"none",
                          borderRadius:8,padding:"11px 16px",
                          color:"white",fontFamily:"'Cairo','Source Sans Pro',system-ui",
                          fontSize:"clamp(13px,1.2vw,15px)",fontWeight:700,cursor:"pointer",
                          transition:"opacity 0.2s",
                        }}
                        onMouseOver={e=>e.currentTarget.style.opacity="0.85"}
                        onMouseOut={e=>e.currentTarget.style.opacity="1"}
                        >
                          جرّب الآن ←
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>

      {/* STATS BAR */}
      <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"16px 24px"}}>
        <div className="stats-inner" style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:32,alignItems:"center",flexWrap:"wrap"}}>
          {[["9","Band levels covered"],["4","IELTS criteria scored"],["100%","Official band descriptors"],["Task 1 & 2","Academic + General Training"]].map(([num,label])=>(
            <div key={label} style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{color:T.primary,fontWeight:700,fontSize:18,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{num}</span>
              <span style={{color:T.textMuted,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* GAME PROMO STRIP — desktop only, always visible on homepage */}
      {mainView==="analyze"&&(
        <div className="desktop-game-strip" style={{background:`linear-gradient(135deg,${T.primary} 0%,#0d2347 100%)`,borderTop:"1px solid rgba(212,175,55,0.2)",padding:"12px 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,direction:"rtl"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:22}}>🎮</span>
              <div>
                <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:800,fontSize:14,color:"white"}}>IELTS Game — تعلّم من خلال اللعب</div>
                <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>الإملاء · القواعد · المفردات · الكتابة · القراءة</div>
              </div>
            </div>
            <button onClick={()=>switchView("game")} style={{background:T.accent,color:T.primary,border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:`0 2px 8px ${T.accent}44`,whiteSpace:"nowrap"}}>
              العب الآن 🕹️
            </button>
          </div>
        </div>
      )}

      {/* TESTIMONIALS — social proof on homepage */}
      {mainView==="analyze"&&<TestimonialsSection/>}

      {/* PRICING COMPARISON — clarity on free vs pro */}
      {mainView==="analyze"&&!proUser&&<PricingComparisonStrip onUpgrade={()=>setShowPaywall(true)}/>}

      {/* UPGRADE BANNER — shown to non-Pro users only */}
      {!proUser&&(
        <div style={{background:T.primary,borderTop:"1px solid rgba(255,255,255,0.08)",padding:"12px 24px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",direction:"rtl"}}>
              <span style={{fontSize:13,color:"rgba(255,255,255,0.9)",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>
                🎓 تحليل غير محدود · جميع الاختبارات · الألعاب · التدريبات
              </span>
              <span style={{background:`${T.accent}22`,border:`1px solid ${T.accent}66`,borderRadius:20,padding:"2px 12px",fontSize:12,color:T.accent,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>
                🇯🇴 CLIQ — 10 دينار (3 أشهر)
              </span>
            </div>
            <button onClick={()=>setShowPaywall(true)}
              style={{background:T.accent,color:T.primary,border:"none",borderRadius:6,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0,boxShadow:`0 2px 8px ${T.accent}44`}}>
              🔓 احصل على Pro →
            </button>
          </div>
        </div>
      )}
      </>)}

      {/* CONTENT AREA — visible on all non-policy pages */}
      {!["terms","privacy","refund","pricing"].includes(mainView)&&(
      <div className="content-outer" style={{maxWidth:1200,margin:"24px auto 80px",padding:"0 24px"}}>
        <div className="content-card" style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,padding:"32px",boxShadow:T.shadow}}>

        {/* ANALYZE */}
        {mainView==="analyze"&&(
          <div className="analyze-box" style={{background:"#ffffff",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",padding:"32px 28px"}}>
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:4,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>Select Task Type</label>
              <p style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:10,marginTop:0}}>Choose the type of writing task you are submitting. Task 2 is the essay. Task 1 Academic is for graphs/charts. Task 1 General is for letters.</p>
              <div className="task-grid" style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
                {Object.entries(TASK_TYPES).map(([key,task])=>(
                  <button key={key} onClick={()=>{ setTaskType(key); setResult(null); setImage(null); setImagePreview(null); setError(""); clearLastResult(); }}
                    style={{background:taskType===key?T.primaryLight:"#f9f9f9",border:`2px solid ${taskType===key?T.primary:T.border}`,borderRadius:8,padding:"20px 14px",cursor:"pointer",textAlign:"center",boxShadow:taskType===key?`0 0 0 2px ${T.primaryBorder}`:T.shadow,transition:"all 0.18s"}}>
                    <div style={{fontSize:22,marginBottom:6}}>{task.icon}</div>
                    <div style={{fontSize:13,fontWeight:600,color:taskType===key?T.primary:T.text,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:4}}>{task.label}</div>
                    <div style={{fontSize:11,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{task.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick-try sample */}
            {!essay.trim()&&!result&&(
              <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"14px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10}}>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🎯 First time? See it in action!</div>
                  <div style={{fontSize:12,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:2}}>Load a sample Band 6 essay and watch the AI analyze it — completely free.</div>
                </div>
                <button onClick={trySampleEssay} style={{background:T.green,color:"white",border:"none",borderRadius:8,padding:"9px 18px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0,boxShadow:"0 2px 6px rgba(0,120,90,0.3)"}}>
                  Load Sample Essay →
                </button>
              </div>
            )}

            {taskType==="task1academic"&&(
              <div style={{marginBottom:16}}>
                <label style={{display:"block",fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>Upload Graph / Chart Image *</label>
                <div onClick={()=>fileRef.current.click()} style={{border:`2px dashed ${imagePreview?T.greenBorder:"#e2001a"}`,borderRadius:12,padding:"20px",textAlign:"center",cursor:"pointer",background:"white",boxShadow:T.shadow}}>
                  {imagePreview?(<div><img src={imagePreview} alt="graph" style={{maxHeight:180,maxWidth:"100%",borderRadius:8,marginBottom:8}}/><div style={{fontSize:12,color:T.green,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>✓ Uploaded — click to change</div></div>):(<div><div style={{fontSize:32,marginBottom:8}}>📊</div><div style={{fontSize:14,color:T.gold,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:4}}>Click to upload graph/chart image</div><div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>JPG, PNG — reads and evaluates the graph</div></div>)}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} style={{display:"none"}}/>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <label style={{fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>
                    {taskType==="task1general"?"Letter Task Instructions":taskType==="task1academic"?"Task Description":"Essay Question / Topic"}
                  </label>
                  <button type="button" onClick={()=>topicImgRef.current.click()}
                    style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"4px 10px",fontSize:11,color:T.blue,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    {processingTopicImg ? "⏳ Reading..." : "📷 Upload Image"}
                  </button>
                  <input ref={topicImgRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    onChange={e=>{ if(e.target.files[0]) extractTextFromImage(e.target.files[0],"topic"); }}/>
                </div>
                <textarea value={topic} onChange={e=>setTopic(e.target.value)} rows={3}
                  placeholder={taskType==="task2"?"e.g. Some people think universities should focus on job skills. Discuss both views and give your opinion.":taskType==="task1academic"?"e.g. The graph below shows changes in energy consumption. Summarise the information and make comparisons.":"e.g. You recently bought a laptop online but it arrived damaged. Write a letter to the manager."}
                  style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              </div>
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7,flexWrap:"wrap",gap:6}}>
                  <label style={{fontSize:11,color:T.textMid,letterSpacing:"0.08em",textTransform:"uppercase",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>
                    Student's Response
                    <span style={{fontSize:11,color:T.textMuted,fontWeight:400,textTransform:"none",letterSpacing:0}}> (minimum {minWords} words required)</span>
                    <span style={{color:wordCount>=minWords?T.green:wordCount>=(minWords*0.6)?T.amber:T.red,marginLeft:10,fontWeight:500}}>
                      {wordCount} words {wordCount>=minWords?"✓":`(min. ${minWords} required)`}
                    </span>
                  </label>
                  <button type="button" onClick={()=>essayImgRef.current.click()}
                    style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"4px 10px",fontSize:11,color:T.blue,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                    {processingEssayImg ? "⏳ Reading..." : "📷 Upload Image"}
                  </button>
                  <input ref={essayImgRef} type="file" accept="image/*" capture="environment" style={{display:"none"}}
                    onChange={e=>{ if(e.target.files[0]) extractTextFromImage(e.target.files[0],"essay"); }}/>
                </div>
                <textarea value={essay} onChange={e=>setEssay(e.target.value)}
                  placeholder={taskType==="task1general"?"Dear Sir/Madam,\n\nI am writing to...":taskType==="task1academic"?"The graph illustrates...":"Paste the student's essay here..."}
                  rows={10}
                  style={{width:"100%",background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,fontSize:14,padding:"12px 14px",resize:"vertical",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.8,outline:"none",boxSizing:"border-box",transition:"border-color 0.2s"}}/>
              </div>
              {error&&<Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`}}><p style={{color:T.red,fontSize:14,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{error}</p></Card>}
              {!proUser&&usesLeft===1&&!session&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>⚠️ This is your free analysis. </span>
                  <button onClick={()=>setShowAuth(true)} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Sign up for 1 more</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}> or </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>upgrade to Pro</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}> for unlimited access.</span>
                </Card>
              )}
              {!proUser&&usesLeft===1&&session&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>⚠️ Last free analysis! </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.gold,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Upgrade to Pro</button>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}> for unlimited access.</span>
                </Card>
              )}
              <button ref={analyzeRef} onClick={analyze} disabled={loading}
                style={{background:loading?T.bgGray:T.primary,border:"none",borderRadius:4,color:loading?T.textMuted:"#fff",fontSize:15,fontWeight:700,padding:"14px 32px",cursor:loading?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",transition:"background 0.15s",display:"flex",alignItems:"center",gap:10,justifyContent:"center",letterSpacing:"0.01em"}}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?(session?"🔓 Upgrade to Continue":"🔓 Sign Up for 1 More Free"):`Analyze ${TASK_TYPES[taskType].label} →`}
              </button>

              {/* Language Selector */}
              <Card style={{background:T.bgGray,border:`1px solid ${T.border}`,marginTop:4}}>
                <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:12,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🌐 Feedback Language / لغة التغذية الراجعة</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:lang==="en"?T.primaryLight:"white",border:`1px solid ${lang==="en"?T.primaryBorder:T.border}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s"}} onClick={()=>switchLang("en")}>
                    <div style={{fontSize:22,flexShrink:0}}>🇬🇧</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:lang==="en"?T.primary:T.text,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:2}}>English — Feedback in English</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>All scores, corrections and tips will appear in English.</div>
                    </div>
                    {lang==="en"&&<span style={{background:T.primary,color:"white",borderRadius:4,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>✓ Active</span>}
                  </div>
                  <div style={{display:"flex",alignItems:"flex-start",gap:12,padding:"10px 14px",background:lang==="ar"?T.primaryLight:"white",border:`1px solid ${lang==="ar"?T.primaryBorder:T.border}`,borderRadius:10,cursor:"pointer",transition:"all 0.2s",direction:"ltr"}} onClick={()=>switchLang("ar")}>
                    <div style={{fontSize:22,flexShrink:0}}>🇸🇦</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,fontWeight:700,color:lang==="ar"?T.primary:T.text,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:2}}>عربي — التغذية الراجعة بالعربية</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl",textAlign:"right"}}>ستظهر جميع الدرجات والتصحيحات والنصائح باللغة العربية.</div>
                    </div>
                    {lang==="ar"&&<span style={{background:T.primary,color:"white",borderRadius:4,padding:"2px 10px",fontSize:11,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0}}>✓ نشط</span>}
                  </div>
                </div>
              </Card>
            </div>

            {result&&(
              <div style={{marginTop:32}}>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button onClick={()=>{ setResult(null); clearLastResult(); setTopic(""); setEssay(""); window.scrollTo({top:0,behavior:"smooth"}); }}
                    style={{background:T.bgGray,border:`1px solid ${T.border}`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
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
                      <span style={{background:"white",border:`1px solid ${T.border}`,borderRadius:20,padding:"2px 10px",fontSize:12,color:wordCount>=minWords?T.green:T.red,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>
                        {wordCount} words {wordCount>=minWords?"✓":"⚠ below minimum"}
                      </span>
                    </div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {result.strengths?.map((s,i)=><span key={i} style={{background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:20,padding:"3px 12px",fontSize:12,color:"rgba(255,255,255,0.9)",fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>✓ {s}</span>)}
                    </div>
                  </div>
                </div>

                {result.mistakes?.length>0&&(
                  <Card style={{marginBottom:16,background:T.bgGray}}>
                    <div style={{marginBottom:8}}>
                      <div style={{fontSize:13,color:T.text,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:2,fontWeight:700}}>👆 Click any underlined word to see its correction and explanation.</div>
                      <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl",textAlign:"right",marginBottom:8}}>اضغط على أي كلمة تحتها خط لرؤية التصحيح والشرح.</div>
                    </div>
                    <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                      {[["major",T.red,"Major — خطأ كبير"],["moderate",T.amber,"Moderate — خطأ متوسط"],["minor",T.blue,"Minor — خطأ بسيط"]].map(([s,c,l])=>(
                        <span key={s} style={{fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",alignItems:"center",gap:4}}>
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
                    <div style={{fontSize:11,color:T.textMid,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:16,fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
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
                        <div style={{fontSize:11,color:T.amber,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Key Improvements Needed</div>
                        {result.improvements.map((imp,i)=><div key={i} style={{color:T.textMid,fontSize:14,lineHeight:1.6,marginBottom:4,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>→ {imp}</div>)}
                      </Card>
                    )}
                  </div>
                )}

                {activeTab==="mistakes"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:4}}>
                      {[["major",T.red],["moderate",T.amber],["minor",T.blue]].map(([s,c])=>(
                        <span key={s} style={{background:"white",border:`1px solid ${c}60`,borderRadius:20,padding:"3px 10px",fontSize:11,color:c,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600}}>● {s}</span>
                      ))}
                      <span style={{color:T.textMuted,fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",alignSelf:"center"}}>— {result.mistakes?.length} total</span>
                    </div>
                    {result.mistakes?.length===0?<Card style={{textAlign:"center",color:T.green,padding:36,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>No mistakes — excellent!</Card>:result.mistakes.map((m,i)=><MistakeCard key={i} mistake={m} i={i} essay={essay}/>)}
                  </div>
                )}

                {activeTab==="booster"&&result.bandBooster&&(
                  <Card style={{background:"#f5f5f5",border:`1px solid ${T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,flexWrap:"wrap"}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize:36,fontWeight:900,color:bandColor(result.bandBooster.currentBand),fontFamily:"Georgia,serif"}}>{result.bandBooster.currentBand}</div><div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase"}}>Current</div></div>
                      <div style={{fontSize:24,color:T.red}}>→</div>
                      <div style={{textAlign:"center"}}><div style={{fontSize:36,fontWeight:900,color:bandColor(result.bandBooster.targetBand),fontFamily:"Georgia,serif"}}>{result.bandBooster.targetBand}</div><div style={{fontSize:10,color:T.textMuted,fontFamily:"monospace",textTransform:"uppercase"}}>Target</div></div>
                      <div style={{flex:1}}><div style={{fontSize:14,color:T.gold,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>What to do:</div></div>
                    </div>
                    {result.bandBooster.specificActions?.map((a,i)=>(
                      <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start",marginBottom:10}}>
                        <span style={{background:T.red,borderRadius:2,width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:700,flexShrink:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{i+1}</span>
                        <p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{a}</p>
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
                        <p style={{color:T.textMid,fontSize:13,margin:0,lineHeight:1.6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>💡 {v.reason}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="tips"&&(
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {result.examinerTips?.map((tip,i)=>(
                      <Card key={i} style={{display:"flex",gap:14,alignItems:"flex-start"}}>
                        {/* FIX 2: tip number circles — solid red background so number is visible */}
                        <span style={{background:T.red,border:"none",borderRadius:"50%",width:28,height:28,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"white",fontWeight:700,flexShrink:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{i+1}</span>
                        <p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{tip}</p>
                      </Card>
                    ))}
                  </div>
                )}

                {activeTab==="sample"&&result.sampleEssay&&(
                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                        <div style={{fontSize:11,color:T.green,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Band 8+ Model Response</div>
                        <div style={{fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:600,color:sampleWordCount>=minWords?T.green:T.red}}>{sampleWordCount} words {sampleWordCount>=minWords?"✓":"⚠ below minimum"}</div>
                      </div>
                      <p style={{color:T.text,fontSize:15,lineHeight:1.9,whiteSpace:"pre-wrap",margin:0,fontFamily:"Georgia,serif"}}>{result.sampleEssay}</p>
                    </Card>
                    {result.sampleEssayExplanation&&(
                      <Card>
                        <div style={{fontSize:11,color:T.blue,fontWeight:700,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:14,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Why This Response Scores High</div>
                        <div style={{display:"flex",flexDirection:"column",gap:12}}>
                          {[["Introduction",result.sampleEssayExplanation.introduction],["Body Paragraphs",result.sampleEssayExplanation.bodyParagraphs],["Conclusion",result.sampleEssayExplanation.conclusion]].map(([lbl,txt])=>(
                            <div key={lbl}><div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:4,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{lbl}</div><p style={{color:T.textMid,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{txt}</p></div>
                          ))}
                          {result.sampleEssayExplanation.vocabularyHighlights?.length>0&&(
                            <div>
                              <div style={{fontSize:11,color:T.amber,fontWeight:700,marginBottom:6,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Advanced Vocabulary Used</div>
                              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{result.sampleEssayExplanation.vocabularyHighlights.map((v,i)=><span key={i} style={{background:T.blueBg,border:`1px solid ${T.blueBorder}`,borderRadius:6,padding:"2px 9px",fontSize:12,color:T.blue,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>{v}</span>)}</div>
                            </div>
                          )}
                          <Card style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`}}><p style={{color:T.green,fontSize:14,lineHeight:1.7,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>🏆 {result.sampleEssayExplanation.whyHighScore}</p></Card>
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
        {mainView==="game"&&<IELTSGame proUser={proUser} onNavigate={switchView}/>}
        </div>
      </div>
      )}

      {mainView==="terms"&&<TermsPage onBack={()=>switchView("analyze")}/>}
      {mainView==="privacy"&&<PrivacyPage onBack={()=>switchView("analyze")}/>}
      {mainView==="refund"&&<RefundPage onBack={()=>switchView("analyze")}/>}
      {mainView==="pricing"&&<PricingPage onBack={()=>switchView("analyze")} onUpgrade={()=>setShowPaywall(true)} isPro={proUser} onManageSub={()=>setShowManageSub(true)}/> }
      {mainView==="admin"&&<AdminPage onBack={()=>{ setMainView("analyze"); window.history.replaceState({view:"analyze"},""," /"); }}/>}

      {/* FOOTER */}
      <div style={{background:"#1c1d1f",borderTop:"1px solid #333",padding:"32px 24px",marginTop:40}}>
        <div style={{maxWidth:1200,margin:"0 auto"}}>
          <div className="footer-top" style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:16,marginBottom:20}}>
            <Logo size={20} style={{cursor:"default"}}/>
            <div className="footer-links" style={{display:"flex",gap:24,flexWrap:"wrap"}}>
              {[["terms","Terms of Service"],["privacy","Privacy Policy"],["refund","Refund Policy"],["pricing","Pricing"]].map(([key,label])=>(
                <button key={key} onClick={()=>switchView(key)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.6)",fontSize:13,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",padding:0}}>{label}</button>
              ))}
            </div>
          </div>
          <div style={{borderTop:"1px solid rgba(255,255,255,0.08)",paddingTop:16,display:"flex",flexDirection:"column",gap:8}}>
            <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>© 2025 Englishfool. All rights reserved.</span>
              <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>منصة احترافية للتحضير لامتحان الآيلتس</span>
            </div>
            <span style={{color:"rgba(255,255,255,0.25)",fontSize:11,fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl"}}>منصة Englishfool غير تابعة لـ Cambridge أو British Council أو IDP</span>
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
            <div style={{fontSize:17,fontWeight:700,color:"#1f1f1f",fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:8}}>
              Analysing your essay...
            </div>
            <div style={{fontSize:13,color:"#636363",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6}}>
              Please stay on this page.<br/>This usually takes 15–30 seconds.
            </div>
          </div>
        </div>
      )}

      {/* ── MOBILE HAMBURGER MENU OVERLAY ── */}
      {menuOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:500,background:"rgba(0,0,0,0.4)",backdropFilter:"blur(2px)"}} onClick={()=>setMenuOpen(false)}>
          <div style={{
            position:"absolute",top:0,right:0,width:"min(320px, 85vw)",height:"100%",
            background:"white",boxShadow:"-4px 0 24px rgba(0,0,0,0.18)",
            display:"flex",flexDirection:"column",padding:"0 0 32px",
            animation:"slideIn 0.2s ease-out"
          }} onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"18px 20px",background:T.primary,borderBottom:`1px solid rgba(255,255,255,0.1)`}}>
              <Logo size={20} onClick={()=>{switchView("analyze");setMenuOpen(false);}}/>
              <button onClick={()=>setMenuOpen(false)} style={{background:"none",border:"none",fontSize:22,cursor:"pointer",color:"rgba(255,255,255,0.7)",padding:4}}>✕</button>
            </div>
            {/* Quick nav tabs at top of menu */}
            <div style={{display:"flex",gap:6,padding:"12px 16px",borderBottom:`1px solid ${T.border}`,flexWrap:"wrap"}}>
              {[{view:"analyze",icon:"✍️",label:"Writing"},{view:"speaking",icon:"🗣️",label:"Speaking"},{view:"reading",icon:"📖",label:"Reading"},{view:"toolkit",icon:"📚",label:"Toolkit"},{view:"game",icon:"🎮",label:"Game"}].map(item=>(
                <button key={item.view} onClick={()=>{switchView(item.view);setMenuOpen(false);}}
                  style={{flex:1,background:mainView===item.view?T.primaryLight:T.bgGray,border:`1.5px solid ${mainView===item.view?T.primaryBorder:T.border}`,borderRadius:10,padding:"10px 4px",fontSize:12,fontWeight:700,color:mainView===item.view?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",display:"flex",flexDirection:"column",alignItems:"center",gap:3,minHeight:52}}>
                  <span style={{fontSize:18}}>{item.icon}</span>{item.label}
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
                {view:"game",icon:"🎮",label:"🎮 IELTS Game"},
              ].map(item=>(
                <button key={item.view} onClick={()=>{switchView(item.view);setMenuOpen(false);}}
                  style={{
                    width:"100%",background:mainView===item.view?T.primaryLight:"transparent",
                    border:"none",borderLeft:mainView===item.view?`4px solid ${T.primary}`:"4px solid transparent",
                    padding:"16px 20px",display:"flex",alignItems:"center",gap:14,
                    cursor:"pointer",textAlign:"left",minHeight:50,
                    color:mainView===item.view?T.primary:T.text,
                    fontSize:15,fontWeight:mainView===item.view?700:500,
                    fontFamily:"'Cairo','Source Sans Pro',system-ui"
                  }}>
                  <span style={{fontSize:20}}>{item.icon}</span>{item.label}
                </button>
              ))}
              <div style={{height:1,background:T.border,margin:"12px 20px"}}/>
              {/* Language switcher inside menu */}
              <div style={{padding:"8px 20px"}}>
                <div style={{fontSize:11,color:T.textMuted,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:8,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Feedback Language</div>
                <div style={{display:"flex",gap:8}}>
                  {["en","ar"].map(l=>(
                    <button key={l} onClick={()=>switchLang(l)} style={{
                      flex:1,background:lang===l?T.primaryLight:"transparent",
                      border:`1px solid ${lang===l?T.primaryBorder:T.border}`,
                      borderRadius:8,padding:"8px",fontSize:13,fontWeight:lang===l?700:400,
                      color:lang===l?T.primary:T.textMuted,cursor:"pointer",
                      fontFamily:"'Cairo','Source Sans Pro',system-ui"
                    }}>{l==="en"?"🇬🇧 English":"🇸🇦 عربي"}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Upgrade button at bottom of menu */}
            {!proUser&&(
              <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>{setShowPaywall(true);setMenuOpen(false);}} style={{
                  width:"100%",background:T.primary,color:"white",border:"none",
                  borderRadius:8,padding:"14px",fontSize:14,fontWeight:700,
                  cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:"0 2px 8px rgba(0,86,210,0.35)"
                }}>🔓 Upgrade to Pro — $17</button>
                <button onClick={()=>{setShowPaywall(true);setMenuOpen(false);}} style={{
                  width:"100%",background:"#f0fdf4",color:T.green,border:`1px solid ${T.greenBorder}`,
                  borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,
                  cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"
                }}>🇯🇴 Jordan: Pay 10 JOD via CLIQ</button>
              </div>
            )}
            {proUser&&(
              <div style={{padding:"0 20px"}}>
                <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"12px 16px",textAlign:"center",fontSize:13,color:T.green,fontWeight:700,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginBottom:8}}>✓ Pro — Unlimited Access</div>
                <button onClick={()=>{setShowManageSub(true);setMenuOpen(false);}}
                  style={{display:"block",width:"100%",textAlign:"center",background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"rtl"}}>
                  ⚙️ إدارة الاشتراك أو الإلغاء
                </button>
              </div>
            )}
            <div style={{padding:"12px 20px 0"}}>
              {session?(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <button onClick={()=>{setShowChangePassword(true);setMenuOpen(false);}} style={{width:"100%",background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    🔑 Change Password
                  </button>
                  <button onClick={handleSignOut} style={{width:"100%",background:"#f3f3f3",border:`1px solid ${T.border}`,borderRadius:8,padding:"12px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    🚪 Sign Out ({session.email})
                  </button>
                </div>
              ):(
                <button onClick={()=>{setShowAuth(true);setMenuOpen(false);}} style={{width:"100%",background:T.primary,color:"white",border:"none",borderRadius:8,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Sign In / Register →</button>
              )}
            </div>
          </div>
        </div>
      )}


      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Rubik:wght@900&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; overflow-y: scroll; overscroll-behavior: none; }
        body { font-family: 'Cairo','Source Sans Pro','Inter',system-ui,sans-serif; margin: 0; -webkit-font-smoothing: antialiased; overscroll-behavior: none; -webkit-overflow-scrolling: touch; }
        textarea, input, select, button { font-family: 'Cairo','Source Sans Pro','Inter',system-ui,sans-serif; }
        img { max-width: 100%; height: auto; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F3F4F6; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        @media (max-width: 768px) {
          /* NAV */
          .hamburger-btn { display: flex !important; }
          .nav-tabs { display: none !important; }
          .nav-right { display: none !important; }
          .sticky-nav { position: sticky !important; top: 0 !important; }
          .nav-inner { padding: 0 14px !important; height: 56px !important; }

          /* HERO */
          .hero-inner { flex-direction: column-reverse !important; min-height: auto !important; padding: 20px 16px 24px !important; }
          .hero-text { flex: none !important; width: 100% !important; padding: 0 !important; }
          .hero-image { display: flex !important; flex: none !important; width: 100% !important; padding: 0 0 16px 0 !important; }
          .hero-btns { flex-direction: column !important; gap: 10px !important; }
          .hero-btns button { width: 100% !important; padding: 16px 20px !important; font-size: 17px !important; border-radius: 12px !important; min-height: 54px !important; }
          .hero-prices { justify-content: center !important; gap: 10px !important; }
          .hero-prices > div { flex: 1 !important; min-width: 140px !important; padding: 12px 16px !important; }

          /* STATS BAR */
          .stats-inner { gap: 12px !important; padding: 10px 14px !important; flex-wrap: wrap !important; justify-content: center !important; }
          .stats-inner > div { gap: 6px !important; }
          .stats-inner span:first-child { font-size: 15px !important; }
          .stats-inner span:last-child { font-size: 11px !important; }

          /* CONTENT */
          .content-outer { padding: 0 8px !important; margin: 10px auto 40px !important; }
          .content-card { padding: 12px !important; border-radius: 10px !important; }
          .analyze-box { padding: 14px 10px !important; border-radius: 12px !important; }
          .task-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
          .result-header { padding: 16px 14px !important; gap: 10px !important; border-radius: 10px !important; }

          /* TABS — bigger touch targets on mobile */
          .tab-row { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; scrollbar-width: none !important; gap: 6px !important; padding-bottom: 4px !important; }
          .tab-row::-webkit-scrollbar { display: none !important; }
          .tab-row button { padding: 10px 14px !important; font-size: 13px !important; border-radius: 8px !important; min-height: 42px !important; }

          /* READING — timer & passage display */
          .reading-timer { font-size: 18px !important; }

          /* CONTACT & PRICING */
          .contact-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }

          /* FOOTER */
          .footer-top { flex-direction: column !important; gap: 12px !important; text-align: center !important; }
          .footer-links { flex-wrap: wrap !important; gap: 10px !important; justify-content: center !important; }

          /* MOBILE SPECIFIC */
          .mobile-hide { display: none !important; }
          .writing-subnav { display: none !important; }
          .mobile-game-strip { display: block !important; }
          .desktop-game-strip { display: none !important; }
          .mobile-home-btn { display: flex !important; }
          .mobile-disclaimer { display: block !important; }
          .upgrade-btn { display: none !important; }
        }

        /* Extra small phones */
        @media (max-width: 380px) {
          .hero-inner { padding: 16px 12px 20px !important; }
          .content-card { padding: 10px !important; }
          .tab-row button { padding: 8px 10px !important; font-size: 12px !important; }
        }

        @media (hover: none) and (pointer: coarse) {
          html, body { overscroll-behavior-y: none; touch-action: pan-y; }
        }
      `}</style>
    </div>
  );
}
