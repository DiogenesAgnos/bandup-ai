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
const FREE_USES_LIMIT = 2;
const STORAGE_KEY = "bandup_uses";
const HISTORY_KEY = "bandup_history";
const API_URL = "/api/analyze";
const LAST_RESULT_KEY = "bandup_last_result";

// ── Local storage helpers (only for non-auth data) ────────────
const saveLastResult = (data) => { try{ localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(data)); }catch{} };
const getLastResult = () => { try{ return JSON.parse(localStorage.getItem(LAST_RESULT_KEY)||"null"); }catch{ return null; } };
const clearLastResult = () => { try{ localStorage.removeItem(LAST_RESULT_KEY); }catch{} };

const T = {
  primary:      "#b91c1c",   // Deep Academic Red (ieltsanswers style)
  primaryHover: "#991b1b",
  primaryLight: "#fef2f2",
  primaryBorder:"#fecaca",
  accent:       "#d4af37",   // Gold accent — works with red
  accentLight:  "#fdf6dc",
  accentBorder: "#e8d27a",
  bg:           "#ffffff",   // Pure White body
  bgSurface:    "#ffffff",
  bgMuted:      "#f9fafb",
  bgGray:       "#f9fafb",
  text:         "#111827",
  textMid:      "#374151",
  textMuted:    "#6b7280",
  textLight:    "#9ca3af",
  border:       "#e5e7eb",
  borderMid:    "#d1d5db",
  green:        "#059669", greenBg:"#d1fae5",  greenBorder:"#6ee7b7",
  red:          "#dc2626", redBg:"#fee2e2",    redBorder:"#fca5a5",
  amber:        "#d97706", amberBg:"#fef3c7",  amberBorder:"#fcd34d",
  blue:         "#2563eb", blueBg:"#dbeafe",   blueBorder:"#93c5fd",
  purple:       "#7c3aed", purpleBg:"#ede9fe", purpleBorder:"#c4b5fd",
  gold:         "#d4af37",
  shadow:    "0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)",
  shadowMd:  "0 4px 16px rgba(0,0,0,0.10)",
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

const getSystemPrompt = (taskType, lang="en") => `You are an expert IELTS examiner with 20+ years of experience applying official Cambridge band descriptors.

${taskType==="task2"?"Evaluating IELTS Task 2. Under 250 words = Task Achievement MAX Band 5.0.":taskType==="task1academic"?"Evaluating IELTS Task 1 Academic. Check: overview present? key trends identified? data accurately referenced? no personal opinion?":"Evaluating IELTS Task 1 General letter. Check: all three bullet points addressed? correct register? appropriate opening and closing?"}

══════════════════════════════════════════════
PART 1 — BAND SCORING  (holistic — decide BEFORE looking at errors)
══════════════════════════════════════════════

CRITICAL: Determine band scores HOLISTICALLY first. Ask: "What is the overall impression of this writer's ability?" DO NOT score by counting errors.

BAND 7-9 CALIBRATION:
- Band 7 essays WILL contain informal phrases, minor grammar slips, occasional awkward collocations, some repetition. These are EXPECTED and do NOT prevent Band 7.
- Band 7 GR descriptor says "produces FREQUENT error-free sentences" — meaning SOME errors are acceptable.
- Band 8 LR descriptor explicitly allows "occasional errors in word choice/spelling."
- DO NOT equate "I found 15 errors" with "Band 5." A sophisticated writer using complex structures WILL produce more errors than a cautious Band 5 writer using safe simple language.
- Reward what the writer CAN do. Score RANGE and SOPHISTICATION, not error count.
- A few informal words or contractions in an otherwise Band 7+ essay do NOT drop the score to Band 5-6.

CONCRETE CALIBRATION EXAMPLES — anchor your scoring to these:
- Essay with clear position + good paragraphs + counterargument + wide vocabulary range + some informal words ("a lot", "big issue") + complex sentences with a few grammar slips + 350+ words = Band 7 to 7.5. NOT Band 6.
- Essay using hedging language ("tends to", "appears to be", "might"), wide vocabulary, complex structures, rare spelling errors, logical paragraphing, counterargument addressed = Band 7.5 to 8. Even with 10-15 minor findable issues, the RANGE earns Band 7+.
- Contractions ("don't", "can't") alone do NOT drop a sophisticated essay below Band 7.
- One misspelled word (e.g. "celebraties") does not make the essay Band 5 vocabulary. It is ONE slip in an otherwise adequate range.

PER-CRITERION SCORING GUIDANCE:

LEXICAL RESOURCE — common AI mistake: scoring too low by averaging weak words with strong ones.
- Score LR on the BEST vocabulary present, not on the average. If the essay has sophisticated hedging ("tends to", "appears to be"), collocation ("art of cookery", "negative impact"), topic-specific terms ("obesity", "sedentary"), and less common items — this is Band 7-8 range. The presence of "a lot" or "bad" alongside sophisticated language does NOT make it Band 6. Examiners reward RANGE — the ability to USE sophisticated vocabulary when appropriate.
- Band 6 LR means vocabulary is MOSTLY basic and ATTEMPTS at less common vocabulary often fail. If the essay clearly succeeds at less common vocabulary in many places, it is Band 7+.

COHERENCE & COHESION — common AI mistake: penalising paragraph length rather than logical flow.
- CC is about PROGRESSION and FLOW, not perfect paragraph separation. An essay with one long body paragraph that still has clear logical sequencing (cause → effect → counterargument) can still reach Band 7. The Band 7 descriptor says "clear progression throughout" — look for progression, not perfect formatting.
- Mechanical cohesive devices ("Firstly", "Secondly", "Moreover") are noted as a Band 7 trait — they are NOT a demotion to Band 6. Band 6 is when devices are FAULTY or INACCURATE, not when they are formulaic.
- If ideas flow logically from one to the next with clear overall direction, score CC at 7 minimum.

GRAMMATICAL RANGE & ACCURACY — common AI mistake: treating all errors as equally serious.
- GR Band 7 says "frequent error-free sentences" — this means MOST sentences are correct, not ALL.
- Complex sentence forms used anywhere in the essay — relative clauses, conditionals, passive voice, hedging constructions — count as evidence of RANGE even if errors exist elsewhere.
- Subject-verb agreement errors ("games that makes") are genuine errors, but the GR score should reflect the RANGE of structures attempted. If 80% of sentences are correct and some complex structures are well-used, this is GR Band 6.5-7, not Band 5.


OFFICIAL BAND DESCRIPTORS:

TASK ACHIEVEMENT / TASK RESPONSE:
- Band 9: Fully addresses all parts. Position fully developed. Ideas fully extended and well supported.
- Band 8: Sufficiently addresses all parts. Clear well-developed position. Ideas well extended and supported.
- Band 7: Addresses all parts. Clear position throughout. Main ideas extended and supported but may over-generalise.
- Band 6: Addresses all parts though some may be more fully covered. Relevant position. Main ideas relevant but some inadequately developed.
- Band 5: Addresses task only partially. Position not always maintained. Main ideas limited and not sufficiently developed.

COHERENCE & COHESION:
- Band 9: Cohesion used skilfully. Paragraphing appropriate throughout.
- Band 8: Sequences logically. Manages all aspects of cohesion well. Paragraphing sufficient and appropriate.
- Band 7: Logically organises with clear progression. Range of cohesive devices used appropriately. Clear central topic in each paragraph.
- Band 6: Arranges coherently. Cohesive devices effective but may be faulty or mechanical.
- Band 5: Some organisation but may lack overall progression. Inadequate/inaccurate/overuse of cohesive devices.

LEXICAL RESOURCE:
- Band 9: Wide range, very natural and sophisticated. Rare minor errors only as slips.
- Band 8: Wide range, fluent and flexible. Skilfully uses uncommon items. Occasional errors in word choice/spelling.
- Band 7: Sufficient range for flexibility and precision. Less common items with some awareness of style. May produce occasional errors.
- Band 6: Adequate range. Attempts less common vocabulary with some inaccuracy. Some errors but do not impede communication.
- Band 5: Limited range, minimally adequate. Noticeable spelling/word formation errors.

GRAMMATICAL RANGE & ACCURACY:
- Band 9: Wide range with full flexibility and accuracy. Rare minor errors only.
- Band 8: Wide range. Majority of sentences error-free. Occasional non-systematic errors.
- Band 7: Variety of complex structures. Frequent error-free sentences. Good control but may make a few errors.
- Band 6: Mix of simple and complex forms. Some errors but rarely reduce communication.
- Band 5: Limited range. Complex sentences less accurate. Frequent grammatical errors possible.

SCORING RULES:
- Overall band = mean of four criteria, rounded to nearest 0.5
- Under 250 words Task 2 = Task Achievement MAX Band 5.0. Under 150 words Task 1 = Task Achievement MAX Band 5.0
- Under 100 words ANY task = Task Achievement MAX Band 3.0. Score other criteria on what is present but note severe underdevelopment.
- LOCK IN all band scores based on holistic impression. Then produce mistakes. The mistakes list must NEVER retroactively change your band scores.
- Scores must be identical whether feedback language is English or Arabic.

OFF-TOPIC ESSAYS — CRITICAL:
- If the essay does not answer the question asked, Task Achievement = Band 3.0 to 4.0 MAXIMUM regardless of language quality. Fluent English does not compensate for missing the question.
- If only partially on topic (answers one part but ignores another), Task Achievement MAX Band 5.0.
- Always check: does this essay actually respond to what was asked? Do this BEFORE scoring anything else.

NON-ENGLISH INPUT:
- If the submitted text is not in English (e.g. Arabic only, or majority non-English), do NOT attempt to score it.
- Return this exact JSON and nothing else: {"error":"non_english","message":"Please submit your essay in English. This tool evaluates English writing only."}

BAND 4-6 CALIBRATION — anchor your low-end scoring to these:
- Band 5-6: Essay attempts the task but ideas are underdeveloped. Vocabulary is mostly basic with occasional attempts at less common words that sometimes fail. Grammar is simple with frequent errors in complex structures. Organisation is present but mechanical — heavy reliance on "Firstly/Secondly/Finally" with little development between points. 200-240 words typical.
- Band 4-5: Essay only partially addresses the task. Ideas are listed rather than developed. Vocabulary is limited and repetitive. Most sentences are short and simple. Errors are frequent and sometimes impede meaning. Reader has to work to follow the argument.
- The key difference between Band 5 and Band 6 is development: Band 6 extends ideas with explanation and some examples. Band 5 states ideas and moves on.
- The key difference between Band 6 and Band 7 is range and sophistication: Band 7 uses less common vocabulary successfully, attempts complex grammar successfully most of the time, and arguments are logically extended not just listed.

WORD COUNT: Count by splitting on spaces. Report exact count in wordCount field.

══════════════════════════════════════════════
PART 2 — MISTAKE DETECTION  (educational — stricter than IELTS marking)
══════════════════════════════════════════════

IMPORTANT: This mistake scan is DELIBERATELY more exhaustive than what a real IELTS examiner marks. Its purpose is to help students improve their writing. A mistake found here does NOT necessarily reduce the band score — many are minor style improvements for future essays.

Go through the essay sentence by sentence and flag ALL of the following:

GRAMMAR: Subject-verb agreement, wrong tense/tense inconsistency, missing/incorrect articles, wrong prepositions, incorrect verb forms (infinitive vs gerund), passive voice errors, dangling modifiers, run-on sentences, conditional errors.

PUNCTUATION: Missing commas after introductory phrases, comma splices, missing apostrophes, incorrect semicolons.

SPELLING: Any misspelled word including commonly confused words.

WORD CHOICE & ACADEMIC STYLE: Informal language ("a lot", "things", "good", "bad", "big"), vague language, repetition within 2-3 sentences, weak verbs, colloquial expressions, contractions (don't→do not, can't→cannot, it's→it is).

SENTENCE STRUCTURE: Simplistic sentences that could be combined, overuse of same structure, consecutive sentences starting with same word.

TASK-SPECIFIC: Copying question phrases without paraphrasing, weak/absent topic sentences, unsupported claims, conclusion that merely repeats the introduction.

CORRECTION FIELD RULES: ALWAYS write a concrete drop-in replacement. NEVER write advice.
  - "a lot of people" → "a significant proportion of individuals"
  - "things" → "factors" or "aspects"
  - "good" → "beneficial" or "advantageous"
  - "In my opinion, I think" → "I firmly contend that"

MISTAKE COUNT: Report ALL genuine errors found — no minimum, no maximum. Do not invent errors to reach a number. Do not omit real errors to stay under a number. If a Band 8 essay has 3 genuine errors, report 3. If a Band 5 essay has 25 errors, report 25. Accuracy over quantity.
Each "original" must match essay text EXACTLY character for character.

SAMPLE ESSAY REQUIREMENTS — the sampleEssay field must demonstrate ALL of the following or it fails its purpose:
- Direct answer to the question in the introduction — no vague opening
- Clear position stated in the introduction if Task 2
- Every body paragraph must have: topic sentence + explanation + specific named example (country, study, statistic, or real case) + link back to the argument
- Minimum two different complex sentence structures per paragraph (relative clause, conditional, passive, hedging)
- No contractions, no "a lot of", no "things", no "nowadays" as an opener
- Varied cohesive devices — not just "Firstly/Secondly/Finally"
- Conclusion must synthesise, not just repeat the introduction
- MINIMUM 280 words Task 2 / 190 words Task 1. Count carefully before returning.
Respond ONLY with valid JSON (no markdown, no backticks):
{
  "wordCount":201,"overallBand":7.5,
  "criteria":{"taskAchievement":{"band":7.0,"feedback":"..."},"coherenceCohesion":{"band":7.5,"feedback":"..."},"lexicalResource":{"band":7.0,"feedback":"..."},"grammaticalRange":{"band":7.5,"feedback":"..."}},
  "mistakes":[{"original":"exact phrase from text","correction":"concrete drop-in replacement","explanation":"clear explanation of WHY this is wrong and HOW the correction improves it","category":"Grammar|Spelling|Punctuation|Sentence Structure|Word Choice|Academic Style|Verb Tense|Subject-Verb Agreement|Article|Preposition|Register","severity":"minor|moderate|major"}],
  "vocabularyUpgrades":[{"weak":"exact weak phrase from essay","advanced":"better IELTS alternative","reason":"why this upgrade helps"}],
  "bandBooster":{"currentBand":7.0,"targetBand":7.5,"specificActions":["specific action 1","action 2","action 3"]},
  "examinerTips":["insider tip 1 specific to this essay","tip 2","tip 3"],
  "strengths":["strength 1","strength 2"],
  "improvements":["improvement 1","improvement 2"],
  "sampleEssay":"Full Band 8+ response — MINIMUM 280 words Task 2 / 190 words Task 1. Must meet all sample essay requirements above.",
  "sampleEssayExplanation":{"introduction":"...","bodyParagraphs":"...","conclusion":"...","vocabularyHighlights":["word 1","word 2"],"whyHighScore":"..."}
}

${lang==="ar"?"\n\nمهم جداً: قدّم جميع التعليقات والشرح باللغة العربية. يشمل: feedback لكل معيار، explanation لكل خطأ، reason لكل ترقية مفردات، specificActions في Band Booster، examinerTips، strengths، improvements، sampleEssayExplanation. أبقِ درجات الباند والمقال النموذجي sampleEssay بالإنجليزية. جميع التعليقات الأخرى بالعربية الفصحى.":""}
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
    <div style={{position:"relative",fontSize:15,lineHeight:1.9,fontFamily:"Georgia,serif",whiteSpace:"pre-wrap",color:T.text,overflow:"visible"}}>
      {segments.map((seg,i)=>{
        if(seg.type==="normal") return <span key={i}>{seg.text}</span>;
        const c=severityColor(seg.mistake.severity);
        const catColor=categoryColor(seg.mistake.category);
        return (
          <span key={i} style={{position:"relative",display:"inline"}}>
            <span onClick={()=>setActiveTooltip(activeTooltip===seg.idx?null:seg.idx)}
              style={{borderBottom:`2px solid ${severityColor(seg.mistake.severity)}`,cursor:"pointer",background:activeTooltip===seg.idx?`${T.red}18`:"transparent",borderRadius:3,padding:"0 1px",transition:"background 0.15s"}}>
              {seg.text}
            </span>
            {activeTooltip===seg.idx&&(
              <span style={{position:"absolute",bottom:"calc(100% + 8px)",left:"50%",transform:"translateX(-50%)",background:"#1e293b",color:"white",borderRadius:10,padding:"10px 14px",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui",width:"min(280px,70vw)",zIndex:500,boxShadow:T.shadowLg,lineHeight:1.5,fontStyle:"normal",whiteSpace:"normal",display:"block"}}>
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
  <div style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:12,padding:"28px 32px",boxShadow:T.shadow,...style}} {...rest}>
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

const MainTab=({label,active,onClick,badge})=>(
  <button onClick={onClick} style={{
    background: "transparent",
    border: "none",
    borderBottom: active ? `3px solid ${T.accent}` : "3px solid transparent",
    borderTop: "3px solid transparent",
    color: active ? T.accent : "rgba(255,255,255,0.88)",
    padding: "0 14px",
    height: 52,
    cursor: "pointer",
    fontSize: 14,
    fontWeight: active ? 700 : 500,
    fontFamily: "'Cairo','Source Sans Pro',system-ui",
    transition: "color 0.15s, border-color 0.15s",
    whiteSpace: "nowrap",
    flexShrink: 0,
    letterSpacing: "0.01em",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  }}>
    <span>{label}</span>
    {badge&&(
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        padding: "1px 5px",
        borderRadius: 4,
        background: badge==="free" ? "rgba(134,239,172,0.25)" : "rgba(251,191,36,0.25)",
        color: badge==="free" ? "#86efac" : "#fbbf24",
        border: badge==="free" ? "1px solid rgba(134,239,172,0.4)" : "1px solid rgba(251,191,36,0.4)",
        lineHeight: 1.4,
      }}>{badge==="free" ? "Free" : "Pro"}</span>
    )}
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

  const FEATURES=["Unlimited essay analyses — Task 1 & 2","Complete mistake detection with corrections","Band Booster + vocabulary upgrades to Band 8","Full IELTS Toolkit (templates, model essays)","All 7 reading tests","Unlimited exercises — 5 categories","Progress tracker with score history","Unlimited grammar checker"];

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
        if(window.emailjs?.send) await window.emailjs.send("service_9es76g1","template_jrd4i4n",{
          from_name:"CLIQ PRO REQUEST: "+cliqForm.name.trim(),
          from_email:cliqForm.email.trim(),
          country:cliqForm.mobile.trim(),
          age_group:"CLIQ Payment",
          message:`New CLIQ Pro upgrade request:\n\nName: ${cliqForm.name.trim()}\nEmail: ${cliqForm.email.trim()}\nMobile: ${cliqForm.mobile.trim()}\nAmount: 25 JOD\nCLIQ Alias: Efool2026`,
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
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:T.text,lineHeight:1}}>25 <span style={{fontSize:20,fontWeight:700}}>دينار</span></div>
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
                  <span style={{fontSize:14,fontWeight:700,color:T.amber,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>حوّل ٢٥ دينار عن طريق كليك</span>
                </div>
                <div style={{fontSize:13,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.7}}>
                  افتح تطبيق البنك ← كليك ← أرسل أموال<br/>
                  أرسل <strong style={{color:T.text}}>٢٥ دينار</strong> إلى الاسم المستعار: <strong style={{color:T.primary,fontFamily:"monospace",fontSize:15,direction:"ltr",display:"inline-block"}}>Efool2026</strong>
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
              <div style={{fontFamily:"Georgia,serif",fontSize:40,fontWeight:900,color:T.text,lineHeight:1}}>$35 <span style={{fontSize:14,color:T.textMuted,fontWeight:400}}>/ 3 months</span></div>
              <div style={{color:T.textMuted,fontSize:12,marginTop:4,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>3-month subscription · Renews at $35 · Cancel anytime</div>
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
              💳 احصل على Pro — $35 (3 months)
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
  if(!isPro) return (
    <div style={{maxWidth:560,margin:"40px auto",padding:"0 24px"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:52,marginBottom:12}}>📈</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,marginBottom:8}}>Track Your Progress</h2>
        <p style={{color:T.textMid,fontSize:14,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.7}}>Every essay you analyse is saved. Watch your band score improve over time.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
        {[
          {icon:"🎯",title:"Band Score History",desc:"See your overall band across every essay you've submitted"},
          {icon:"📊",title:"Criteria Breakdown",desc:"Track Task Response, CC, Lexical Resource & Grammar separately"},
          {icon:"📉",title:"Mistake Trends",desc:"See if your error count is dropping over time"},
          {icon:"⚡",title:"Biggest Improvement",desc:"Identifies which criterion improved most since your first essay"},
        ].map((c,i)=>(
          <div key={i} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:22,marginBottom:4}}>{c.icon}</div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700,fontSize:13,color:T.text,marginBottom:4}}>{c.title}</div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:11,color:T.textMuted,lineHeight:1.4}}>{c.desc}</div>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center"}}>
        <button onClick={onUpgrade} style={{background:T.primary,color:"white",border:"none",borderRadius:10,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:`0 4px 16px ${T.primary}44`}}>
          🔓 Upgrade to Pro — $35 / 25 JOD
        </button>
        <div style={{marginTop:12,fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>3-month subscription · Cancel anytime</div>
      </div>
    </div>
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
          <button onClick={onUpgrade} style={{background:T.gold,color:"white",fontWeight:700,fontSize:13,padding:"9px 20px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Upgrade to Pro — $35</button>
        </div>
      </div>
    </div>
  );
  return (
    <div>
      <Card style={{marginBottom:16,background:"#fff5f5",border:"1px solid #ffcccc"}}>
        <p style={{color:T.red,fontSize:13,margin:0,fontFamily:"'Cairo','Source Sans Pro',system-ui",direction:"ltr",textAlign:"left"}}>🎓 Your personal IELTS reference guide. {!isPro&&<span style={{color:T.textMid}}>Linking Words and Grammar are free. Upgrade for full access.</span>}</p>
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

const GRAMMAR_TOTAL_LIMIT = 5; // 5 free uses total
const GRAMMAR_DAILY_LIMIT = GRAMMAR_TOTAL_LIMIT; // kept for backward compat
const getGrammarUsesToday = () => { 
  try { 
    const val = parseInt(localStorage.getItem("ef_grammar_uses")||"0",10);
    return isNaN(val)?0:val;
  } catch { return 0; }
};
const saveGrammarUse = () => {
  try {
    const current = getGrammarUsesToday();
    localStorage.setItem("ef_grammar_uses", String(current+1));
  } catch {}
};

const GrammarChecker = ({isPro, onUpgrade=()=>{}}) => {
  const [gcTab,setGcTab]=useState("checker");
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dailyUses, setDailyUses] = useState(()=>getGrammarUsesToday());
  const dailyLeft = GRAMMAR_TOTAL_LIMIT - dailyUses;

  const check = async () => {
    if (!input.trim()) { setError("Please enter a word or sentence to check."); return; }
    // Always read fresh from localStorage to avoid stale state
    const freshUses = getGrammarUsesToday();
    const currentUses = freshUses; if(freshUses !== dailyUses) setDailyUses(freshUses);
    if (!isPro && freshUses >= GRAMMAR_TOTAL_LIMIT) { setError("upgrade_needed"); return; }
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
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {[{id:"checker",icon:"✏️",label:"Grammar Checker"},{id:"self",icon:"🔎",label:"Self-Correct Mode"}].map(t=>(
          <button key={t.id} onClick={()=>setGcTab(t.id)}
            style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",padding:"9px 18px",borderRadius:8,border:`1px solid ${gcTab===t.id?T.primary:T.border}`,background:gcTab===t.id?T.primaryLight:"white",color:gcTab===t.id?T.primary:T.textMid,fontWeight:gcTab===t.id?700:500,fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      {gcTab==="self"&&<SelfCorrectMode isPro={isPro} onUpgrade={onUpgrade}/>}
      {gcTab==="checker"&&<div>
      <Card style={{ marginBottom: 20, background: T.greenBg, border: `1px solid ${T.greenBorder}` }}>
        <p style={{ color: T.green, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
          ✏️ <strong>Grammar & Spell Checker</strong> — {isPro?"Unlimited checks with Pro — enter any text for instant corrections.":dailyLeft>0?(<>Enter any word, phrase, or sentence. <strong>{dailyLeft}</strong> of {GRAMMAR_TOTAL_LIMIT} free {dailyLeft===1?"check":"checks"} remaining.</>):(<span style={{color:T.red}}>You've used all {GRAMMAR_TOTAL_LIMIT} free checks. <button onClick={onUpgrade} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",padding:0,textDecoration:"underline",fontFamily:"inherit",fontSize:"inherit"}}>Upgrade to Pro for unlimited use →</button></span>)}
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
          🎓 Want a full essay scored with band levels, vocabulary upgrades, and a model response? Try our <strong>Essay Analyzer</strong> — start with our free sample, then upgrade to Pro.
        </p>
      </Card>
      <Card style={{ marginTop: 16, background: T.amberBg, border: `1px solid ${T.amberBorder}` }}>
        <p style={{ color: T.amber, fontSize: 13, margin: 0, fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>
          🏋️ Looking to practise grammar, paraphrasing, linking words, and more? Head over to the <strong>Exercises</strong> tab — 100+ questions with a 30-minute free session timer.
        </p>
      </Card>
      </div>}
    </div>
  );
};


// ── Dictation Sentences ──────────────────────────────────────────
const DICTATION_SENTENCES = [
  {text:"Many students find it difficult to manage their time effectively.",level:"B1"},
  {text:"Governments should invest more money in public transport.",level:"B1"},
  {text:"Air pollution is a serious problem in most large cities.",level:"B1"},
  {text:"Children learn better when they enjoy what they are studying.",level:"B1"},
  {text:"The cost of living has increased significantly over the past decade.",level:"B1"},
  {text:"Regular exercise has many benefits for both physical and mental health.",level:"B1"},
  {text:"Technology has changed the way people communicate with each other.",level:"B1"},
  {text:"It is important to learn a foreign language at an early age.",level:"B1"},
  {text:"Young people today have more opportunities than previous generations.",level:"B1"},
  {text:"The number of people using the internet has grown rapidly in recent years.",level:"B1"},
  {text:"The rise in obesity rates can be attributed to increasingly sedentary lifestyles.",level:"B2"},
  {text:"Despite significant progress, gender inequality remains a persistent global challenge.",level:"B2"},
  {text:"Urban populations are expected to increase substantially over the coming decades.",level:"B2"},
  {text:"Renewable energy sources are becoming increasingly cost-competitive with fossil fuels.",level:"B2"},
  {text:"Social media has fundamentally altered the way news is produced and consumed.",level:"B2"},
  {text:"The relationship between economic growth and environmental sustainability is complex.",level:"B2"},
  {text:"Access to quality education is widely regarded as a fundamental human right.",level:"B2"},
  {text:"Governments face considerable pressure to balance economic development with environmental protection.",level:"B2"},
  {text:"The rapid expansion of artificial intelligence raises important ethical questions.",level:"B2"},
  {text:"Cultural diversity enriches societies but can also present significant integration challenges.",level:"B2"},
  {text:"The proliferation of misinformation on digital platforms poses a substantial threat to democratic processes.",level:"C1"},
  {text:"Socioeconomic disparities in educational attainment perpetuate cycles of intergenerational poverty.",level:"C1"},
  {text:"The accelerating pace of technological innovation necessitates a fundamental reassessment of labour markets.",level:"C1"},
  {text:"Climate change mitigation requires unprecedented levels of international cooperation and political will.",level:"C1"},
  {text:"The correlation between biodiversity loss and ecosystem instability is increasingly well-documented.",level:"C1"},
];

// ── Sentence Builder Questions ────────────────────────────────────
const SENTENCE_BUILDER_QS = [
  {words:["many","people","believe","that","education","is","important"],correct:"many people believe that education is important",hint:"Start with 'many'",level:"B1"},
  {words:["the","government","should","invest","in","public","transport"],correct:"the government should invest in public transport",hint:"Start with 'the'",level:"B1"},
  {words:["she","has","been","living","here","for","five","years"],correct:"she has been living here for five years",hint:"Present perfect continuous",level:"B1"},
  {words:["air","pollution","affects","millions","of","people","worldwide"],correct:"air pollution affects millions of people worldwide",hint:"Subject → verb → object",level:"B1"},
  {words:["despite","the","rain","the","match","continued"],correct:"despite the rain the match continued",hint:"Despite + noun phrase",level:"B1"},
  {words:["the","number","of","students","studying","abroad","has","increased","significantly"],correct:"the number of students studying abroad has increased significantly",hint:"'The number of' is singular → 'has'",level:"B2"},
  {words:["it","is","widely","argued","that","technology","has","both","benefits","and","drawbacks"],correct:"it is widely argued that technology has both benefits and drawbacks",hint:"Impersonal passive structure",level:"B2"},
  {words:["despite","being","expensive","electric","cars","are","becoming","increasingly","popular"],correct:"despite being expensive electric cars are becoming increasingly popular",hint:"Despite + gerund",level:"B2"},
  {words:["a","growing","number","of","individuals","are","choosing","to","work","remotely"],correct:"a growing number of individuals are choosing to work remotely",hint:"'A growing number of' + plural verb",level:"B2"},
  {words:["the","policy","was","implemented","in","order","to","reduce","carbon","emissions"],correct:"the policy was implemented in order to reduce carbon emissions",hint:"Passive + purpose clause",level:"B2"},
  {words:["the","extent","to","which","globalisation","has","benefited","developing","nations","remains","debated"],correct:"the extent to which globalisation has benefited developing nations remains debated",hint:"Embedded question structure",level:"C1"},
  {words:["not","until","recently","have","scientists","fully","understood","the","complexity","of","the","microbiome"],correct:"not until recently have scientists fully understood the complexity of the microbiome",hint:"Inversion after negative adverbial",level:"C1"},
  {words:["were","governments","to","invest","adequately","in","education","inequality","would","diminish"],correct:"were governments to invest adequately in education inequality would diminish",hint:"Formal conditional inversion: Were + subject + to...",level:"C1"},
];

// ── B1 Reading Tests ──────────────────────────────────────────────
const B1_TESTS = [
  {
    level:"B1", title:"Working from Home",
    text:"More and more people are now working from home. This has become very common since 2020. Many workers say they are happier because they save time on travel. They can also spend more time with their families.\n\nHowever, some people find it difficult to work at home. They miss talking to their colleagues. Some homes are small and it is hard to find a quiet place to work. Children can also be a distraction.\n\nCompanies have different opinions about working from home. Some businesses have decided to let their employees work from home permanently. Others want everyone back in the office. Many companies now use a mix — some days in the office and some days at home. This is called hybrid working.",
    questions:[
      {type:"tf",q:"Working from home became popular before 2020.",a:"FALSE",exp:"The text says it 'has become very common since 2020'."},
      {type:"tf",q:"All workers prefer working from home.",a:"FALSE",exp:"'Some people find it difficult to work at home.'"},
      {type:"mc",q:"What is 'hybrid working'?",options:["Working only at home","Working only in an office","A mix of home and office work","Working in different countries"],a:"A mix of home and office work",exp:"'Some days in the office and some days at home.'"},
      {type:"mc",q:"Which of these is a problem some people have at home?",options:["They earn less money","They miss talking to colleagues","They work longer hours","They cannot use technology"],a:"They miss talking to colleagues",exp:"'They miss talking to their colleagues.'"},
      {type:"completion",q:"Some workers save time on ___ when they work from home.",a:"travel",exp:"'They save time on travel.'"},
    ]
  },
  {
    level:"B1", title:"Fast Food and Health",
    text:"Fast food is very popular in many countries. People like it because it is quick, cheap, and tasty. However, eating fast food too often can be bad for your health. Most fast food contains a lot of fat, sugar, and salt.\n\nStudies show that people who eat fast food regularly are more likely to become overweight. They also have a higher risk of heart disease and diabetes. Children are particularly at risk because they often prefer fast food to healthier options.\n\nSome fast food companies are now trying to offer healthier choices. They have added salads and fruit to their menus. However, many customers still choose the less healthy options. Experts believe that governments should do more to encourage healthy eating, for example by putting higher taxes on unhealthy food.",
    questions:[
      {type:"tf",q:"Fast food is popular partly because it is cheap.",a:"TRUE",exp:"'People like it because it is quick, cheap, and tasty.'"},
      {type:"tf",q:"Children face no special health risks from fast food.",a:"FALSE",exp:"'Children are particularly at risk.'"},
      {type:"mc",q:"What have some fast food companies added to their menus?",options:["More burgers","Salads and fruit","Cheaper drinks","Larger portions"],a:"Salads and fruit",exp:"'They have added salads and fruit to their menus.'"},
      {type:"mc",q:"What do experts suggest governments should do?",options:["Ban fast food","Put higher taxes on unhealthy food","Give money to fast food companies","Build more gyms"],a:"Put higher taxes on unhealthy food",exp:"'Putting higher taxes on unhealthy food.'"},
      {type:"completion",q:"People who eat fast food regularly have a higher risk of heart disease and ___.",a:"diabetes",exp:"'A higher risk of heart disease and diabetes.'"},
    ]
  },
  {
    level:"B1", title:"Travelling by Train",
    text:"Many people enjoy travelling by train. It is a comfortable way to get from one place to another. You can read, work, or look out of the window at the countryside. Unlike flying, you do not need to arrive at the station hours before your journey.\n\nHowever, trains can sometimes be expensive, especially if you book at the last minute. It is usually cheaper to book your tickets in advance. Many railway companies offer discounts for young people, families, and senior citizens.\n\nTrains are also better for the environment than planes or cars. They produce less carbon dioxide per passenger. Many countries are now investing in new high-speed rail lines to make train travel faster and more convenient.",
    questions:[
      {type:"tf",q:"You must arrive at the station hours before a train journey.",a:"FALSE",exp:"'Unlike flying, you do not need to arrive at the station hours before your journey.'"},
      {type:"tf",q:"Booking train tickets in advance is usually cheaper.",a:"TRUE",exp:"'It is usually cheaper to book your tickets in advance.'"},
      {type:"mc",q:"Why are trains better for the environment than planes?",options:["They are faster","They cost less","They produce less carbon dioxide per passenger","They carry more people"],a:"They produce less carbon dioxide per passenger",exp:"'They produce less carbon dioxide per passenger.'"},
      {type:"mc",q:"Who can get discounts on train tickets?",options:["Only students","Business travellers only","Young people, families, and senior citizens","Everyone automatically"],a:"Young people, families, and senior citizens",exp:"'Many railway companies offer discounts for young people, families, and senior citizens.'"},
      {type:"completion",q:"Countries are investing in high-speed rail to make train travel faster and more ___.",a:"convenient",exp:"'Faster and more convenient.'"},
    ]
  },
  {
    level:"B1", title:"Social Media",
    text:"Social media has changed the way people communicate. Billions of people around the world use platforms like Instagram, Facebook, and X every day. These platforms allow people to share photos, videos, and opinions with friends and strangers.\n\nSocial media can be very useful. It helps people stay in touch with family and friends who live far away. It also allows people to learn about events happening around the world. Some people use social media to start businesses or find jobs.\n\nHowever, there are also problems with social media. Some people spend too much time on their phones and feel anxious when they cannot check their accounts. Young people in particular can feel bad about themselves when they compare their lives to the perfect images they see online. Experts recommend taking regular breaks from social media to protect mental health.",
    questions:[
      {type:"tf",q:"Social media is only used by young people.",a:"FALSE",exp:"'Billions of people around the world' — not only young people."},
      {type:"tf",q:"Social media can help people find a job.",a:"TRUE",exp:"'Some people use social media to start businesses or find jobs.'"},
      {type:"mc",q:"What mental health problem is linked to too much social media use?",options:["Sleeping too much","Feeling anxious","Losing memory","Feeling overconfident"],a:"Feeling anxious",exp:"'Some people feel anxious when they cannot check their accounts.'"},
      {type:"mc",q:"What do experts suggest to protect mental health?",options:["Delete all accounts","Stop using smartphones","Take regular breaks from social media","Only follow positive content"],a:"Take regular breaks from social media",exp:"'Experts recommend taking regular breaks from social media.'"},
      {type:"completion",q:"Young people may feel bad when they compare themselves to ___ images online.",a:"perfect",exp:"'The perfect images they see online.'"},
    ]
  },
  {
    level:"B1", title:"Zoos: For and Against",
    text:"Many people enjoy visiting zoos. They can see animals from all over the world in one place. Zoos are also educational — children can learn about different species and the importance of protecting animals.\n\nHowever, some people believe that zoos are cruel. They argue that animals should live in their natural habitat, not in small enclosures. Animals in zoos sometimes show signs of stress and boredom.\n\nSupporters of zoos say that modern zoos are very different from zoos in the past. Many zoos now have large, natural spaces for animals. Some zoos also run important conservation programmes that help to save endangered species. Without these programmes, some animals might already be extinct.",
    questions:[
      {type:"tf",q:"Modern zoos are the same as zoos in the past.",a:"FALSE",exp:"'Modern zoos are very different from zoos in the past.'"},
      {type:"tf",q:"Some animals in zoos show signs of stress.",a:"TRUE",exp:"'Animals in zoos sometimes show signs of stress and boredom.'"},
      {type:"mc",q:"What is one argument in favour of zoos?",options:["They are cheap to run","They help save endangered species","They give animals complete freedom","They are better than national parks"],a:"They help save endangered species",exp:"'Some zoos run conservation programmes that help to save endangered species.'"},
      {type:"mc",q:"What do critics say about zoos?",options:["They are too expensive","Animals should live in natural habitats","Zoos are too small","Zoos have too many visitors"],a:"Animals should live in natural habitats",exp:"'Animals should live in their natural habitat, not in small enclosures.'"},
      {type:"completion",q:"Without conservation programmes, some animals might already be ___.",a:"extinct",exp:"'Some animals might already be extinct.'"},
    ]
  },
];

// ── Daily Challenge ───────────────────────────────────────────────
const DAILY_KEY="ef_daily_v2";
const STREAK_KEY="ef_streak_v2";
const getDailyChallenge=()=>{
  const today=new Date().toDateString();
  try{const s=JSON.parse(localStorage.getItem(DAILY_KEY)||"null");if(s&&s.date===today)return s;}catch{}
  const d=new Date();
  const seed=(d.getDate()*17+d.getMonth()*31+d.getFullYear())%1000;
  // Build pool from grammar + vocab exercises
  const gPool=[];
  GRAMMAR_EXERCISES.forEach(cat=>{
    cat.exercises.forEach(q=>{
      if(q.correct!==undefined&&Array.isArray(q.options)){
        gPool.push({type:"grammar",q:q.sentence,opts:q.options,a:q.correct,exp:q.explanation||"",cat:cat.category||cat.title});
      }
    });
  });
  const vPool=VOCAB_EXERCISES.filter(q=>q.weak&&q.options&&q.correct!==undefined).map(q=>({
    type:"vocab",q:`Which is the best academic replacement for "${q.weak}"?`,opts:q.options,a:q.correct,exp:q.tip||"",cat:"Vocabulary Upgrade"
  }));
  const pool=[...gPool,...vPool];
  if(!pool.length)return null;
  const q=pool[seed%pool.length];
  const obj={date:today,q,answered:false,userAnswer:null};
  try{localStorage.setItem(DAILY_KEY,JSON.stringify(obj));}catch{}
  return obj;
};
const getStreak=()=>{try{return JSON.parse(localStorage.getItem(STREAK_KEY)||"null")||{count:0,last:""};}catch{return{count:0,last:""};}};
const saveStreak=(count)=>{try{localStorage.setItem(STREAK_KEY,JSON.stringify({count,last:new Date().toDateString()}));}catch{}};

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
,
  {
    category: "Modal Verbs",
    icon: "🔧",
    color: "#7c3aed",
    exercises: [
      {sentence:"You ___ finish this by Friday — it's mandatory.",options:["should","must","might"],correct:1,explanation:"'Must' expresses obligation with no alternative. 'Should' is advice. 'Might' is possibility."},
      {sentence:"She ___ be at home — her car is outside.",options:["must","should","can"],correct:0,explanation:"'Must' expresses logical deduction. Evidence (car outside) leads to a certain conclusion."},
      {sentence:"You ___ smoke in a hospital. It's prohibited.",options:["mustn't","don't have to","shouldn't"],correct:0,explanation:"'Mustn't' = prohibition (forbidden). 'Don't have to' = no obligation but it's allowed. These are opposite meanings."},
      {sentence:"I ___ speak French fluently when I was young.",options:["could","was able to","would"],correct:0,explanation:"'Could' expresses general ability in the past. 'Was able to' is used for a single specific achievement ('I was able to escape')."},
      {sentence:"The students ___ wear uniforms — the school doesn't require it.",options:["mustn't","needn't","shouldn't"],correct:1,explanation:"'Needn't' (don't need to) = no obligation. 'Mustn't' = forbidden. The school doesn't require it — so it's simply not necessary."},
      {sentence:"He ___ be tired — he's been working for 16 hours.",options:["can","must","might"],correct:1,explanation:"'Must' for logical deduction based on strong evidence. 16-hour shift makes tiredness a near-certain conclusion."},
      {sentence:"___ I open the window? It's quite hot in here.",options:["Should","Could","Must"],correct:1,explanation:"'Could' is the most polite form for requests/permission. 'Can' also works but is less formal. 'Must' is not used for requests."},
      {sentence:"You ___ have told me earlier — I could have helped.",options:["should","must","would"],correct:0,explanation:"'Should have + past participle' = criticism of a past action that didn't happen. 'You should have told me' = it was the right thing but you didn't do it."},
      {sentence:"The bridge ___ collapse at any moment — stay back.",options:["may","might","could"],correct:2,explanation:"'Could' with an extreme situation implies real danger/possibility. All three work here, but 'could' is most direct for warnings."},
      {sentence:"This room ___ have been a bedroom originally.",options:["must","can","will"],correct:0,explanation:"'Must have been' = past deduction (logical conclusion about the past). Evidence suggests something was true in the past."},
    ]
  },
  {
    category: "Reported Speech",
    icon: "💬",
    color: "#0891b2",
    exercises: [
      {sentence:"She said she ___ come to the meeting.",options:["will","would","can"],correct:1,explanation:"Backshift rule: 'will' → 'would' in reported speech. 'She said she WOULD come.'"},
      {sentence:"He told me he ___ finished the report.",options:["has","had","have"],correct:1,explanation:"'Has finished' → 'had finished' (present perfect → past perfect in reported speech)."},
      {sentence:"The manager said the project ___ be delayed.",options:["will","would","could"],correct:1,explanation:"'Will be delayed' → 'WOULD be delayed' in reported speech. The backshift applies to all future forms."},
      {sentence:"She asked me ___ I could help her.",options:["that","if","what"],correct:1,explanation:"Reported yes/no questions use 'if' or 'whether'. 'She asked IF I could help.' Not 'that' — that's for statements."},
      {sentence:"He told the students ___ talk during the exam.",options:["don't","not to","to not"],correct:1,explanation:"Reported imperatives (orders, requests): tell/ask + object + NOT TO + infinitive. 'He told them NOT TO talk.'"},
      {sentence:"The doctor said I ___ eat more vegetables.",options:["should","ought","must"],correct:0,explanation:"'Should' in reported speech doesn't backshift. 'He said you SHOULD eat more vegetables' (advice reported directly)."},
      {sentence:"She asked where ___ going.",options:["am I","I was","was I"],correct:1,explanation:"In reported questions, the word order becomes statement-order (subject + verb), not question-order. 'She asked where I WAS going.'"},
      {sentence:"He said he ___ the film the previous night.",options:["watched","has watched","had watched"],correct:2,explanation:"Simple past → past perfect in reported speech. 'I watched' → 'He said he HAD WATCHED the film the night before.'"},
      {sentence:"The sign read: 'Visitors ___ not enter without ID.'",options:["do","can","must"],correct:2,explanation:"Prohibition signs use 'must not'. 'Must not enter without ID' — a firm rule/prohibition, not simply inability."},
      {sentence:"She told me that she ___ working there for five years.",options:["is","was","has been"],correct:1,explanation:"Backshift: present continuous → past continuous. 'She IS working' → 'She told me she WAS working.'"},
    ]
  },
  {
    category: "Comparatives & Superlatives",
    icon: "📊",
    color: "#059669",
    exercises: [
      {sentence:"This essay is ___ than my previous one.",options:["more good","better","gooder"],correct:1,explanation:"'Good' is irregular: good → better → best. Never 'more good' or 'gooder'."},
      {sentence:"The ___ you practise, the ___ you improve.",options:["more / more","most / most","more / better"],correct:0,explanation:"Double comparative structure: 'The more X, the more Y'. Both parts use the same comparative pattern."},
      {sentence:"She is ___ student in the class.",options:["most intelligent","the most intelligent","more intelligent"],correct:1,explanation:"Superlatives need 'the'. 'She is THE MOST INTELLIGENT student.' Multi-syllable adjectives use 'most'."},
      {sentence:"This is ___ problem I've ever encountered.",options:["the most difficult","a most difficult","most difficult"],correct:0,explanation:"Superlatives require 'the'. 'THE most difficult problem I've ever encountered.' The article is not optional."},
      {sentence:"The new model is ___ efficient than the old one.",options:["far more","much most","very more"],correct:0,explanation:"'Far more' and 'much more' are correct intensifiers for comparatives. 'Very' does NOT modify comparatives."},
      {sentence:"His accent is ___ mine.",options:["similar than","similar to","similar as"],correct:1,explanation:"'Similar' always takes 'to'. 'Similar TO mine.' Common error: 'similar than' doesn't exist in English."},
      {sentence:"The film was ___ disappointing ___ I expected.",options:["more / that","more / than","as / than"],correct:1,explanation:"Comparative adjective: 'more + adjective + THAN'. 'More disappointing THAN I expected.'"},
      {sentence:"The two methods are ___ effective.",options:["equally","equal","equalling"],correct:0,explanation:"Use 'equally' (adverb) to modify adjectives. 'Equally effective.' 'Equal' is an adjective and cannot modify another adjective."},
      {sentence:"This is ___ expensive item in the shop.",options:["the most","the more","most"],correct:0,explanation:"Superlative with 'the': 'THE most expensive item.' You must include 'the' before superlatives."},
      {sentence:"He speaks English ___ than his brother.",options:["more fluent","more fluently","fluenter"],correct:1,explanation:"'More fluently' — comparative of adverb. Add 'more' before adverbs. 'Fluenter' doesn't exist. 'Fluent' is an adjective."},
    ]
  },
  {
    category: "Word Formation",
    icon: "🔤",
    color: "#d97706",
    exercises: [
      {sentence:"The company needs to ___ its marketing strategy. (BROAD)",options:["broaden","broadness","broad"],correct:0,explanation:"BROADEN = verb (to make broader). Suffixes: -en makes adjectives into verbs (wide→widen, deep→deepen, broad→broaden)."},
      {sentence:"The policy was ___ criticised by experts. (WIDE)",options:["widely","wideness","widened"],correct:0,explanation:"WIDELY = adverb (modifies the verb 'criticised'). Form: adjective + -ly. 'The policy was WIDELY criticised.'"},
      {sentence:"There has been a significant ___ in crime rates. (REDUCE)",options:["reduce","reduction","reducing"],correct:1,explanation:"REDUCTION = noun (nominalisation of 'reduce'). 'A significant REDUCTION' — noun phrase needed after 'a'."},
      {sentence:"Her ___ of the situation was impressive. (ANALYSE)",options:["analytical","analyst","analysis"],correct:2,explanation:"ANALYSIS = noun form of 'analyse'. 'Her analysis WAS impressive.' (noun after possessive). Analyst = a person. Analytical = adjective."},
      {sentence:"The results were highly ___. (ENCOURAGE)",options:["encouraging","encouraged","encouragement"],correct:0,explanation:"ENCOURAGING = adjective (present participle used as adjective). 'The results were highly ENCOURAGING.' Encouragement is a noun."},
      {sentence:"Environmental ___ is now a key policy priority. (SUSTAIN)",options:["sustained","sustainable","sustainability"],correct:2,explanation:"SUSTAINABILITY = noun (the state of being sustainable). '-ity' suffix creates abstract nouns from adjectives."},
      {sentence:"He made a ___ decision to resign. (CONTROVERSY)",options:["controversy","controversial","controversially"],correct:1,explanation:"CONTROVERSIAL = adjective (modifies 'decision'). From controversy (noun) → controversial (adjective) → controversially (adverb)."},
      {sentence:"The research ___ several important patterns. (IDENTIFY)",options:["identification","identified","identifying"],correct:1,explanation:"IDENTIFIED = past tense verb. 'The research IDENTIFIED patterns' — past simple active, no article needed."},
      {sentence:"There is growing ___ about climate policy. (AGREE)",options:["disagreement","disagreeing","disagree"],correct:0,explanation:"DISAGREEMENT = noun. Prefix 'dis-' creates the opposite. '-ment' suffix creates nouns. 'Growing disagreement' = noun phrase."},
      {sentence:"The ___ of the experiment were unexpected. (FIND)",options:["find","findings","finder"],correct:1,explanation:"FINDINGS = plural noun (research results). 'The FINDINGS of the experiment' — academic term for results/conclusions."},
    ]
  },
  {
    category: "Sentence Transformation",
    icon: "🔄",
    color: "#be185d",
    exercises: [
      {sentence:"Active → Passive: 'Scientists discovered a new planet.'",options:["A new planet was discovered by scientists.","A new planet discovered by scientists.","A new planet has been discovered by scientists."],correct:0,explanation:"Past simple passive: was/were + past participle. 'Was discovered' for past simple. Keep 'by scientists' at the end."},
      {sentence:"Rewrite using 'Despite': 'Although she studied hard, she failed.'",options:["Despite studying hard, she failed.","Despite she studied hard, she failed.","Despite to study hard, she failed."],correct:0,explanation:"'Despite' + gerund (-ing). NEVER 'Despite + clause (subject+verb)'. 'Despite STUDYING hard, she failed.'"},
      {sentence:"Rewrite using 'It is argued': 'Many people believe AI will replace jobs.'",options:["It is argued that AI will replace jobs.","It is argued AI replacing jobs.","It is argued for AI replacing jobs."],correct:0,explanation:"'It is argued that + full clause.' This is a formal passive reporting structure. The 'that' is mandatory here."},
      {sentence:"Combine: 'The man is tall. He plays basketball.'",options:["The man, who is tall, plays basketball.","The man which is tall plays basketball.","The tall man, he plays basketball."],correct:0,explanation:"Use 'who' for people in relative clauses. Non-defining clause needs commas: 'The man, WHO IS TALL, plays basketball.' 'Which' is for things."},
      {sentence:"Rewrite using 'Not only': 'Exercise improves health. It also boosts mood.'",options:["Not only does exercise improve health, but it also boosts mood.","Not only exercise improves health, but it also boosts mood.","Not only exercise improves health but also boosts mood."],correct:0,explanation:"'Not only' causes inversion: NOT ONLY + auxiliary + subject + verb. 'Not only DOES exercise IMPROVE health, but it also boosts mood.'"},
      {sentence:"Change to conditional: 'He doesn't have money, so he can't travel.'",options:["If he had money, he could travel.","If he has money, he can travel.","If he would have money, he could travel."],correct:0,explanation:"Second conditional for hypothetical present/future: If + past simple, would/could + infinitive. 'If he HAD money, he COULD travel.'"},
      {sentence:"Rewrite using 'Having': 'After he finished the exam, he left.'",options:["Having finished the exam, he left.","Having finishing the exam, he left.","Having been finish the exam, he left."],correct:0,explanation:"Perfect participle clause: 'Having + past participle' replaces 'After + subject + past simple'. 'HAVING FINISHED the exam, he left.'"},
      {sentence:"Rewrite using passive reporting: 'People say he is the best.'",options:["He is said to be the best.","He is said that he is the best.","It is said he is the best."],correct:0,explanation:"Both 'He is said to be' AND 'It is said that he is' are correct. The first (personal passive) is more elegant for IELTS."},
      {sentence:"Combine with relative clause: 'The book won the prize. I recommended it.'",options:["The book that I recommended won the prize.","The book which I recommended it won the prize.","The book, I recommended, won the prize."],correct:0,explanation:"Object relative clause: 'The book THAT I recommended.' Do NOT include the pronoun 'it' — it's already replaced by 'that'."},
      {sentence:"Rewrite using causative: 'My phone was repaired by a technician.'",options:["I had my phone repaired.","I made my phone repaired.","I got my phone repair."],correct:0,explanation:"Causative have: have + object + past participle. 'I HAD my phone REPAIRED.' 'Get' also works: 'I got my phone repaired.'"},
    ]
  },
  {
    category: "Collocations",
    icon: "🤝",
    color: "#1d4ed8",
    exercises: [
      {sentence:"She ___ a suggestion during the meeting.",options:["did","made","had"],correct:1,explanation:"MAKE a suggestion (not do). Key collocations: make a decision, make a mistake, make progress, make an effort."},
      {sentence:"The company ___ a loss of £2 million last year.",options:["made","did","had"],correct:0,explanation:"MAKE a loss/profit. Also: make a difference, make an impression, make ends meet."},
      {sentence:"He ___ the blame for the project's failure.",options:["took","made","got"],correct:0,explanation:"TAKE the blame (accept responsibility). Also: take responsibility, take action, take pride, take part."},
      {sentence:"The researchers ___ a thorough investigation.",options:["made","conducted","did"],correct:1,explanation:"CONDUCT a study/investigation/survey/experiment. More formal and academic than 'do' or 'make'."},
      {sentence:"The charity ___ awareness about mental health.",options:["made","raised","grew"],correct:1,explanation:"RAISE awareness (not make). Also: raise concerns, raise funds, raise the issue, raise standards."},
      {sentence:"We need to ___ a compromise between the two views.",options:["make","reach","find"],correct:1,explanation:"REACH a compromise/agreement/conclusion/decision. All these 'arrival at a result' concepts use 'reach'."},
      {sentence:"She ___ her ambition to become a doctor.",options:["reached","achieved","made"],correct:1,explanation:"ACHIEVE an ambition/goal/objective/aim. REACH a destination/agreement. These are different."},
      {sentence:"The country ___ significant economic growth last decade.",options:["made","experienced","did"],correct:1,explanation:"EXPERIENCE growth/decline/difficulties/changes. Also: undergo changes, witness growth."},
      {sentence:"The policy ___ little effect on crime rates.",options:["had","made","did"],correct:0,explanation:"HAVE an effect/impact/influence ON something. 'The policy HAD little effect.' Not 'made an effect' — that doesn't exist."},
      {sentence:"She ___ a conclusion after reviewing all the evidence.",options:["made","reached","took"],correct:1,explanation:"REACH a conclusion (arrived at after reasoning). DRAW a conclusion (also correct). 'Make a conclusion' is not standard."},
    ]
  },
  {
    category: "Tense Review (Mixed)",
    icon: "⏱️",
    color: "#dc2626",
    exercises: [
      {sentence:"By the time she arrives, we ___ waiting for two hours.",options:["will have been","will be","are"],correct:0,explanation:"Future perfect continuous: will have been + -ing. Emphasises duration up to a future point. 'Will HAVE BEEN WAITING for two hours.'"},
      {sentence:"The company ___ in 1995 by two engineers.",options:["founded","was founded","has been founded"],correct:1,explanation:"Passive past simple for a specific past year. '1995' is a definite past time marker → past simple passive: WAS FOUNDED."},
      {sentence:"I wish I ___ harder at school.",options:["studied","had studied","would study"],correct:1,explanation:"'I wish + past perfect' = regret about the past. 'I wish I HAD STUDIED harder.' (It's too late now.)"},
      {sentence:"She ___ this company for 20 years when she finally retired.",options:["ran","has run","had been running"],correct:2,explanation:"Past perfect continuous: duration of activity up to a past point. She retired (past) — before that, 20 years of running = HAD BEEN RUNNING."},
      {sentence:"The results will be announced as soon as they ___ ready.",options:["will be","are","be"],correct:1,explanation:"After time conjunctions (as soon as, when, until, before, after), use present simple for future reference. NOT 'will be'."},
      {sentence:"It ___ heavily since this morning — the streets are flooded.",options:["rained","has been raining","had rained"],correct:1,explanation:"Present perfect continuous: action that started in the past and continues now, with a visible present result. Streets are flooded NOW."},
      {sentence:"He acted as if he ___ the answer.",options:["knows","knew","had known"],correct:1,explanation:"'As if/as though' + past simple = unreal comparison in the present. 'He acted AS IF he KNEW' — he probably doesn't know."},
      {sentence:"___ you ever ___ sushi before you went to Japan?",options:["Did you eat","Had you eaten","Have you eaten"],correct:1,explanation:"Past perfect for an experience before another past event. 'HAD you EATEN sushi before you WENT to Japan?' Both past, one before the other."},
      {sentence:"The bridge ___ for repairs next month.",options:["closes","is closing","will be closed"],correct:2,explanation:"Passive future: will be + past participle. 'Will be closed for repairs' — it will be closed BY someone. All three could work but passive is most formal."},
      {sentence:"She ___ her keys. She's looking everywhere.",options:["lost","has lost","had lost"],correct:1,explanation:"Present perfect: past action with current relevance (she can't get in NOW). 'HAS LOST her keys' — the result affects the present moment."},
    ]
  },
  {
    category: "Discourse Markers & Cohesion",
    icon: "🔗",
    color: "#0f766e",
    exercises: [
      {sentence:"The proposal is expensive. ___, it may not work.",options:["Furthermore","Moreover","What is more"],correct:1,explanation:"'Moreover' adds a stronger, more important point. All three are correct here, but 'moreover' is the most formal and elegant."},
      {sentence:"___ her lack of experience, she performed excellently.",options:["Despite","Although","However"],correct:0,explanation:"'Despite' + noun/gerund. 'Despite HER LACK OF experience.' 'Although' + clause (subject + verb). 'However' connects two sentences."},
      {sentence:"He worked extremely hard. ___, he failed the exam.",options:["Consequently","Nevertheless","Therefore"],correct:1,explanation:"'Nevertheless' = despite that / even so. Hard work (expected to help) but failed anyway = surprising contrast. 'Consequently' would mean work CAUSED failure."},
      {sentence:"The diet had no effect. ___, the exercise regime proved transformative.",options:["In contrast","On the contrary","However"],correct:0,explanation:"'In contrast' compares two different things. 'On the contrary' contradicts the previous statement ('It didn't work — in fact, the opposite is true')."},
      {sentence:"___ economists, growth will slow next year.",options:["According to","Referring to","Based to"],correct:0,explanation:"'According to' + source = reporting another's view. 'According to ECONOMISTS.' 'Based on' is also possible but 'based to' doesn't exist."},
      {sentence:"___ a result of the recession, unemployment rose sharply.",options:["As","Because","Due"],correct:0,explanation:"'As a result of + noun' = because of. 'AS A RESULT OF the recession.' 'Due to' also works. 'Because of' works too. 'Because' alone needs a clause."},
      {sentence:"The data is limited. ___, some conclusions can be drawn.",options:["Even so","Even though","Even if"],correct:0,explanation:"'Even so' = despite that / nevertheless (connector between sentences). 'Even though' + clause. 'Even if' + hypothetical condition."},
      {sentence:"She is both intelligent ___ hardworking.",options:["as well as","and","but also"],correct:1,explanation:"'Both X AND Y' is the correct correlative conjunction. 'Both intelligent AND hardworking.' 'Both... as well as' is redundant."},
      {sentence:"The solution is simple; ___, it is rarely applied.",options:["yet","but","so"],correct:0,explanation:"After a semicolon, conjunctive adverbs like 'yet' (= however, despite this) connect contrasting independent clauses."},
      {sentence:"___ the rain, we continued the outdoor event.",options:["In spite of","In spite","Despite of"],correct:0,explanation:"'In spite of' = despite. 'Despite OF' does not exist. 'In spite OF + noun'. Both 'despite the rain' and 'in spite of the rain' are correct."},
    ]
  },
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
                      Pro feature · Upgrade for unlimited access to all exercises
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
  { original: "Many people believe that governments should spend more money on education.", options: ["A lot of people think governments need to pay for education more.", "It is widely held that public authorities ought to allocate greater funding to the education sector.", "Governments should invest in education because many people want this."], correct: 1, explanation: "Option B is correct: 'It is widely held that' is a formal impersonal passive structure. 'Public authorities' is more academic than 'governments'. 'Allocate greater funding' replaces the weak 'spend more money'. Option A is wrong: 'a lot of' and 'think' are informal — this is a lower register version, not a paraphrase. Option C is wrong: it adds 'because many people want this' which changes the meaning of the original sentence." },
  { original: "Climate change is a serious problem that affects the whole world.", options: ["Global warming is a big issue everywhere on Earth.", "Climate change is dangerous for everyone around the world.", "Climate change represents a critical global challenge with far-reaching consequences for all nations."], correct: 2, explanation: "Option C is correct: 'Represents a critical global challenge' uses formal verb + noun phrase structure. 'Far-reaching consequences' is precise academic vocabulary. 'All nations' is more formal than 'whole world'. Option A is wrong: 'a big issue' is informal, and 'Global warming' slightly changes the meaning (it is one cause of climate change, not synonymous). Option B is wrong: 'dangerous for everyone' is informal and imprecise — climate change has varied consequences, not simply danger for all." },
  { original: "Young people nowadays spend too much time on social media.", options: ["In contemporary society, a significant proportion of young people devote an excessive amount of time to social media platforms.", "Kids these days use social media too often.", "Social media is used too much by today's youth."], correct: 0, explanation: "Option A is correct: 'In contemporary society' replaces 'nowadays'. 'A significant proportion of' is more precise than 'young people' alone. 'Devote an excessive amount of time to' is formal. 'Social media platforms' specifies the medium. Option B is wrong: 'Kids' is informal/colloquial and never appropriate in IELTS writing. Option C is wrong: the passive 'is used too much' weakens the sentence and 'today's youth' is a cliché — these are signs of lower register." },
  { original: "It is important for students to learn foreign languages.", options: ["Students need to study languages that are foreign to them.", "The acquisition of foreign languages is of considerable importance for learners.", "Learning foreign languages is a thing students should do."], correct: 1, explanation: "Option B is correct: 'The acquisition of' nominalises the verb phrase — a key IELTS skill. 'Of considerable importance' is formal and avoids the weak verb 'is important'. 'Learners' is more academic than 'students'. Option A is wrong: 'languages that are foreign to them' is a clumsy wordy expansion that adds nothing — this is a common paraphrasing mistake. Option C is wrong: 'a thing students should do' is extremely informal and vague — this is the kind of phrasing that earns Band 4 or below." },
  { original: "More and more people are choosing to work from home.", options: ["A growing number of individuals are opting to work remotely, a trend that has gained considerable momentum in recent years.", "Lots of people now prefer working at home instead of the office.", "Working from home is becoming popular with many people today."], correct: 0, explanation: "Option A is correct: 'A growing number of individuals' replaces the informal 'more and more people'. 'Opting to work remotely' is more formal and precise. The added clause about momentum shows contextual awareness — valuable for Task Achievement marks. Option B is wrong: 'Lots of people' is informal and would be penalised. 'At home instead of the office' is also informal phrasing. Option C is wrong: 'becoming popular' understates and simplifies the original. 'Many people today' is vague." },
  { original: "The government should do something to reduce crime in cities.", options: ["The authorities ought to implement targeted measures to curb criminal activity in urban areas.", "Something must be done by governments about city crime.", "The government needs to stop crime happening in cities."], correct: 0, explanation: "'The authorities ought to implement measures' uses passive construction and formal verb. 'Curb criminal activity' replaces 'reduce crime'. 'Urban areas' is more academic than 'cities'." },
  { original: "Technology has changed the way people communicate with each other.", options: ["Technology has made communication between people very different.", "Technological advancements have fundamentally transformed interpersonal communication.", "People now communicate differently because of technology."], correct: 1, explanation: "'Technological advancements' is a better noun phrase. 'Fundamentally transformed' is stronger than 'changed'. 'Interpersonal communication' is academic and precise." },
  { original: "Some countries have a problem with obesity because people eat too much unhealthy food.", options: ["Several nations face an escalating obesity crisis, attributable in part to the widespread consumption of nutritionally poor diets.", "Some places have fat people because of bad food habits.", "Obesity is a problem in certain countries where unhealthy food is eaten."], correct: 0, explanation: "'Escalating obesity crisis' shows problem awareness. 'Attributable in part to' is formal causative language. 'Nutritionally poor diets' replaces 'unhealthy food'." },
  { original: "The government needs to spend more money on public transport.", options: ["Authorities should make more financial investment in public infrastructure.", "The authorities ought to allocate greater resources to public transport infrastructure.", "More money is needed by the government for buses and trains."], correct: 1, explanation: "'Ought to allocate greater resources' is formal. 'Public transport infrastructure' upgrades 'public transport'. 'Authorities' replaces 'the government'." },
  { original: "Many young people find it difficult to get a job.", options: ["A significant proportion of young people face considerable challenges in securing employment.", "Lots of youth struggle to find jobs these days.", "Young persons have difficulty in job-getting situations."], correct: 0, explanation: "'A significant proportion' replaces 'many'. 'Face considerable challenges' is more academic. 'Securing employment' replaces 'get a job'." },
  { original: "The internet has made it easier to access information.", options: ["Online connectivity has simplified the process of information retrieval.", "The internet has made information more easy to access.", "People can get information easier because of the internet."], correct: 0, explanation: "'Online connectivity' is a sophisticated subject. 'Simplified the process of' replaces 'made it easier to'. 'Information retrieval' is academic." },
  { original: "Poverty causes many social problems.", options: ["Economic deprivation underlies a wide range of societal issues.", "Poverty is the reason for a lot of problems in society.", "Being poor makes many social things become problems."], correct: 0, explanation: "'Economic deprivation' elevates 'poverty'. 'Underlies' is more academic than 'causes'. 'Societal issues' upgrades 'social problems'." },
  { original: "Schools should teach students about health and fitness.", options: ["Educational institutions ought to incorporate health and fitness education into their curricula.", "Schools need to teach kids about how to be healthy and fit.", "Health education should be teached in schools."], correct: 0, explanation: "'Educational institutions' elevates 'schools'. 'Incorporate into curricula' is academic. 'Fitness education' nominalises the concept." },
  { original: "People are living longer than they used to.", options: ["Life expectancy has increased significantly in recent decades.", "People are now older when they die than before.", "Humans are currently living for more years than they were previously."], correct: 0, explanation: "'Life expectancy has increased' — nominalisation. 'Significantly' adds precision. 'In recent decades' specifies timeframe." },

  { original: "Schools should teach students about health and fitness.", options: ["Educational institutions ought to incorporate health and fitness education into their curricula.", "Schools need to teach kids about how to be healthy and fit.", "Health education should be teached in schools."], correct: 0, explanation: "'Educational institutions' elevates 'schools'. 'Incorporate into curricula' is academic. 'Fitness education' nominalises the concept." },
  { original: "People are living longer than they used to.", options: ["Life expectancy has increased significantly in recent decades.", "People are now older when they die than before.", "Humans are currently living for more years than they were previously."], correct: 0, explanation: "'Life expectancy has increased' — nominalisation. 'Significantly' adds precision. 'In recent decades' specifies timeframe." },
  { original: "Air pollution is getting worse in most cities.", options: ["Atmospheric pollution is deteriorating in the majority of urban centres.", "Air is becoming more polluted in most cities around the world.", "City air quality is becoming worser in many places."], correct: 0, explanation: "'Atmospheric pollution is deteriorating' is fully formal. 'Urban centres' replaces 'cities'. 'The majority of' replaces 'most'." },
  { original: "Exercise is good for both physical and mental health.", options: ["Physical activity yields significant benefits for both physical and psychological wellbeing.", "Doing exercise is helpful for the body and the mind.", "Exercise benefits your physical body as well as your mental mindset."], correct: 0, explanation: "'Physical activity yields benefits' nominalises the verb and uses a strong academic verb. 'Physical and psychological wellbeing' is the correct IELTS register — 'somatic' is too obscure for Band 8 and would likely be penalised as inappropriate vocabulary. Option B is informal. Option C is repetitive and unnatural ('physical body')." },
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
  { weak: "a lot of people", options: ["many individual humans", "a significant proportion of the population", "lots of human beings"], correct: 1, tip: "Correct: 'A significant proportion of the population' — formal, precise, and natural. Option A ('many individual humans') is not just informal — it is unnatural English that no native speaker would write. Option C ('lots of human beings') is also informal and sounds unnatural in academic context." },
  { weak: "good for society", options: ["very nice for communities", "beneficial for the wider community", "helpful to social groups"], correct: 1, tip: "'Beneficial for' is the key academic upgrade. Also try: 'advantageous', 'conducive to social wellbeing'." },
  { weak: "went up a lot", options: ["rose significantly", "went up very much", "increased in a big way"], correct: 0, tip: "'Rose significantly' — use trend verbs (rose, surged, climbed) + adverbs (significantly, sharply, steadily) in Task 1." },
  { weak: "bad for the environment", options: ["not good for nature", "detrimental to the natural environment", "harmful to our Earth"], correct: 1, tip: "'Detrimental to' is a high-band collocation. Also: 'damaging to ecological systems', 'harmful to biodiversity'." },
  { weak: "the government should do something", options: ["authorities ought to implement targeted measures", "the government needs to act", "officials have to do things"], correct: 0, tip: "'Implement targeted measures' is specific and academic. Never write 'do something' in IELTS — it signals vague thinking." },
  { weak: "nowadays", options: ["in today's world", "in contemporary society", "currently in this day and age"], correct: 1, tip: "'In contemporary society' or 'In the modern era' — 'Nowadays' is an IELTS cliché that lowers your Lexical Resource score." },
  { weak: "important", options: ["crucial / paramount / indispensable", "really needed and significant", "very necessary indeed"], correct: 0, tip: "Upgrade ladder: important → significant → crucial → paramount → indispensable. Each step raises your band." },
  { weak: "rise in crime", options: ["escalation in criminal activity", "going up of lawbreaking", "increase in bad behaviour"], correct: 0, tip: "'Escalation in criminal activity' uses nominalisation — a key IELTS skill. Also: 'surge in offences', 'proliferation of antisocial behaviour'." },
    { weak: "more and more", options: ["increasingly more", "an escalating number", "a growing number of people"], correct: 2, tip: "'A growing number of' or 'an increasing number of' — avoid 'more and more' in IELTS writing." },
  { weak: "use (a strategy)", options: ["utilise", "employ", "apply"], correct: 1, tip: "When the context is a method or strategy: 'employ a strategy' is the most natural academic collocation. 'Utilise' means to make practical use of a resource. 'Apply' works for principles or rules. All three are more formal than 'use' — 'employ' is the best fit for strategies and approaches." },
  { weak: "help", options: ["assist", "facilitate", "aid"], correct: 1, tip: "'Facilitate' is the strongest academic choice when you mean 'make easier'. 'Assist' for people." },
  { weak: "get better", options: ["improve", "enhance", "develop"], correct: 0, tip: "'Improve' is the standard academic verb. 'Enhance' implies adding quality. Both are correct." },
  { weak: "get worse", options: ["deteriorate", "worsen", "decline"], correct: 0, tip: "'Deteriorate' is the most academic — used for conditions, situations, and quality." },
  { weak: "show", options: ["indicate", "demonstrate", "illustrate"], correct: 1, tip: "'Demonstrate' (prove through evidence), 'indicate' (suggest), 'illustrate' (clarify with examples)." },
  { weak: "very big", options: ["enormous", "substantial", "significant"], correct: 2, tip: "'Significant' is preferred in academic writing — it implies importance, not just size." },
  { weak: "very small", options: ["minimal", "marginal", "negligible"], correct: 2, tip: "'Negligible' means too small to matter. 'Minimal' means the least possible." },
  { weak: "important", options: ["crucial", "vital", "significant"], correct: 0, tip: "'Crucial' implies that without it, something fails — the strongest of these three." },
  { weak: "think", options: ["consider", "argue", "contend"], correct: 1, tip: "'Argue' when making a case. 'Consider' for reflecting. 'Contend' for asserting a debated claim." },
  { weak: "say", options: ["state", "assert", "claim"], correct: 0, tip: "'State' is neutral. 'Assert' shows confidence. 'Claim' implies the speaker may be wrong." },
  { weak: "start", options: ["initiate", "implement", "introduce"], correct: 0, tip: "'Initiate' (begin a process), 'implement' (put into action), 'introduce' (bring something new)." },
  { weak: "end", options: ["conclude", "terminate", "cease"], correct: 0, tip: "'Conclude' (finish naturally), 'terminate' (end abruptly), 'cease' (stop an ongoing activity)." },
  { weak: "need", options: ["require", "necessitate", "demand"], correct: 1, tip: "'Necessitate' implies that something makes something else unavoidable — very academic." },
  { weak: "because of", options: ["due to", "as a result of", "owing to"], correct: 0, tip: "'Due to' after 'be' verbs. 'Owing to' is more formal and can start sentences." },
  { weak: "deal with", options: ["address", "tackle", "resolve"], correct: 0, tip: "'Address' (acknowledge and discuss), 'tackle' (take action), 'resolve' (find a final solution)." },
  { weak: "find out", options: ["determine", "establish", "identify"], correct: 1, tip: "'Establish' implies certainty. 'Determine' (reach a conclusion through analysis)." },
  { weak: "make sure", options: ["ensure", "guarantee", "verify"], correct: 0, tip: "'Ensure' is the academic standard. 'Guarantee' is too absolute. 'Verify' means to check." },
  { weak: "affect (negatively)", options: ["undermine", "impair", "damage"], correct: 0, tip: "When the effect is negative: 'undermine' (gradually weaken), 'impair' (reduce function — used for abilities, health), 'damage' (cause harm). 'Affect' alone is neutral and weak in IELTS. 'Undermine' is the strongest academic choice for gradual negative effects." },
  { weak: "keep", options: ["maintain", "sustain", "preserve"], correct: 0, tip: "'Maintain' (keep at same level), 'sustain' (keep going over time), 'preserve' (protect from change)." },
  { weak: "change", options: ["transform", "alter", "modify"], correct: 0, tip: "'Transform' implies radical change. 'Alter' is moderate. 'Modify' means small adjustments." },
  { weak: "try to", options: ["seek to", "aim to", "attempt to"], correct: 0, tip: "'Seek to' is the most formal. 'Aim to' shows intention. 'Attempt to' implies possible failure." },
  { weak: "stop", options: ["prevent", "prohibit", "restrict"], correct: 0, tip: "'Prevent' (stop from happening), 'prohibit' (ban by law), 'restrict' (limit but not fully stop)." },
  { weak: "agree", options: ["concur", "advocate", "endorse"], correct: 0, tip: "'Concur' means formally agree with someone's view — strong in academic arguments." },
  { weak: "disagree", options: ["refute", "dispute", "challenge"], correct: 1, tip: "'Dispute' (question validity), 'refute' (disprove), 'challenge' (question without disproving)." },
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
  if(!isPro) return (
    <div style={{maxWidth:560,margin:"40px auto",padding:"0 24px"}}>
      <div style={{textAlign:"center",marginBottom:24}}>
        <div style={{fontSize:52,marginBottom:12}}>🏋️</div>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:22,color:T.text,marginBottom:8}}>Practice Exercises</h2>
        <p style={{color:T.textMid,fontSize:14,fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.7}}>230+ exercises across 8 categories — all with instant feedback and detailed explanations.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:24}}>
        {[
          {icon:"📐",title:"Grammar",count:"130+ questions",desc:"Articles, tenses, conditionals, subject-verb agreement"},
          {icon:"🎧",title:"Dictation",count:"25 sentences",desc:"Listen and type — B1, B2, and C1 levels"},
          {icon:"🔤",title:"Sentence Builder",count:"13 sentences",desc:"Arrange words into the correct sentence"},
          {icon:"📚",title:"Vocabulary",count:"33 questions",desc:"Academic word list, collocations, word formation"},
          {icon:"✏️",title:"Paraphrasing",count:"18 questions",desc:"Rewrite sentences using Band 7+ academic language"},
          {icon:"🔍",title:"Error Correction",count:"25+ questions",desc:"Spot and fix real IELTS-style mistakes"},
          {icon:"📊",title:"Band Quiz",count:"10 questions",desc:"Self-assess your current writing level by criterion"},
        ].map((c,i)=>(
          <div key={i} style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:22,marginBottom:4}}>{c.icon}</div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700,fontSize:13,color:T.text}}>{c.title}</div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:11,color:T.primary,fontWeight:600,marginBottom:4}}>{c.count}</div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:11,color:T.textMuted,lineHeight:1.4}}>{c.desc}</div>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center"}}>
        <button onClick={onUpgrade} style={{background:T.primary,color:"white",border:"none",borderRadius:10,padding:"14px 32px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:`0 4px 16px ${T.primary}44`}}>
          🔓 Upgrade to Pro — $35 / 25 JOD
        </button>
        <div style={{marginTop:12,fontSize:12,color:T.textMuted,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>3-month subscription · Cancel anytime</div>
      </div>
    </div>
  );
  const [activeExTab, setActiveExTab] = useState("grammar");
  const [timeLeft, setTimeLeft] = useState(Infinity);
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
    { key:"dictation", icon:"🎧", label:"Dictation" },
    { key:"builder", icon:"🔤", label:"Sentence Builder" },
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
                      Pro feature · Upgrade for unlimited access to all exercises
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
          <button onClick={onUpgrade} style={{ background: T.primary, color: "white", border: "none", borderRadius: 8, padding: "12px 28px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Cairo','Source Sans Pro',system-ui" }}>🔓 Upgrade to Pro — $35</button>
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
        {activeExTab === "dictation" && <DictationExercises canAnswer={canAnswer} />}
        {activeExTab === "builder" && <SentenceBuilder canAnswer={canAnswer} />}
      </div>
    </div>
  );
};


// ── Dictation Component ──────────────────────────────────────────
const DictationExercises = ({canAnswer}) => {
  const [level,setLevel]=useState("B1");
  const [qIdx,setQIdx]=useState(0);
  const [typed,setTyped]=useState("");
  const [submitted,setSubmitted]=useState(false);
  const [playCount,setPlayCount]=useState(0);
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};
  const sentences=DICTATION_SENTENCES.filter(s=>s.level===level);
  const current=sentences[qIdx%sentences.length];

  const speak=()=>{
    if(!window.speechSynthesis)return;
    window.speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(current.text);
    u.lang="en-GB";u.rate=0.82;u.pitch=1;
    const voices=window.speechSynthesis.getVoices();
    const pick=voices.find(v=>v.lang.startsWith("en-GB")&&v.name.includes("Female"))
      ||voices.find(v=>v.lang.startsWith("en-GB"))
      ||voices.find(v=>v.lang.startsWith("en-US"))||null;
    if(pick)u.voice=pick;
    window.speechSynthesis.speak(u);
    setPlayCount(p=>p+1);
  };

  const normalise=s=>s.toLowerCase().trim().replace(/[.,!?;:]/g,"").replace(/\s+/g," ");
  const isCorrect=submitted&&normalise(typed)===normalise(current.text);

  const wordDiff=()=>{
    const cWords=current.text.split(" ");
    const uWords=typed.trim().split(" ");
    return cWords.map((w,i)=>({w,ok:normalise(w)===normalise(uWords[i]||""),userW:uWords[i]||"(missing)"}));
  };

  const next=()=>{setQIdx(i=>i+1);setTyped("");setSubmitted(false);setPlayCount(0);window.speechSynthesis?.cancel();};

  return(
    <div>
      <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
        <p style={{...sty,color:"#0369a1",fontSize:13,margin:"0 0 10px"}}>🎧 <strong>Dictation</strong> — Click Play, listen carefully, then type exactly what you hear. Builds spelling, grammar and listening together.</p>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{...sty,fontSize:12,color:"#0369a1",fontWeight:600}}>Level:</span>
          {["B1","B2","C1"].map(l=>(
            <button key={l} onClick={()=>{setLevel(l);setQIdx(0);setTyped("");setSubmitted(false);setPlayCount(0);}}
              style={{...sty,padding:"4px 12px",borderRadius:6,border:`1px solid ${level===l?"#0369a1":"#bae6fd"}`,background:level===l?"#0369a1":"white",color:level===l?"white":"#0369a1",fontWeight:level===l?700:400,fontSize:12,cursor:"pointer"}}>
              {l}
            </button>
          ))}
          <span style={{...sty,fontSize:11,color:"#64748b",marginLeft:4}}>{qIdx%sentences.length+1} / {sentences.length}</span>
        </div>
      </div>

      <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={speak} disabled={!canAnswer}
            style={{...sty,background:playCount===0?"#b91c1c":"#1e3a5f",color:"white",border:"none",borderRadius:10,padding:"12px 24px",fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:8,opacity:canAnswer?1:0.5,transition:"background 0.2s"}}>
            🔊 {playCount===0?"Play Sentence":"Play Again"}
          </button>
          {playCount>0&&!submitted&&<span style={{...sty,fontSize:12,color:"#64748b"}}>Played {playCount}× — you can replay as many times as needed</span>}
        </div>

        <textarea value={typed} onChange={e=>!submitted&&setTyped(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(!submitted&&typed.trim())setSubmitted(true);}}}
          placeholder={playCount===0?"Click Play first, then type here...":"Type exactly what you heard..."}
          disabled={submitted||!canAnswer}
          style={{...sty,width:"100%",minHeight:72,padding:"10px 12px",border:`2px solid ${submitted?(isCorrect?"#86efac":"#fca5a5"):"#e2e8f0"}`,borderRadius:8,fontSize:14,color:"#1e293b",background:submitted?(isCorrect?"#f0fdf4":"#fff1f2"):"#fafafa",resize:"vertical",boxSizing:"border-box",marginBottom:12,transition:"border-color 0.2s"}}
        />

        {!submitted&&(
          <button onClick={()=>setSubmitted(true)} disabled={!typed.trim()||!canAnswer}
            style={{...sty,background:typed.trim()&&canAnswer?"#b91c1c":"#e2e8f0",color:typed.trim()&&canAnswer?"white":"#94a3b8",border:"none",borderRadius:8,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:typed.trim()&&canAnswer?"pointer":"default"}}>
            Check →
          </button>
        )}

        {submitted&&(
          <div>
            <div style={{...sty,fontWeight:800,fontSize:15,color:isCorrect?"#059669":"#dc2626",marginBottom:12}}>
              {isCorrect?"✅ Perfect!":"❌ Not quite — differences highlighted below"}
            </div>
            <div style={{background:"#f8fafc",borderRadius:8,padding:"12px 14px",marginBottom:12,border:"1px solid #e2e8f0"}}>
              <div style={{...sty,fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Correct sentence</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                {wordDiff().map((wd,i)=>(
                  <span key={i} style={{...sty,fontSize:14,padding:"2px 6px",borderRadius:4,
                    background:wd.ok?"transparent":"#fee2e2",
                    color:wd.ok?"#1e293b":"#991b1b",
                    fontWeight:wd.ok?400:700,
                    borderBottom:wd.ok?"none":"2px solid #dc2626"}}>
                    {wd.w}
                  </span>
                ))}
              </div>
            </div>
            {!isCorrect&&(
              <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:8,padding:"10px 12px",marginBottom:12}}>
                <div style={{...sty,fontSize:11,fontWeight:700,color:"#9a3412",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>You wrote</div>
                <div style={{...sty,fontSize:13,color:"#9a3412",fontStyle:"italic"}}>{typed}</div>
              </div>
            )}
            <button onClick={next}
              style={{...sty,background:"#b91c1c",color:"white",border:"none",borderRadius:8,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Next sentence →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Sentence Builder Component ───────────────────────────────────
const SentenceBuilder = ({canAnswer}) => {
  const [filter,setFilter]=useState("all");
  const [qIdx,setQIdx]=useState(0);
  const [selected,setSelected]=useState([]);
  const [submitted,setSubmitted]=useState(false);
  const [showHint,setShowHint]=useState(false);
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};

  const qs=filter==="all"?SENTENCE_BUILDER_QS:SENTENCE_BUILDER_QS.filter(q=>q.level===filter);
  const q=qs[qIdx%qs.length];

  const shuffled=useMemo(()=>{
    const arr=[...q.words];
    const s=qIdx*7+qs.length;
    for(let i=arr.length-1;i>0;i--){const j=(s*(i+3))%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}
    return arr;
  },[q,qIdx,qs.length]);

  const builtStr=selected.map(i=>shuffled[i]).join(" ").toLowerCase();
  const isCorrect=submitted&&builtStr===q.correct.toLowerCase();

  const addWord=(i)=>{if(!submitted&&!selected.includes(i))setSelected(p=>[...p,i]);};
  const removeWord=(pos)=>{if(!submitted)setSelected(p=>p.filter((_,j)=>j!==pos));};

  const next=()=>{setQIdx(i=>(i+1)%qs.length);setSelected([]);setSubmitted(false);setShowHint(false);};

  return(
    <div>
      <div style={{background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
        <p style={{...sty,color:"#7c3aed",fontSize:13,margin:"0 0 10px"}}>🔤 <strong>Sentence Builder</strong> — Tap the words in the correct order to build the sentence. No grammar lesson — just try it.</p>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{...sty,fontSize:12,color:"#7c3aed",fontWeight:600}}>Level:</span>
          {[{k:"all",l:"All"},{k:"B1",l:"B1"},{k:"B2",l:"B2"},{k:"C1",l:"C1"}].map(({k,l})=>(
            <button key={k} onClick={()=>{setFilter(k);setQIdx(0);setSelected([]);setSubmitted(false);setShowHint(false);}}
              style={{...sty,padding:"4px 12px",borderRadius:6,border:`1px solid ${filter===k?"#7c3aed":"#c4b5fd"}`,background:filter===k?"#7c3aed":"white",color:filter===k?"white":"#7c3aed",fontWeight:filter===k?700:400,fontSize:12,cursor:"pointer"}}>
              {l}
            </button>
          ))}
          <span style={{...sty,fontSize:11,color:"#64748b",marginLeft:4}}>{qIdx%qs.length+1} / {qs.length}</span>
        </div>
      </div>

      <div style={{background:"white",border:"1px solid #e2e8f0",borderRadius:12,padding:"20px",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        {/* Answer tray */}
        <div style={{...sty,fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Your sentence</div>
        <div style={{minHeight:52,background:"#f8fafc",borderRadius:8,padding:"10px 12px",marginBottom:16,border:`2px solid ${submitted?(isCorrect?"#86efac":"#fca5a5"):"#e2e8f0"}`,display:"flex",flexWrap:"wrap",gap:6,alignItems:"center",transition:"border-color 0.2s"}}>
          {selected.length===0
            ?<span style={{...sty,color:"#94a3b8",fontSize:13,fontStyle:"italic"}}>Tap words below to build the sentence...</span>
            :selected.map((si,pos)=>(
              <button key={pos} onClick={()=>removeWord(pos)} disabled={submitted}
                style={{...sty,background:submitted?(isCorrect?"#dcfce7":"#fee2e2"):T.primaryLight,border:`1px solid ${submitted?(isCorrect?"#86efac":"#fca5a5"):T.primaryBorder}`,borderRadius:6,padding:"5px 10px",fontSize:13,fontWeight:600,color:submitted?(isCorrect?"#166534":"#991b1b"):T.primary,cursor:submitted?"default":"pointer"}}>
                {shuffled[si]}
              </button>
            ))
          }
        </div>

        {/* Word bank */}
        {!submitted&&(
          <>
            <div style={{...sty,fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:8,textTransform:"uppercase",letterSpacing:"0.06em"}}>Word bank — tap to add</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:16}}>
              {shuffled.map((word,i)=>!selected.includes(i)&&(
                <button key={i} onClick={()=>canAnswer&&addWord(i)}
                  style={{...sty,background:"white",border:"1px solid #e2e8f0",borderRadius:6,padding:"7px 13px",fontSize:13,fontWeight:500,color:"#475569",cursor:canAnswer?"pointer":"default",transition:"all 0.15s",boxShadow:"0 1px 3px rgba(0,0,0,0.06)"}}
                  onMouseOver={e=>{if(canAnswer){e.currentTarget.style.background="#f5f3ff";e.currentTarget.style.borderColor="#c4b5fd";e.currentTarget.style.color="#7c3aed";}}}
                  onMouseOut={e=>{e.currentTarget.style.background="white";e.currentTarget.style.borderColor="#e2e8f0";e.currentTarget.style.color="#475569";}}>
                  {word}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Controls */}
        {!submitted&&(
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={()=>setSubmitted(true)} disabled={selected.length<2}
              style={{...sty,background:selected.length>=2?"#b91c1c":"#e2e8f0",color:selected.length>=2?"white":"#94a3b8",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,fontWeight:700,cursor:selected.length>=2?"pointer":"default"}}>
              Check
            </button>
            <button onClick={()=>setSelected([])}
              style={{...sty,background:"white",border:"1px solid #e2e8f0",borderRadius:8,padding:"9px 16px",fontSize:13,color:"#64748b",cursor:"pointer"}}>
              Reset
            </button>
            <button onClick={()=>setShowHint(h=>!h)}
              style={{...sty,background:"white",border:"1px solid #f59e0b",borderRadius:8,padding:"9px 16px",fontSize:13,color:"#d97706",cursor:"pointer",fontWeight:600}}>
              {showHint?"Hide hint":"💡 Hint"}
            </button>
          </div>
        )}
        {showHint&&!submitted&&(
          <div style={{...sty,marginTop:10,padding:"8px 12px",background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,fontSize:13,color:"#92400e"}}>
            💡 {q.hint}
          </div>
        )}

        {/* Result */}
        {submitted&&(
          <div style={{marginTop:12}}>
            <div style={{...sty,fontWeight:800,fontSize:15,color:isCorrect?"#059669":"#dc2626",marginBottom:10}}>
              {isCorrect?"✅ Correct!":"❌ Not quite"}
            </div>
            {!isCorrect&&(
              <div style={{background:"#f8fafc",borderRadius:8,padding:"12px 14px",marginBottom:10,border:"1px solid #e2e8f0"}}>
                <div style={{...sty,fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>Correct answer</div>
                <div style={{...sty,fontSize:14,color:"#1e293b",fontWeight:600,lineHeight:1.6}}>{q.correct.charAt(0).toUpperCase()+q.correct.slice(1)}.</div>
              </div>
            )}
            <button onClick={next}
              style={{...sty,background:"#b91c1c",color:"white",border:"none",borderRadius:8,padding:"10px 22px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Self-Correct Mode ────────────────────────────────────────────
const SelfCorrectMode = ({isPro,onUpgrade}) => {
  const [text,setText]=useState("");
  const [selfText,setSelfText]=useState("");
  const [stage,setStage]=useState("write");
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const [hints,setHints]=useState(null); // {count, wrongPhrases, categories}
  const [hintLoading,setHintLoading]=useState(false);
  const [showPhrases,setShowPhrases]=useState(false);
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};

  // Stage 1→2: get hint count + problem locations (no corrections)
  const getHints=async(originalText)=>{
    setHintLoading(true);
    try{
      const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:400,
          system:`You are an English error detector. Find errors in the text and return ONLY JSON — no markdown:
{"count":3,"wrongPhrases":["exact phrase 1","exact phrase 2"],"categories":["grammar","word choice"]}
wrongPhrases: the exact incorrect words/phrases from the text (no corrections, just the problematic parts).
categories: types of errors found from: grammar, spelling, word choice, punctuation, structure, tense, article.
If no errors: {"count":0,"wrongPhrases":[],"categories":[]}`,
          messages:[{role:"user",content:originalText.trim()}]})});
      const data=await res.json();
      const txt=data.content?.map(b=>b.text||"").join("")||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      setHints(parsed);
    }catch(e){console.error(e);setHints({count:0,wrongPhrases:[],categories:[]});}
    finally{setHintLoading(false);}
  };

  // Stage 2→3: get full corrections
  const analyse=async()=>{
    setLoading(true);
    try{
      const res=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:700,
          system:`You are an English grammar checker. Analyse the provided text and return only JSON:
{"errors":[{"wrong":"exact wrong phrase","right":"corrected version","explanation":"concise rule explanation","severity":"major|moderate|minor"}],"overall":"one sentence summary","score":0}
score is 0-10. If no errors, return {"errors":[],"overall":"No errors found.","score":10}. Return ONLY valid JSON, no markdown.`,
          messages:[{role:"user",content:selfText.trim()}]})});
      const data=await res.json();
      const txt=data.content?.map(b=>b.text||"").join("")||"";
      const parsed=JSON.parse(txt.replace(/```json|```/g,"").trim());
      setResult({orig:text,self:selfText,parsed});
      setStage("result");
    }catch(e){console.error(e);}
    finally{setLoading(false);}
  };

  const goToCorrect=async(originalText)=>{
    setSelfText(originalText);
    setStage("correct");
    await getHints(originalText);
  };

  const reset=()=>{setText("");setSelfText("");setStage("write");setResult(null);setHints(null);setShowPhrases(false);};
  const sevColor={major:"#dc2626",moderate:"#d97706",minor:"#2563eb"};

  // Highlight wrong phrases in a display-only div
  const renderHighlighted=(txt,phrases)=>{
    if(!phrases||phrases.length===0) return <span style={{...sty,fontSize:14,color:"#1e293b",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{txt}</span>;
    let parts=[];
    let remaining=txt;
    let key=0;
    // Sort phrases by position of first occurrence
    const sorted=[...phrases].sort((a,b)=>txt.indexOf(a)-txt.indexOf(b));
    sorted.forEach(phrase=>{
      const pos=remaining.indexOf(phrase);
      if(pos===-1)return;
      if(pos>0)parts.push(<span key={key++} style={{...sty,fontSize:14,color:"#1e293b",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{remaining.slice(0,pos)}</span>);
      parts.push(
        <span key={key++} title="Possible error — find and fix this"
          style={{...sty,fontSize:14,background:"#fef3c7",borderBottom:"2px solid #f59e0b",borderRadius:"2px",color:"#92400e",fontWeight:600,lineHeight:1.8,cursor:"help",padding:"0 1px"}}>
          {phrase}
        </span>
      );
      remaining=remaining.slice(pos+phrase.length);
    });
    if(remaining)parts.push(<span key={key++} style={{...sty,fontSize:14,color:"#1e293b",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{remaining}</span>);
    return parts;
  };

  return(
    <div>
      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"12px 16px",marginBottom:16}}>
        <p style={{...sty,color:"#166534",fontSize:13,margin:0}}>🔎 <strong>Self-Correct Mode</strong> — Write freely, then find and fix your own mistakes before seeing the full AI feedback. Trains error-spotting independently.</p>
      </div>

      {/* Stage pills */}
      <div style={{display:"flex",gap:6,marginBottom:16}}>
        {[{id:"write",label:"1 Write"},
          {id:"correct",label:"2 Self-correct"},
          {id:"result",label:"3 Feedback"}].map(s=>(
          <div key={s.id} style={{...sty,fontSize:12,fontWeight:stage===s.id?700:400,
            color:stage===s.id?"white":["write","correct","result"].indexOf(s.id)<["write","correct","result"].indexOf(stage)?"#059669":"#94a3b8",
            padding:"5px 12px",borderRadius:20,
            background:stage===s.id?"#b91c1c":["write","correct","result"].indexOf(s.id)<["write","correct","result"].indexOf(stage)?"#dcfce7":"#f1f5f9",
            border:`1px solid ${stage===s.id?"#b91c1c":["write","correct","result"].indexOf(s.id)<["write","correct","result"].indexOf(stage)?"#86efac":"#e2e8f0"}`,
            whiteSpace:"nowrap"}}>
            {s.label}
          </div>
        ))}
      </div>

      {stage==="write"&&(
        <div>
          <label style={{...sty,fontSize:12,fontWeight:700,color:"#64748b",display:"block",marginBottom:6}}>Write anything — a sentence, paragraph, or argument. Don't worry about errors.</label>
          <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Start writing here..."
            style={{...sty,width:"100%",minHeight:140,padding:"12px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:14,color:"#1e293b",resize:"vertical",boxSizing:"border-box",marginBottom:12}}/>
          <button onClick={()=>goToCorrect(text)} disabled={text.trim().length<10}
            style={{...sty,background:text.trim().length>=10?"#b91c1c":"#e2e8f0",color:text.trim().length>=10?"white":"#94a3b8",border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:text.trim().length>=10?"pointer":"default"}}>
            Done — now find your own errors →
          </button>
        </div>
      )}

      {stage==="correct"&&(
        <div>
          {/* Hint banner */}
          {hintLoading&&(
            <div style={{...sty,background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#92400e"}}>
              ⏳ Scanning your text for issues...
            </div>
          )}
          {!hintLoading&&hints&&hints.count>0&&(
            <div style={{background:"#fff7ed",border:"1px solid #fed7aa",borderRadius:10,padding:"14px 16px",marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8,marginBottom:hints.categories.length>0?8:0}}>
                <div>
                  <span style={{...sty,fontSize:14,fontWeight:700,color:"#9a3412"}}>
                    ⚠️ Found <strong>{hints.count}</strong> {hints.count===1?"issue":"issues"} in your text
                  </span>
                  {hints.categories.length>0&&(
                    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:6}}>
                      {hints.categories.map((cat,i)=>(
                        <span key={i} style={{...sty,fontSize:11,fontWeight:700,color:"#9a3412",background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:4,padding:"2px 8px",textTransform:"capitalize"}}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {hints.wrongPhrases.length>0&&(
                  <button onClick={()=>setShowPhrases(p=>!p)}
                    style={{...sty,background:"white",border:"1px solid #fed7aa",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,color:"#d97706",cursor:"pointer",flexShrink:0}}>
                    {showPhrases?"Hide locations":"Show me where"}
                  </button>
                )}
              </div>
              <div style={{...sty,fontSize:12,color:"#9a3412",lineHeight:1.5}}>
                Can you find and fix {hints.count===1?"it":"all of them"}? Edit the text below, then click Check.
              </div>
            </div>
          )}
          {!hintLoading&&hints&&hints.count===0&&(
            <div style={{...sty,background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,color:"#166534",fontWeight:600}}>
              ✅ No obvious errors detected in your original text — but try editing it and check anyway.
            </div>
          )}

          {/* Highlighted original (shown when "Show me where" is clicked) */}
          {showPhrases&&hints?.wrongPhrases?.length>0&&(
            <div style={{marginBottom:12}}>
              <div style={{...sty,fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.06em"}}>
                Your original — problems underlined in amber (hover for tooltip)
              </div>
              <div style={{background:"#fffbeb",border:"2px solid #fbbf24",borderRadius:8,padding:"14px 16px",lineHeight:1.9,fontSize:14}}>
                {renderHighlighted(text,hints.wrongPhrases)}
              </div>
              <div style={{...sty,fontSize:11,color:"#92400e",marginTop:5}}>
                ⚠️ Locations are shown — corrections are hidden. Fix them yourself in the editor below.
              </div>
            </div>
          )}

          <label style={{...sty,fontSize:12,fontWeight:700,color:"#d97706",display:"block",marginBottom:6}}>
            Edit your text below — fix the errors you can find:
          </label>
          <textarea value={selfText} onChange={e=>setSelfText(e.target.value)}
            style={{...sty,width:"100%",minHeight:140,padding:"12px",border:"2px solid #f59e0b",borderRadius:8,fontSize:14,color:"#1e293b",resize:"vertical",boxSizing:"border-box",background:"#fffbeb",marginBottom:12}}/>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button onClick={analyse} disabled={loading}
              style={{...sty,background:"#b91c1c",color:"white",border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
              {loading?"⏳ Analysing...":"Check my corrections →"}
            </button>
            <button onClick={()=>{setStage("write");setHints(null);setShowPhrases(false);}}
              style={{...sty,background:"white",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 16px",fontSize:13,color:"#64748b",cursor:"pointer"}}>← Back</button>
          </div>
        </div>
      )}

      {stage==="result"&&result&&(
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{...sty,fontWeight:700,fontSize:15,color:"#1e293b"}}>Feedback on your corrected text</div>
            <div style={{fontSize:28,fontWeight:900,color:result.parsed.score>=8?"#059669":result.parsed.score>=5?"#d97706":"#dc2626",...sty}}>
              {result.parsed.score}<span style={{fontSize:14,color:"#94a3b8"}}>/10</span>
            </div>
          </div>
          <div style={{...sty,fontSize:13,color:"#475569",marginBottom:14,padding:"10px 14px",background:"#f8fafc",borderRadius:8,border:"1px solid #e2e8f0",lineHeight:1.6}}>
            {result.parsed.overall}
          </div>
          {result.parsed.errors.length===0
            ?<div style={{...sty,fontSize:14,color:"#059669",fontWeight:700,padding:"12px 16px",background:"#f0fdf4",border:"1px solid #86efac",borderRadius:8,marginBottom:14}}>✅ No errors found in your corrected text!</div>
            :<div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              {result.parsed.errors.map((e,i)=>(
                <div key={i} style={{background:"#fff5f5",border:`1px solid #fecaca`,borderRadius:8,padding:"10px 14px"}}>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>
                    <span style={{...sty,background:"#fee2e2",borderRadius:6,padding:"2px 8px",fontSize:12,color:"#991b1b",fontWeight:600}}>✗ "{e.wrong}"</span>
                    <span style={{color:"#94a3b8"}}>→</span>
                    <span style={{...sty,background:"#dcfce7",borderRadius:6,padding:"2px 8px",fontSize:12,color:"#166534",fontWeight:600}}>✓ "{e.right}"</span>
                    <span style={{...sty,fontSize:10,fontWeight:700,color:sevColor[e.severity]||"#64748b",background:"white",border:`1px solid ${sevColor[e.severity]||"#e2e8f0"}`,borderRadius:4,padding:"1px 6px",textTransform:"uppercase"}}>{e.severity}</span>
                  </div>
                  <div style={{...sty,fontSize:12,color:"#64748b"}}>💡 {e.explanation}</div>
                </div>
              ))}
            </div>
          }
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
            {[{label:"Original",text:result.orig,bg:"#f8fafc",border:"#e2e8f0"},{label:"Your correction",text:result.self,bg:"#f0fdf4",border:"#86efac"}].map(p=>(
              <div key={p.label} style={{background:p.bg,borderRadius:8,padding:"10px 12px",border:`1px solid ${p.border}`}}>
                <div style={{...sty,fontSize:11,color:"#94a3b8",marginBottom:4,fontWeight:600}}>{p.label}</div>
                <div style={{...sty,fontSize:12,color:"#1e293b",lineHeight:1.6}}>{p.text}</div>
              </div>
            ))}
          </div>
          <button onClick={reset}
            style={{...sty,background:"white",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,color:"#b91c1c",cursor:"pointer"}}>
            🔄 Try again with new text
          </button>
        </div>
      )}
    </div>
  );
};

// ── Daily Challenge Widget ────────────────────────────────────────
const DailyChallengeWidget = ({uiLang="en"}) => {
  const [ch,setCh]=useState(()=>getDailyChallenge());
  const [chosen,setChosen]=useState(()=>{try{const s=JSON.parse(localStorage.getItem(DAILY_KEY)||"null");return s?.answered?s.userAnswer:null;}catch{return null;}});
  const [submitted,setSubmitted]=useState(()=>{try{const s=JSON.parse(localStorage.getItem(DAILY_KEY)||"null");return s?.answered||false;}catch{return false;}});
  const [streak,setStreak]=useState(()=>getStreak());
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};
  if(!ch||!ch.q)return null;
  const q=ch.q;
  const isCorrect=submitted&&chosen===q.a;

  const pick=(i)=>{
    if(submitted)return;
    const today=new Date().toDateString();
    const yesterday=new Date(Date.now()-86400000).toDateString();
    const cur=getStreak();
    const newCount=cur.last===yesterday?cur.count+1:cur.last===today?cur.count:1;
    saveStreak(newCount);
    const updated={...ch,answered:true,userAnswer:i};
    try{localStorage.setItem(DAILY_KEY,JSON.stringify(updated));}catch{}
    setCh(updated);setChosen(i);setSubmitted(true);
    setStreak({count:newCount,last:today});
  };

  const ar=uiLang==="ar";
  const title=ar?"تحدي اليوم 🔥":"Daily Challenge 🔥";
  const sub=ar?`${new Date().toLocaleDateString("ar-SA",{weekday:"long",day:"numeric",month:"short"})}`:new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"short"});
  const streakLabel=ar?`يوم متتالٍ`:"day streak";
  const comeBack=ar?"عُد غداً لتحدٍّ جديد":"Come back tomorrow for a new challenge";

  return(
    <div style={{background:"linear-gradient(135deg,#1e3a5f 0%,#7f1d1d 100%)",borderRadius:16,padding:"24px",color:"white",marginBottom:0}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,flexWrap:"wrap",gap:10}}>
        <div>
          <div style={{...sty,fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.55)",textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:2}}>{title}</div>
          <div style={{...sty,fontSize:11,color:"rgba(255,255,255,0.4)"}}>{sub} · {q.cat}</div>
        </div>
        <div style={{textAlign:"center",background:"rgba(255,255,255,0.1)",borderRadius:10,padding:"8px 16px",border:"1px solid rgba(255,255,255,0.15)"}}>
          <div style={{fontSize:20,fontWeight:900,color:streak.count>0?"#fbbf24":"rgba(255,255,255,0.3)"}}>🔥 {streak.count}</div>
          <div style={{...sty,fontSize:10,color:"rgba(255,255,255,0.4)"}}>{streakLabel}</div>
        </div>
      </div>
      <div style={{...sty,fontSize:14,fontWeight:600,color:"white",marginBottom:14,lineHeight:1.6,direction:ar?"rtl":"ltr"}}>{q.q}</div>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:submitted?14:0}}>
        {q.opts.map((opt,i)=>{
          let bg="rgba(255,255,255,0.08)",bc="rgba(255,255,255,0.12)",col="rgba(255,255,255,0.8)";
          if(submitted){
            if(i===q.a){bg="rgba(16,185,129,0.25)";bc="#10b981";col="#6ee7b7";}
            else if(i===chosen&&chosen!==q.a){bg="rgba(239,68,68,0.18)";bc="#ef4444";col="#fca5a5";}
          }
          return(
            <button key={i} onClick={()=>pick(i)} disabled={submitted}
              style={{...sty,background:bg,border:`1.5px solid ${bc}`,borderRadius:8,padding:"10px 14px",textAlign:ar?"right":"left",cursor:submitted?"default":"pointer",color:col,fontSize:13,fontWeight:i===q.a&&submitted?700:400,display:"flex",gap:10,alignItems:"center",transition:"all 0.15s",direction:ar?"rtl":"ltr"}}
              onMouseOver={e=>{if(!submitted)e.currentTarget.style.background="rgba(255,255,255,0.14)";}}
              onMouseOut={e=>{if(!submitted)e.currentTarget.style.background=bg;}}>
              <span style={{background:"rgba(255,255,255,0.12)",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,flexShrink:0}}>
                {["A","B","C","D"][i]}
              </span>
              <span style={{flex:1}}>{opt}</span>
              {submitted&&i===q.a&&<span style={{flexShrink:0,marginLeft:ar?0:4,marginRight:ar?4:0}}>✓</span>}
            </button>
          );
        })}
      </div>
      {submitted&&(
        <div>
          <div style={{...sty,fontWeight:700,fontSize:13,color:isCorrect?"#6ee7b7":"#fca5a5",marginBottom:q.exp?6:8,direction:ar?"rtl":"ltr"}}>
            {isCorrect?`✅ ${ar?"صحيح! التسلسل":"Correct! Streak"}: ${streak.count} 🔥`:`❌ ${ar?"إجابة خاطئة":"Incorrect"}`}
          </div>
          {q.exp&&<div style={{...sty,fontSize:12,color:"rgba(255,255,255,0.6)",lineHeight:1.6,marginBottom:8,direction:ar?"rtl":"ltr"}}>💡 {q.exp}</div>}
          <div style={{...sty,fontSize:11,color:"rgba(255,255,255,0.35)",direction:ar?"rtl":"ltr"}}>{comeBack}</div>
        </div>
      )}
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
    {q:"Where is your hometown?",a:"I'm from Amman — it's the capital of Jordan. It's a fairly large city, built across a series of hills, and it has this interesting mix of really ancient history and quite modern development. I've spent most of my life there, so there's a real sense of attachment."},
    {q:"What do you like about your hometown?",a:"The thing I appreciate most is probably the sense of community — people are genuinely warm and quite welcoming to strangers. The food culture is brilliant too. You can find extraordinary traditional dishes like mansaf or falafel at almost any street corner. And the city has a character that's hard to describe — traditional and contemporary at the same time."},
    {q:"Is there anything you would like to change about your hometown?",a:"Honestly, the public transport. Most people depend entirely on private cars, which means the traffic congestion during peak hours is quite severe. A proper metro system or reliable tram network would transform the city. Several proposals have been made over the years, but nothing substantial has materialised yet."}
  ]},
  {topic:"Work & Studies",questions:[
    {q:"Do you work or study?",a:"I work in the education sector — I've been involved in coordinating English language examinations for a few years now. It's genuinely rewarding because the work directly affects students' opportunities. When someone achieves the score they need for university admission or a visa, that has a real impact on their life."},
    {q:"What do you enjoy about your work?",a:"The variety, mostly. No two days are identical — you're dealing with different institutions, different challenges, different people. I also enjoy the problem-solving aspect. There are often logistical or administrative issues that need creative solutions, and I find that quite engaging rather than frustrating."},
    {q:"Would you like to change your job in the future?",a:"I'm considering a move into business development, actually. The skills I've built — relationship management, analytical thinking, strategic communication — would transfer well. Ideally I'd retain the connection to education but shift focus towards building partnerships and commercial strategy rather than day-to-day coordination."}
  ]},
  {topic:"Technology",questions:[
    {q:"How often do you use your phone?",a:"Constantly, if I'm honest — probably more than I should. It's essentially the hub for everything: work communications, news, messaging. I'd estimate four or five hours daily, which sounds excessive when you say it out loud. I've tried reducing screen time but it's genuinely difficult when so much professional communication happens through messaging apps."},
    {q:"Do you think people spend too much time on technology?",a:"I think there's a real and growing dependency, yes. The concerning part isn't just the time — it's the displacement of richer activities. People scroll instead of having conversations, or check notifications instead of being present. That said, technology has also enabled remarkable things. The question is whether we're using it intentionally or being used by it."},
    {q:"What technology do you find most useful?",a:"GPS navigation, without question. I genuinely don't understand how people managed before it — the cognitive load of navigating an unfamiliar city without real-time guidance must have been enormous. Translation tools are a close second. For someone working across language contexts, they've become indispensable."}
  ]},
  {topic:"Food & Cooking",questions:[
    {q:"Do you enjoy cooking?",a:"I do, actually — more than I expected to. I find it quite meditative after a demanding day. Recently I've been experimenting with Asian techniques, which are quite different from Middle Eastern cooking — different spice profiles, different methods entirely. Getting those dishes right is genuinely satisfying."},
    {q:"What kind of food do you usually eat?",a:"Fairly typical for this region — rice, grilled meats, fresh salads with olive oil. I try to be reasonably conscious about nutrition, but I have a real weakness for good street food. A proper falafel sandwich from the right place is hard to beat, regardless of what I know about balanced diets."},
    {q:"Have your eating habits changed over the years?",a:"Significantly, yes. When I was younger, convenience was the only criterion. Now I'm much more deliberate — less sugar, fewer processed foods, more attention to where ingredients come from. I wouldn't say I'm obsessive about it, but there's a level of awareness now that simply wasn't there before."}
  ]},
  {topic:"Environment",questions:[
    {q:"Are you interested in protecting the environment?",a:"Increasingly so. Partly through media coverage and partly through things you observe directly — water availability in Jordan has become a visibly pressing issue over my lifetime. I've made personal changes, though I'm aware individual actions are limited without broader structural change."},
    {q:"What environmental problems are common in your country?",a:"Water scarcity is the most critical — Jordan is among the most water-stressed countries in the world, which has real implications for agriculture and daily life. Beyond that, air quality in urban areas, particularly Amman and Zarqa, has deteriorated significantly due to traffic density and industrial activity."},
    {q:"Do you think individuals can make a difference to the environment?",a:"Individually, the impact is marginal. Collectively, it can be significant — but only if millions of people make changes simultaneously, which requires cultural shifts that governments and institutions need to drive. I think framing it purely as individual responsibility actually lets corporations and policymakers off the hook."}
  ]},
  {topic:"Social Media",questions:[
    {q:"Which social media platforms do you use?",a:"Mainly WhatsApp for daily communication and Instagram for content. I check LinkedIn occasionally to follow professional developments in my field. Facebook less so — I use it mainly to stay connected with family who are geographically dispersed. The platforms I use most are almost entirely defined by who else uses them."},
    {q:"Do you think social media has more advantages or disadvantages?",a:"The honest answer is that it depends almost entirely on how you use it. For staying connected, accessing information and building professional networks — it's genuinely valuable. The problems arise from the design of these platforms, which are engineered to maximise engagement rather than wellbeing. Those incentives produce real harms: misinformation, anxiety, polarisation."},
    {q:"How has social media changed the way people communicate?",a:"It's fundamentally restructured it. Asynchronous communication has largely replaced synchronous — people now default to sending a voice message rather than making a call. Group conversations that would once have required physical presence happen through chat. Whether this represents genuine connection or a pale substitute for it is something I think about quite a bit."}
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

// ── CONVERSATION PRACTICE ─────────────────────
const FREE_CONVO_LEVELS=["b1"];
const CONVO_LEVELS=[
  {id:"a1",label:"A1 — Beginner",free:false},
  {id:"a2",label:"A2 — Elementary",free:false},
  {id:"b1",label:"B1 — Intermediate",free:true},
  {id:"b2",label:"B2 — Upper Intermediate",free:false},
  {id:"c1",label:"C1 — Advanced",free:false},
  {id:"c2",label:"C2 — Proficiency",free:false},
];

const CHAR_SARAH={
  name:"Sarah",
  role:"IELTS Conversation Partner",
  color:"#b91c1c",
  bg:"#fef2f2",
  border:"#fecaca",
  avatar:`<svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="38" fill="#fef2f2" stroke="#fecaca" strokeWidth="2"/>
    <circle cx="40" cy="30" r="14" fill="#f9a8a8"/>
    <ellipse cx="40" cy="62" rx="18" ry="12" fill="#b91c1c"/>
    <circle cx="40" cy="30" r="11" fill="#fddcdc"/>
    <ellipse cx="35" cy="28" rx="2" ry="2.5" fill="#7f1d1d"/>
    <ellipse cx="45" cy="28" rx="2" ry="2.5" fill="#7f1d1d"/>
    <path d="M35 35 Q40 39 45 35" stroke="#c05050" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    <rect x="22" y="44" width="36" height="5" rx="2" fill="#991b1b"/>
    <path d="M28 50 Q40 58 52 50" fill="#b91c1c"/>
  </svg>`
};

const ALL_IELTS_QUESTIONS=[
  ...SPEAKING_PART1.flatMap(t=>t.questions.map(q=>({part:1,topic:t.topic,q:q.q}))),
  ...SPEAKING_PART2.map(t=>({part:2,topic:t.topic,q:`Talk about the following topic for 1-2 minutes: "${t.topic}"`})),
  ...SPEAKING_PART3.flatMap(t=>t.questions.map(q=>({part:3,topic:t.topic,q:q.q}))),
];

const FREE_SESSION_MS=7*60*1000;
const IELTS_SESSION_MS=7*60*1000;
const SESSION_USED_KEY="ef_session_used_forever";
const SESSION_TIMER_KEY="ef_session_timer_ms";
const SESSION_HISTORY_KEY="ef_sarah_history";

const getSessionUsed=()=>{try{return localStorage.getItem(SESSION_USED_KEY)==="1";}catch{return false;}};
const markSessionUsed=()=>{try{localStorage.setItem(SESSION_USED_KEY,"1");}catch{}};

const saveTimerMs=(ms)=>{try{localStorage.setItem(SESSION_TIMER_KEY,String(ms));}catch{}};
const loadTimerMs=()=>{try{const v=localStorage.getItem(SESSION_TIMER_KEY);return v?parseInt(v,10):0;}catch{return 0;}};
const clearTimerMs=()=>{try{localStorage.removeItem(SESSION_TIMER_KEY);}catch{}};

const loadSarahHistory=()=>{try{const d=localStorage.getItem(SESSION_HISTORY_KEY);return d?JSON.parse(d):null;}catch{return null;}};
const saveSarahHistory=(data)=>{try{localStorage.setItem(SESSION_HISTORY_KEY,JSON.stringify(data));}catch{}};

// Varied correction phrases for Sarah
const CORRECTION_OPENERS=[
  "Actually, a more natural way to say that is",
  "Just a small note —",
  "Worth mentioning —",
  "One thing to polish:",
  "I noticed you said '...', which is close, but",
  "A small grammar point here —",
  "Native speakers would typically say",
  "That's a good attempt, but the natural phrasing is",
  "Quick tip:",
  "In English we usually say",
];

const stripForTTS=(text)=>text
  .replace(/[\u{1F300}-\u{1FAFF}]/gu,"")
  .replace(/[\u2600-\u27BF]/gu,"")
  .replace(/\*\*/g,"").replace(/\*/g,"")
  .replace(/#+\s*/g,"").replace(/_{1,2}/g,"")
  .replace(/[^\w\s.,!?;:'"-]/g," ")
  .replace(/\s+/g," ").trim();

const speakText=(text,onEnd)=>{
  if(!window.speechSynthesis)return;
  const doSpeak=()=>{
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(text);
    utt.lang="en-GB";utt.rate=0.88;utt.pitch=1.1;
    const voices=window.speechSynthesis.getVoices();
    // Explicit priority list — covers Chrome desktop, Chrome Android, Safari iOS
    const match=
      voices.find(v=>/google uk english female/i.test(v.name))||
      voices.find(v=>/samantha/i.test(v.name))||           // iOS Safari
      voices.find(v=>/karen/i.test(v.name))||              // iOS Australian female
      voices.find(v=>/moira/i.test(v.name))||              // iOS Irish female
      voices.find(v=>v.lang==="en-GB"&&!/male|man/i.test(v.name))||
      voices.find(v=>/google us english female|zira/i.test(v.name))||
      voices.find(v=>v.lang==="en-US"&&!/male|man/i.test(v.name))||
      voices.find(v=>v.lang.startsWith("en")&&!/male|man/i.test(v.name))||
      voices.find(v=>v.lang.startsWith("en"));
    if(match){utt.voice=match;utt.lang=match.lang;}
    if(onEnd)utt.onend=onEnd;
    if(window.speechSynthesis.paused)window.speechSynthesis.resume();
    window.speechSynthesis.speak(utt);
  };
  if(window.speechSynthesis.getVoices().length===0){
    window.speechSynthesis.onvoiceschanged=()=>{window.speechSynthesis.onvoiceschanged=null;doSpeak();};
  }else{doSpeak();}
};

// IELTS topic structure for user selection
const IELTS_TOPICS=SPEAKING_PART1.map(t=>({
  topic:t.topic,
  questions:t.questions.map(q=>q.q)
}));

const ConversationPractice=({isPro,onUpgrade})=>{
  const [screen,setScreen]=useState("setup");
  const [mode,setMode]=useState("free");
  const [level,setLevel]=useState(()=>{try{return localStorage.getItem("ef_sarah_level")||"b1";}catch{return "b1";}});
  const [userName,setUserName]=useState(()=>{try{return localStorage.getItem("ef_sarah_name")||"";}catch{return "";}});
  const [ieltsTopicIdx,setIeltsTopicIdx]=useState(0);
  const [messages,setMessages]=useState([]);
  const [isThinking,setIsThinking]=useState(false);
  const [isRecording,setIsRecording]=useState(false);
  const [isPaused,setIsPaused]=useState(false);
  const [transcript,setTranscript]=useState("");
  const [error,setError]=useState("");
  const [ttsEnabled,setTtsEnabled]=useState(true);
  const [sessionMs,setSessionMs]=useState(()=>loadTimerMs());
  const [sessionEnded,setSessionEnded]=useState(false);
  const [sessionBlockedToday,setSessionBlockedToday]=useState(false);
  const [report,setReport]=useState(null);
  const [showMicHint,setShowMicHint]=useState(true);
  const [pastHistory,setPastHistory]=useState(()=>loadSarahHistory());
  const messagesEndRef=useRef(null);
  const chatBoxRef=useRef(null);
  const recognitionRef=useRef(null);
  const sessionTimerRef=useRef(null);
  const isRecordingRef=useRef(false);
  const isPausedRef=useRef(false);
  const finalTranscriptRef=useRef("");
  const mountedRef=useRef(true);
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};

  const hasTimeLimit=!isPro;
  const sessionLimit=IELTS_SESSION_MS; // same for both modes
  const timeLeft=Math.max(0,sessionLimit-sessionMs);
  const timeLeftStr=`${Math.floor(timeLeft/60000)}:${String(Math.floor((timeLeft%60000)/1000)).padStart(2,"0")}`;

  // Cleanup on unmount — stop voice and recording
  useEffect(()=>{
    mountedRef.current=true;
    return()=>{
      mountedRef.current=false;
      window.speechSynthesis?.cancel();
      isRecordingRef.current=false;
      recognitionRef.current?.abort();
      clearInterval(sessionTimerRef.current);
    };
  },[]);

  // Session timer — persists to localStorage, respects pause
  useEffect(()=>{
    if(screen!=="chat"||!hasTimeLimit)return;
    clearInterval(sessionTimerRef.current);
    sessionTimerRef.current=setInterval(()=>{
      if(isPausedRef.current)return;
      setSessionMs(p=>{
        const next=p+1000;
        saveTimerMs(next);
        if(next>=sessionLimit){
          clearInterval(sessionTimerRef.current);
          window.speechSynthesis?.cancel();
          isRecordingRef.current=false;
          recognitionRef.current?.abort();
          if(mountedRef.current){
            setSessionEnded(true);
            markSessionUsed();
            clearTimerMs();
          }
        }
        return next;
      });
    },1000);
    return()=>clearInterval(sessionTimerRef.current);
  },[screen,hasTimeLimit,sessionLimit]);

  // Scroll to bottom on every new message and on thinking state change
  useEffect(()=>{
    if(screen!=="chat")return;
    const t=setTimeout(()=>{
      const el=chatBoxRef.current;
      if(el)el.scrollTop=el.scrollHeight;
    },80);
    return()=>clearTimeout(t);
  },[messages,isThinking]);

  const levelLocked=(id)=>!isPro&&!FREE_CONVO_LEVELS.includes(id);

  const buildSystemPrompt=()=>{
    const levelDesc={
      a1:"Use only basic vocabulary and very short sentences. Yes/no questions only.",
      a2:"Simple sentences, common vocabulary, short easy questions.",
      b1:"Clear sentences, everyday vocabulary, intermediate questions.",
      b2:"Varied vocabulary, some idioms, more challenging questions.",
      c1:"Sophisticated vocabulary, nuanced discussion questions.",
      c2:"Native-level, complex abstract topics, no simplification."
    };
    const ieltsTopicList=IELTS_TOPICS.map(t=>`- ${t.topic}: ${t.questions.join(" / ")}`).join("\n");
    const historyContext=pastHistory?`
RETURNING USER — past session info:
Name: ${pastHistory.name}
Level at last session: ${pastHistory.level}
Words/phrases they struggled with: ${pastHistory.struggles||"none noted"}
Words they learned: ${pastHistory.learned||"none noted"}
Greet them warmly as a returning student. Reference something specific from their past progress if relevant.`:"";

    return `You are Sarah, a warm, professional English conversation coach and IELTS examiner helping ${userName} practise speaking.
${historyContext}
Current level: ${levelDesc[level]||levelDesc.b1}

IELTS speaking topics and questions available:
${ieltsTopicList}

CORRECTION STYLE — vary your phrasing every time. Never use the same opener twice in a row. Choose from these styles:
- "Actually, the more natural phrasing here is '...' —"
- "Small note: native speakers would say '...' —"
- "Worth knowing: '...' sounds more natural —"
- "Just a quick tip — '...' works better here —"
- "That's close, but the natural English is '...' —"
- "Good effort, but we'd usually say '...' —"
- "One thing to polish: try '...' instead —"
- "Native speakers tend to say '...' in this situation —"

RESPONSE RULES:
1. MAXIMUM 2 SENTENCES per response.
2. NO emojis, NO asterisks, NO markdown. Plain text only.
3. After every user response: find ONE grammar or vocabulary error, correct it using one of the varied phrasings above. If no error, give a brief 4-6 word warm acknowledgement only.
4. Ask EXACTLY one question. Never two.
5. Every 4 turns: suggest a stronger vocabulary word: "A richer word here would be '...'"
6. Never repeat a question already asked in this conversation.
7. English only.
8. If no topic chosen yet: ask what they want to talk about, OR offer a choice of 3-4 IELTS topics by name so they can pick.
9. If user wants IELTS practice: offer them a list of available topics to choose from. Then work through Part 1 questions on that topic, transition to Part 2 (ask them to speak for 2 minutes — if they stop early, tell them to continue), then Part 3 discussion.`;
  };

  const callClaude=async(system,history,userMsg)=>{
    try{
      const msgs=history.slice(-14);
      if(userMsg)msgs.push({role:"user",content:userMsg});
      const res=await fetch("/api/analyze",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:160,system,messages:msgs})
      });
      if(!mountedRef.current)return "";
      const data=await res.json();
      return data?.content?.[0]?.text||"";
    }catch(e){return "";}
  };

  const addSarahMessage=(text)=>{
    if(!mountedRef.current)return;
    const clean=text.replace(/^\[Sarah\]\s*/i,"").replace(/\*\*/g,"").replace(/\*/g,"").trim();
    setMessages(prev=>[...prev,{role:"bot",text:clean,id:Date.now()+Math.random()}]);
    if(ttsEnabled)setTimeout(()=>speakText(stripForTTS(clean)),80);
  };

  const getHistory=()=>messages.map(m=>({
    role:m.role==="user"?"user":"assistant",
    content:m.role==="user"?`[${userName}]: ${m.text}`:`[Sarah]: ${m.text}`
  }));

  const sendMessage=async(text)=>{
    if(!text.trim()||isThinking||sessionEnded)return;
    setShowMicHint(false);
    window.speechSynthesis?.cancel();
    setTranscript("");
    finalTranscriptRef.current="";
    setMessages(prev=>[...prev,{role:"user",text:text.trim(),id:Date.now()}]);
    setIsThinking(true);
    const history=getHistory();
    const reply=await callClaude(buildSystemPrompt(),history,`[${userName}]: ${text.trim()}`);
    if(mountedRef.current){setIsThinking(false);if(reply)addSarahMessage(reply);}
  };

  const startConversation=async()=>{
    if(!userName.trim())return;
    if(hasTimeLimit&&getSessionUsed()){
      setSessionBlockedToday(true);
      return;
    }
    if(window.speechSynthesis?.getVoices().length===0)
      window.speechSynthesis.addEventListener("voiceschanged",()=>{},{once:true});
    clearTimerMs();
    setScreen("chat");
    setMessages([]);
    setSessionMs(0);
    setSessionEnded(false);
    setIsPaused(false);
    isPausedRef.current=false;
    setSessionBlockedToday(false);
    setShowMicHint(true);
    setIsThinking(true);
    const isReturning=!!pastHistory;
    const opening=isReturning
      ?`Welcome ${userName} back warmly. You know them — they practised before at ${pastHistory.level} level. Briefly acknowledge their return, then ask what they'd like to work on today.`
      :`Greet ${userName} warmly as Sarah. Say you are here to practise English together. Ask what they would like to talk about, or offer to ask IELTS-style questions if they want to practise for the exam.`;
    const reply=await callClaude(buildSystemPrompt(),[],opening);
    if(mountedRef.current){setIsThinking(false);if(reply)addSarahMessage(reply);}
  };

  const generateReport=async()=>{
    window.speechSynthesis?.cancel();
    isRecordingRef.current=false;
    recognitionRef.current?.abort();
    clearInterval(sessionTimerRef.current);
    setScreen("report");
    setReport(null);
    // Save session history for next time
    const convo=messages.map(m=>`${m.role==="user"?userName:"Sarah"}: ${m.text}`).join("\n");
    try{localStorage.setItem("ef_sarah_name",userName);}catch{}
    try{localStorage.setItem("ef_sarah_level",level);}catch{}
    if(!convo.trim()){setReport("No conversation recorded.");return;}
    const sys=`You are an IELTS speaking coach. Write a helpful session report for ${userName} based on this conversation.
Plain text only. No markdown, no asterisks, no emojis. Use these exact section headings followed by a colon and newline:

MISTAKES FOUND:
List up to 5 specific grammar or vocabulary errors with their corrections. Quote the exact wrong phrase, then give the correct version. If none, write "No significant errors found — well done."

VOCABULARY TO LEARN:
List 4-5 words or phrases that would have improved the conversation. For each, give a brief example sentence.

TIPS FOR IMPROVEMENT:
Give 3 specific, actionable tips based only on what you observed in this conversation.

STRONG POINTS:
Note 2 things the user did well.

OVERALL:
Write 2-3 warm, honest sentences about the user's current level and one clear priority to focus on next.`;
    try{
      const res=await fetch("/api/analyze",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:600,system:sys,
          messages:[{role:"user",content:`Conversation:\n\n${convo}`}]})});
      if(!mountedRef.current)return;
      const data=await res.json();
      const reportText=data?.content?.[0]?.text||"Could not generate report.";
      setReport(reportText);
      // Save history summary for next session
      saveSarahHistory({name:userName,level,date:new Date().toISOString(),
        struggles:messages.filter(m=>m.role==="bot"&&/say|phrasing|natural|word|tip/i.test(m.text)).slice(-3).map(m=>m.text).join("; "),
        learned:messages.filter(m=>m.role==="bot"&&/richer|stronger|better word/i.test(m.text)).map(m=>m.text).join("; ")
      });
      setPastHistory(loadSarahHistory());
    }catch(e){setReport("Could not generate report.");}
  };

  // Recording — single-shot per session, only isFinal results accumulated — fixes Android triple-word bug
  const startRecording=()=>{
    window.speechSynthesis?.cancel();
    if(!("webkitSpeechRecognition" in window)&&!("SpeechRecognition" in window)){
      setError("Voice input requires Google Chrome. Please type instead.");
      return;
    }
    isRecordingRef.current=true;
    finalTranscriptRef.current="";
    setTranscript("");
    setIsRecording(true);
    setError("");
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const startRec=()=>{
      if(!isRecordingRef.current)return;
      const rec=new SR();
      rec.lang="en-US";
      rec.continuous=false;   // single-shot: avoids Android duplicate result bug
      rec.interimResults=true;
      rec.maxAlternatives=1;
      // Snapshot of confirmed text before this session — never changes within session
      const base=finalTranscriptRef.current;
      rec.onresult=(e)=>{
        // Collect ONLY final results from THIS session — no iteration over old results
        let sessionFinal="";
        let sessionInterim="";
        for(let i=0;i<e.results.length;i++){
          if(e.results[i].isFinal)sessionFinal+=e.results[i][0].transcript;
          else sessionInterim+=e.results[i][0].transcript;
        }
        // Display = confirmed base + this session's final + live interim
        const display=[base,sessionFinal,sessionInterim].filter(s=>s.trim()).join(" ").trim();
        setTranscript(display);
      };
      rec.onerror=(e)=>{
        if(e.error==="no-speech")return; // silence — onend will restart
        if(e.error==="aborted")return;
        setError("Microphone error. Please type your response.");
        isRecordingRef.current=false;
        setIsRecording(false);
      };
      rec.onend=()=>{
        // Before restarting, save the final text from this session as the new base
        setTranscript(prev=>{
          finalTranscriptRef.current=prev;
          return prev;
        });
        if(isRecordingRef.current)setTimeout(()=>startRec(),80);
        else setIsRecording(false);
      };
      recognitionRef.current=rec;
      try{rec.start();}catch(err){
        if(isRecordingRef.current)setTimeout(()=>startRec(),300);
      }
    };
    startRec();
  };

  const stopRecording=()=>{
    isRecordingRef.current=false;
    recognitionRef.current?.stop();
    setIsRecording(false);
  };

  const SarahAvatar=({size=44})=>(
    <div style={{width:size,height:size,flexShrink:0,borderRadius:"50%",overflow:"hidden",border:`2px solid ${CHAR_SARAH.border}`}}
      dangerouslySetInnerHTML={{__html:CHAR_SARAH.avatar}}/>
  );

  const UserAvatar=()=>(
    <div style={{width:44,height:44,flexShrink:0,borderRadius:"50%",background:T.primaryLight,border:`2px solid ${T.primaryBorder}`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:16,color:T.primary,...sty}}>
      {(userName||"U").charAt(0).toUpperCase()}
    </div>
  );

  // REPORT SCREEN
  if(screen==="report")return(
    <div style={{maxWidth:620,margin:"0 auto",padding:"20px 0",...sty}}>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
        <SarahAvatar size={36}/>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:0}}>Session Report</h2>
      </div>
      {!report?(
        <div style={{textAlign:"center",padding:"48px",color:T.textMuted}}>
          <div style={{fontSize:13,marginBottom:14,...sty}}>Sarah is analysing your conversation...</div>
          <div style={{display:"flex",gap:5,justifyContent:"center"}}>
            {[0,1,2].map(i=><div key={i} style={{width:9,height:9,borderRadius:"50%",background:T.primary,animation:`bounce 1s ${i*0.2}s infinite`}}/>)}
          </div>
        </div>
      ):(
        <div style={{background:"white",border:`1px solid ${T.border}`,borderRadius:14,padding:"22px",lineHeight:1.9,fontSize:14,color:T.text,whiteSpace:"pre-wrap",...sty}}>
          {report}
        </div>
      )}
      {report&&(
        <button onClick={()=>{setScreen("setup");setMessages([]);setSessionMs(0);setSessionEnded(false);setReport(null);setTranscript("");finalTranscriptRef.current="";}}
          style={{marginTop:14,width:"100%",padding:"13px",background:T.primary,color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
          Start New Conversation
        </button>
      )}
    </div>
  );

  // BLOCKED — already used session today
  if(sessionBlockedToday&&!isPro)return(
    <div style={{maxWidth:520,margin:"0 auto",padding:"40px 16px",textAlign:"center",...sty}}>
      <div style={{fontSize:44,marginBottom:16}}>📅</div>
      <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,marginBottom:8}}>Free session used</h2>
      <p style={{fontSize:14,color:T.textMuted,marginBottom:24,lineHeight:1.7}}>
        You have used your free 7-minute session. Upgrade to Pro for unlimited sessions with all levels and no time limits.<br/>
        <span style={{direction:"rtl",display:"block",marginTop:8}}>لقد استخدمت جلستك المجانية (7 دقائق). اشترك في Pro للحصول على جلسات غير محدودة بجميع المستويات.</span>
      </p>
      <button onClick={onUpgrade}
        style={{padding:"13px 32px",background:T.primary,color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
        Upgrade to Pro — Unlimited Sessions
      </button>
    </div>
  );

  // SESSION ENDED
  if(sessionEnded&&screen==="chat")return(
    <div style={{maxWidth:520,margin:"0 auto",padding:"40px 16px",textAlign:"center",...sty}}>
      <div style={{fontSize:44,marginBottom:16}}>⏱</div>
      <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,marginBottom:8}}>Session complete</h2>
      <p style={{fontSize:14,color:T.textMuted,marginBottom:24,lineHeight:1.7}}>
        Your free 7-minute session is now complete. View your report below, or upgrade to Pro for unlimited sessions.<br/>
        <span style={{direction:"rtl",display:"block",marginTop:6}}>انتهت جلستك المجانية (7 دقائق). اطّلع على تقريرك أدناه، أو اشترك في Pro للجلسات غير المحدودة.</span>
      </p>
      <div style={{display:"flex",gap:10,flexDirection:"column"}}>
        <button onClick={generateReport}
          style={{padding:"13px",background:T.green,color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
          View My Session Report
        </button>
        <button onClick={onUpgrade}
          style={{padding:"13px",background:T.primary,color:"white",border:"none",borderRadius:10,fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
          Upgrade to Pro — Unlimited Sessions
        </button>
      </div>
    </div>
  );

  // SETUP SCREEN
  if(screen==="setup")return(
    <div style={{maxWidth:520,margin:"0 auto",padding:"20px 0",...sty}}>
      <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:10,padding:"12px 14px",marginBottom:10,fontSize:13,color:"#065f46",...sty}}>
        <strong>What Sarah does:</strong> She has a real conversation with you, corrects your grammar and vocabulary naturally as you speak, and gives you a full report at the end. You can also ask her for IELTS-style practice questions.
        <div style={{direction:"rtl",marginTop:6,color:"#047857",fontSize:12}}>سارة تتحدث معك وتصحح أخطاء القواعد والمفردات أثناء المحادثة، وتعطيك تقريراً في النهاية. يمكنك طلب أسئلة على طراز الآيلتس منها.</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:16}}>
        <div style={{background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:10,padding:"9px 13px",fontSize:12,color:"#1d4ed8",...sty}}>
          <strong>Requires Google Chrome</strong> for voice input and Sarah's voice. Other browsers: text only.<br/>
          <span style={{direction:"rtl",display:"block",marginTop:3,color:"#1e40af"}}>يتطلب متصفح Google Chrome للصوت. المتصفحات الأخرى: كتابة فقط.</span>
        </div>
        <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"9px 13px",fontSize:12,color:T.amber,...sty}}>
          <strong>Grammar and vocabulary only.</strong> Pronunciation cannot be assessed through text.<br/>
          <span style={{direction:"rtl",display:"block",marginTop:3}}>تحسين القواعد والمفردات فقط — النطق لا يمكن تقييمه.</span>
        </div>
        {!isPro&&(
          <div style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:10,padding:"9px 13px",fontSize:12,color:T.primary,...sty}}>
            <strong>Free users:</strong> One free 7-minute session. Pro = unlimited sessions and all levels.<br/>
            <span style={{direction:"rtl",display:"block",marginTop:3}}>المجاني: جلسة واحدة مجانية مدتها 7 دقائق. Pro = جلسات غير محدودة بجميع المستويات.</span>
          </div>
        )}
      </div>
      <div style={{textAlign:"center",marginBottom:16}}>
        <SarahAvatar size={58}/>
        <h2 style={{fontFamily:"Georgia,serif",fontSize:19,color:T.text,margin:"10px 0 4px"}}>Conversation with Sarah</h2>
        <p style={{fontSize:13,color:T.textMuted,margin:0}}>Real-time corrections · IELTS questions on request</p>
      </div>
      <div style={{background:"white",border:`1px solid ${T.border}`,borderRadius:14,padding:"18px"}}>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:T.textMid,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Your name</label>
          <input value={userName} onChange={e=>setUserName(e.target.value)} placeholder="Enter your first name"
            onKeyDown={e=>{if(e.key==="Enter"&&userName.trim()){if(hasTimeLimit&&getSessionUsed()){setSessionBlockedToday(true);}else{startConversation();}}}}
            style={{width:"100%",padding:"10px 12px",borderRadius:8,border:`1px solid ${T.borderMid}`,fontSize:14,...sty,boxSizing:"border-box"}}/>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",fontSize:11,fontWeight:700,color:T.textMid,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>Your level</label>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:5}}>
            {CONVO_LEVELS.map(l=>{
              const locked=levelLocked(l.id);
              return(
                <button key={l.id} onClick={()=>locked?onUpgrade():setLevel(l.id)}
                  style={{padding:"7px 4px",borderRadius:8,border:`1px solid ${level===l.id?T.primary:T.border}`,background:level===l.id?T.primaryLight:locked?T.bgMuted:"white",cursor:"pointer",fontSize:11,fontWeight:level===l.id?700:500,color:level===l.id?T.primary:locked?T.textLight:T.textMid,...sty,textAlign:"center"}}>
                  {locked?"🔒 ":""}{l.id.toUpperCase()}{l.id==="b1"?" ✓":""}
                </button>
              );
            })}
          </div>
          {!isPro&&<div style={{fontSize:11,color:T.textMuted,marginTop:5}}>B1 free · Other levels require Pro</div>}
        </div>
        <button onClick={()=>{if(!userName.trim())return;if(hasTimeLimit&&getSessionUsed()){setSessionBlockedToday(true);return;}startConversation();}}
          disabled={!userName.trim()}
          style={{width:"100%",padding:"13px",background:userName.trim()?T.primary:T.border,color:"white",border:"none",borderRadius:10,fontSize:15,fontWeight:700,cursor:"pointer",...sty}}>
          Start Conversation with Sarah →
        </button>
      </div>
    </div>
  );

  // CHAT SCREEN
  return(
    <div style={{maxWidth:620,margin:"0 auto",display:"flex",flexDirection:"column",height:"calc(100vh - 240px)",minHeight:440,...sty}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 0",borderBottom:`1px solid ${T.border}`,marginBottom:10,flexShrink:0}}>
        <SarahAvatar size={34}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>Sarah</div>
          <div style={{fontSize:11,color:T.textMuted}}>Conversation · {level.toUpperCase()}{isPaused?" · Paused":""}</div>
        </div>
        {hasTimeLimit&&(
          <div style={{fontSize:12,fontWeight:700,color:isPaused?T.textMuted:timeLeft<60000?T.red:timeLeft<120000?T.amber:T.green,background:isPaused?T.bgMuted:timeLeft<60000?T.redBg:timeLeft<120000?T.amberBg:T.greenBg,padding:"3px 9px",borderRadius:6,flexShrink:0,...sty}}>
            {timeLeftStr}
          </div>
        )}
        {/* Pause button */}
        <button onClick={()=>{
          const next=!isPaused;
          setIsPaused(next);
          isPausedRef.current=next;
          if(next){
            // Pausing — stop voice and recording
            window.speechSynthesis?.cancel();
            if(isRecording){isRecordingRef.current=false;recognitionRef.current?.stop();setIsRecording(false);}
          }
        }}
          title={isPaused?"Resume":"Pause"}
          style={{background:isPaused?T.amber:T.bgMuted,border:`1px solid ${isPaused?T.amberBorder:T.border}`,borderRadius:8,padding:"5px 8px",fontSize:13,cursor:"pointer",color:isPaused?T.amber:T.textMid,flexShrink:0,...sty}}>
          {isPaused?"▶":"⏸"}
        </button>
        <button onClick={()=>{window.speechSynthesis?.cancel();setTtsEnabled(v=>!v);}}
          title={ttsEnabled?"Mute Sarah":"Unmute Sarah"}
          style={{background:ttsEnabled?T.primaryLight:T.bgMuted,border:`1px solid ${ttsEnabled?T.primaryBorder:T.border}`,borderRadius:8,padding:"5px 8px",fontSize:12,cursor:"pointer",color:ttsEnabled?T.primary:T.textMuted,flexShrink:0,...sty}}>
          {ttsEnabled?"🔊":"🔇"}
        </button>
        <button onClick={generateReport}
          style={{background:T.bgMuted,border:`1px solid ${T.border}`,borderRadius:8,padding:"5px 10px",fontSize:12,cursor:"pointer",color:T.textMid,flexShrink:0,...sty}}>
          End
        </button>
      </div>

      {/* Messages */}
      <div ref={chatBoxRef} style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,paddingBottom:10}}>
        {messages.map((msg)=>{
          const isUser=msg.role==="user";
          return(
            <div key={msg.id} style={{display:"flex",gap:10,alignItems:"flex-start",flexDirection:isUser?"row-reverse":"row"}}>
              {isUser?<UserAvatar/>:<SarahAvatar size={34}/>}
              <div style={{maxWidth:"80%",display:"flex",flexDirection:"column",alignItems:isUser?"flex-end":"flex-start"}}>
                {!isUser&&<div style={{fontSize:11,fontWeight:700,color:CHAR_SARAH.color,marginBottom:3,...sty}}>Sarah</div>}
                <div style={{background:isUser?T.primaryLight:CHAR_SARAH.bg,border:`1px solid ${isUser?T.primaryBorder:CHAR_SARAH.border}`,borderRadius:isUser?"14px 14px 4px 14px":"14px 14px 14px 4px",padding:"10px 14px",fontSize:14,color:T.text,lineHeight:1.65,...sty}}>
                  {msg.text}
                </div>
              </div>
            </div>
          );
        })}
        {isThinking&&(
          <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
            <SarahAvatar size={34}/>
            <div style={{background:CHAR_SARAH.bg,border:`1px solid ${CHAR_SARAH.border}`,borderRadius:"14px 14px 14px 4px",padding:"12px 16px"}}>
              <div style={{display:"flex",gap:4,alignItems:"center"}}>
                {[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:T.textMuted,animation:`bounce 1s ${i*0.2}s infinite`}}/>)}
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef}/>
      </div>

      {/* Paused overlay */}
      {isPaused&&(
        <div style={{textAlign:"center",background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:8,padding:"8px 12px",marginBottom:6,fontSize:13,color:T.amber,...sty}}>
          ⏸ Paused — tap ▶ to resume
        </div>
      )}

      {/* Mic hint */}
      {showMicHint&&messages.length>0&&!isRecording&&(
        <div style={{textAlign:"center",fontSize:12,color:T.primary,background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:8,padding:"6px 12px",marginBottom:6,...sty}}>
          Tap the mic button below to speak ↓
        </div>
      )}

      {/* Input */}
      <div style={{flexShrink:0,paddingTop:6}}>
        {error&&<div style={{fontSize:12,color:T.red,marginBottom:5,...sty}}>{error}</div>}
        <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
          <textarea value={transcript} onChange={e=>setTranscript(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();if(!isRecording)sendMessage(transcript);}}}
            placeholder={isRecording?"Listening... tap stop when done":"Tap mic to speak or type here..."}
            rows={2}
            style={{flex:1,padding:"10px 12px",borderRadius:10,border:`1.5px solid ${isRecording?T.red:T.borderMid}`,fontSize:14,...sty,resize:"none",lineHeight:1.5,boxSizing:"border-box",transition:"border-color 0.2s"}}/>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            <button onClick={isRecording?stopRecording:startRecording}
              disabled={isPaused}
              aria-label={isRecording?"Stop recording":"Start recording"}
              style={{width:50,height:50,borderRadius:"50%",border:"none",background:isPaused?T.border:isRecording?T.red:T.primary,color:"white",fontSize:20,cursor:isPaused?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:isRecording?`0 0 0 4px ${T.redBorder}`:`0 3px 10px ${T.primary}55`,transition:"all 0.2s",opacity:isPaused?0.5:1}}>
              {isRecording?"⏹":"🎤"}
            </button>
            <button onClick={()=>{if(!isRecording&&!isPaused)sendMessage(transcript);}} disabled={!transcript.trim()||isThinking||isRecording||isPaused}
              aria-label="Send message"
              style={{width:50,height:50,borderRadius:"50%",border:"none",background:transcript.trim()&&!isThinking&&!isRecording?T.green:T.border,color:"white",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,transition:"background 0.2s"}}>
              ↑
            </button>
          </div>
        </div>
        {isRecording&&<div style={{fontSize:12,color:T.red,marginTop:4,...sty}}>Recording — tap stop when done</div>}
      </div>
      <style>{`@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}`}</style>
    </div>
  );
};
const SpeakingPage = ({isPro, onUpgrade}) => {
  const [tab, setTab] = useState("chat");
  const [expandedP1, setExpandedP1] = useState(null);
  const [expandedP2, setExpandedP2] = useState(null);
  const [expandedP3, setExpandedP3] = useState(null);
  const [showAnswer, setShowAnswer] = useState({});

  const tabs = [
    {id:"chat",label:"🎤 Speaking Practice",free:true},
    {id:"examples",label:"📝 Models & Tips",free:true},
    {id:"vocabulary",label:"📚 Vocabulary",free:false},
    {id:"mistakes",label:"⚠️ Common Mistakes",free:true}
  ];
  const toggleAnswer = (key) => setShowAnswer(prev=>({...prev,[key]:!prev[key]}));
  const sty = {fontFamily:"'Cairo','Source Sans Pro',system-ui"};
  const card = {background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",marginBottom:16,boxShadow:T.shadow};
  const locked = (free) => !free && !isPro;

    return (
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 24px 80px"}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:28,color:T.text,margin:"0 0 4px",direction:"ltr",textAlign:"left"}}>🗣️ Speaking Practice</h1>
      <p style={{...sty,fontSize:14,color:T.textMuted,margin:"0 0 20px",lineHeight:1.5}}>Practise speaking with Sarah and get real-time grammar and vocabulary corrections.</p>

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
                      <>
                        <div style={{background:"#fef9c3",border:"1px solid #fde047",borderRadius:8,padding:"10px 14px",marginBottom:8,fontSize:12,color:"#713f12",lineHeight:1.5}}>
                          ⚠️ <strong>لا تحفظ هذه الإجابة حرفياً.</strong> الممتحن مدرَّب على اكتشاف الإجابات المحفوظة. استخدمها كمثال على الهيكل والمفردات، ثم تحدّث بأسلوبك الخاص عن تجربتك الشخصية.
                        </div>
                        <div style={{background:T.greenBg,border:`1px solid ${T.greenBorder}`,borderRadius:8,padding:"14px",...sty,fontSize:13,color:T.textMid,lineHeight:1.7,whiteSpace:"pre-line"}}>{item.model}</div>
                      </>
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

      {/* CHAT TAB — shown first by default */}
      {tab==="chat"&&(
        <ConversationPractice isPro={isPro} onUpgrade={onUpgrade}/>
      )}

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
    {title:"The Architecture of Sleep",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Sleep, far from being a passive state, is an active neurological process that scientists are only now beginning to fully understand. Research over the past two decades has revealed that sleep consists of distinct stages, each serving unique biological functions.\n\nThe sleep cycle is divided into non-rapid eye movement (NREM) and rapid eye movement (REM) sleep. NREM has three stages. Stage 1 is a transitional period lasting a few minutes. Stage 2 features specific brain wave patterns known as sleep spindles and K-complexes. Stage 3, called deep sleep or slow-wave sleep, is the most restorative phase, during which the body repairs tissues, strengthens the immune system, and consolidates memories.\n\nREM sleep occurs approximately 90 minutes after falling asleep and recurs in increasingly longer periods throughout the night. The brain becomes remarkably active during REM — in some respects more active than during waking hours. The eyes move rapidly beneath closed lids, and most vivid dreaming occurs. The body's voluntary muscles become temporarily paralysed, a phenomenon called atonia, preventing individuals from acting out dreams.\n\nModern research has established that adults require between seven and nine hours for optimal functioning. However, the University of California found that approximately one percent of the population carries a genetic mutation allowing them to function normally on just six hours — so-called 'short sleepers' who don't experience the cognitive impairments affecting most sleep-deprived people.\n\nThe consequences of chronic sleep deprivation extend far beyond tiredness. Research in Nature demonstrated that sleeping six hours instead of eight for two weeks produces cognitive impairments equivalent to staying awake for 48 hours continuously. These impairments affect attention, working memory, and decision-making, yet chronically sleep-deprived individuals often fail to recognise the extent of their own impairment.\n\nThe relationship between sleep and long-term health is perhaps most concerning. Epidemiological studies have linked insufficient sleep to cardiovascular disease, obesity, diabetes, and weakened immune function. Professor Matthew Walker of UC Berkeley has argued that sleep deprivation is now so widespread in industrialised societies that it constitutes a public health epidemic.",
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
    {title:"Urban Green Spaces and Public Health",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"As global urbanisation accelerates — with the UN projecting that 68% of the world's population will live in cities by 2050 — the role of green spaces in urban environments has become a subject of increasing scientific interest. Parks, gardens, and urban forests are now recognised as critical infrastructure delivering measurable benefits to public health, environmental quality, and social cohesion.\n\nResearch published in The Lancet demonstrated that residents living within 300 metres of green space showed significantly lower levels of cortisol, the body's primary stress hormone. A study across nine European cities found that people spending at least 120 minutes per week in natural environments reported substantially better health and psychological wellbeing, regardless of socioeconomic status.\n\nThe environmental benefits are equally compelling. Trees act as natural air filters, absorbing pollutants including nitrogen dioxide and particulate matter. A single mature tree absorbs approximately 22 kilograms of carbon dioxide per year while releasing enough oxygen for two people. Green spaces also play a crucial role in managing urban stormwater through permeable soil and plant root systems.\n\nThe 'urban heat island effect' — whereby cities are significantly warmer than surrounding rural areas — can be substantially mitigated through strategic green space placement. Research from the Technical University of Munich found that urban parks can reduce local temperatures by 1 to 4 degrees Celsius.\n\nSocially, urban parks serve as democratic spaces where people from different backgrounds interact. Unlike commercial venues, parks are freely accessible, making them particularly important for lower-income communities. Studies have shown that well-maintained green spaces reduce crime rates, foster community engagement, and provide essential recreational opportunities for children.\n\nDespite these benefits, urban green spaces face persistent threats from development pressure. Singapore has emerged as a notable counterexample, implementing a 'City in a Garden' strategy that increased green cover from 36% in the 1980s to nearly 50% today, demonstrating that urban density and abundant green space need not be mutually exclusive.",
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
    {title:"The Psychology of Decision Making",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Every day, the average adult makes approximately 35,000 decisions. The field of behavioural economics, pioneered by Daniel Kahneman and Amos Tversky in the 1970s, has fundamentally challenged the assumption that humans are rational decision-makers.\n\nKahneman's research, which earned him the Nobel Prize in Economics in 2002, identified two systems of thinking. System 1 operates automatically and quickly, responsible for snap judgements and intuitive responses. System 2 allocates attention to effortful activities including complex calculations and logical reasoning. While System 2 is more reliable, it's slower and requires significant cognitive resources, meaning people frequently default to System 1.\n\n'Loss aversion' is one of the most influential concepts — people experience the pain of losing something approximately twice as intensely as the pleasure of gaining something equivalent. This explains why investors hold losing stocks too long and consumers are motivated more by fear of missing offers than by equivalent future discounts.\n\nThe 'anchoring effect' shows that people rely heavily on the first information they encounter when making estimates. In one experiment, participants who saw a high random number subsequently estimated higher values for unrelated questions than those who saw a low number. This affects salary negotiations, real estate pricing, and courtroom sentencing.\n\n'Choice overload,' popularised by Barry Schwartz, describes the paradox that more options often lead to worse decisions. Researchers Sheena Iyengar and Mark Lepper found that customers offered 24 varieties of jam were far less likely to purchase than those offered 6. The abundance created decision paralysis and diminished satisfaction.\n\nGovernments worldwide have established 'nudge units' leveraging these insights. By changing default options on pension enrolment forms, the UK government dramatically increased retirement savings rates without restricting individual choice — demonstrating that small changes in how choices are presented can produce large shifts in behaviour.",
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
    {title:"The Death of Languages",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Of the approximately 7,000 languages currently spoken worldwide, linguists estimate that nearly half will become extinct by the end of this century. A language is considered endangered when children no longer learn it as their first language, and dead when its last native speaker passes away. The rate of language death has accelerated dramatically in recent decades, with one language disappearing approximately every two weeks.\n\nThe causes of language death are complex and interrelated. Economic globalisation has created powerful incentives for speakers of minority languages to adopt dominant languages — primarily English, Mandarin, Spanish, and Arabic — that provide access to education, employment, and international commerce. Urbanisation compounds this effect, as young people migrate to cities where minority languages carry no practical value. Government policies have historically played a devastating role; throughout the 20th century, many nations actively suppressed indigenous languages through education systems that punished children for speaking anything other than the national language.\n\nThe consequences of language loss extend far beyond the disappearance of words and grammar. Each language encodes unique knowledge about the natural world — medicinal plants, animal behaviour, ecological relationships — accumulated over thousands of years. The Inuit language, for example, contains dozens of words distinguishing different types of snow, reflecting observational precision that cannot be replicated in translation. When a language dies, this irreplaceable knowledge dies with it.\n\nFurthermore, linguistic diversity appears to correlate with biological diversity. Research published in the Proceedings of the National Academy of Sciences found that regions with the highest concentration of endemic species also tend to have the greatest diversity of languages. This suggests that the conditions supporting biological diversity — geographic isolation, varied ecosystems — simultaneously foster linguistic diversity.\n\nEfforts to revive endangered languages have produced some remarkable successes. Hebrew was essentially a dead language used only in religious texts before being revived as the everyday language of Israel in the early 20th century. Welsh, once in serious decline, has seen a significant resurgence through Welsh-medium education, with the number of Welsh speakers increasing for the first time in over a century. New Zealand's Maori language has similarly benefited from immersion schooling programmes.\n\nTechnology is increasingly playing a role in language preservation. Digital archives, mobile apps, and social media platforms allow speakers of endangered languages to create and share content, reaching diaspora communities that might otherwise lose connection with their linguistic heritage. However, linguists caution that technology alone cannot save a language — survival ultimately depends on whether communities choose to transmit it to their children.",
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
    {title:"The Rise of Artificial Intelligence in Education",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Artificial intelligence is transforming education at every level, from primary schools to universities and corporate training programmes. AI-powered tutoring systems can now adapt in real time to individual students' strengths and weaknesses, providing personalised instruction that was previously available only through expensive one-to-one human tutoring.\n\nOne of the most significant developments has been the emergence of intelligent tutoring systems (ITS). Research conducted at Carnegie Mellon University found that students using AI tutors achieved learning outcomes comparable to those receiving human tutoring, and significantly better than those in traditional classroom settings. The AI systems accomplished this by continuously analysing student responses, identifying misconceptions, and adjusting the difficulty and focus of subsequent questions accordingly.\n\nAutomated essay scoring represents another area where AI has made substantial inroads. Systems developed by organisations including Educational Testing Service (ETS) can evaluate written work for grammar, coherence, argument structure, and vocabulary range. Studies comparing AI scores with human examiner scores have found correlation rates exceeding 0.90, suggesting remarkable consistency. However, critics argue that current AI systems struggle to evaluate creativity, nuanced argumentation, and the genuine quality of ideas — focusing instead on surface-level linguistic features.\n\nThe integration of AI in education raises significant equity concerns. Students in well-funded schools and affluent families have greater access to sophisticated AI learning tools, potentially widening the achievement gap rather than narrowing it. A report by UNESCO warned that without deliberate policy intervention, AI in education could 'reinforce existing inequalities along economic, social, and cultural lines.'\n\nTeachers' roles are evolving rather than being eliminated. Most education experts reject the notion that AI will replace teachers entirely. Instead, they envision a model where AI handles routine tasks — grading, progress tracking, content delivery — while teachers focus on mentoring, creative instruction, and the social-emotional aspects of education that AI cannot replicate. A survey by McKinsey found that 72% of teachers who had used AI tools reported that the technology saved them significant time on administrative tasks.\n\nLooking ahead, the development of generative AI models presents both opportunities and challenges. These systems can create customised learning materials, generate practice questions, and provide instant feedback. However, concerns about academic integrity have intensified, as students can use the same technology to generate essays and complete assignments without genuine learning taking place.",
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
    {title:"The Ocean's Twilight Zone",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Between 200 and 1,000 metres below the ocean surface lies a vast realm known as the mesopelagic zone, or 'twilight zone.' Despite containing an estimated 10 billion tonnes of fish — more than the total catch of all the world's fisheries combined — this enormous ecosystem remains one of the least understood environments on Earth.\n\nThe twilight zone receives barely enough sunlight for photosynthesis, creating a dim world where organisms have evolved remarkable adaptations. Bioluminescence — the ability to produce light through chemical reactions — is nearly universal among twilight zone creatures. Some species use light to attract prey, others to communicate with potential mates, and still others to camouflage themselves against the faint light filtering from above through a process called counter-illumination.\n\nPerhaps the most extraordinary phenomenon in the twilight zone is the daily vertical migration, considered the largest animal migration on Earth. Each evening, billions of organisms — fish, squid, crustaceans, and jellyfish — ascend hundreds of metres to feed in the nutrient-rich surface waters under cover of darkness. Before dawn, they descend again to the relative safety of the deep. This migration moves an estimated 10 gigatons of carbon from the surface to the deep ocean annually, playing a significant but poorly quantified role in regulating atmospheric carbon dioxide levels.\n\nScientists are only now beginning to understand the twilight zone's importance to global climate regulation. The 'biological carbon pump' operates as organisms consume carbon-rich food at the surface and transport it to depth through their migrations, faecal matter, and eventual death. Without this mechanism, atmospheric CO2 levels could be 50% higher than they currently are, with catastrophic consequences for climate stability.\n\nCommercial interest in the twilight zone is growing, driven by the search for new protein sources to feed expanding human populations. Several nations have begun developing technologies to harvest mesopelagic fish at industrial scale. Marine biologists have expressed alarm at these developments, warning that the ecosystem is far too poorly understood to sustain commercial exploitation. The organisms of the twilight zone grow slowly and reproduce infrequently, making them extremely vulnerable to overfishing.\n\nThe challenges of studying this environment are formidable. Traditional nets are ineffective because many twilight zone organisms can detect and avoid them. New technologies including autonomous underwater vehicles, acoustic sensors, and environmental DNA sampling are beginning to reveal the true extent of life in this hidden realm, but comprehensive surveys remain years away.",
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
    {title:"The History and Future of Antibiotics",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"The discovery of penicillin by Alexander Fleming in 1928 is widely regarded as one of the most significant medical breakthroughs in history. Before antibiotics, even minor wounds could lead to fatal infections, and surgical procedures carried enormous risks. The widespread introduction of antibiotics in the 1940s transformed medicine, extending average life expectancy by an estimated eight years and saving hundreds of millions of lives.\n\nHowever, the golden age of antibiotic discovery was remarkably brief. Most classes of antibiotics in use today were discovered between 1940 and 1962. Since then, the pipeline of new antibiotics has slowed to a trickle, partly because pharmaceutical companies find these drugs less profitable than medications for chronic conditions. An antibiotic course lasts days or weeks, whereas treatments for diabetes, heart disease, or depression generate revenue for years.\n\nThe emergence of antibiotic-resistant bacteria represents one of the gravest threats to global public health. The World Health Organisation has warned that without urgent action, the world faces a 'post-antibiotic era' in which common infections could once again become lethal. Methicillin-resistant Staphylococcus aureus (MRSA) alone kills an estimated 20,000 people annually in the United States. Globally, antibiotic-resistant infections are responsible for approximately 1.27 million deaths per year.\n\nResistance develops through natural selection. When bacteria are exposed to antibiotics, most are killed, but a small number with genetic mutations allowing them to survive will reproduce and pass on their resistance genes. The overuse of antibiotics in human medicine — particularly for viral infections against which they are ineffective — and their extensive use in agriculture have dramatically accelerated this process.\n\nSeveral promising approaches are being explored to combat resistance. Bacteriophage therapy uses viruses that specifically target bacteria, a technique pioneered in the Soviet Union but largely ignored in the West until recently. CRISPR gene-editing technology offers the theoretical possibility of disabling resistance genes directly. Meanwhile, researchers are investigating antimicrobial peptides — naturally occurring molecules in the immune systems of many organisms — as a fundamentally new class of antibacterial agents.\n\nPrevention remains crucial. Simple measures such as proper handwashing, appropriate antibiotic prescribing, and reducing antibiotic use in livestock can significantly slow the development of resistance, buying time for new therapeutic approaches to be developed.",
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
    {title:"Renewable Energy: Progress and Challenges",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"The global transition to renewable energy has accelerated beyond the most optimistic projections made just a decade ago. In 2023, renewable sources accounted for over 30% of global electricity generation for the first time, with solar and wind power leading the expansion. The cost of solar photovoltaic panels has fallen by approximately 90% since 2010, making solar power cheaper than coal in most regions of the world.\n\nChina has emerged as the dominant force in renewable energy deployment, installing more solar capacity in a single year than the United States has accumulated in its entire history. The country manufactures approximately 80% of the world's solar panels, creating both economic advantages and supply chain concerns for other nations seeking energy independence.\n\nWind energy has experienced similarly dramatic growth. Offshore wind farms, once considered prohibitively expensive, have seen costs drop by nearly 60% over the past decade. Countries with extensive coastlines, including the United Kingdom, Denmark, and the Netherlands, have invested heavily in offshore wind, with turbines now reaching heights exceeding 260 metres — taller than most skyscrapers.\n\nDespite this progress, significant challenges remain. The intermittency of solar and wind power — the sun doesn't always shine and the wind doesn't always blow — creates a fundamental problem for grid stability. Energy storage technologies, particularly lithium-ion batteries, have improved substantially but remain expensive at the scale needed to power entire cities overnight or through calm weather periods.\n\nThe environmental footprint of renewable energy technology itself requires careful consideration. Solar panel manufacturing involves toxic chemicals and significant energy consumption. Wind turbines have been linked to bird and bat mortality, and the decommissioning of ageing equipment creates waste management challenges. Lithium mining for batteries has caused significant environmental damage in countries including Chile, Bolivia, and the Democratic Republic of Congo.\n\nNuclear energy occupies a controversial position in the transition debate. Advocates argue that nuclear power provides reliable, low-carbon baseload electricity that perfectly complements intermittent renewables. Opponents cite unresolved issues of radioactive waste storage, the risk of catastrophic accidents, and the high cost of new nuclear construction. France, which generates approximately 70% of its electricity from nuclear power, demonstrates both the potential and the ongoing controversies of this approach.",
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
    {title:"The Neuroscience of Creativity",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Creativity has long been shrouded in mystique — the province of tortured artists and eccentric geniuses. Modern neuroscience, however, is revealing that creative thinking is a fundamental cognitive process accessible to everyone, governed by identifiable neural mechanisms rather than divine inspiration.\n\nBrain imaging studies have overturned the popular myth that creativity resides exclusively in the right hemisphere. Research by cognitive neuroscientist Roger Beaty at Penn State University has demonstrated that creative thinking involves dynamic interaction between three large-scale brain networks: the default mode network, activated during imagination and spontaneous thought; the executive control network, responsible for focused attention and evaluation; and the salience network, which mediates between the two, determining which ideas merit further attention.\n\nHighly creative individuals appear to have stronger connections between these three networks, allowing them to generate novel ideas while simultaneously evaluating their usefulness. This finding explains why creativity requires both the uninhibited flow of ideas and the disciplined judgement to select the best ones — a process psychologists call 'divergent' and 'convergent' thinking, respectively.\n\nEnvironmental factors significantly influence creative output. Research at the University of Chicago found that a moderate level of ambient noise — approximately 70 decibels, equivalent to a busy coffee shop — enhances creative thinking compared to both silence and loud noise. This may explain the common experience of generating ideas in cafes and public spaces rather than in quiet isolation.\n\nSleep plays a crucial role in creative problem-solving. Studies have shown that REM sleep, during which the brain consolidates memories and forms unexpected connections between distant concepts, significantly enhances creative insight. The chemist August Kekulé famously attributed his discovery of the benzene ring structure to a dream, and numerous artists and scientists have reported similar experiences of creative breakthroughs emerging from sleep.\n\nThe relationship between constraints and creativity presents a counterintuitive finding. While freedom might seem conducive to creativity, research consistently shows that moderate constraints — limited time, materials, or resources — actually stimulate more creative solutions than complete freedom. This 'constraint theory of creativity' suggests that boundaries force the mind to explore unconventional approaches it might otherwise overlook.",
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
    {title:"The Silk Road: More Than Trade",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"The Silk Road — a network of trade routes connecting East Asia with the Mediterranean world — has been romanticised as a single highway traversed by camel caravans laden with exotic goods. In reality, it was a complex web of interconnected paths spanning over 6,400 kilometres, through which not only silk and spices but also ideas, religions, technologies, and diseases travelled between civilisations for nearly two millennia.\n\nThe term 'Silk Road' was coined in 1877 by German geographer Ferdinand von Richthofen, though the routes themselves had been in use since at least the 2nd century BCE when the Chinese Han Dynasty opened diplomatic and commercial relations with Central Asian kingdoms. Silk was indeed a prized commodity — so valued in Rome that the Senate repeatedly attempted to ban its purchase to prevent the outflow of gold — but it was far from the only merchandise exchanged.\n\nThe cultural transmission along these routes was arguably more significant than the commercial exchange. Buddhism spread from India to China, Central Asia, and eventually Korea and Japan via Silk Road connections. Islam later travelled eastward along the same paths. Artistic styles blended in remarkable ways: Gandharan Buddhist sculpture, produced in modern-day Pakistan and Afghanistan, displays unmistakable Greek influence from Alexander the Great's campaigns.\n\nTechnological transfer was equally transformative. Papermaking, invented in China around 105 CE, reached the Islamic world by the 8th century and Europe by the 12th century, revolutionising the preservation and dissemination of knowledge. Gunpowder, the compass, and printing — China's 'Four Great Inventions' (alongside paper) — all reached Europe via Silk Road intermediaries, fundamentally altering the course of Western civilisation.\n\nThe Silk Road also served as a conduit for disease. The Black Death, which killed an estimated one-third of Europe's population between 1347 and 1353, is believed to have originated in Central Asia and travelled westward along trade routes. Earlier pandemics, including the Plague of Justinian in the 6th century, likely followed similar paths.\n\nToday, China's Belt and Road Initiative, launched in 2013, explicitly invokes the historical Silk Road to frame a massive infrastructure and investment programme spanning Asia, Africa, and Europe. Whether this modern iteration will produce the same richness of cultural and intellectual exchange as its predecessor remains to be seen.",
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
    {title:"Coral Reefs Under Threat",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Coral reefs, often called the 'rainforests of the sea,' occupy less than 0.1% of the ocean floor yet support approximately 25% of all known marine species. These extraordinary ecosystems, built over thousands of years by tiny coral polyps depositing calcium carbonate skeletons, are now facing an existential crisis driven primarily by rising ocean temperatures.\n\nMass coral bleaching events have increased dramatically in frequency and severity since the 1980s. Bleaching occurs when ocean temperatures rise just 1-2 degrees Celsius above the normal summer maximum, causing corals to expel the symbiotic algae called zooxanthellae that provide them with up to 90% of their energy through photosynthesis. Without these algae, the coral turns white and, if conditions persist for several weeks, dies.\n\nThe Great Barrier Reef, the world's largest coral reef system stretching over 2,300 kilometres along Australia's northeast coast, has experienced five mass bleaching events since 2016. A study published in Current Biology found that the reef lost approximately 50% of its coral cover between 1995 and 2017. Scientists warn that if global temperatures rise by 2 degrees Celsius above pre-industrial levels — the upper limit set by the Paris Agreement — virtually all tropical coral reefs will be severely degraded.\n\nOcean acidification presents a second existential threat. As oceans absorb approximately 30% of human-produced carbon dioxide, seawater becomes more acidic. This reduces the concentration of carbonate ions that corals need to build their skeletons, effectively dissolving the structural foundation of reef ecosystems. Current projections suggest that ocean acidity will increase by 100-150% by 2100 under high-emission scenarios.\n\nThe economic consequences of reef degradation are substantial. Coral reefs provide ecosystem services valued at an estimated $375 billion annually, including coastal protection from storms, fisheries supporting over 500 million people, and tourism revenue. The Great Barrier Reef alone generates approximately $6.4 billion per year for the Australian economy and supports 64,000 jobs.\n\nReef restoration efforts are expanding but face enormous challenges of scale. Coral gardening — growing fragments in nurseries and transplanting them to degraded reefs — has shown promise but can only restore tiny fractions of what has been lost. Some scientists are experimenting with selectively breeding heat-resistant coral strains, essentially attempting to accelerate natural evolution to keep pace with climate change.",
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
    {title:"The Economics of Happiness",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"For decades, economists measured national progress almost exclusively through Gross Domestic Product (GDP) — the total value of goods and services produced within a country. However, a growing body of research has challenged the assumption that economic growth automatically translates into improved wellbeing, prompting governments to explore alternative measures of national success.\n\nThe 'Easterlin Paradox,' proposed by economist Richard Easterlin in 1974, observed that within a country, wealthier individuals tend to be happier than poorer ones, yet average happiness levels do not increase as the country as a whole grows richer over time. This paradox has been partially explained by the concept of 'hedonic adaptation' — humans' tendency to quickly return to a baseline level of happiness after positive or negative changes in circumstances.\n\nResearch has explored whether income beyond a certain threshold continues to improve wellbeing. Earlier studies suggested a ceiling around $75,000 per year in the United States, though more recent research indicates that life satisfaction may continue to rise with income at higher levels, while day-to-day emotional wellbeing shows more complex patterns. The distinction between immediate emotional experience and broader life satisfaction has important policy implications. This distinction between emotional wellbeing and life evaluation has important policy implications.\n\nBhutan pioneered the concept of Gross National Happiness (GNH) in the 1970s, explicitly prioritising collective happiness over economic productivity. The GNH index measures nine domains including psychological wellbeing, health, education, governance, and ecological diversity. While critics argue that GNH is difficult to measure objectively and can mask genuine economic hardship, the concept has influenced policy discussions worldwide.\n\nThe United Nations World Happiness Report, published annually since 2012, ranks countries based on self-reported life satisfaction. Nordic countries — Finland, Denmark, Norway, and Iceland — consistently occupy the top positions. The report identifies six key factors explaining approximately 75% of the variation in happiness between countries: GDP per capita, social support, healthy life expectancy, freedom to make life choices, generosity, and perceptions of corruption.\n\nSeveral countries have begun integrating wellbeing metrics into policy-making. New Zealand's 'Wellbeing Budget,' introduced in 2019, allocates government spending based on measures including mental health, child poverty, and domestic violence rather than purely economic indicators. Scotland, Iceland, and Wales have formed the Wellbeing Economy Governments network, committed to prioritising wellbeing over GDP growth.",
     questions:[
      {type:"completion",q:"The Easterlin Paradox was proposed in ___.",a:"1974",exp:"'Proposed by economist Richard Easterlin in 1974'."},
      {type:"mc",q:"Hedonic adaptation means:",options:["People always want more money","People return to baseline happiness after changes","Economic growth causes happiness","Wealth guarantees happiness"],a:"People return to baseline happiness after changes",exp:"'Tendency to quickly return to a baseline level of happiness'."},
      {type:"mc",q:"What does research suggest about the relationship between high income and day-to-day emotional wellbeing?",options:["It continues to improve indefinitely","It shows complex patterns beyond a certain threshold","It declines after reaching a peak","It has no relationship to income"],a:"It shows complex patterns beyond a certain threshold",exp:"The passage states that day-to-day emotional wellbeing shows 'more complex patterns' at higher income levels, while life satisfaction may continue to rise."},
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
    {title:"The Microbiome Revolution",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"The human body hosts approximately 38 trillion microorganisms — bacteria, fungi, viruses, and other microscopic life forms — collectively known as the microbiome. This microbial community, weighing roughly 200 grams in total, contains an estimated 3.3 million unique genes, outnumbering human genes by approximately 150 to 1. Over the past two decades, advances in DNA sequencing technology have transformed our understanding of these invisible inhabitants from mere passengers to active participants in human health.\n\nThe gut microbiome, containing the greatest concentration and diversity of microbes, has received the most scientific attention. Research has established that gut bacteria play essential roles in digesting food, synthesising vitamins including K and B12, training the immune system, and protecting against pathogenic organisms. The composition of an individual's gut microbiome is influenced by numerous factors including mode of birth, breastfeeding, diet, antibiotic use, and environmental exposures.\n\nPerhaps the most surprising discovery has been the gut-brain axis — a bidirectional communication system linking the gut microbiome to the central nervous system. Studies in mice have demonstrated that altering gut bacteria can affect behaviour, anxiety levels, and even cognitive function. Human research, while still in its early stages, has found associations between certain gut bacteria profiles and conditions including depression, autism spectrum disorder, and Parkinson's disease.\n\nThe therapeutic potential of microbiome manipulation is generating enormous interest. Faecal microbiota transplantation (FMT), in which gut bacteria from a healthy donor are transferred to a patient, has proven remarkably effective for treating recurrent Clostridioides difficile infections, with cure rates exceeding 90%. Researchers are now investigating whether similar approaches could treat conditions ranging from inflammatory bowel disease to metabolic syndrome.\n\nThe probiotics industry has capitalised on growing public awareness of the microbiome, with global sales exceeding $60 billion annually. However, scientists caution that most commercial probiotic products have limited evidence supporting their health claims. The specific strains, dosages, and conditions under which probiotics might be beneficial remain poorly defined, and regulatory oversight varies significantly between countries.\n\nDiet appears to be the single most influential factor in shaping the gut microbiome. Research has consistently shown that plant-rich diets high in fibre promote microbial diversity, while Western diets high in processed food and sugar are associated with reduced diversity — a state linked to increased risk of obesity, diabetes, and autoimmune conditions.",
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
    {title:"The Future of Water",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Freshwater represents just 2.5% of all water on Earth, and only 1% of that is readily accessible in rivers, lakes, and shallow aquifers. As global population approaches 10 billion by 2050 and climate change disrupts rainfall patterns, water scarcity is emerging as one of the defining challenges of the 21st century. The United Nations estimates that by 2025, 1.8 billion people will live in regions facing absolute water scarcity.\n\nAgriculture accounts for approximately 70% of global freshwater withdrawals, making it the single largest consumer. Inefficient irrigation methods — including flood irrigation, which can lose up to 50% of water to evaporation — remain widespread in developing countries. Drip irrigation technology, which delivers water directly to plant roots, can reduce agricultural water use by 30-70% while simultaneously increasing crop yields, yet adoption remains limited due to initial costs.\n\nUrban water infrastructure presents its own challenges. In many cities, ageing pipe networks lose 20-40% of treated water to leaks before it reaches consumers. London's Victorian-era water mains lose approximately one billion litres daily. Upgrading these systems requires enormous capital investment, but the cost of inaction — in terms of wasted treated water and the energy used to treat it — may be greater.\n\nDesalination — removing salt from seawater — has emerged as a critical water source for arid regions. The Middle East leads globally, with Saudi Arabia alone operating more than 30 desalination plants. Modern reverse osmosis technology has reduced the energy cost of desalination by approximately 80% since the 1970s. However, the process still requires significant energy, and the disposal of concentrated brine byproduct poses environmental challenges to marine ecosystems.\n\nWater recycling represents another promising approach. Singapore's NEWater programme purifies treated wastewater to drinking-water standards using advanced membrane filtration and ultraviolet disinfection. The programme now meets approximately 40% of Singapore's water demand. Namibia's capital, Windhoek, has been practising direct potable water recycling since 1968, demonstrating that the technology is both safe and viable.\n\nTransboundary water disputes are intensifying as scarcity increases. Major river systems including the Nile, Tigris-Euphrates, Jordan, and Mekong are shared by multiple nations with competing demands. The construction of dams and diversion projects by upstream nations has created diplomatic tensions and, in some cases, threats of military conflict. International water law remains underdeveloped compared to the scale of the challenge.",
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
    {title:"The Science of Memory",practiceNote:"Practice passage — statistics are representative of the field, not directly sourced.",text:"Memory is not a single unified system but rather a collection of distinct processes, each governed by different neural mechanisms and serving different functions. Understanding these distinctions has been one of the most important advances in cognitive neuroscience over the past fifty years.\n\nShort-term memory, also known as working memory, holds information temporarily for immediate use — typically for 15 to 30 seconds without rehearsal. Its capacity is remarkably limited: psychologist George Miller's famous 1956 paper established that most people can hold approximately seven items in working memory simultaneously. More recent research suggests the true capacity may be even smaller — closer to four independent items — with the apparent ability to hold seven arising from chunking, the grouping of individual items into meaningful units.\n\nLong-term memory is subdivided into two major categories. Explicit (or declarative) memory involves conscious recollection and includes episodic memory — personal experiences anchored in time and place — and semantic memory — general knowledge about the world. Implicit memory operates below conscious awareness and includes procedural memory (how to ride a bicycle), classical conditioning, and priming effects.\n\nThe hippocampus plays a central role in converting short-term memories into long-term ones, a process called consolidation. The famous case of patient H.M., who had both hippocampi surgically removed to treat epilepsy in 1953, demonstrated this dramatically: H.M. could hold normal conversations and recall his distant past but was completely unable to form new long-term memories. He would meet his doctors anew each day, with no recollection of previous encounters.\n\nMemory is reconstructive rather than reproductive — we don't replay recordings but actively rebuild memories each time we recall them. This reconstruction process introduces the possibility of error. Psychologist Elizabeth Loftus has demonstrated through decades of research that memories can be easily distorted by suggestion, leading questions, and post-event information. Her work has had profound implications for the legal system, particularly regarding the reliability of eyewitness testimony.\n\nSleep is essential for memory consolidation. During slow-wave sleep, the hippocampus replays the day's experiences and transfers them to the neocortex for long-term storage. Studies have shown that students who sleep after learning new material retain significantly more information than those who remain awake for the same duration. Even brief naps of 20-30 minutes have been shown to improve memory performance.",
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
    {id:"b1",label:"📗 B1 Level ("+B1_TESTS.length+")"},
    {id:"academic",label:"📖 Academic C1 ("+AC_TESTS.length+")"},
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
    if(type==="yn") return "Do the following statements agree with the views or claims of the writer? Write YES if the statement agrees with the writer's views, NO if the statement contradicts the writer's views, or NOT GIVEN if it is impossible to say what the writer thinks.";
    if(type==="mc") return "Choose the correct letter, A, B, C or D.";
    if(type==="completion") return "Complete the sentences below. Choose NO MORE THAN TWO WORDS AND/OR A NUMBER from the passage for each answer.";
    if(type==="matching_headings") return "The reading passage has several paragraphs. Choose the correct heading for each paragraph from the list of headings. Write the correct letter (A–H) next to each paragraph.";
    return "";
  };

  const renderQ = (q, i, showTypeHeader) => {
    const key = q.key;
    const typeLabel = q.type==="tfng"?"True / False / Not Given":q.type==="yn"?"Yes / No / Not Given":q.type==="mc"?"Multiple Choice":q.type==="matching_headings"?"Matching Headings":"Sentence Completion";
    return (
      <div key={key}>
        {showTypeHeader&&(
          <div style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:8,padding:"12px 16px",marginBottom:10,marginTop:i>0?18:0}}>
            <div style={{...sty,fontSize:13,fontWeight:700,color:T.primary,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{typeLabel}</div>
            <div style={{...sty,fontSize:12,color:T.textMid,lineHeight:1.5,fontStyle:"italic"}}>{typeInstruction(q.type)}</div>
          </div>
        )}
        <div style={{marginBottom:14,padding:"12px 14px",background:T.bgGray,borderRadius:8,border:`1px solid ${T.border}`}}>
          <div style={{...sty,fontSize:14,color:T.text,marginBottom:8,fontWeight:600,direction:"ltr",textAlign:"left"}}>{i+1}. {q.q}</div>
          {(q.type==="tfng")&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",direction:"ltr"}}>
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
          {q.type==="yn"&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",direction:"ltr"}}>
              {["YES","NO","NOT GIVEN"].map(opt=>(
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
                  style={{textAlign:"left",direction:"ltr",padding:"9px 14px",borderRadius:6,fontSize:13,...sty,cursor:submitted?"default":"pointer",
                    background:userAnswers[key]===opt?(submitted?(opt===q.a?T.greenBg:T.redBg):T.primaryLight):"white",
                    border:`1px solid ${userAnswers[key]===opt?(submitted?(opt===q.a?T.greenBorder:T.redBorder):T.primaryBorder):T.border}`,
                    color:userAnswers[key]===opt?(submitted?(opt===q.a?T.green:T.red):T.primary):T.textMid}}>
                  {String.fromCharCode(65+oi)}. {opt}
                </button>
              ))}
            </div>
          )}
          {(q.type==="completion"||q.type==="matching_headings")&&(
            <input value={userAnswers[key]||""} onChange={e=>{if(!submitted)setUserAnswers(prev=>({...prev,[key]:e.target.value}));}}
              placeholder={q.type==="matching_headings"?"Enter heading letter (A, B, C...)":"Type your answer (max 3 words)"} readOnly={submitted}
              style={{...sty,fontSize:14,padding:"8px 12px",border:`1px solid ${submitted?(userAnswers[key]?.toLowerCase().trim()===q.a.toLowerCase()?T.greenBorder:T.redBorder):T.border}`,borderRadius:6,width:"100%",maxWidth:340,background:submitted?(userAnswers[key]?.toLowerCase().trim()===q.a.toLowerCase()?T.greenBg:T.redBg):"white",boxSizing:"border-box"}}/>
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
              <button onClick={()=>{setActiveTest({type,idx:i});setActivePsg(0);setShowAnswers(false);setSubmitted(false);setUserAnswers({});}} style={{background:type==="ac"?T.primary:T.green,color:"white",border:"none",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>Start Test →</button>
            )}
          </div>
        </div>
      ))}
      {!isPro&&<p style={{...sty,fontSize:13,color:T.amber,textAlign:"center",fontWeight:600}}>🔒 Test 1 is free. Unlock all {tests.length} tests with Pro.</p>}
    </div>
  );



  const renderB1TestList = () => (
    <div>
      <div style={{background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
        <h3 style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:15,fontWeight:700,color:"#166534",margin:"0 0 4px"}}>📗 B1 Reading Practice</h3>
        <p style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:13,color:"#166534",margin:0,lineHeight:1.6}}>Shorter passages at intermediate level. Suitable for IELTS targets of Band 5–6. 5 questions per passage.</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
        {B1_TESTS.map((t,i)=>(
          <div key={i} onClick={()=>{setActiveTest({level:"B1",idx:i});setUserAnswers({});setSubmitted(false);window.scrollTo({top:0,behavior:"smooth"});}}
            style={{...card,cursor:"pointer",transition:"all 0.2s"}}
            onMouseOver={e=>{e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.12)";e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseOut={e=>{e.currentTarget.style.boxShadow=T.shadow;e.currentTarget.style.transform="translateY(0)";}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:11,fontWeight:700,color:"#166534",background:"#dcfce7",border:"1px solid #86efac",borderRadius:4,padding:"2px 8px"}}>B1</span>
              <span style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:11,color:"#94a3b8"}}>{t.questions.length} questions</span>
            </div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700,fontSize:15,color:"#1e293b",marginBottom:6}}>{t.title}</div>
            <div style={{fontFamily:"'Cairo','Source Sans Pro',system-ui",fontSize:12,color:"#94a3b8"}}>{t.text.substring(0,80)}...</div>
            <div style={{marginTop:10,fontSize:12,fontWeight:600,color:"#b91c1c",fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Start →</div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderB1Test = () => {
    const test=B1_TESTS[activeTest.idx];
    const sty2={fontFamily:"'Cairo','Source Sans Pro',system-ui"};
    const qKeys=test.questions.map((_,i)=>`b1_${i}`);
    const allAnswered=qKeys.every(k=>userAnswers[k]!==undefined);

    return(
      <div>
        {/* Back + header */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <button onClick={()=>{setActiveTest(null);setSubmitted(false);setUserAnswers({});setTimerRunning(false);window.scrollTo({top:0,behavior:"smooth"});setTab("b1");}}
            style={{...sty2,background:"white",border:"1px solid #e2e8f0",borderRadius:8,padding:"8px 16px",fontSize:13,color:"#475569",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
            ← Back to B1 Tests
          </button>
          <span style={{...sty2,fontSize:12,background:"#dcfce7",border:"1px solid #86efac",borderRadius:6,padding:"3px 10px",color:"#166534",fontWeight:700}}>
            B1 Level
          </span>
        </div>

        <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:"#1e293b",margin:"0 0 4px"}}>{test.title}</h2>
        <p style={{...sty2,fontSize:12,color:"#94a3b8",margin:"0 0 16px"}}>{test.questions.length} comprehension questions</p>

        {/* Passage */}
        <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:10,padding:"18px 20px",marginBottom:20,maxHeight:380,overflowY:"auto",direction:"ltr",textAlign:"left"}}>
          {test.text.split("\n\n").map((p,i)=>(
            <p key={i} style={{...sty2,fontSize:14,color:"#1e293b",lineHeight:1.85,margin:i>0?"14px 0 0":0}}>{p}</p>
          ))}
        </div>

        {/* Questions */}
        {!submitted&&(
          <div style={{display:"flex",flexDirection:"column",gap:14,marginBottom:20}}>
            {test.questions.map((q,qi)=>{
              const key=`b1_${qi}`;
              return(
                <div key={qi} style={{background:"white",border:"1px solid #e2e8f0",borderRadius:10,padding:"16px 18px",boxShadow:"0 1px 3px rgba(0,0,0,0.05)"}}>
                  <div style={{...sty2,fontSize:14,fontWeight:600,color:"#1e293b",marginBottom:12}}>
                    <span style={{color:"#b91c1c",fontWeight:800,marginRight:8}}>{qi+1}.</span>{q.q}
                  </div>
                  {q.type==="tf"&&(
                    <div style={{display:"flex",gap:8}}>
                      {["TRUE","FALSE","NOT GIVEN"].map(opt=>(
                        <button key={opt} onClick={()=>setUserAnswers(p=>({...p,[key]:opt}))}
                          style={{...sty2,flex:1,padding:"8px 4px",border:`1.5px solid ${userAnswers[key]===opt?"#b91c1c":"#e2e8f0"}`,borderRadius:8,background:userAnswers[key]===opt?"#fff1f2":"white",color:userAnswers[key]===opt?"#b91c1c":"#64748b",fontWeight:userAnswers[key]===opt?700:400,fontSize:12,cursor:"pointer",transition:"all 0.15s"}}>
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.type==="mc"&&(
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {q.options.map((opt,oi)=>(
                        <button key={oi} onClick={()=>setUserAnswers(p=>({...p,[key]:opt}))}
                          style={{...sty2,textAlign:"left",padding:"9px 12px",border:`1.5px solid ${userAnswers[key]===opt?"#b91c1c":"#e2e8f0"}`,borderRadius:8,background:userAnswers[key]===opt?"#fff1f2":"white",color:userAnswers[key]===opt?"#b91c1c":"#64748b",fontWeight:userAnswers[key]===opt?700:400,fontSize:13,cursor:"pointer",transition:"all 0.15s"}}>
                          {["A","B","C","D"][oi]}. {opt}
                        </button>
                      ))}
                    </div>
                  )}
                  {q.type==="completion"&&(
                    <input value={userAnswers[key]||""} onChange={e=>setUserAnswers(p=>({...p,[key]:e.target.value}))}
                      placeholder="Your answer..."
                      style={{...sty2,width:"100%",padding:"9px 12px",border:"1.5px solid #e2e8f0",borderRadius:8,fontSize:13,color:"#1e293b",boxSizing:"border-box"}}/>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!submitted&&(
          <button onClick={()=>setSubmitted(true)} disabled={!allAnswered}
            style={{...sty2,background:allAnswered?"#b91c1c":"#e2e8f0",color:allAnswered?"white":"#94a3b8",border:"none",borderRadius:8,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:allAnswered?"pointer":"default",marginBottom:20}}>
            Submit Answers →
          </button>
        )}

        {/* Results */}
        {submitted&&(()=>{
          const score=test.questions.reduce((sum,q,qi)=>{
            const key=`b1_${qi}`;
            const ans=userAnswers[key]||"";
            const correct=q.a;
            const isRight=q.type==="completion"?ans.toLowerCase().trim()===correct.toLowerCase().trim():ans===correct;
            return sum+(isRight?1:0);
          },0);
          const pct=Math.round(score/test.questions.length*100);
          return(
            <div>
              <div style={{background:pct>=80?"#f0fdf4":pct>=60?"#fef3c7":"#fff1f2",border:`1px solid ${pct>=80?"#86efac":pct>=60?"#fbbf24":"#fca5a5"}`,borderRadius:12,padding:"16px 20px",marginBottom:20,textAlign:"center"}}>
                <div style={{fontSize:32,fontWeight:900,color:pct>=80?"#059669":pct>=60?"#d97706":"#dc2626",...sty2}}>{score}/{test.questions.length}</div>
                <div style={{...sty2,fontSize:14,color:pct>=80?"#166534":pct>=60?"#92400e":"#991b1b",fontWeight:600,marginTop:4}}>
                  {pct>=80?"Excellent!":pct>=60?"Good — review the explanations below":"Keep practising — read the explanations carefully"}
                </div>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
                {test.questions.map((q,qi)=>{
                  const key=`b1_${qi}`;
                  const ans=userAnswers[key]||"";
                  const isRight=q.type==="completion"?ans.toLowerCase().trim()===q.a.toLowerCase().trim():ans===q.a;
                  return(
                    <div key={qi} style={{background:"white",border:`1.5px solid ${isRight?"#86efac":"#fca5a5"}`,borderRadius:10,padding:"14px 16px"}}>
                      <div style={{display:"flex",gap:8,alignItems:"flex-start",marginBottom:6}}>
                        <span style={{fontSize:14,flexShrink:0}}>{isRight?"✅":"❌"}</span>
                        <div style={{...sty2,fontSize:13,color:"#1e293b",fontWeight:600}}>{q.q}</div>
                      </div>
                      {!isRight&&<div style={{...sty2,fontSize:12,color:"#dc2626",marginBottom:4}}>Your answer: <strong>{ans||"(no answer)"}</strong></div>}
                      <div style={{...sty2,fontSize:12,color:"#166534",marginBottom:4}}>Correct: <strong>{q.a}</strong></div>
                      <div style={{...sty2,fontSize:12,color:"#64748b",lineHeight:1.5}}>💡 {q.exp}</div>
                    </div>
                  );
                })}
              </div>
              <button onClick={()=>{setActiveTest(null);setSubmitted(false);setUserAnswers({});setTimerRunning(false);window.scrollTo({top:0,behavior:"smooth"});setTab("b1");}}
                style={{...sty2,background:"white",border:"1px solid #e2e8f0",borderRadius:8,padding:"10px 22px",fontSize:14,fontWeight:700,color:"#b91c1c",cursor:"pointer"}}>
                ← Try another B1 test
              </button>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderActiveTest = () => {
    const tests = activeTest.type==="ac"?AC_TESTS:GT_TESTS_DATA;
    const test = tests[activeTest.idx];
    const allQ = getAllQuestions(test);
    const psg = test.passages[activePsg];
    const psgQuestions = allQ.filter(q=>q.pIdx===activePsg);
    const globalOffset = allQ.filter(q=>q.pIdx<activePsg).length;

    return (
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8,marginBottom:16}}>
          <button onClick={()=>{setActiveTest(null);setSubmitted(false);setUserAnswers({});setTimerRunning(false);window.scrollTo({top:0,behavior:"smooth"});}} style={{background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,color:T.primary,fontSize:13,fontWeight:700,cursor:"pointer",...sty,padding:"8px 16px",borderRadius:8,display:"flex",alignItems:"center",gap:6}}>← Change Test</button>
          <div style={{...sty,fontSize:13,color:T.textMuted,fontWeight:600}}>{test.title}</div>
        </div>

        {/* Sticky Timer Bar */}
        {!submitted&&(
          <div style={{position:"sticky",top:110,zIndex:100,background:"white",border:`1px solid ${timerSeconds>3300?T.amberBorder:T.border}`,borderRadius:10,padding:"10px 18px",marginBottom:16,display:"flex",justifyContent:"space-between",alignItems:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.12)"}}>
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
          <h2 style={{fontFamily:"Georgia,serif",fontSize:20,color:T.text,margin:"0 0 16px",direction:"ltr",textAlign:"left"}}>{psg.title}</h2>
          <div style={{background:T.bgGray,borderRadius:8,padding:"24px",marginBottom:20,lineHeight:1.9,...sty,fontSize:15,color:T.textMid,whiteSpace:"pre-line",maxHeight:500,overflowY:"auto",border:`1px solid ${T.border}`,direction:"ltr",textAlign:"left"}} className="reading-passage">
            {psg.text}
          </div>
          {psg.practiceNote&&(
            <div style={{fontSize:11,color:T.textMuted,fontFamily:"'Cairo',system-ui",padding:"4px 8px",background:T.bgGray,borderRadius:4,marginBottom:10,direction:"ltr",textAlign:"left"}}>ℹ️ {psg.practiceNote}</div>
          )}
          <h3 style={{fontFamily:"Georgia,serif",fontSize:17,color:T.text,margin:"0 0 14px",direction:"ltr",textAlign:"left"}}>Questions {globalOffset+1}–{globalOffset+psgQuestions.length}</h3>
          {psgQuestions.map((q,qi)=>{
            const prevType = qi>0?psgQuestions[qi-1].type:null;
            const showHeader = q.type!==prevType;
            return renderQ(q,globalOffset+qi,showHeader);
          })}
        </div>

        {/* Navigation + Submit */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{display:"flex",gap:8}}>
            {activePsg>0&&<button onClick={()=>{setActivePsg(activePsg-1);setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);}} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:600,color:T.textMid,cursor:"pointer",...sty}}>← Previous Passage</button>}
            {activePsg<test.passages.length-1&&<button onClick={()=>{setActivePsg(activePsg+1);setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);}} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"10px 18px",fontSize:13,fontWeight:700,cursor:"pointer",...sty}}>Next Passage →</button>}
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
    <div style={{maxWidth:900,margin:"0 auto",padding:"36px 24px 80px"}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:28,color:T.text,margin:"0 0 6px",direction:"ltr",textAlign:"left"}}>📖 IELTS Reading</h1>
      <p style={{...sty,fontSize:14,color:T.textMuted,margin:"0 0 20px",lineHeight:1.6,direction:"ltr",textAlign:"left"}}>Full practice tests with scoring, answer keys with explanations, and strategies for every question type.</p>

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
      {!activeTest&&tab==="b1"&&renderB1TestList()}
      {activeTest&&activeTest.level==="B1"&&renderB1Test()}
      {activeTest&&activeTest.level!=="B1"&&renderActiveTest()}

      {!activeTest&&tab==="strategies"&&(
        <div>
          {/* Key insight about real IELTS questions */}
          <div style={{background:"#eff6ff",border:"1.5px solid #bfdbfe",borderRadius:10,padding:"14px 18px",marginBottom:20}}>
            <div style={{fontWeight:700,fontSize:14,color:"#1e40af",marginBottom:6}}>🔑 The Paraphrasing Principle — most important skill in IELTS Reading</div>
            <p style={{margin:0,fontSize:13,color:"#b91c1c",lineHeight:1.7}}>
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
// Initialize GA4 if not already loaded
(()=>{
  if(typeof window!=="undefined"&&!window._gaLoaded){
    window._gaLoaded=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=function(){window.dataLayer.push(arguments);};
    window.gtag("js",new Date());
    window.gtag("config",GA_ID,{send_page_view:true});
    const s=document.createElement("script");
    s.async=true;
    s.src=`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  }
})();
const trackEvent = (eventName, params={}) => {
  try { if(window.gtag) window.gtag("event", eventName, params); } catch(e) {}
};

// ── EmailJS Self-Init ─────────────────────────
// ── Contact Page ─────────────────────────────
const EMAILJS_SERVICE_ID = "service_9es76g1";
const EMAILJS_TEMPLATE_ID = "template_jrd4i4n";
const EMAILJS_PUBLIC_KEY  = "Wl_oo3VnUzPGW3MB4";

// Load and initialize EmailJS SDK if not already present
(()=>{
  if(typeof window!=="undefined"&&!window._ejsLoaded){
    window._ejsLoaded=true;
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    s.async=true;
    s.onload=()=>{
      try{ window.emailjs.init({publicKey: EMAILJS_PUBLIC_KEY}); }catch(e){ console.error("EmailJS init failed",e); }
    };
    document.head.appendChild(s);
  }
})();

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
      let attempts=0;
      while(!window.emailjs?.send && attempts<20){ await new Promise(r=>setTimeout(r,150)); attempts++; }
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
    <div style={{maxWidth:600,margin:"0 auto",padding:"36px 24px 0"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:48,marginBottom:12}}>✉️</div>
        <h2 style={{fontFamily:"Arial Black,system-ui",color:T.text,fontSize:28,margin:"0 0 8px 0",fontWeight:900,direction:"rtl"}}>اتصل بنا</h2>
        <p style={{color:T.textMid,fontSize:15,fontFamily:"'Cairo','Source Sans Pro',system-ui",margin:0,lineHeight:1.6,direction:"rtl"}}>هل لديك سؤال أو ملاحظة؟ تواصل معنا بكل سرور، أو راسلنا مباشرةً عبر Messenger.</p>
        <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap",marginTop:12}}>
          <a href="https://www.facebook.com/profile.php?id=61579432547860" target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:8,background:"#1877f2",color:"white",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,textDecoration:"none",fontFamily:"'Cairo',system-ui"}}>
            <span style={{fontSize:18}}>💬</span> Facebook Messenger
          </a>
          <a href="https://www.instagram.com/englishfool4/" target="_blank" rel="noreferrer" style={{display:"inline-flex",alignItems:"center",gap:8,background:"linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",color:"white",borderRadius:8,padding:"10px 20px",fontSize:14,fontWeight:700,textDecoration:"none",fontFamily:"'Cairo',system-ui"}}>
            <span style={{fontSize:18}}>📸</span> Instagram
          </a>
        </div>
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
  <div style={{maxWidth:800, margin:"0 auto", padding:"12px 32px 80px"}}>
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
    <Section title="3. User Accounts and Subscriptions"><p style={{margin:"0 0 12px"}}>The Service offers a free tier with limited analyses and a Pro plan at $35 USD / 25 JOD (3-month subscription). Payments are processed securely by Paddle.com as our Merchant of Record.</p><p style={{margin:"0 0 12px"}}>Pro access is granted for 3 months per subscription period.</p><p style={{margin:"0 0 12px"}}>Buyers are entitled to a full refund within 14 days of purchase, in accordance with Paddle's Buyer Terms. See our Refund Policy for full details.</p></Section>
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
          {["2 free essay analyses — no sign-up needed","Task 1 & Task 2 support","Band scores for all 4 criteria","Basic mistake detection","Linking Words toolkit","Grammar reference guide","Grammar & Spell Checker (5 free checks)"].map((f,i)=>(
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
            احصل على Pro — $35 (3 months)
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
  {id:"spelling", arabic:"لعبة التهجئة",  english:"Spelling Game",   emoji:"🔤", free:true,  color:"#059669", bg:"#d1fae5", desc:"هل تعرف كيف تكتب الكلمات الإنجليزية صح؟", descEn:"Can you spell English words correctly?"},
  {id:"grammar",  arabic:"لعبة القواعد",  english:"Grammar Game",    emoji:"📖", free:false, color:"#2563eb", bg:"#dbeafe", desc:"تحدَّ نفسك في قواعد اللغة الإنجليزية", descEn:"Challenge yourself on English grammar rules"},
  {id:"writing",  arabic:"لعبة الكتابة", english:"Writing Game",    emoji:"✍️", free:false, color:"#d97706", bg:"#fef3c7", desc:"مفردات وتعابير الكتابة الأكاديمية", descEn:"Academic writing vocabulary and expressions"},
  {id:"reading",  arabic:"لعبة القراءة", english:"Reading Game",    emoji:"📚", free:false, color:"#7c3aed", bg:"#ede9fe", desc:"فهم النصوص والمفردات القرائية", descEn:"Reading comprehension and vocabulary"},
  {id:"vocab",    arabic:"لعبة المفردات",english:"Vocabulary Game",  emoji:"💡", free:false, color:"#dc2626", bg:"#fee2e2", desc:"وسّع قاموسك لمستوى الدرجة 8", descEn:"Expand your vocabulary to Band 8 level"},
];
const IELTS_GAME_QS={
  spelling:[
    {q:"Which word is spelled correctly?",opts:["accommodate","accomodate","acommodate","accomadate"],a:0},
    {q:"Which word is spelled correctly?",opts:["neccessary","necessary","necesary","necessery"],a:1},
    {q:"Which word is spelled correctly?",opts:["definately","definitly","definitely","defenitely"],a:2},
    {q:"Which word is spelled correctly?",opts:["separate","seperate","separrate","seperrate"],a:0},
    {q:"Which word is spelled correctly?",opts:["occurence","occurrance","occurance","occurrence"],a:3},
    {q:"Which word is spelled correctly?",opts:["begining","beggining","beginning","beginnning"],a:2},
    {q:"Which word is spelled correctly?",opts:["environment","enviornment","enviroment","environement"],a:0},
    {q:"Which word is spelled correctly?",opts:["goverment","governement","govenment","government"],a:3},
    {q:"Which word is spelled correctly?",opts:["knowlege","knoweldge","knolwedge","knowledge"],a:3},
    {q:"Which word is spelled correctly?",opts:["immediately","immediatly","imediately","immeditley"],a:0},
    {q:"Which word is spelled correctly?",opts:["particullary","particularly","particulerly","partucularly"],a:1},
    {q:"Which word is spelled correctly?",opts:["succesfully","successfuly","successefully","successfully"],a:3},
    {q:"Which word is spelled correctly?",opts:["opportunites","oppertunities","opportunities","opportunittes"],a:2},
    {q:"Which word is spelled correctly?",opts:["comunication","communicaton","communication","communicaiton"],a:2},
    {q:"Which word is spelled correctly?",opts:["responsability","responsibilty","responsibiliy","responsibility"],a:3},
    {q:"Which word is spelled correctly?",opts:["aproximately","approximatly","approximately","approximatley"],a:2},
    {q:"Which word is spelled correctly?",opts:["developement","devlopment","devellopment","development"],a:3},
    {q:"Which word is spelled correctly?",opts:["internatonal","internatioanl","internationel","international"],a:3},
    {q:"Which word is spelled correctly?",opts:["signifcant","signifigant","significant","significent"],a:2},
    {q:"Which word is spelled correctly?",opts:["acheivment","achievment","achevement","achievement"],a:3},
    {q:"Which word is spelled correctly?",opts:["assesment","assessement","assesement","assessment"],a:3},
    {q:"Which word is spelled correctly?",opts:["recomended","recommened","reccommended","recommended"],a:3},
    {q:"Which word is spelled correctly?",opts:["througout","throuought","throughut","throughout"],a:3},
    {q:"Which word is spelled correctly?",opts:["disadavantage","disadvantege","disadvntage","disadvantage"],a:3},
    {q:"Which word is spelled correctly?",opts:["concluson","conclussion","conclusoin","conclusion"],a:3},
  ],
  grammar:[
    {q:"Choose the correct sentence:",opts:["She don't like studying","She doesn't like studying","She not like studying","She isn't like studying"],a:1,exp:"مع he/she/it نستخدم doesn't وليس don't"},
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
    {q:"She has been living here ___ five years.",opts:["since","for","during","while"],a:1,exp:"for + time period → for five years. since + نقطة زمنية"},
    {q:"The majority of students ___ passed the exam.",opts:["has","is","have","was"],a:2,exp:"'the majority of' + اسم جمع → have"},
    {q:"He works ___ a teacher in a local school.",opts:["like","as","for","with"],a:1,exp:"as = بصفته وظيفة. like = يشبه → works as a teacher"},
  ],
  writing:[
    {q:"Which word expresses contrast?",opts:["Furthermore","Therefore","However","Consequently"],a:2},
    {q:"'To what extent do you agree?' means:",opts:["وافق أو اعترض فقط","اعطِ الجانبين فقط","أبدِ رأيك وبرّره","ناقش المشكلات والحلول"],a:2},
    {q:"Best paraphrase for 'Cities are becoming overcrowded':",opts:["Cities have people","Urban areas are experiencing population growth","People live in cities","Cities are big"],a:1},
    {q:"Which word is more formal?",opts:["big","large","huge","enormous"],a:1},
    {q:"'Coherent essay' means:",opts:["يستخدم مفردات كثيرة","الأفكار مترابطة ومنظمة","يحتوي فقرات كثيرة","طويل جداً"],a:1},
    {q:"Which sentence uses a cohesive device correctly?",opts:["In addition, however, some disagree","Furthermore, this trend has led to social problems","Despite, the situation is improving","Although however, both sides have merit"],a:1},
    {q:"'The graph shows an upward trend.' means:",opts:["البيانات تنخفض","تبقى ثابتة","ترتفع","غير منتظمة"],a:2},
    {q:"Best phrase to introduce an opinion:",opts:["In my humble opinion I think","It is widely argued that","I believe that personally","From my personal individual opinion"],a:1},
    {q:"Lexical resource means:",opts:["دقة القواعد","نطاق ودقة المفردات","تنظيم المقالة","الإملاء فقط"],a:1},
    {q:"Best academic alternative for 'show':",opts:["demonstrate","tell","say","prove"],a:0},
    {q:"Which is NOT a type of Task 2?",opts:["Opinion essay","Discussion essay","Narrative essay","Problem-solution essay"],a:2},
    {q:"'Despite the challenges, solutions exist.' is an example of:",opts:["Topic sentence","Concession statement","Thesis statement","Conclusion"],a:1},
    {q:"Task 2 requires a minimum word count of:",opts:["150","200","250","300"],a:2},
    {q:"Best phrase for a conclusion:",opts:["In a nutshell basically","In conclusion, it is clear that","To sum it all up finally","At the end of everything"],a:1},
    {q:"Which sentence is more complex?",opts:["People work hard","Although work can be stressful, it provides financial stability","Working is good","People need jobs"],a:1},
    {q:"'Affluent' means:",opts:["فقير","غني","ريفي","متعلم"],a:1},
    {q:"Which word signals an example?",opts:["However","Therefore","For instance","In contrast"],a:2},
    {q:"'The data indicates a gradual ___.' Which word fits?",opts:["increase","increased","increasing","increases"],a:0},
    {q:"Best topic sentence for an opinion essay paragraph:",opts:["There are many reasons","One significant reason is the impact on public health","I will discuss this","People have opinions"],a:1},
    {q:"Coherence in writing means:",opts:["استخدام جمل طويلة","تدفق الأفكار بشكل منطقي","وجود مفردات كثيرة","الكتابة بسرعة"],a:1},
    {q:"'Pollution ___ a major threat.' Correct verb:",opts:["make","poses","do","creates a"],a:1},
    {q:"A counter-argument paragraph should:",opts:["تتجاهل الآراء المعارضة","تطرح الرأي المعارض ثم تردّ عليه","توافق الحجة الرئيسية فقط","تكون أطول من الحجة الأساسية"],a:1},
    {q:"Which is a compound sentence?",opts:["She studied hard.","She studied hard and passed the exam.","Although she studied hard, she failed.","Having studied hard, she passed."],a:1},
    {q:"'Mitigate' means:",opts:["يجعل أسوأ","يتجاهل","يخفف من حدة","يمنع كلياً"],a:2},
    {q:"Task 1 Academic requires:",opts:["حجة","وصف بيانات مرئية","رسالة","رأي شخصي"],a:1},
  ],
  reading:[
    {q:"'implies' means:",opts:["يصرّح مباشرة","يشير ضمنياً","يجادل ضد","يثبت"],a:1},
    {q:"The main idea of a paragraph is found in:",opts:["الجملة الأخيرة","أي جملة","عادةً الجملة الموضوعية","التفاصيل الداعمة"],a:2},
    {q:"'Ubiquitous' means:",opts:["نادر","موجود في كل مكان","خطير","مكلف"],a:1},
    {q:"In True/False/Not Given questions, 'Not Given' means:",opts:["العبارة خاطئة","المعلومة غير موجودة في النص","العبارة صحيحة جزئياً","الكاتب يعارض"],a:1},
    {q:"'Despite rapid urbanisation, rural traditions persist.' The relationship is:",opts:["سبب ونتيجة","تناقض","تسلسل","مثال"],a:1},
    {q:"Skimming means:",opts:["قراءة كل كلمة بعناية","قراءة سريعة للمعنى العام","البحث عن معلومة محددة","تجاهل النص"],a:1},
    {q:"'corroborates' means:",opts:["يتناقض مع","يؤكد","يتحدى","يتجاهل"],a:1},
    {q:"Scanning means:",opts:["قراءة بطيئة كلمة بكلمة","قراءة للمعنى العام","البحث عن معلومة محددة","تلخيص النص"],a:2},
    {q:"'stance' means:",opts:["قانون","موقف/اتجاه","سياسة","ميزانية"],a:1},
    {q:"How many sections are in IELTS Reading?",opts:["2","3","4","5"],a:1},
    {q:"'Empirical evidence' refers to:",opts:["حجج نظرية","أدلة مبنية على الملاحظة/التجربة","آراء شخصية","سجلات تاريخية"],a:1},
    {q:"'The author's tone is sceptical' means:",opts:["المؤلف يوافق تماماً","المؤلف متشكك أو غير متأكد","المؤلف متحمس","المؤلف محايد"],a:1},
    {q:"'Furthermore' indicates:",opts:["تناقض","نقطة إضافية","خاتمة","سبب"],a:1},
    {q:"'Detrimental effects' means:",opts:["تأثيرات إيجابية","محايدة","ضارة","مؤقتة"],a:2},
    {q:"A 'rhetorical question' in a text:",opts:["تتطلب إجابة مكتوبة","تُطرح للتأثير وليس للإجابة الحرفية","سؤال بحثي","دائماً في النهاية"],a:1},
    {q:"'gradually' means:",opts:["فجأة","خطوة بخطوة","فوراً","عشوائياً"],a:1},
    {q:"'Controversial' means:",opts:["مقبول على نطاق واسع","يسبب خلافاً","مثبت علمياً","قديم"],a:1},
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
function IELTSGameLobby({proUser,onSelect,uiLang="ar",onUpgrade}){
  return(
    <div style={{minHeight:"calc(100vh - 64px)",background:"linear-gradient(160deg,#0f172a 0%,#431407 50%,#0f172a 100%)",padding:"40px 20px",position:"relative",overflow:"hidden"}}>
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
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:"clamp(14px,2vw,18px)",color:"rgba(255,255,255,0.6)"}}>
            {uiLang==="ar"?"تعلّم وتمرّن على الآيلتس بطريقة ممتعة وتفاعلية 🌟":"Learn and practise IELTS in a fun, interactive way 🌟"}
          </div>
          <div style={{marginTop:12,display:"inline-flex",gap:16,background:"rgba(255,255,255,0.06)",borderRadius:20,padding:"8px 20px",border:"1px solid rgba(255,255,255,0.12)"}}>
            {(uiLang==="ar"?[["25","سؤالاً في كل لعبة"],["🏆","نقاط وتقييم"],["🔊","موسيقى تفاعلية"]]:[["25","questions per game"],["🏆","points & scoring"],["🔊","interactive music"]]).map(([ic,lb])=>(
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
                onClick={()=>locked?onUpgrade&&onUpgrade():onSelect(cat)}
                style={{
                  background:locked?"rgba(255,255,255,0.03)":"rgba(255,255,255,0.07)",
                  border:`2px solid ${locked?"rgba(255,255,255,0.08)":cat.color+"99"}`,
                  borderRadius:20,padding:"28px 24px",
                  cursor:"pointer",
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
                <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:20,color:"white",marginBottom:6,direction:uiLang==="ar"?"rtl":"ltr"}}>{uiLang==="ar"?cat.arabic:cat.english}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:16,direction:uiLang==="ar"?"rtl":"ltr"}}>{uiLang==="ar"?cat.desc:cat.descEn}</div>
                <div style={{display:"flex",alignItems:"center",gap:8,direction:"rtl"}}>
                  <span style={{background:cat.free?"#059669":"rgba(255,255,255,0.1)",borderRadius:20,padding:"4px 14px",fontFamily:"'Cairo',system-ui",fontSize:12,fontWeight:700,color:cat.free?"white":"rgba(255,255,255,0.5)"}}>
                    {cat.free?(uiLang==="ar"?"✅ مجاني":"✅ Free"):"👑 Pro"}
                  </span>
                  <span style={{fontFamily:"'Cairo',system-ui",fontSize:12,color:"rgba(255,255,255,0.35)"}}>{uiLang==="ar"?"25 سؤال":"25 questions"}</span>
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
function IELTSGameComplete({answers,score,category,onReplay,onLobby,history=[],reviewIdx,setReviewIdx,uiLang="ar"}){
  useEffect(()=>{ gameAudio.stopBg(); setTimeout(()=>gameAudio.complete(),200); },[]);
  const pct=Math.round((score/25)*100);
  const BANDS_AR={
    25:{medal:"🏆",title:"أنت البطل الحقيقي!",sub:"درجة كاملة! أنت أكثر من جاهز للايلتس 🔥",color:"#d4af37"},
    20:{medal:"🌟",title:"أداء رائع جداً!",sub:"مستوى ممتاز! خطوة صغيرة وتصبح البطل",color:"#10b981"},
    15:{medal:"💪",title:"تقريباً!",sub:"مستوى جيد — لكن يجب مراجعة المزيد قبل الامتحان",color:"#3b82f6"},
    10:{medal:"📚",title:"تحتاج إلى مزيد من التدريب",sub:"ما شاء الله على البداية — كرّر اللعبة ولاحظ الفرق",color:"#f97316"},
    7:{medal:"😅",title:"أنت في بداية الطريق!",sub:"جهد جيد — لكن الطريق لا يزال طويلاً، استمر!",color:"#8b5cf6"},
  };
  const BANDS_EN={
    25:{medal:"🏆",title:"Perfect Score!",sub:"You got everything right — you're more than ready for IELTS 🔥",color:"#d4af37"},
    20:{medal:"🌟",title:"Excellent Performance!",sub:"Outstanding level! One small step to become the champion",color:"#10b981"},
    15:{medal:"💪",title:"Almost There!",sub:"Good level — but review more before the exam",color:"#3b82f6"},
    10:{medal:"📚",title:"Needs More Practice",sub:"Great start — replay the game and notice the improvement",color:"#f97316"},
    7:{medal:"😅",title:"Just Getting Started!",sub:"Good effort — the journey continues, keep going!",color:"#8b5cf6"},
  };
  const getBand=(s,dict)=>s===25?dict[25]:s>=20?dict[20]:s>=15?dict[15]:s>=10?dict[10]:s>=7?dict[7]:{medal:"😢",title:uiLang==="ar"?"لم تنجح هذه المرة!":"Better Luck Next Time!",sub:uiLang==="ar"?"لا تيأس! كل بطل بدأ من الصفر — العب مرةً أخرى 💪":"Don't give up! Every champion started from zero — play again 💪",color:"#ef4444"};
  const band=getBand(score,uiLang==="ar"?BANDS_AR:BANDS_EN);
  const [tab,setTab]=useState("review"); // review | history
  // For answer review: navigate between questions
  const [ri,setRi]=useState(0);
  const ra=answers[ri];

  return(
    <div style={{minHeight:"calc(100vh - 64px)",background:"linear-gradient(160deg,#450a0a,#431407,#450a0a)",padding:"28px 16px",display:"flex",flexDirection:"column",alignItems:"center",fontFamily:"'Cairo',system-ui"}}>
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
          {[[`${score}✅`,uiLang==="ar"?"صحيح":"Correct"],[`${25-score}❌`,uiLang==="ar"?"خطأ":"Wrong"],[`${pct}%`,uiLang==="ar"?"نسبتك":"Score"]].map(([val,lbl])=>(
            <div key={lbl} style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"12px 8px",textAlign:"center",border:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{fontWeight:900,fontSize:18,color:"white",marginBottom:3}}>{val}</div>
              <div style={{fontSize:11,color:"rgba(255,255,255,0.4)"}}>{lbl}</div>
            </div>
          ))}
        </div>
        {/* Tabs: Review / History */}
        <div style={{display:"flex",gap:6,marginBottom:14}}>
          {[["review",uiLang==="ar"?"📋 مراجعة الإجابات":"📋 Answer Review"],["history",uiLang==="ar"?"📈 سجل تقدمك":"📈 Your History"]].map(([t,l])=>(
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
                        <span style={{color:"#d4af37",fontSize:11,fontWeight:700,width:16,flexShrink:0}}>{uiLang==="ar"?["أ","ب","ج","د"][oi]:["A","B","C","D"][oi]}</span>
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
              <button onClick={()=>setRi(r=>Math.max(0,r-1))} disabled={ri===0} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 20px",color:ri===0?"rgba(255,255,255,0.2)":"white",fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:13,cursor:ri===0?"not-allowed":"pointer"}}>{uiLang==="ar"?"→ السابق":"← Previous"}</button>
              <button onClick={()=>setRi(r=>Math.min(answers.length-1,r+1))} disabled={ri===answers.length-1} style={{background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.15)",borderRadius:10,padding:"9px 20px",color:ri===answers.length-1?"rgba(255,255,255,0.2)":"white",fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:13,cursor:ri===answers.length-1?"not-allowed":"pointer"}}>{uiLang==="ar"?"← التالي":"Next →"}</button>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab==="history"&&(
          <div style={{background:"rgba(255,255,255,0.05)",borderRadius:16,padding:"16px",border:"1px solid rgba(255,255,255,0.08)",marginBottom:18,maxHeight:300,overflowY:"auto"}}>
            {history.length===0?(
              <div style={{textAlign:"center",color:"rgba(255,255,255,0.3)",padding:"24px"}}>{uiLang==="ar"?"لم تلعب أي لعبة بعد — هذه هي أولى جلساتك! 🎮":"No games played yet — this is your first session! 🎮"}</div>
            ):(
              <>
                <div style={{fontWeight:700,color:"rgba(255,255,255,0.6)",fontSize:12,marginBottom:10,textAlign:"center"}}>{uiLang==="ar"?`آخر ${history.length} جلسة`:`Last ${history.length} sessions`}</div>
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
            {uiLang==="ar"?"🔄 العب مرةً أخرى":"🔄 Play Again"}
          </button>
          <button onClick={onLobby} style={{background:"rgba(255,255,255,0.08)",border:"1.5px solid rgba(255,255,255,0.18)",borderRadius:14,padding:"13px 24px",fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:14,color:"white",cursor:"pointer",transition:"background 0.2s"}}
            onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.15)"} onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}>
            {uiLang==="ar"?"🎮 اختر لعبةً أخرى":"🎮 Choose Another Game"}
          </button>
        </div>
      </div>
      <style>{`@keyframes celebratePop{from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}`}</style>
    </div>
  );
}

function IELTSGame({proUser,onNavigate,uiLang="ar",onUpgrade}){
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
        const entry={cat:cat.id,catName:uiLang==="ar"?cat.arabic:cat.english,score:finalScore,total:qIdx+1,date:new Date().toLocaleDateString(uiLang==="ar"?"ar-SA":"en-GB"),ts:Date.now()};
        const h=getHistory(); h.unshift(entry);
        try{localStorage.setItem("ef_game_history",JSON.stringify(h.slice(0,50)));}catch{}
        setScreen("complete");
      } else { setQIdx(j=>j+1); setGState("running"); setBlockKey(k=>k+1); setShowPrev(false); }
    },1500);
  };

  if(screen==="lobby") return <IELTSGameLobby proUser={proUser} onSelect={startGame} uiLang={uiLang} onUpgrade={onUpgrade}/>;

  if(screen==="intro"&&cat) return(
    <div style={{minHeight:"calc(100vh - 64px)",background:"linear-gradient(160deg,#450a0a,#431407)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px",fontFamily:"'Cairo',system-ui"}}>
      <div style={{maxWidth:480,width:"100%",background:"rgba(255,255,255,0.07)",border:`2px solid ${cat.color}55`,borderRadius:24,padding:"36px 32px",textAlign:"center",boxShadow:`0 0 60px ${cat.color}22`}}>
        <div style={{fontSize:56,marginBottom:12}}>{cat.emoji}</div>
        <div style={{fontWeight:900,fontSize:"clamp(20px,3vw,28px)",color:"white",marginBottom:6,direction:uiLang==="ar"?"rtl":"ltr"}}>{uiLang==="ar"?cat.arabic:cat.english}</div>
        <div style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginBottom:28,direction:uiLang==="ar"?"rtl":"ltr"}}>{uiLang==="ar"?"هل أنت مستعد؟ إليك القواعد:":"Ready? Here are the rules:"}</div>
        <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:28,direction:uiLang==="ar"?"rtl":"ltr"}}>
          {(uiLang==="ar"?[["🎯","25 سؤال في كل لعبة"],["❤️","3 أخطاء فقط — بعدها Game Over"],["🏃","اللوحة تأتي إليك تلقائياً"],["🔇","يمكنك كتم الموسيقى في أي وقت"],["⏸️","يمكنك إيقاف اللعبة مؤقتاً والعودة لها"],["💡","شرح الإجابات الخاطئة في النهاية"]]:[["🎯","25 questions per game"],["❤️","3 wrong answers = Game Over"],["🏃","The question wall comes to you automatically"],["🔇","Mute music anytime"],["⏸️","Pause and resume the game anytime"],["💡","Wrong answer explanations shown at the end"]]).map(([ic,txt])=>(
            <div key={txt} style={{display:"flex",alignItems:"center",gap:12,background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"10px 14px"}}>
              <span style={{fontSize:18,flexShrink:0}}>{ic}</span>
              <span style={{fontWeight:600,fontSize:13,color:"rgba(255,255,255,0.85)"}}>{txt}</span>
            </div>
          ))}
        </div>
        <button onClick={beginPlaying} style={{width:"100%",background:cat.color,border:"none",borderRadius:14,padding:"16px",fontFamily:"'Cairo',system-ui",fontWeight:900,fontSize:17,color:"white",cursor:"pointer",boxShadow:`0 6px 20px ${cat.color}55`,transition:"transform 0.15s"}}
          onMouseOver={e=>e.currentTarget.style.transform="scale(1.03)"} onMouseOut={e=>e.currentTarget.style.transform="scale(1)"}>
          {uiLang==="ar"?"🚀 ابدأ اللعبة!":"🚀 Start Game!"}
        </button>
        <button onClick={()=>setScreen("lobby")} style={{marginTop:10,background:"transparent",border:"none",color:"rgba(255,255,255,0.35)",fontSize:13,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>{uiLang==="ar"?"← رجوع":"← Back"}</button>
      </div>
    </div>
  );

  if(screen==="complete") return <IELTSGameComplete answers={answers} score={score} category={cat} reviewIdx={reviewIdx} setReviewIdx={setReviewIdx} onReplay={()=>{setCat(cat);setScreen("intro");}} onLobby={()=>setScreen("lobby")} history={getHistory()} uiLang={uiLang}/>;

  const stars=Array.from({length:55},(_,i)=>({x:(i*37+13)%100,y:(i*53+7)%55,r:i%7===0?3.5:i%3===0?2.5:1.5,dur:2+(i%4)*0.7,delay:i%5*0.4}));

  return(
    <div style={{position:"relative",height:"calc(100vh - 64px)",overflow:"hidden",userSelect:"none",fontFamily:"'Cairo',system-ui"}}>
      {/* Van Gogh Night Sky */}
      <div style={{position:"absolute",inset:0,background:"linear-gradient(180deg,#450a0a 0%,#0d1a4a 20%,#1a2a6c 45%,#253b7e 60%,#2d5016 76%,#1a3a0d 100%)"}}/>
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
                  {Array.from({length:3}).map((_,col)=><div key={col} style={{width:14,height:11,background:row%2===0&&col===1?"#b91c1c":"#2d5a8e",border:"1px solid #0f2a4f",borderRadius:1}}/>)}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Character */}
      <div style={{position:"absolute",bottom:72,left:"18%",zIndex:10,animation:paused?"none":gState==="running"?"charBob 0.45s ease-in-out infinite":"charThink 1.2s ease-in-out infinite",filter:gState==="question"?"drop-shadow(0 0 12px #d4af37)":"none",transition:"filter 0.3s"}}>
        <div style={{position:"relative",display:"flex",flexDirection:"column",alignItems:"center",gap:0}}>
          {gState==="question"&&<div style={{position:"absolute",top:-44,left:"50%",transform:"translateX(-50%)",background:"white",borderRadius:12,padding:"4px 10px",fontSize:16,fontWeight:900,color:cat.color,border:`2px solid ${cat.color}`,animation:"qBubble 0.8s ease-in-out infinite",whiteSpace:"nowrap",boxShadow:"0 4px 12px rgba(0,0,0,0.3)"}}>{uiLang==="ar"?"؟":"?"}</div>}
          {correct===true&&<div style={{position:"absolute",top:-20,left:"50%",transform:"translateX(-50%)",fontSize:20,animation:"coinBurst 0.5s ease-out forwards"}}>⭐</div>}
          <div style={{fontSize:0,lineHeight:0}}>
            <div style={{width:28,height:10,background:cat?cat.color:"#b91c1c",borderRadius:"4px 4px 0 0",margin:"0 auto",marginBottom:-2}}/>
            <div style={{width:36,height:6,background:cat?cat.color:"#b91c1c",borderRadius:2,margin:"0 auto"}}/>
          </div>
          <div style={{width:34,height:30,background:"#fde68a",borderRadius:"50% 50% 40% 40%",border:"2px solid #d97706",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>
            {paused?"😴":gState==="question"?"🤔":correct===true?"😄":correct===false?"😬":"😊"}
          </div>
          <div style={{width:30,height:28,background:cat?cat.color:"#b91c1c",border:`2px solid ${cat?(cat.color+"bb"):"#991b1b"}`,borderRadius:4}}/>
          <div style={{display:"flex",gap:4,marginTop:1}}>
            <div style={{width:12,height:20,background:"#b91c1c",borderRadius:"0 0 3px 3px",animation:(!paused&&gState==="running")?"legL 0.45s ease-in-out infinite":"none",transformOrigin:"top center"}}/>
            <div style={{width:12,height:20,background:"#b91c1c",borderRadius:"0 0 3px 3px",animation:(!paused&&gState==="running")?"legR 0.45s ease-in-out infinite 0.225s":"none",transformOrigin:"top center"}}/>
          </div>
        </div>
      </div>
      {/* HUD */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:20,background:"rgba(69,10,10,0.85)",backdropFilter:"blur(8px)",borderBottom:"1px solid rgba(212,175,55,0.2)"}}>
        {/* Main row */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px"}}>
          <div style={{display:"flex",gap:3,alignItems:"center"}}>
            {Array.from({length:3}).map((_,i)=><span key={i} style={{fontSize:16,opacity:i<lives?1:0.2}}>❤️</span>)}
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1,flex:1,padding:"0 8px"}}>
            <div style={{color:"rgba(255,255,255,0.85)",fontWeight:700,fontSize:"clamp(9px,1.2vw,11px)",direction:uiLang==="ar"?"rtl":"ltr"}}>{uiLang==="ar"?cat.arabic:cat.english} · {qIdx+1}/25</div>
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
            {uiLang==="ar"?(showPrev?"🔼 إخفاء السؤال السابق":"🔽 السؤال السابق — للمراجعة فقط"):(showPrev?"🔼 Hide previous question":"🔽 Previous question — review only")}
          </button>
        )}
      </div>
      {/* Pause overlay */}
      {paused&&(
        <div style={{position:"absolute",inset:0,zIndex:50,background:"rgba(69,10,10,0.88)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"rgba(255,255,255,0.07)",border:"2px solid rgba(212,175,55,0.4)",borderRadius:24,padding:"40px 32px",textAlign:"center",maxWidth:300}}>
            <div style={{fontSize:48,marginBottom:12}}>⏸️</div>
            <div style={{fontFamily:"'Cairo',system-ui",fontWeight:900,fontSize:22,color:"white",marginBottom:8}}>{uiLang==="ar"?"اللعبة متوقفة مؤقتاً":"Game Paused"}</div>
            <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)",marginBottom:24}}>Q{qIdx+1}/25 · ⭐{score}</div>
            <button onClick={togglePause} style={{width:"100%",background:"#d4af37",border:"none",borderRadius:12,padding:"14px",fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:16,color:"#0f172a",cursor:"pointer",marginBottom:10}}>{uiLang==="ar"?"▶ متابعة اللعبة":"▶ Resume Game"}</button>
            <button onClick={()=>{gameAudio.stopBg();setScreen("lobby");}} style={{width:"100%",background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:12,padding:"11px",fontFamily:"'Cairo',system-ui",fontWeight:600,fontSize:14,color:"rgba(255,255,255,0.6)",cursor:"pointer"}}>{uiLang==="ar"?"🏠 رجوع للقائمة":"🏠 Back to Menu"}</button>
          </div>
        </div>
      )}
      {/* Previous Question Peek — view only, no re-answering */}
      {showPrev&&answers.length>0&&(()=>{
        const prev=answers[answers.length-1];
        const pq=qs[qIdx-1]||qs[0];
        return(
          <div style={{position:"absolute",top:52,left:"3%",right:"3%",zIndex:40,background:"rgba(80,10,10,0.98)",border:"1.5px solid rgba(212,175,55,0.5)",borderRadius:16,padding:"14px 16px",boxShadow:"0 8px 32px rgba(0,0,0,0.7)",animation:"feedbackPop 0.25s ease-out"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,direction:"rtl"}}>
              <div style={{fontFamily:"'Cairo',system-ui",fontSize:12,fontWeight:700,color:"#d4af37"}}>{uiLang==="ar"?"👁 السؤال السابق — للمراجعة فقط":"👁 Previous question — review only"}</div>
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
                    <span style={{color:"#d4af37",fontSize:10,fontWeight:700,width:14,flexShrink:0}}>{uiLang==="ar"?["أ","ب","ج","د"][oi]:["A","B","C","D"][oi]}</span>
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
        <div style={{position:"absolute",bottom:72,left:"3%",right:"3%",zIndex:30,background:"rgba(80,10,10,0.97)",borderRadius:"20px 20px 0 0",boxShadow:"0 -8px 40px rgba(0,0,0,0.6)",animation:"panelSlideUp 0.35s cubic-bezier(0.16,1,0.3,1)",padding:"16px 16px 12px",border:"1px solid rgba(212,175,55,0.3)",borderBottom:"none"}}>
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
                  <span style={{background:"rgba(212,175,55,0.2)",color:"#d4af37",borderRadius:50,width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:11,flexShrink:0}}>{uiLang==="ar"?["أ","ب","ج","د"][i]:["A","B","C","D"][i]}</span>
                  <span style={{fontFamily:"'Cairo',system-ui",fontSize:"clamp(11px,1.3vw,13px)",fontWeight:600,color:col,lineHeight:1.3,flex:1}}>{opt}</span>
                </button>
              );
            })}
          </div>
          {chosen!==null&&(
            <div style={{marginTop:10,direction:"rtl",animation:"feedbackPop 0.3s cubic-bezier(0.16,1,0.3,1)"}}>
              <div style={{textAlign:"center",fontWeight:800,fontSize:"clamp(12px,1.6vw,14px)",color:correct?"#10b981":"#ef4444",marginBottom:(!correct&&cq.exp)?5:0}}>
                {uiLang==="ar"?(correct?"🎉 ممتاز! إجابة صحيحة!":"❌ الإجابة الصحيحة: "+cq.opts[cq.a]):(correct?"🎉 Correct!":"❌ Correct answer: "+cq.opts[cq.a])}
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


// ── HONEST PLACEHOLDER (no fake testimonials) ──────
function TestimonialsSection({uiLang="ar"}){
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};
  return(
    <div style={{background:"#f8fafc",borderTop:"1px solid #e2e8f0",padding:"48px 32px",textAlign:"center"}}>
      <div style={{maxWidth:600,margin:"0 auto"}}>
        <div style={{fontSize:32,marginBottom:12}}>💬</div>
        <div style={{...sty,fontWeight:700,fontSize:18,color:"#1e293b",marginBottom:12}}>
          {uiLang==="ar"?"آراء المستخدمين قادمة قريباً":"Real reviews coming soon"}
        </div>
        <div style={{...sty,fontSize:14,color:"#64748b",lineHeight:1.8,marginBottom:20}}>
          {uiLang==="ar"
            ?"جرّب الموقع مجاناً وقيّمه بنفسك — تحليلان كاملان بدون تسجيل. إذا أفادك، سنطلب رأيك."
            :"Try it free and judge for yourself — 2 full essay analyses, no sign-up. If it helps you, we'll ask for your review."}
        </div>
      </div>
    </div>
  );
}

// ── FREE VS PRO COMPARISON ────────────────────────
function PricingComparisonStrip({onUpgrade,uiLang="ar"}){
  const FREE_AR=["تحليلان كاملان مجاناً — بدون تسجيل","اختبار قراءة واحد مجاناً","جميع الألعاب الـ٥ مجاناً","تدريب المحادثة — نماذج Band 8 لجميع الأجزاء","قائمة مفردات آيلتس كاملة (٤٠٠+ كلمة)","الكلمات الرابطة ومرجع القواعد","٥ فحوصات قواعد مجاناً"];
  const FREE_EN=["2 full essay analyses free — no sign-up","1 reading test free","All 5 games — completely free","Speaking practice — Band 8 answers for Parts 1, 2 & 3","400+ word vocabulary list","Linking words & grammar reference","5 grammar checks free"];
  const PRO_AR=["تقييم غير محدود — Task 1 و Task 2","جميع اختبارات القراءة الـ ٧","تدريبات غير محدودة — كل الفئات","تحليل مفردات مع ترقيات Band 8","نماذج إجابة Band 8+ كاملة","متابعة التقدم وتاريخ الدرجات","فحص قواعد غير محدود"];
  const PRO_EN=["Unlimited essay analysis — Task 1 & Task 2","All 7 reading tests","Unlimited exercises — all categories","Vocabulary analysis with Band 8 upgrades","Full Band 8+ model answers","Progress tracker with score history","Unlimited grammar checker"];
  const free=uiLang==="ar"?FREE_AR:FREE_EN;
  const pro=uiLang==="ar"?PRO_AR:PRO_EN;
  return(
    <div style={{background:"#b91c1c",padding:"56px 32px"}}>
      <div style={{maxWidth:900,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:"clamp(18px,2.5vw,26px)",color:"white",marginBottom:6}}>{uiLang==="ar"?"المجاني مقابل Pro — الفرق في ثانية":"Free vs Pro — The Difference at a Glance"}</div>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.5)"}}>{uiLang==="ar"?"3 أشهر · $35 دولي / 25 دينار أردني":"3 months · $35 international / 25 JOD Jordan"}</div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,direction:"rtl"}}>
          {/* Free */}
          <div style={{background:"rgba(255,255,255,0.06)",borderRadius:12,padding:"20px 20px",border:"1px solid rgba(255,255,255,0.12)"}}>
            <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:16,color:"rgba(255,255,255,0.6)",marginBottom:16}}>{uiLang==="ar"?"المجاني":"Free"}</div>
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
              <span style={{background:"#d4af37",color:"#b91c1c",borderRadius:6,padding:"2px 10px",fontSize:12,fontWeight:800,fontFamily:"'Cairo',system-ui"}}>Pro</span>
              <span style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:16,color:"#d4af37"}}>{uiLang==="ar"?"كل شيء مفتوح":"Everything Unlocked"}</span>
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
          <button onClick={onUpgrade} style={{background:"#d4af37",color:"#b91c1c",border:"none",borderRadius:10,padding:"14px 40px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui",boxShadow:"0 4px 16px rgba(212,175,55,0.4)"}}>
            {uiLang==="ar"?"احصل على Pro الآن ←":"Get Pro Now →"}
          </button>
          <div style={{fontFamily:"'Cairo',system-ui",fontSize:12,color:"rgba(255,255,255,0.35)",marginTop:8}}>{uiLang==="ar"?"الإلغاء في أي وقت · دفع آمن عبر Paddle":"Cancel anytime · Secure payment via Paddle"}</div>
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
    <div style={{background:"linear-gradient(135deg,#b91c1c,#7f1d1d)",borderBottom:"2px solid rgba(212,175,55,0.3)",padding:"16px 24px",direction:"rtl"}}>
      <div style={{maxWidth:900,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,flexWrap:"wrap"}}>
        <div style={{fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:14,color:"white"}}>
          🎯 ابدأ بتقييم مقالتك الآن — الأول مجاناً تماماً
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={onStart} style={{background:"#d4af37",color:"#b91c1c",border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>قيّم مقالتي ←</button>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(255,255,255,0.2)",borderRadius:8,padding:"9px 14px",fontSize:13,color:"rgba(255,255,255,0.5)",cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>لاحقاً</button>
        </div>
      </div>
    </div>
  );
  return(
    <div style={{background:"linear-gradient(135deg,#b91c1c,#7f1d1d)",borderBottom:"2px solid rgba(212,175,55,0.3)",padding:"22px 24px",direction:"rtl"}}>
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


// ── IELTS VOCABULARY PAGE ─────────────────────────────────────────
const IELTS_VOCAB = {
  reading:[
    {w:"albeit",ar:"رغم أن / على الرغم من",en:"although / even though",ex:"The results were positive, albeit inconclusive."},
    {w:"scrutinise",ar:"يفحص بدقة / يمحّص",en:"to examine closely and critically",ex:"Scientists scrutinised the data before publishing."},
    {w:"prevalence",ar:"انتشار / شيوع",en:"the fact of being widespread",ex:"The prevalence of obesity has increased globally."},
    {w:"alleviate",ar:"يخفف / يسكّن",en:"to make something less severe",ex:"Exercise can alleviate symptoms of depression."},
    {w:"substantiate",ar:"يثبت / يدعم بأدلة",en:"to provide evidence to support",ex:"Researchers could not substantiate the claims."},
    {w:"proliferation",ar:"تكاثر / انتشار سريع",en:"rapid increase in number",ex:"The proliferation of smartphones changed communication."},
    {w:"corroborate",ar:"يؤكد / يدعم",en:"to confirm or support a statement",ex:"The second study corroborated the earlier findings."},
    {w:"ambiguous",ar:"غامض / ذو معنيين",en:"open to more than one interpretation",ex:"The instructions were ambiguous and confusing."},
    {w:"undermine",ar:"يقوّض / يضعف",en:"to weaken or damage gradually",ex:"Poor sleep undermines cognitive performance."},
    {w:"contend",ar:"يجادل / يزعم",en:"to assert or argue",ex:"Some researchers contend that diet is the key factor."},
    {w:"catalyst",ar:"محفّز / عامل تسريع",en:"something that causes change",ex:"The internet was a catalyst for globalisation."},
    {w:"disparity",ar:"تفاوت / فجوة",en:"a great difference",ex:"There is a significant disparity in income levels."},
    {w:"feasible",ar:"ممكن / قابل للتنفيذ",en:"possible and practical to achieve",ex:"A four-day work week is increasingly feasible."},
    {w:"mitigate",ar:"يخفف / يقلل",en:"to make less severe or harmful",ex:"Trees help mitigate the effects of urban heat."},
    {w:"constitute",ar:"يشكّل / يُكوّن",en:"to be or make up something",ex:"Women constitute 48% of the workforce."},
    {w:"adverse",ar:"سلبي / ضار",en:"having a harmful effect",ex:"Adverse weather delayed the construction project."},
    {w:"imperative",ar:"ضروري / لا غنى عنه",en:"of vital importance / essential",ex:"It is imperative to address climate change now."},
    {w:"subsequent",ar:"لاحق / تالٍ",en:"coming after in time or order",ex:"The initial trial and subsequent analysis took two years."},
    {w:"analogous",ar:"مماثل / مشابه",en:"comparable in certain respects",ex:"The situation is analogous to what happened in the 1970s."},
    {w:"concurrent",ar:"متزامن / متوازٍ",en:"existing or happening at the same time",ex:"Two concurrent studies reached similar conclusions."},
    {w:"contentious",ar:"مثير للجدل",en:"causing disagreement or argument",ex:"Vaccination remains a contentious issue in some communities."},
    {w:"intrinsic",ar:"جوهري / ذاتي",en:"belonging naturally / essential",ex:"There is intrinsic value in learning for its own sake."},
    {w:"paradox",ar:"مفارقة / تناقض ظاهري",en:"a seemingly contradictory statement",ex:"The paradox of choice suggests more options reduce satisfaction."},
    {w:"phenomenon",ar:"ظاهرة",en:"a fact or situation that is observed",ex:"Social media addiction is a modern phenomenon."},
    {w:"discrepancy",ar:"تناقض / اختلاف",en:"a difference between facts or claims",ex:"There was a discrepancy between the two reports."},
    {w:"eradicate",ar:"يستأصل / يقضي على",en:"to destroy or remove completely",ex:"Vaccination programmes can eradicate certain diseases."},
    {w:"notion",ar:"فكرة / مفهوم",en:"a concept or belief",ex:"The notion that money buys happiness is debated."},
    {w:"premise",ar:"فرضية / مقدمة",en:"an assumption on which an argument is based",ex:"The study was based on the premise that diet affects mood."},
    {w:"rigorous",ar:"صارم / دقيق",en:"thorough and careful",ex:"The experiment followed a rigorous methodology."},
    {w:"tangible",ar:"ملموس / محسوس",en:"clear and definite / real",ex:"There are tangible benefits to regular exercise."},
    {w:"viable",ar:"قابل للحياة / عملي",en:"capable of working successfully",ex:"Solar energy is now a viable alternative to fossil fuels."},
    {w:"pivotal",ar:"محوري / بالغ الأهمية",en:"of crucial importance",ex:"Education plays a pivotal role in social mobility."},
    {w:"trajectory",ar:"مسار / اتجاه",en:"the path or course of development",ex:"The trajectory of economic growth has slowed."},
    {w:"volatile",ar:"متقلب / غير مستقر",en:"liable to change rapidly and unpredictably",ex:"Oil prices have been volatile in recent months."},
    {w:"refute",ar:"يدحض / يفنّد",en:"to prove wrong / disprove",ex:"The new evidence refutes the earlier hypothesis."},
    {w:"magnitude",ar:"حجم / ضخامة",en:"the great size or extent of something",ex:"Scientists underestimated the magnitude of the disaster."},
    {w:"cohesion",ar:"تماسك / ترابط",en:"the action of forming a united whole",ex:"Social cohesion is essential for a stable community."},
    {w:"elicit",ar:"يستخرج / يستحضر",en:"to draw out a response or reaction",ex:"The survey was designed to elicit honest responses."},
    {w:"ostensibly",ar:"ظاهرياً / على ما يبدو",en:"apparently but not necessarily actually",ex:"The law was ostensibly designed to protect consumers."},
    {w:"innate",ar:"فطري / موروث",en:"inborn / natural",ex:"Some researchers argue that language ability is innate."},
  ],
  listening:[
    {w:"adjacent",ar:"مجاور / قريب",en:"next to or adjoining",ex:"The car park is adjacent to the main building."},
    {w:"prior",ar:"سابق / قبلي",en:"existing or happening before",ex:"Prior booking is required for the tour."},
    {w:"approximate",ar:"تقريبي",en:"close to the actual but not exact",ex:"The approximate cost is $500."},
    {w:"vicinity",ar:"محيط / جوار",en:"the area near or surrounding a place",ex:"There are no hotels in the vicinity of the station."},
    {w:"consult",ar:"يستشير / يراجع",en:"to seek advice or information from",ex:"You should consult a doctor if symptoms persist."},
    {w:"regulations",ar:"أنظمة / لوائح",en:"official rules or laws",ex:"Health and safety regulations must be followed."},
    {w:"accommodate",ar:"يستوعب / يأوي",en:"to provide space or facilities for",ex:"The hall can accommodate 200 people."},
    {w:"retrieve",ar:"يسترجع / يسترد",en:"to get something back or find again",ex:"You can retrieve your bag from reception."},
    {w:"enquiry",ar:"استفسار / تحقيق",en:"a request for information",ex:"For further enquiries, call the helpdesk."},
    {w:"clarify",ar:"يوضح / يشرح",en:"to make a statement less confused",ex:"Could you clarify what you mean by that?"},
    {w:"submit",ar:"يقدّم / يرسل",en:"to present for consideration",ex:"Please submit your application by Friday."},
    {w:"allocate",ar:"يخصص / يوزّع",en:"to distribute for a particular purpose",ex:"Funds have been allocated for new equipment."},
    {w:"mandatory",ar:"إلزامي / ضروري",en:"required by law or rules",ex:"Attendance at the induction is mandatory."},
    {w:"assistance",ar:"مساعدة / دعم",en:"help or support",ex:"Technical assistance is available 24 hours a day."},
    {w:"brochure",ar:"كتيّب / نشرة",en:"a small booklet with information",ex:"You can find a brochure at the reception desk."},
    {w:"confirmation",ar:"تأكيد",en:"a statement confirming something",ex:"You will receive email confirmation within 24 hours."},
    {w:"estimate",ar:"يقدّر / تقدير",en:"an approximate calculation",ex:"The estimate for repairs was £200."},
    {w:"extension",ar:"امتداد / تمديد",en:"an addition to a building or time period",ex:"The deadline has been given a two-week extension."},
    {w:"liability",ar:"مسؤولية قانونية",en:"legal responsibility for something",ex:"The company accepts no liability for lost items."},
    {w:"nominal",ar:"رمزي / بسيط",en:"very small in amount",ex:"There is a nominal fee for parking."},
    {w:"premises",ar:"مبنى / موقع",en:"a building and its surrounding grounds",ex:"Smoking is not permitted on the premises."},
    {w:"query",ar:"استفسار / سؤال",en:"a question or doubt",ex:"If you have a query, speak to the manager."},
    {w:"valid",ar:"صالح / معتمد",en:"legally or officially acceptable",ex:"Your ticket is valid for 30 days."},
    {w:"waive",ar:"يتنازل / يُسقط الحق",en:"to refrain from insisting on",ex:"The company may waive the fee in exceptional cases."},
    {w:"affiliated",ar:"مرتبط / تابع",en:"officially connected with a larger organisation",ex:"The college is affiliated with Oxford University."},
    {w:"coordination",ar:"تنسيق",en:"the organisation of different elements",ex:"Good coordination between departments is essential."},
    {w:"demonstrate",ar:"يوضح / يثبت",en:"to show or prove clearly",ex:"The results demonstrate the effectiveness of the treatment."},
    {w:"facilitate",ar:"يسهّل / ييسّر",en:"to make an action easier",ex:"Online platforms facilitate remote learning."},
    {w:"infrastructure",ar:"بنية تحتية",en:"basic physical systems of a country",ex:"Poor infrastructure is holding back economic growth."},
    {w:"initiative",ar:"مبادرة",en:"an act to begin something new",ex:"A new initiative was launched to reduce plastic waste."},
  ],
  writing1:[
    {w:"fluctuate",ar:"يتذبذب / يتقلب",en:"to rise and fall irregularly",ex:"Temperatures fluctuated throughout the year."},
    {w:"plateau",ar:"يستقر / يصل إلى ثبات",en:"to reach a state of little or no change",ex:"Sales plateaued after the initial surge."},
    {w:"surge",ar:"ارتفاع مفاجئ",en:"a sudden large increase",ex:"There was a surge in online shopping during lockdowns."},
    {w:"decline",ar:"انخفاض / تراجع",en:"a gradual decrease",ex:"There was a steady decline in manufacturing output."},
    {w:"overall",ar:"بشكل عام",en:"taking everything into account",ex:"Overall, the trend was upward over the decade."},
    {w:"proportion",ar:"نسبة / حصة",en:"a part or share of a whole",ex:"A large proportion of respondents preferred option A."},
    {w:"account for",ar:"يمثّل / يشكّل",en:"to make up a particular amount",ex:"Transport accounted for 30% of carbon emissions."},
    {w:"marginally",ar:"بهامش ضئيل / بشكل طفيف",en:"to a small extent",ex:"Numbers were marginally higher in the second period."},
    {w:"dramatic",ar:"حاد / ملحوظ",en:"sudden and striking",ex:"There was a dramatic increase in internet usage."},
    {w:"gradual",ar:"تدريجي",en:"taking place slowly over time",ex:"There was a gradual improvement in air quality."},
    {w:"stabilise",ar:"يستقر / يثبت",en:"to make or become stable",ex:"Prices stabilised after the initial drop."},
    {w:"negligible",ar:"ضئيل / لا يُذكر",en:"so small as to be unimportant",ex:"The difference between the two figures was negligible."},
    {w:"stark",ar:"صارخ / واضح جداً",en:"severe or sharply clear",ex:"The graph shows a stark contrast between the two groups."},
    {w:"comparable",ar:"مماثل / قابل للمقارنة",en:"similar in quality or quantity",ex:"The figures are comparable to those of the previous year."},
    {w:"correspond",ar:"يتوافق / يتطابق",en:"to match or be in agreement",ex:"The data corresponds to national trends."},
    {w:"depict",ar:"يصوّر / يعرض",en:"to show or represent in a picture or chart",ex:"The bar chart depicts changes in population over 20 years."},
    {w:"evident",ar:"واضح / جليّ",en:"clearly seen or understood",ex:"It is evident from the chart that sales dropped in 2019."},
    {w:"notable",ar:"ملحوظ / بارز",en:"worthy of attention",ex:"A notable exception was the UK, which saw an increase."},
    {w:"pattern",ar:"نمط / نهج",en:"a repeated or regular way",ex:"A clear pattern emerges from the data."},
    {w:"reveal",ar:"يكشف / يظهر",en:"to make known or visible",ex:"The figures reveal a significant gender gap."},
    {w:"significant",ar:"ملحوظ / ذو أهمية",en:"important or large enough to be noticed",ex:"There was a significant rise in the birth rate."},
    {w:"peak",ar:"يبلغ ذروته / يصل إلى القمة",en:"to reach the highest point",ex:"Production peaked in 2015 before declining."},
    {w:"roughly",ar:"تقريباً / نحو",en:"approximately",ex:"Roughly half of respondents chose option B."},
    {w:"stark contrast",ar:"تناقض صارخ",en:"a very clear difference",ex:"This is in stark contrast to figures from a decade ago."},
    {w:"upward trend",ar:"اتجاه تصاعدي",en:"a general increase over time",ex:"There is a clear upward trend in renewable energy use."},
    {w:"levelled off",ar:"استقر / ثبت",en:"to stop increasing or decreasing",ex:"Growth levelled off by the end of the period."},
    {w:"interestingly",ar:"ومن المثير للاهتمام",en:"in a way that arouses curiosity",ex:"Interestingly, the pattern reversed after 2010."},
    {w:"respectively",ar:"على التوالي / بالترتيب",en:"in the order already mentioned",ex:"The figures were 40% and 60% respectively."},
    {w:"triple",ar:"يتضاعف ثلاث مرات",en:"to become three times as large",ex:"The number of users tripled between 2000 and 2010."},
    {w:"constitute",ar:"يشكّل / يمثّل",en:"to make up a proportion of",ex:"Renewables now constitute 25% of energy production."},
  ],
  writing2:[
    {w:"advocate",ar:"يدعو / ينادي بـ",en:"to publicly recommend or support",ex:"Many experts advocate a plant-based diet."},
    {w:"contention",ar:"جدل / محلّ خلاف",en:"heated disagreement / a claim",ex:"It is my contention that education should be free."},
    {w:"detrimental",ar:"ضار / مُضرّ",en:"causing harm or damage",ex:"Fast food has a detrimental effect on health."},
    {w:"exacerbate",ar:"يفاقم / يزيد سوءاً",en:"to make worse",ex:"Poor urban planning can exacerbate social inequality."},
    {w:"foster",ar:"يعزّز / يشجّع",en:"to encourage the development of",ex:"Schools should foster creativity and independent thinking."},
    {w:"inevitable",ar:"حتمي / لا مفرّ منه",en:"certain to happen",ex:"Technological unemployment may be inevitable."},
    {w:"proponent",ar:"مؤيد / مدافع",en:"a person who supports an idea",ex:"Proponents of renewable energy argue it creates jobs."},
    {w:"tackle",ar:"يتصدى / يعالج",en:"to make determined efforts to deal with",ex:"Governments must tackle income inequality urgently."},
    {w:"warrant",ar:"يستوجب / يبرر",en:"to justify or make necessary",ex:"The issue warrants serious consideration."},
    {w:"negate",ar:"ينفي / يلغي",en:"to make ineffective / nullify",ex:"Subsidies can negate the advantages of competition."},
    {w:"perspective",ar:"منظور / وجهة نظر",en:"a particular way of viewing things",ex:"From an economic perspective, this policy makes sense."},
    {w:"inequality",ar:"عدم المساواة / التفاوت",en:"difference in status or opportunity",ex:"Income inequality continues to grow in many countries."},
    {w:"sustainable",ar:"مستدام",en:"able to be maintained at a certain rate",ex:"We need a sustainable approach to economic growth."},
    {w:"compromise",ar:"حل وسط / يتنازل",en:"a settlement by mutual concession",ex:"Both sides must be willing to compromise."},
    {w:"consent",ar:"موافقة / إذن",en:"permission for something to happen",ex:"Informed consent is essential in medical research."},
    {w:"consequence",ar:"عاقبة / نتيجة",en:"a result of an action or condition",ex:"The consequences of inaction on climate change will be severe."},
    {w:"dimension",ar:"بُعد / جانب",en:"an aspect or feature of a situation",ex:"There is an ethical dimension to this issue that cannot be ignored."},
    {w:"enormous",ar:"هائل / ضخم",en:"very large in size or extent",ex:"The internet has had an enormous impact on society."},
    {w:"ethical",ar:"أخلاقي",en:"relating to moral principles",ex:"There are serious ethical concerns about genetic engineering."},
    {w:"fundamental",ar:"جوهري / أساسي",en:"forming a necessary base or core",ex:"Education is a fundamental right."},
    {w:"globalisation",ar:"العولمة",en:"the process of international integration",ex:"Globalisation has both benefits and drawbacks."},
    {w:"incentive",ar:"حافز / دافع",en:"something that motivates action",ex:"Tax breaks can act as an incentive for businesses."},
    {w:"jurisdiction",ar:"اختصاص قانوني / ولاية",en:"the authority to make legal decisions",ex:"International law falls under global jurisdiction."},
    {w:"meritocracy",ar:"الجدارة / نظام الكفاءات",en:"a system where advancement is based on ability",ex:"True meritocracy requires equal access to education."},
    {w:"obligation",ar:"التزام / واجب",en:"a duty or commitment",ex:"Governments have an obligation to protect citizens."},
    {w:"perception",ar:"تصوّر / إدراك",en:"a way of understanding something",ex:"Public perception of immigration has shifted."},
    {w:"precaution",ar:"احتياط / حذر",en:"a measure taken in advance to prevent harm",ex:"Wearing a seatbelt is a basic safety precaution."},
    {w:"remedy",ar:"علاج / حلّ",en:"a solution to a problem",ex:"Stricter enforcement is not the only remedy."},
    {w:"scrutiny",ar:"تدقيق / فحص مكثف",en:"critical observation or examination",ex:"The policy came under intense public scrutiny."},
    {w:"underestimate",ar:"يستهين / يقلّل من",en:"to fail to appreciate the full magnitude of",ex:"We should not underestimate the power of social media."},
    {w:"widespread",ar:"واسع الانتشار / منتشر",en:"distributed over a large area",ex:"There is widespread agreement on the need for reform."},
  ],
  speaking:[
    {w:"elaborate",ar:"يوضّح / يفصّل",en:"to add more detail",ex:"Could you elaborate on that point?"},
    {w:"roughly speaking",ar:"بشكل تقريبي / على وجه التقريب",en:"approximately / in general terms",ex:"Roughly speaking, about half the class failed."},
    {w:"as far as I'm concerned",ar:"فيما يخصني / من وجهة نظري",en:"in my opinion",ex:"As far as I'm concerned, working from home is more productive."},
    {w:"on balance",ar:"في المجمل / موازنةً بين",en:"considering everything",ex:"On balance, I think the advantages outweigh the drawbacks."},
    {w:"to a certain extent",ar:"إلى حدٍ ما",en:"partly / in some ways",ex:"To a certain extent, I agree with that view."},
    {w:"a pressing issue",ar:"قضية ملحّة",en:"an urgent problem needing attention",ex:"Climate change is arguably the most pressing issue of our time."},
    {w:"It goes without saying",ar:"من البديهي أن / لا شك في",en:"it is obvious / clearly true",ex:"It goes without saying that education is important."},
    {w:"from my perspective",ar:"من منظوري / من وجهة نظري",en:"in my view",ex:"From my perspective, the policy needs reform."},
    {w:"broadly speaking",ar:"بشكل عام / بوجه عام",en:"in a general way",ex:"Broadly speaking, younger people are more tech-savvy."},
    {w:"stem from",ar:"ينشأ من / يعود إلى",en:"to originate from",ex:"Many social problems stem from inequality."},
    {w:"give rise to",ar:"يؤدي إلى / ينجم عنه",en:"to cause or produce",ex:"Urbanisation has given rise to new social challenges."},
    {w:"come to terms with",ar:"يتقبّل / يتعايش مع",en:"to accept something difficult",ex:"It took years to come to terms with the change."},
    {w:"keep up with",ar:"يواكب / يجاري",en:"to match the pace of",ex:"It is hard to keep up with technological change."},
    {w:"play a role in",ar:"يؤدي دوراً في",en:"to be involved in or contribute to",ex:"Parenting plays a crucial role in child development."},
    {w:"on the one hand",ar:"من ناحية",en:"used to introduce one side of a comparison",ex:"On the one hand, technology improves efficiency."},
    {w:"on the other hand",ar:"من ناحية أخرى",en:"used to introduce an opposing view",ex:"On the other hand, it has led to job losses."},
    {w:"tend to",ar:"يميل إلى / في العادة",en:"to usually do or be something",ex:"People tend to resist change initially."},
    {w:"take for granted",ar:"يأخذ كأمر مسلّم به",en:"to fail to appreciate something",ex:"We often take clean water for granted."},
    {w:"in the long run",ar:"على المدى البعيد",en:"over a long period of time",ex:"In the long run, investing in education pays off."},
    {w:"pros and cons",ar:"إيجابيات وسلبيات",en:"advantages and disadvantages",ex:"There are clear pros and cons to remote working."},
    {w:"boils down to",ar:"يتلخص في / يرجع إلى",en:"to be reducible to",ex:"It all boils down to personal choice in the end."},
    {w:"be aware of",ar:"يدرك / يعي",en:"to know about something",ex:"People need to be more aware of environmental issues."},
    {w:"draw a distinction",ar:"يُميّز / يفرّق بين",en:"to identify a difference",ex:"It is important to draw a distinction between fact and opinion."},
    {w:"have an impact on",ar:"يؤثر على / يُحدث أثراً في",en:"to affect something",ex:"Social media has had a huge impact on communication."},
    {w:"in stark contrast",ar:"في تناقض صارخ مع",en:"very different from",ex:"Rural life is in stark contrast to city life."},
    {w:"needless to say",ar:"لا حاجة للقول / من البديهي",en:"obviously / it is clear that",ex:"Needless to say, health is our greatest asset."},
    {w:"without a doubt",ar:"بلا شك / من المؤكد",en:"certainly / definitely",ex:"Climate change is, without a doubt, a global emergency."},
    {w:"be inclined to",ar:"يميل إلى / يُفضّل",en:"to be likely or willing to",ex:"I'm inclined to think the risks outweigh the benefits."},
    {w:"the flip side",ar:"الجانب الآخر / الوجه الآخر",en:"the opposite or contrasting aspect",ex:"The flip side of globalisation is cultural homogenisation."},
    {w:"draw on",ar:"يستند إلى / يستفيد من",en:"to use as a source",ex:"Good speakers draw on personal experiences to connect with the audience."},
    {w:"weigh up",ar:"يوازن بين / يقيّم",en:"to consider the pros and cons",ex:"You need to weigh up the options before deciding."},
    {w:"highlight",ar:"يسلّط الضوء على / يبرز",en:"to emphasise something",ex:"I'd like to highlight three key points."},
    {w:"increasingly",ar:"بشكل متزايد",en:"more and more over time",ex:"People are increasingly relying on digital services."},
    {w:"compelling",ar:"مقنع / جذاب",en:"strongly persuasive",ex:"She made a compelling case for reform."},
    {w:"nuanced",ar:"دقيق / متشعّب",en:"having subtle distinctions",ex:"The issue requires a more nuanced discussion."},
    {w:"frankly",ar:"بصراحة",en:"honestly and directly",ex:"Frankly, I think the policy has failed."},
    {w:"it's worth noting",ar:"تجدر الإشارة إلى أن",en:"it is important to mention",ex:"It's worth noting that this trend is not universal."},
    {w:"in my experience",ar:"في تجربتي",en:"based on personal experience",ex:"In my experience, consistency matters more than intensity."},
    {w:"overstated",ar:"مبالَغ فيه",en:"exaggerated beyond the truth",ex:"The risks of AI have been somewhat overstated."},
  ],
};

const GENERAL_VOCAB_EXTRA = {
  reading_extra:[
    {w:"infer",ar:"يستنتج / يستخلص",en:"to draw a conclusion from evidence",ex:"From the data, we can infer that demand is rising."},
    {w:"explicit",ar:"صريح / واضح",en:"stated clearly and directly",ex:"The report was explicit about the need for change."},
    {w:"implicit",ar:"ضمني",en:"suggested without being directly stated",ex:"There is an implicit assumption in the argument."},
    {w:"convey",ar:"يُوصل / يعبّر عن",en:"to communicate or express",ex:"The graph conveys a clear upward trend."},
    {w:"assertion",ar:"ادّعاء / تأكيد",en:"a confident statement of fact",ex:"The assertion that technology creates jobs is debated."},
    {w:"contradict",ar:"يتناقض مع",en:"to assert the opposite of",ex:"The second paragraph contradicts the first claim."},
    {w:"substantiate",ar:"يدعم بأدلة",en:"to provide evidence for a claim",ex:"The study substantiates the link between sleep and memory."},
    {w:"plausible",ar:"معقول / محتمل",en:"seeming reasonable or probable",ex:"The most plausible explanation is a change in climate."},
    {w:"excerpt",ar:"مقتطف",en:"a short extract from a text",ex:"Read the excerpt and answer the questions below."},
    {w:"chronological",ar:"زمني / مرتّب تاريخياً",en:"arranged in order of time",ex:"The events are described in chronological order."},
    {w:"elaborate",ar:"يفصّل / يوسّع",en:"to explain in more detail",ex:"The author elaborates on this point in paragraph three."},
    {w:"paraphrase",ar:"يُعيد الصياغة",en:"to restate in different words",ex:"Paraphrase the key points in your own words."},
    {w:"summarise",ar:"يلخّص",en:"to give a brief account of",ex:"Summarise the main argument of the passage."},
    {w:"perspective",ar:"منظور / وجهة نظر",en:"a point of view",ex:"The author presents a historical perspective on the issue."},
    {w:"valid",ar:"صحيح / مبرَّر",en:"based on sound reasoning",ex:"This is a valid criticism of the current system."},
  ],
  listening_extra:[
    {w:"clarify",ar:"يوضّح / يشرح",en:"to make something less confusing",ex:"Could you clarify what you mean by that?"},
    {w:"agenda",ar:"جدول أعمال",en:"a list of items to be discussed",ex:"The agenda for today includes three main topics."},
    {w:"approximately",ar:"تقريباً",en:"close to but not exactly",ex:"The lecture lasts approximately 90 minutes."},
    {w:"deadline",ar:"موعد نهائي",en:"the latest time something must be done",ex:"The deadline for submissions is Friday."},
    {w:"eligible",ar:"مؤهّل / مستحق",en:"meeting the necessary conditions",ex:"Students with a 3.0 GPA are eligible for the scholarship."},
    {w:"register",ar:"يسجّل / يلتحق",en:"to sign up officially",ex:"You must register before the end of the week."},
    {w:"verify",ar:"يتحقق من",en:"to check the truth of",ex:"I need to verify the information before presenting it."},
    {w:"scheme",ar:"خطة / مشروع",en:"a plan or system",ex:"The government introduced a new housing scheme."},
    {w:"brief",ar:"موجز / مختصر",en:"short and to the point",ex:"Let me give you a brief overview of the project."},
    {w:"notify",ar:"يُخطر / يُعلم",en:"to formally inform someone",ex:"Please notify us if your contact details change."},
    {w:"enquiry",ar:"استفسار",en:"a request for information",ex:"For enquiries, call the main office."},
    {w:"capacity",ar:"طاقة / سعة",en:"the maximum amount that can be contained",ex:"The hall has a capacity of 200 people."},
    {w:"schedule",ar:"جدول زمني / يُجدول",en:"a plan of things to be done at set times",ex:"The schedule has been revised for next term."},
    {w:"duration",ar:"مدة / فترة",en:"the length of time something lasts",ex:"The course has a duration of six months."},
    {w:"available",ar:"متاح / موجود",en:"able to be used or obtained",ex:"Rooms are available from Monday to Friday."},
  ],
  writing1_extra:[
    {w:"axis",ar:"محور",en:"a reference line on a graph",ex:"The vertical axis shows temperature in degrees Celsius."},
    {w:"interval",ar:"فاصل زمني",en:"a space between two points in time",ex:"Data was collected at five-year intervals."},
    {w:"percentage",ar:"نسبة مئوية",en:"a proportion per hundred",ex:"The percentage of female graduates increased sharply."},
    {w:"steady",ar:"ثابت / منتظم",en:"regular without sudden changes",ex:"There was a steady rise in temperatures over the decade."},
    {w:"sharp",ar:"حاد / مفاجئ",en:"sudden and steep",ex:"A sharp increase in prices was recorded in 2018."},
    {w:"category",ar:"فئة / تصنيف",en:"a class or division",ex:"The data is broken into three age categories."},
    {w:"column",ar:"عمود / خانة",en:"a vertical section in a table",ex:"The second column shows data for 2020."},
    {w:"compare",ar:"يقارن بين",en:"to examine similarities and differences",ex:"We can compare figures from 2010 and 2020."},
    {w:"represent",ar:"يُمثّل",en:"to stand for or show",ex:"The blue bars represent annual rainfall."},
    {w:"distribution",ar:"توزيع",en:"how something is spread across a range",ex:"The chart shows the distribution of income by age group."},
    {w:"constant",ar:"ثابت / مستمر",en:"remaining the same over time",ex:"Output remained constant throughout the period."},
    {w:"variable",ar:"متغيّر",en:"something that changes",ex:"Temperature is the key variable in this experiment."},
    {w:"rate",ar:"معدّل / نسبة",en:"the speed or frequency at which something happens",ex:"The unemployment rate fell to 4% last year."},
    {w:"sector",ar:"قطاع",en:"a distinct part of an economy or society",ex:"The service sector accounts for 70% of GDP."},
    {w:"figure",ar:"رقم / بيانات",en:"a number or statistical value",ex:"The figures show a clear decline in manufacturing."},
  ],
  writing2_extra:[
    {w:"thesis",ar:"أطروحة / موقف رئيسي",en:"the main argument of an essay",ex:"Your thesis should be stated clearly in the introduction."},
    {w:"concede",ar:"يُقرّ / يسلّم بـ",en:"to acknowledge something is true",ex:"I concede that there are some benefits to the policy."},
    {w:"advocate",ar:"يدعو إلى",en:"to publicly support a cause",ex:"Many experts advocate for stricter environmental laws."},
    {w:"address",ar:"يتناول / يعالج",en:"to deal with an issue",ex:"The essay must address all parts of the question."},
    {w:"illustrate",ar:"يوضّح بمثال",en:"to explain with examples",ex:"This example illustrates the impact of poverty on health."},
    {w:"whereas",ar:"في حين أن",en:"used to contrast two facts",ex:"Some prefer urban life, whereas others prefer rural areas."},
    {w:"thus",ar:"وبذلك / ومن ثَمّ",en:"therefore / as a result",ex:"The data was incomplete; thus, no conclusion was drawn."},
    {w:"implication",ar:"تداعية / مضمون",en:"a likely consequence",ex:"The implications of this policy are far-reaching."},
    {w:"critique",ar:"نقد / تحليل نقدي",en:"a detailed analysis and assessment",ex:"The report offers a thorough critique of the system."},
    {w:"stance",ar:"موقف / اتجاه",en:"a position taken on an issue",ex:"The government's stance on immigration has shifted."},
    {w:"obligation",ar:"التزام / واجب",en:"a duty or commitment",ex:"Governments have an obligation to protect citizens."},
    {w:"impartial",ar:"محايد / غير منحاز",en:"treating all sides equally",ex:"The judge must remain impartial throughout the trial."},
    {w:"rational",ar:"عقلاني / منطقي",en:"based on reason, not emotion",ex:"A rational approach to the problem is needed."},
    {w:"bias",ar:"تحيّز / انحياز",en:"an unfair preference for one side",ex:"Media bias can influence public opinion significantly."},
    {w:"hypothesis",ar:"فرضية",en:"a proposed explanation to be tested",ex:"The hypothesis was supported by the experimental data."},
  ],
};



// Additional vocabulary batch 2
const EXTRA_VOCAB_B2 = {
  reading: [
    {w:"allege",ar:"يدّعي / يزعم",en:"to claim without proof",ex:"The report alleges widespread corruption."},
    {w:"attribute to",ar:"يُعزى إلى / ينسب إلى",en:"to regard as caused by",ex:"The decline is attributed to poor management."},
    {w:"central to",ar:"محوري لـ / أساسي في",en:"most important to",ex:"Community is central to this argument."},
    {w:"challenge",ar:"يتحدى / يشكّك في",en:"to question or dispute",ex:"Several scientists challenged the findings."},
    {w:"characterise",ar:"يُميّز / يصف",en:"to describe the qualities of",ex:"The author characterises the problem as systemic."},
    {w:"cite",ar:"يستشهد بـ / يذكر",en:"to refer to as evidence",ex:"The study cites three key experiments."},
    {w:"coincide",ar:"يتزامن مع / يتوافق",en:"to happen at the same time",ex:"The results coincide with earlier predictions."},
    {w:"complexity",ar:"تعقيد",en:"the state of having many parts",ex:"The complexity of the issue requires careful analysis."},
    {w:"comprehensive",ar:"شامل / متكامل",en:"covering all aspects",ex:"The report provides a comprehensive overview."},
    {w:"contention",ar:"محلّ خلاف / جدل",en:"a point made in an argument",ex:"The main contention is that funding is insufficient."},
    {w:"demonstrate",ar:"يُثبت / يُظهر",en:"to show clearly",ex:"The data demonstrates a clear relationship."},
    {w:"diminish",ar:"يتضاءل / يقلّل من",en:"to make or become less",ex:"The new evidence diminishes the original claim."},
    {w:"distinguish",ar:"يُميّز بين",en:"to recognise a difference",ex:"It is important to distinguish fact from opinion."},
    {w:"dominant",ar:"سائد / مهيمن",en:"most important or powerful",ex:"The dominant view is that climate change is man-made."},
    {w:"echo",ar:"يُردّد / يُعيد",en:"to repeat or reflect",ex:"This finding echoes earlier research on the topic."},
    {w:"encompass",ar:"يشمل / يحتوي على",en:"to include a wide range",ex:"The study encompasses data from 40 countries."},
    {w:"extent",ar:"مدى / نطاق",en:"the range or scope of something",ex:"The extent of the damage is still unknown."},
    {w:"framework",ar:"إطار / منهجية",en:"a structure for thinking about something",ex:"The researchers used a theoretical framework."},
    {w:"generate",ar:"يُولّد / يُنتج",en:"to produce or create",ex:"The experiment generated surprising results."},
    {w:"identify",ar:"يُحدّد / يتعرّف على",en:"to recognise or establish",ex:"The study identifies three key risk factors."},
    {w:"impact",ar:"أثر / تأثير",en:"a strong effect",ex:"The policy had a major impact on employment."},
    {w:"inherent",ar:"متأصّل / جوهري",en:"existing as a natural part of",ex:"There are inherent limitations in this method."},
    {w:"interpret",ar:"يُفسّر / يُؤوّل",en:"to explain the meaning of",ex:"The results can be interpreted in different ways."},
    {w:"landmark",ar:"بارز / تاريخي",en:"a significant or historic event",ex:"The 2015 agreement was a landmark in climate policy."},
    {w:"mechanism",ar:"آلية / طريقة عمل",en:"the process by which something works",ex:"The mechanism behind the disease is still unclear."},
    {w:"overlap",ar:"يتداخل / يتقاطع",en:"to share common features",ex:"The two studies overlap in their findings."},
    {w:"perceive",ar:"يُدرك / ينظر إلى",en:"to understand or see in a particular way",ex:"The policy is perceived as unfair by many."},
    {w:"reinforce",ar:"يُعزّز / يقوّي",en:"to strengthen or support",ex:"This finding reinforces previous conclusions."},
    {w:"relevant",ar:"ذو صلة / مرتبط",en:"connected to the matter at hand",ex:"Only relevant evidence should be included."},
    {w:"scope",ar:"نطاق / مجال",en:"the range of a subject",ex:"The scope of the research was limited to adults."},
    {w:"signal",ar:"يُشير إلى / يدلّ على",en:"to indicate or suggest",ex:"This signals a shift in government policy."},
    {w:"subsequent",ar:"لاحق / تالٍ",en:"coming after in time",ex:"Subsequent studies confirmed the original findings."},
    {w:"sufficient",ar:"كافٍ / وافٍ",en:"enough for a particular purpose",ex:"The evidence is not sufficient to draw conclusions."},
    {w:"underlying",ar:"كامن / أساسي",en:"forming the basis of something",ex:"The underlying cause of the problem is unclear."},
  ],
  listening: [
    {w:"accommodation",ar:"سكن / إقامة",en:"a place to live or stay",ex:"Student accommodation is available on campus."},
    {w:"assessment",ar:"تقييم / اختبار",en:"a formal evaluation",ex:"The assessment will take place next Friday."},
    {w:"attendance",ar:"حضور / تواجد",en:"the fact of being present",ex:"Attendance at lectures is compulsory."},
    {w:"brochure",ar:"كتيّب / نشرة",en:"a small booklet with information",ex:"Pick up a brochure at the reception desk."},
    {w:"cancel",ar:"يلغي",en:"to decide that something will not happen",ex:"The event has been cancelled due to weather."},
    {w:"certificate",ar:"شهادة / وثيقة",en:"an official document proving something",ex:"You will receive a certificate on completion."},
    {w:"charge",ar:"رسوم / يفرض رسوماً",en:"an amount asked as payment",ex:"There is a small charge for parking."},
    {w:"compulsory",ar:"إلزامي / إجباري",en:"required by rules or law",ex:"Attendance is compulsory for all registered students."},
    {w:"deposit",ar:"وديعة / دُفعة أولى",en:"a sum paid as security",ex:"A deposit of £200 is required upon booking."},
    {w:"enquire",ar:"يستفسر / يسأل",en:"to ask for information",ex:"Please enquire at the front desk."},
    {w:"extension",ar:"تمديد / امتداد",en:"an increase in time or space",ex:"You may request an extension for your assignment."},
    {w:"fee",ar:"رسوم / أتعاب",en:"a payment for a service",ex:"The registration fee is £50."},
    {w:"guidelines",ar:"إرشادات / توجيهات",en:"rules or instructions",ex:"Please follow the guidelines carefully."},
    {w:"location",ar:"موقع / مكان",en:"a particular place",ex:"The new campus is in a central location."},
    {w:"orientation",ar:"توجيه / تعريف",en:"an introductory event or process",ex:"Attend the orientation session on Monday."},
    {w:"permit",ar:"تصريح / يسمح",en:"official permission / to allow",ex:"You need a permit to park in this area."},
    {w:"postpone",ar:"يؤجّل",en:"to move something to a later time",ex:"The meeting has been postponed until Thursday."},
    {w:"preliminary",ar:"تمهيدي / أوّلي",en:"coming before the main event",ex:"A preliminary meeting will be held next week."},
    {w:"prerequisite",ar:"شرط مسبق / متطلب أساسي",en:"something required beforehand",ex:"Statistics is a prerequisite for this course."},
    {w:"procedure",ar:"إجراء / خطوات",en:"an official way of doing something",ex:"Please follow the standard procedure."},
    {w:"qualification",ar:"مؤهّل / شهادة",en:"a pass of an exam or course",ex:"What qualifications do you need for this role?"},
    {w:"reception",ar:"استقبال / حفل",en:"the area where visitors are greeted",ex:"Please collect your pass from reception."},
    {w:"refund",ar:"استرداد / تعويض",en:"money returned after payment",ex:"A full refund is available within 14 days."},
    {w:"renovate",ar:"يجدّد / يُرمّم",en:"to repair and improve",ex:"The library is being renovated this summer."},
    {w:"semester",ar:"فصل دراسي",en:"a half-year academic period",ex:"The second semester begins in January."},
    {w:"supplement",ar:"مكمّل / إضافة",en:"something added to complete",ex:"Reading supplements are available online."},
    {w:"survey",ar:"استبيان / يستطلع",en:"a set of questions to gather data",ex:"Please complete the student satisfaction survey."},
    {w:"tutorial",ar:"جلسة تعليمية / دليل تطبيقي",en:"a small-group teaching session",ex:"Tutorials are held every Wednesday afternoon."},
    {w:"voluntary",ar:"تطوّعي / اختياري",en:"done by choice without payment",ex:"Participation in the study is voluntary."},
    {w:"workshop",ar:"ورشة عمل",en:"a meeting for practical training",ex:"A writing workshop is scheduled for next week."},
    {w:"withdrawal",ar:"انسحاب / سحب",en:"the act of taking back",ex:"Early course withdrawal incurs a penalty fee."},
  ],
  writing1: [
    {w:"account for",ar:"يُفسّر / يُشكّل",en:"to make up a percentage",ex:"Transport accounts for 25% of total emissions."},
    {w:"apparent",ar:"واضح / جليّ",en:"clearly visible or understood",ex:"An apparent decline is visible from 2015."},
    {w:"average",ar:"متوسط",en:"the typical or mean value",ex:"The average temperature rose by 1.5 degrees."},
    {w:"considerably",ar:"بشكل ملحوظ / كثيراً",en:"by a large amount",ex:"Output increased considerably in the final quarter."},
    {w:"continuous",ar:"مستمر / متواصل",en:"without interruption",ex:"There was a continuous rise over the ten-year period."},
    {w:"contrast",ar:"تباين / يتباين",en:"a difference between two things",ex:"In contrast, female participation rose sharply."},
    {w:"correspond",ar:"يتوافق مع",en:"to match or be related",ex:"The figures correspond to national averages."},
    {w:"data",ar:"بيانات / معطيات",en:"facts collected for analysis",ex:"The data reveals a clear downward trend."},
    {w:"decade",ar:"عقد من الزمن",en:"a period of ten years",ex:"Output doubled over the following decade."},
    {w:"depict",ar:"يُصوّر / يعرض",en:"to show in a chart or image",ex:"The pie chart depicts the breakdown of costs."},
    {w:"discrepancy",ar:"تفاوت / اختلاف",en:"a difference between figures",ex:"There is a discrepancy between the two data sets."},
    {w:"dominant",ar:"مهيمن / الأكبر حجماً",en:"most significant in the data",ex:"Oil was the dominant energy source in 2000."},
    {w:"exceed",ar:"يتجاوز / يتخطى",en:"to go beyond a limit",ex:"Sales exceeded 10 million units in 2020."},
    {w:"feature",ar:"يتضمّن / من أبرز ما يظهر",en:"to present as notable",ex:"The graph features data from six countries."},
    {w:"follow",ar:"يتبع / يعقب",en:"to come after",ex:"A sharp drop followed the peak of 2010."},
    {w:"fraction",ar:"جزء صغير / كسر",en:"a small part of a whole",ex:"Only a fraction of the budget goes to research."},
    {w:"halve",ar:"يتنصّف / يتقلّص إلى النصف",en:"to reduce by 50%",ex:"Energy costs halved between 2005 and 2015."},
    {w:"highlight",ar:"يُبرز / يُشير إلى",en:"to show as most important",ex:"The chart highlights the 2008 financial crisis."},
    {w:"illustrate",ar:"يُوضّح / يعرض",en:"to show through a chart or example",ex:"Figure 2 illustrates the growth in renewables."},
    {w:"minimal",ar:"ضئيل / في حدّه الأدنى",en:"very small in amount",ex:"There was minimal change between 2000 and 2005."},
    {w:"overall",ar:"بشكل عام / الإجمالي",en:"considering everything",ex:"Overall, the trend was consistently upward."},
    {w:"peak",ar:"ذروة / أعلى نقطة",en:"the highest point",ex:"Production peaked at 5 million units in 2015."},
    {w:"period",ar:"فترة زمنية",en:"a length of time",ex:"The data covers a twenty-year period."},
    {w:"progressive",ar:"تدريجي / متصاعد",en:"happening step by step",ex:"There was a progressive increase over the years."},
    {w:"recover",ar:"يتعافى / يرتفع من جديد",en:"to return to a previous level",ex:"Exports recovered sharply in 2012."},
    {w:"remain",ar:"يبقى / يظل",en:"to continue to be the same",ex:"Figures remained stable throughout the period."},
    {w:"represent",ar:"يُمثّل",en:"to stand for in a chart",ex:"Each bar represents a five-year interval."},
    {w:"roughly",ar:"تقريباً",en:"approximately",ex:"Roughly half of respondents chose option B."},
    {w:"sector",ar:"قطاع",en:"a part of an economy",ex:"The services sector grew by 15% in a decade."},
    {w:"slightly",ar:"بشكل طفيف / قليلاً",en:"to a small degree",ex:"Temperatures rose slightly in the second period."},
    {w:"source",ar:"مصدر",en:"where something comes from",ex:"Coal remains the largest energy source globally."},
    {w:"sum",ar:"مجموع / إجمالي",en:"the total amount",ex:"The total sum spent reached £2 billion."},
    {w:"triple",ar:"يتضاعف ثلاث مرات",en:"to become three times as large",ex:"Internet users tripled between 2000 and 2010."},
  ],
  writing2: [
    {w:"acknowledge",ar:"يعترف بـ / يُقرّ",en:"to accept the truth of",ex:"We must acknowledge the limitations of this approach."},
    {w:"arguably",ar:"يمكن القول إن / ربما",en:"used to indicate a debatable claim",ex:"Education is arguably the most important investment."},
    {w:"assumption",ar:"افتراض / فرضية",en:"something accepted as true without proof",ex:"The argument rests on a flawed assumption."},
    {w:"benefit",ar:"فائدة / يستفيد",en:"an advantage",ex:"The benefits of exercise are well established."},
    {w:"challenge",ar:"تحدٍّ / عقبة",en:"a difficult problem",ex:"Climate change poses a serious challenge to agriculture."},
    {w:"claim",ar:"يدّعي / ادّعاء",en:"to state something as true",ex:"Critics claim the policy is ineffective."},
    {w:"conclusion",ar:"استنتاج / خاتمة",en:"a final judgement or decision",ex:"In conclusion, the benefits clearly outweigh the costs."},
    {w:"contribute",ar:"يُسهم في / يساهم",en:"to help cause a result",ex:"Social media contributes to political polarisation."},
    {w:"controversial",ar:"مثير للجدل",en:"causing strong disagreement",ex:"Capital punishment remains a controversial topic."},
    {w:"debate",ar:"نقاش / جدل",en:"a formal argument",ex:"There is ongoing debate about immigration policy."},
    {w:"decline",ar:"انخفاض / تدهور",en:"a reduction or worsening",ex:"There has been a decline in social cohesion."},
    {w:"drawback",ar:"عيب / جانب سلبي",en:"a disadvantage",ex:"A major drawback of the plan is its high cost."},
    {w:"emphasis",ar:"تركيز / اهتمام خاص",en:"special importance given to something",ex:"There is too much emphasis on exam results."},
    {w:"enforce",ar:"يُطبّق / يُلزم",en:"to make people obey a rule",ex:"Laws must be properly enforced to be effective."},
    {w:"enhance",ar:"يُحسّن / يُعزّز",en:"to improve the quality of",ex:"Technology has enhanced communication globally."},
    {w:"ethical",ar:"أخلاقي",en:"relating to moral principles",ex:"There are serious ethical concerns about the policy."},
    {w:"evident",ar:"واضح / جليّ",en:"clearly seen or understood",ex:"It is evident that action is needed immediately."},
    {w:"exploit",ar:"يستغلّ",en:"to use selfishly or unfairly",ex:"Companies should not exploit cheap labour."},
    {w:"fundamental",ar:"أساسي / جوهري",en:"forming a necessary base",ex:"Education is a fundamental human right."},
    {w:"generational",ar:"جيلي / بين الأجيال",en:"relating to generations",ex:"There is a generational divide on this issue."},
    {w:"global",ar:"عالمي / دولي",en:"worldwide",ex:"Climate change is a global challenge."},
    {w:"government",ar:"حكومة",en:"the system that rules a country",ex:"Government intervention is sometimes necessary."},
    {w:"harmful",ar:"ضار / مُضرّ",en:"causing damage or injury",ex:"Excessive screen time can be harmful to children."},
    {w:"implement",ar:"يُطبّق / ينفّذ",en:"to put into action",ex:"The new policy will be implemented next year."},
    {w:"impose",ar:"يفرض",en:"to force something on someone",ex:"The government imposed strict environmental limits."},
    {w:"individual",ar:"فرد / شخصي",en:"a single person",ex:"Individual responsibility is key to solving this."},
    {w:"inequality",ar:"عدم المساواة",en:"unfair differences between groups",ex:"Income inequality continues to widen globally."},
    {w:"influence",ar:"يؤثّر على / تأثير",en:"to have an effect on",ex:"Media has a strong influence on public opinion."},
    {w:"initiative",ar:"مبادرة",en:"a new plan to solve a problem",ex:"A government initiative was launched last year."},
    {w:"invest",ar:"يستثمر",en:"to put money or effort into",ex:"Countries must invest in renewable energy."},
    {w:"poverty",ar:"فقر",en:"the state of being very poor",ex:"Poverty remains a major global challenge."},
    {w:"propose",ar:"يقترح",en:"to suggest a plan",ex:"The report proposes several practical solutions."},
    {w:"restrict",ar:"يُقيّد / يحدّ من",en:"to limit or control",ex:"Governments should restrict junk food advertising."},
    {w:"significant",ar:"ملحوظ / ذو أهمية",en:"important enough to notice",ex:"There has been a significant rise in obesity."},
    {w:"solution",ar:"حلّ",en:"a way of solving a problem",ex:"There is no simple solution to this issue."},
  ],
  speaking: [
    {w:"in terms of",ar:"من حيث / بالنسبة لـ",en:"regarding a particular aspect",ex:"In terms of cost, public transport is better."},
    {w:"personally",ar:"شخصياً",en:"used to give a personal view",ex:"Personally, I think remote work is more productive."},
    {w:"generally speaking",ar:"بشكل عام",en:"in most cases",ex:"Generally speaking, younger people adapt faster to change."},
    {w:"as a result",ar:"ونتيجةً لذلك",en:"because of this",ex:"As a result, many people lost their jobs."},
    {w:"in contrast",ar:"في المقابل / على النقيض",en:"showing a difference",ex:"In contrast, rural areas saw very little growth."},
    {w:"at the same time",ar:"في الوقت ذاته",en:"simultaneously",ex:"At the same time, we must consider the risks."},
    {w:"with regard to",ar:"فيما يتعلق بـ",en:"concerning a topic",ex:"With regard to education, more investment is needed."},
    {w:"it depends on",ar:"يعتمد على / يتوقف على",en:"varies according to factors",ex:"It depends on the individual and their circumstances."},
    {w:"on the whole",ar:"بوجه عام / في المجمل",en:"considering everything",ex:"On the whole, the changes have been positive."},
    {w:"to be honest",ar:"بصراحة / لأكون صريحاً",en:"used before saying something direct",ex:"To be honest, I'm not sure what the best solution is."},
    {w:"there's no doubt that",ar:"لا شك في أن",en:"expressing strong certainty",ex:"There's no doubt that education is crucial."},
    {w:"it's hard to say",ar:"من الصعب القول",en:"expressing uncertainty",ex:"It's hard to say whether the trend will continue."},
    {w:"what I mean is",ar:"ما أعنيه هو",en:"used to clarify",ex:"What I mean is that we need long-term solutions."},
    {w:"let me think",ar:"دعني أفكّر",en:"used to buy time",ex:"Let me think about that for a moment."},
    {w:"in a way",ar:"بطريقة ما / من وجه",en:"to some extent",ex:"In a way, technology has made life easier and harder."},
    {w:"the way I see it",ar:"من وجهة نظري",en:"my personal view",ex:"The way I see it, education solves most social problems."},
    {w:"it seems to me",ar:"يبدو لي أن",en:"expressing a personal impression",ex:"It seems to me that the problem is being ignored."},
    {w:"apart from",ar:"بالإضافة إلى / عدا",en:"other than / in addition",ex:"Apart from cost, the main concern is safety."},
    {w:"provided that",ar:"شريطة أن / بشرط",en:"on the condition that",ex:"I support the idea, provided that it's properly funded."},
    {w:"in spite of",ar:"على الرغم من",en:"despite",ex:"In spite of the challenges, the project succeeded."},
    {w:"not to mention",ar:"ناهيك عن / فضلاً عن",en:"used to add another point",ex:"It costs a lot, not to mention the time involved."},
    {w:"what's more",ar:"علاوة على ذلك",en:"in addition",ex:"The plan is expensive. What's more, it's impractical."},
    {w:"that said",ar:"مع ذلك / بيد أن",en:"despite what was just said",ex:"The policy is flawed. That said, it's a step forward."},
    {w:"bear in mind",ar:"ضع في حسبانك / لا تنسَ",en:"to remember a factor",ex:"Bear in mind that this data is from 2010."},
    {w:"so to speak",ar:"إذا صحّ التعبير",en:"used loosely or metaphorically",ex:"He's the engine of the team, so to speak."},
    {w:"all things considered",ar:"بالنظر إلى كل شيء",en:"taking everything into account",ex:"All things considered, it was a successful project."},
    {w:"when it comes to",ar:"عندما يتعلق الأمر بـ",en:"regarding a topic",ex:"When it comes to health, prevention is better."},
    {w:"more often than not",ar:"في أغلب الأحيان",en:"usually",ex:"More often than not, early intervention works best."},
    {w:"needless to say",ar:"لا حاجة للقول",en:"obviously",ex:"Needless to say, safety should be the top priority."},
    {w:"by and large",ar:"في معظمه / عموماً",en:"mostly / in general",ex:"By and large, the reforms have been successful."},
    {w:"first and foremost",ar:"أولاً وقبل كل شيء",en:"most importantly",ex:"First and foremost, we need to address poverty."},
    {w:"to put it simply",ar:"ببساطة / بعبارة بسيطة",en:"to explain in plain terms",ex:"To put it simply, the policy failed."},
    {w:"as far as I know",ar:"على حدّ علمي",en:"based on my knowledge",ex:"As far as I know, no solution has been found yet."},
    {w:"it goes without saying",ar:"من البديهي / لا شك في",en:"it is obvious",ex:"It goes without saying that honesty is important."},
  ],
};
const VocabularyPage = ({uiLang="ar", isPro=false, onUpgrade}) => {
  const FREE_VOCAB_CATS=["writing2","reading"];
  const MERGED_VOCAB = {
    reading: [...IELTS_VOCAB.reading, ...(GENERAL_VOCAB_EXTRA.reading_extra||[]), ...(EXTRA_VOCAB_B2.reading||[])],
    listening: [...IELTS_VOCAB.listening, ...(GENERAL_VOCAB_EXTRA.listening_extra||[]), ...(EXTRA_VOCAB_B2.listening||[])],
    writing1: [...IELTS_VOCAB.writing1, ...(GENERAL_VOCAB_EXTRA.writing1_extra||[]), ...(EXTRA_VOCAB_B2.writing1||[])],
    writing2: [...IELTS_VOCAB.writing2, ...(GENERAL_VOCAB_EXTRA.writing2_extra||[]), ...(EXTRA_VOCAB_B2.writing2||[])],
    speaking: [...IELTS_VOCAB.speaking, ...(GENERAL_VOCAB_EXTRA.speaking||[]), ...(EXTRA_VOCAB_B2.speaking||[])],
  };
  const CATS=[
    {key:"writing2", labelAr:"الكتابة - Task 2 ✍️",labelEn:"Writing Task 2 ✍️", free:true},
    {key:"reading",  labelAr:"القراءة 📖",          labelEn:"Reading 📖",         free:true},
    {key:"writing1", labelAr:"الكتابة - Task 1 📊", labelEn:"Writing Task 1 📊",  free:false},
    {key:"listening",labelAr:"الاستماع 🎧",          labelEn:"Listening 🎧",       free:false},
    {key:"speaking", labelAr:"المحادثة 🗣️",          labelEn:"Speaking 🗣️",        free:false},
  ];
  const [cat,setCat]=useState("writing2");
  const [meaningsLang,setMeaningsLang]=useState("ar");
  const [search,setSearch]=useState("");
  const catLocked=(key)=>!isPro&&!FREE_VOCAB_CATS.includes(key);
  const words=(MERGED_VOCAB[cat]||[]).filter(w=>
    !search||w.w.toLowerCase().includes(search.toLowerCase())||w.ar.includes(search)||w.en.toLowerCase().includes(search.toLowerCase())
  );

  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 20px 80px"}}>
      {/* Header */}
      <div style={{marginBottom:24,direction:"rtl"}}>
        <h1 style={{fontFamily:"'Cairo',system-ui",fontSize:26,fontWeight:800,color:T.primary,margin:"0 0 6px"}}>{uiLang==="ar"?"📝 مفردات الآيلتس الأساسية":"📝 IELTS Core Vocabulary"}</h1>
        <p style={{fontFamily:"'Cairo',system-ui",fontSize:14,color:T.textMuted,margin:0,lineHeight:1.7}}>{uiLang==="ar"?"الكتابة والقراءة مجانيان — باقي الأقسام Pro":"Writing Task 2 & Reading are free — other categories require Pro"}</p>
      </div>

      {/* Controls row */}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:20,direction:"rtl"}}>
        {/* Meaning language toggle */}
        <div style={{display:"flex",background:T.bgMuted,borderRadius:8,padding:2,gap:2,flexShrink:0}}>
          <span style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo',system-ui",padding:"0 8px",display:"flex",alignItems:"center"}}>{uiLang==="ar"?"شرح بـ:":"Meaning:"}</span>
          {[{l:"ar",label:"عربي"},{l:"en",label:"English"}].map(o=>(
            <button key={o.l} onClick={()=>setMeaningsLang(o.l)} style={{background:meaningsLang===o.l?"white":"transparent",border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:meaningsLang===o.l?700:500,color:meaningsLang===o.l?T.primary:T.textMuted,cursor:"pointer",fontFamily:"'Cairo',system-ui",transition:"all 0.2s",boxShadow:meaningsLang===o.l?T.shadow:"none"}}>
              {o.label}
            </button>
          ))}
        </div>
        {/* Search */}
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن كلمة... / Search..."
          style={{flex:1,minWidth:160,background:"white",border:`1px solid ${T.border}`,borderRadius:8,padding:"7px 12px",fontSize:13,fontFamily:"'Cairo',system-ui",outline:"none",direction:"rtl"}}/>
        <div style={{fontSize:12,color:T.textMuted,fontFamily:"'Cairo',system-ui",flexShrink:0}}>{words.length} {uiLang==="ar"?"كلمة":"words"}</div>
      </div>

      {/* Category tabs */}
      <div style={{display:"flex",gap:6,overflowX:"auto",marginBottom:20,paddingBottom:4}} className="tab-row">
        {CATS.map(c=>{
          const locked=catLocked(c.key);
          return(
            <button key={c.key} onClick={()=>{if(locked){onUpgrade&&onUpgrade();}else{setCat(c.key);setSearch("");}}}
              style={{background:cat===c.key?T.primaryLight:locked?T.bgMuted:"white",border:`1.5px solid ${cat===c.key?T.primary:locked?T.border:T.border}`,borderRadius:8,padding:"8px 16px",fontSize:13,fontWeight:cat===c.key?700:500,color:cat===c.key?T.primary:locked?T.textLight:T.textMid,cursor:"pointer",fontFamily:"'Cairo',system-ui",whiteSpace:"nowrap",flexShrink:0,transition:"all 0.2s",opacity:locked?0.7:1}}>
              {locked?"🔒 ":""}{uiLang==="ar"?c.labelAr:c.labelEn}
            </button>
          );
        })}
      </div>

      {/* Word grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:12}}>
        {words.map((w,i)=>(
          <div key={i} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",transition:"box-shadow 0.2s",cursor:"default"}}
            onMouseOver={e=>e.currentTarget.style.boxShadow=T.shadow}
            onMouseOut={e=>e.currentTarget.style.boxShadow="none"}>
            {/* Word */}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <span style={{fontFamily:"Georgia,serif",fontSize:16,fontWeight:700,color:T.primary,direction:"ltr"}}>{w.w}</span>
            </div>
            {/* Meaning */}
            <div style={{fontSize:13,color:T.text,fontFamily:"'Cairo',system-ui",marginBottom:6,direction:meaningsLang==="ar"?"rtl":"ltr",background:T.primaryLight,borderRadius:6,padding:"4px 8px",fontWeight:600}}>
              {meaningsLang==="ar"?w.ar:w.en}
            </div>
            {/* Example */}
            <div style={{fontSize:12,color:T.textMuted,fontFamily:"Georgia,serif",fontStyle:"italic",lineHeight:1.5,direction:"ltr"}}>
              &ldquo;{w.ex}&rdquo;
            </div>
          </div>
        ))}
      </div>

      {words.length===0&&(
        <div style={{textAlign:"center",padding:"40px 20px",color:T.textMuted,fontFamily:"'Cairo',system-ui",fontSize:14}}>
          لا توجد نتائج للبحث — جرّب كلمة مختلفة
        </div>
      )}

      {/* Footer note */}
      <div style={{marginTop:32,background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",direction:"rtl"}}>
        <p style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:T.textMuted,margin:0,lineHeight:1.7}}>
          💡 <strong style={{color:T.text}}>نصيحة:</strong> لا تحفظ هذه الكلمات منفردة — تعلّمها في سياقها. استخدم كل كلمة في جملة من إنشائك لترسّخ في ذاكرتك.
        </p>
      </div>
    </div>
  );
};


// ── PLACEMENT TEST ──────────────────────────────────────────────
const PLACEMENT_READING_PASSAGE = {
  title: "The Rise of Urban Farming",
  text: `Urban farming — the practice of growing food within cities — has seen remarkable growth over the past two decades. Once dismissed as a niche hobby, it is now recognised as a serious response to food security concerns, environmental challenges, and the disconnect many city dwellers feel from natural food systems.

The appeal is practical as well as philosophical. Community gardens and rooftop farms reduce the distance food travels from farm to table, cutting carbon emissions associated with transport. In cities like Singapore and Tokyo, vertical farms use artificial lighting and hydroponic systems to grow vegetables in stacked layers, producing yields many times greater per square metre than conventional agriculture. Singapore, which imports over 90% of its food, has set a national target to produce 30% of its nutritional needs locally by 2030.

Critics, however, point to significant limitations. The energy required to power indoor lighting and climate control systems can exceed the environmental savings from reduced transport. A 2022 study found that some indoor vertical farms produce more carbon emissions per kilogram of lettuce than conventional outdoor farms, once the full energy lifecycle is accounted for. Furthermore, urban farms currently produce mainly high-value, low-calorie crops like salad leaves and herbs — not the staple grains and proteins that constitute the majority of human diets.

Proponents argue that the technology is still maturing and that energy costs will fall as renewable sources become more widespread. They also highlight benefits that go beyond food production: urban farms have been shown to reduce urban heat, improve mental health among participants, and build community cohesion in areas that lack green space.

The debate ultimately reflects a broader tension in environmental policy — between embracing imperfect solutions now versus waiting for more efficient alternatives that may take decades to develop.`,
  questions: [
    {q:"What is the main purpose of this passage?",options:["To argue that urban farming is always superior to conventional farming","To present a balanced overview of urban farming's benefits and limitations","To persuade readers to start their own urban farm","To explain how hydroponic technology works"],a:1},
    {q:"According to the passage, what is Singapore's food production goal by 2030?",options:["To export food to other countries","To stop importing food entirely","To produce 30% of its nutritional needs locally","To build 100 vertical farms"],a:2},
    {q:"The word 'niche' in the first paragraph most closely means:",options:["Popular and widespread","Expensive and impractical","Specialised and not mainstream","Modern and technological"],a:2},
    {q:"What does the 2022 study mentioned in the passage suggest?",options:["Urban farming always reduces carbon emissions","Some indoor farms may produce more emissions than outdoor farms","Vertical farms are more efficient than all outdoor farms","Energy costs for urban farms are falling rapidly"],a:1},
    {q:"Why do critics say urban farms have limited impact on food security?",options:["They are too expensive to build","They mainly produce low-calorie crops, not staple foods","They only work in warm climates","They require too much water"],a:1},
    {q:"The word 'proponents' in the fourth paragraph means:",options:["People who oppose something","Scientists who study something","People who support and advocate for something","Government officials who regulate something"],a:2},
    {q:"Which benefit of urban farming is NOT mentioned in the passage?",options:["Reducing urban heat","Improving mental health","Creating employment opportunities","Building community cohesion"],a:2},
    {q:"What does the final paragraph suggest about environmental policy?",options:["Imperfect solutions should always be rejected","There is a difficult choice between acting now with imperfect solutions or waiting for better ones","Urban farming is not worth pursuing","Renewable energy will solve all problems"],a:1},
    {q:"The phrase 'once the full energy lifecycle is accounted for' suggests that:",options:["Energy costs are always hidden","You need to consider total energy use, not just one aspect","Lifecycle costs are too complex to calculate","Transport emissions are the biggest factor"],a:1},
    {q:"What can be inferred about conventional outdoor farming compared to some indoor vertical farms?",options:["It is always less sustainable","It may sometimes produce lower carbon emissions per kilogram of crop","It is more expensive","It cannot produce salad crops"],a:1},
    {q:"Which best describes the overall tone of the passage?",options:["Strongly critical of urban farming","Enthusiastically supportive of urban farming","Balanced and analytical","Uncertain and confused"],a:2},
    {q:"The passage implies that the future of urban farming depends mainly on:",options:["Government funding","Improvements in renewable energy and technology maturity","Consumer demand for locally grown food","International cooperation"],a:1},
  ]
};

const PLACEMENT_GRAMMAR_VOCAB = [
  {q:"She has been working at this company __ five years.",options:["since","for","during","from"],a:1},
  {q:"The results of the experiment __ announced tomorrow.",options:["will be","are being","have been","were"],a:0},
  {q:"Choose the correct sentence:",options:["The informations were useful.","The information was useful.","The informations was useful.","The information were useful."],a:1},
  {q:"If I __ more time, I would study abroad.",options:["have","had","would have","will have"],a:1},
  {q:"The report highlighted __ need for further research.",options:["a","an","the","—"],a:2},
  {q:"Scientists have found a strong __ between diet and mental health.",options:["link","linked","linking","links"],a:0},
  {q:"The policy was __ by the government last year.",options:["implement","implemented","implementing","to implement"],a:1},
  {q:"She is known for her __ attention to detail.",options:["meticulous","mediocre","merciful","menacing"],a:0},
  {q:"Not only __ the project delayed, but it also exceeded its budget.",options:["was","is","were","has"],a:0},
  {q:"The new regulations are designed to __ pollution levels.",options:["reduce","reducing","reduced","reduction"],a:0},
  {q:"He gave a __ argument that convinced most of the committee.",options:["persuasive","persuaded","persuading","persuasion"],a:0},
  {q:"The number of people affected by the disease __ risen sharply.",options:["have","has","are","were"],a:1},
  {q:"Despite __ hard, she did not pass the exam.",options:["studied","studying","to study","having study"],a:1},
  {q:"The study concluded that exercise has a __ effect on cognitive function.",options:["beneficial","benefited","benefiting","benefit"],a:0},
  {q:"Which word means 'to make a problem worse'?",options:["alleviate","mitigate","exacerbate","resolve"],a:2},
  {q:"The findings were __ with previous research in the field.",options:["consistent","consisting","consisted","consistency"],a:0},
  {q:"By the time she arrived, the meeting __ already started.",options:["has","had","was","would"],a:1},
  {q:"Which sentence uses 'however' correctly?",options:["I like coffee, however tea.","I like coffee. However, I prefer tea.","However I like coffee and tea.","I like coffee however, I prefer tea."],a:1},
  {q:"The word 'prevalent' most closely means:",options:["rare and unusual","widely common","strictly controlled","recently discovered"],a:1},
  {q:"Despite budget cuts, the government allocated __ funds to healthcare than in the previous year.",options:["more","less","fewer","much"],a:0,exp:"'More' is correct here because 'budget cuts' followed by 'despite' signals healthcare spending increased. 'Fewer' is wrong — funds is uncountable. 'Much' cannot be used in comparatives."},
];

const CEFR_LEVELS = [
  {min:0,  max:25,  cefr:"A1", label:"Beginner",           ielts:"1.0 – 2.5", color:"#6b7280", bg:"#f3f4f6", advice:"Focus on building core vocabulary and basic grammar. The Vocabulary and Grammar sections of Englishfool are your starting point."},
  {min:26, max:40,  cefr:"A2", label:"Elementary",         ielts:"2.5 – 3.5", color:"#2563eb", bg:"#dbeafe", advice:"Work on expanding vocabulary and basic sentence structures. Try the IELTS Games and Vocabulary page to build confidence."},
  {min:41, max:56,  cefr:"B1", label:"Intermediate",       ielts:"4.0 – 5.0", color:"#7c3aed", bg:"#ede9fe", advice:"You have a foundation. Now focus on IELTS-specific writing structure, cohesive devices, and reading practice."},
  {min:57, max:72,  cefr:"B2", label:"Upper Intermediate",  ielts:"5.5 – 6.5", color:"#d97706", bg:"#fef3c7", advice:"You are in IELTS range. Focus on essay structure, vocabulary precision, and error reduction. The Essay Analyzer is your most valuable tool."},
  {min:73, max:87,  cefr:"C1", label:"Advanced",           ielts:"7.0 – 8.0", color:"#059669", bg:"#d1fae5", advice:"Strong English level. Work on sophisticated vocabulary, complex sentence variety, and exam technique to reach Band 7+."},
  {min:88, max:100, cefr:"C2", label:"Proficient",         ielts:"8.5 – 9.0", color:"#dc2626", bg:"#fee2e2", advice:"Near-native level. Focus entirely on IELTS exam technique, timing, and Band 9 model answers."},
];

const PLACEMENT_STORAGE_KEY = "ef_placement_result";

const savePlacementResult = (data) => { try { localStorage.setItem(PLACEMENT_STORAGE_KEY, JSON.stringify({...data, date: new Date().toISOString()})); } catch {} };
const loadPlacementResult = () => { try { const d=localStorage.getItem(PLACEMENT_STORAGE_KEY); return d?JSON.parse(d):null; } catch { return null; } };
const clearPlacementResult = () => { try { localStorage.removeItem(PLACEMENT_STORAGE_KEY); } catch {} };

const PlacementTest = ({uiLang="ar", onNavigate, isPro=false}) => {
  const saved = loadPlacementResult();
  const hasTaken = !!saved;
  const [screen, setScreen] = useState(saved?"results":"intro");
  const [readingAnswers, setReadingAnswers] = useState(saved?.readingAnswers||{});
  const [grammarAnswers, setGrammarAnswers] = useState(saved?.grammarAnswers||{});
  const [readingTime, setReadingTime] = useState(600);
  const [grammarTime, setGrammarTime] = useState(600);
  const [results, setResults] = useState(saved||null);
  const [reviewSection, setReviewSection] = useState(null); // null | "reading" | "grammar"
  const timerRef = useRef(null);
  const sty = {fontFamily:"'Cairo','Source Sans Pro',system-ui"};

  const startTimer = (setTime, onExpire) => {
    if(timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(()=>{
      setTime(prev=>{
        if(prev<=1){ clearInterval(timerRef.current); onExpire(); return 0; }
        return prev-1;
      });
    },1000);
  };

  useEffect(()=>{ return ()=>{ if(timerRef.current) clearInterval(timerRef.current); }; },[]);

  const fmt = s => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  const startReading = () => { setScreen("reading"); startTimer(setReadingTime, finishReading); };
  const finishReading = () => { if(timerRef.current) clearInterval(timerRef.current); setScreen("grammar"); startTimer(setGrammarTime, finishGrammar); };
  const finishGrammar = () => { if(timerRef.current) clearInterval(timerRef.current); calcResults(); };

  const calcResults = (rAns=readingAnswers, gAns=grammarAnswers) => {
    const rScore = PLACEMENT_READING_PASSAGE.questions.reduce((s,q,i)=> s+(rAns[i]===q.a?1:0),0);
    const gScore = PLACEMENT_GRAMMAR_VOCAB.reduce((s,q,i)=> s+(gAns[i]===q.a?1:0),0);
    const total = rScore+gScore;
    const pct = Math.round((total/32)*100);
    const level = CEFR_LEVELS.find(l=>pct>=l.min&&pct<=l.max)||CEFR_LEVELS[0];
    const data = {rScore,gScore,total,pct,level,readingAnswers:rAns,grammarAnswers:gAns};
    savePlacementResult(data);
    setResults(data);
    setScreen("results");
    setTimeout(()=>window.scrollTo({top:0,behavior:"smooth"}),50);
  };

  const retake = () => {
    clearPlacementResult();
    setScreen("intro"); setReadingAnswers({}); setGrammarAnswers({});
    setReadingTime(600); setGrammarTime(600); setResults(null); setReviewSection(null);
    window.scrollTo({top:0,behavior:"smooth"});
  };

  const TimerBar = ({time, total=600}) => {
    const pct=(time/total)*100;
    const color=time<120?T.red:time<240?T.amber:T.green;
    return(
      <div style={{background:T.bgGray,borderRadius:4,height:6,overflow:"hidden",marginBottom:4}}>
        <div style={{width:`${pct}%`,height:"100%",background:color,transition:"width 1s linear,background 0.5s"}}/>
      </div>
    );
  };

  // ── INTRO ──
  if(screen==="intro") return(
    <div style={{maxWidth:680,margin:"0 auto",padding:"32px 20px 80px"}}>
      <div style={{textAlign:"center",marginBottom:32}}>
        <div style={{fontSize:56,marginBottom:12}}>📋</div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:28,color:T.text,margin:"0 0 8px"}}>{uiLang==="ar"?"اختبار تحديد المستوى":"Placement Test"}</h1>
        <p style={{...sty,fontSize:15,color:T.textMid,lineHeight:1.7,marginBottom:0}}>{uiLang==="ar"?"اكتشف مستواك في الإنجليزية وتقديرك في الآيلتس — مجاني بالكامل":"Discover your English level and estimated IELTS band — completely free"}</p>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:28}}>
        {[
          {icon:"📖",label:uiLang==="ar"?"القراءة":"Reading",time:uiLang==="ar"?"١٠ دقائق":"10 minutes",count:uiLang==="ar"?"١٢ سؤالاً":"12 questions",desc:uiLang==="ar"?"فقرة أكاديمية + أسئلة فهم":"Academic passage + comprehension questions"},
          {icon:"📐",label:uiLang==="ar"?"القواعد والمفردات":"Grammar & Vocabulary",time:uiLang==="ar"?"١٠ دقائق":"10 minutes",count:uiLang==="ar"?"٢٠ سؤالاً":"20 questions",desc:uiLang==="ar"?"زمن، مفردات، هيكل الجملة":"Tenses, vocabulary, sentence structure"},
        ].map((s,i)=>(
          <div key={i} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"16px"}}>
            <div style={{fontSize:28,marginBottom:6}}>{s.icon}</div>
            <div style={{...sty,fontWeight:700,fontSize:14,color:T.text,marginBottom:2}}>{s.label}</div>
            <div style={{...sty,fontSize:12,color:T.primary,fontWeight:600,marginBottom:4}}>{s.time} · {s.count}</div>
            <div style={{...sty,fontSize:12,color:T.textMuted,lineHeight:1.4}}>{s.desc}</div>
          </div>
        ))}
      </div>
      <div style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:10,padding:"14px 16px",marginBottom:24,direction:uiLang==="ar"?"rtl":"ltr"}}>
        <div style={{...sty,fontSize:13,color:T.textMid,lineHeight:1.7}}>{uiLang==="ar"?"✅ ستحصل على: مستواك في الإطار الأوروبي (A1–C2) · تقدير درجة الآيلتس · مراجعة إجاباتك الخاطئة · خطة تعلم مخصصة":"✅ You'll get: CEFR level (A1–C2) · Estimated IELTS band · Full answer review with corrections · Personalised learning plan"}</div>
      </div>
      <div style={{textAlign:"center"}}>
        <button onClick={startReading} style={{background:T.primary,color:"white",border:"none",borderRadius:10,padding:"14px 40px",fontSize:16,fontWeight:700,cursor:"pointer",...sty,boxShadow:`0 4px 16px ${T.primary}44`}}>
          {uiLang==="ar"?"ابدأ الاختبار ←":"Start Test →"}
        </button>
        <div style={{...sty,fontSize:12,color:T.textMuted,marginTop:8}}>{uiLang==="ar"?"مجاني · لا يتطلب تسجيلاً · ٢٠ دقيقة فقط":"Free · No sign-up required · 20 minutes"}</div>
      </div>
    </div>
  );

  // ── READING ──
  if(screen==="reading") return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"24px 20px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div style={{...sty,fontWeight:700,fontSize:15,color:T.text}}>📖 {uiLang==="ar"?"القسم الأول: القراءة":"Section 1: Reading"}</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{...sty,fontSize:13,color:T.textMuted}}>{Object.keys(readingAnswers).length}/12 {uiLang==="ar"?"مجاب":"answered"}</div>
          <div style={{...sty,fontWeight:700,fontSize:15,color:readingTime<120?T.red:readingTime<240?T.amber:T.text,fontVariantNumeric:"tabular-nums",minWidth:40}}>⏱ {fmt(readingTime)}</div>
        </div>
      </div>
      <TimerBar time={readingTime}/>

      {/* Mobile notice */}
      <div className="placement-mobile-notice" style={{display:"none",background:"#fef3c7",border:"1px solid #f59e0b",borderRadius:10,padding:"12px 16px",marginTop:12,marginBottom:4}}>
        <div style={{...sty,fontSize:13,color:"#92400e",fontWeight:600,textAlign:"center"}}>
          💻 {uiLang==="ar"?"يُفضَّل أداء قسم القراءة على الحاسوب — الشاشة الأكبر تتيح لك رؤية النص والأسئلة بوضوح":"This section is best taken on a computer — the larger screen lets you read and answer questions more comfortably"}
        </div>
      </div>

      {/* Desktop: side by side | Mobile: stacked */}
      <div className="placement-reading-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginTop:12}}>
        <div style={{background:"white",border:`1px solid ${T.border}`,borderRadius:12,padding:"20px",height:"70vh",overflowY:"auto"}} className="placement-passage">
          <div style={{...sty,fontWeight:700,fontSize:13,color:T.primary,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em"}}>{PLACEMENT_READING_PASSAGE.title}</div>
          {PLACEMENT_READING_PASSAGE.text.split("\n\n").map((p,i)=>(
            <p key={i} style={{fontFamily:"Georgia,serif",fontSize:14,lineHeight:1.8,color:T.text,marginBottom:12}}>{p}</p>
          ))}
        </div>
        <div style={{height:"70vh",overflowY:"auto",display:"flex",flexDirection:"column",gap:12}} className="placement-questions">
          {PLACEMENT_READING_PASSAGE.questions.map((q,qi)=>(
            <div key={qi} style={{background:"white",border:`1.5px solid ${readingAnswers[qi]!==undefined?T.primaryBorder:T.border}`,borderRadius:10,padding:"14px"}}>
              <div style={{...sty,fontSize:13,fontWeight:600,color:T.text,marginBottom:8,lineHeight:1.5}}>{qi+1}. {q.q}</div>
              {q.options.map((opt,oi)=>(
                <button key={oi} onClick={()=>setReadingAnswers(p=>({...p,[qi]:oi}))}
                  style={{display:"block",width:"100%",textAlign:"left",background:readingAnswers[qi]===oi?T.primaryLight:"transparent",border:`1px solid ${readingAnswers[qi]===oi?T.primaryBorder:T.border}`,borderRadius:7,padding:"7px 10px",marginBottom:4,cursor:"pointer",...sty,fontSize:12,color:readingAnswers[qi]===oi?T.primary:T.textMid,fontWeight:readingAnswers[qi]===oi?600:400,transition:"all 0.15s"}}>
                  {String.fromCharCode(65+oi)}. {opt}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div style={{textAlign:"center",marginTop:16}}>
        <button onClick={finishReading} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
          {uiLang==="ar"?"إنهاء القراءة · الانتقال للقسم الثاني →":"Finish Reading · Next Section →"}
        </button>
      </div>
    </div>
  );

  // ── GRAMMAR ──
  if(screen==="grammar") return(
    <div style={{maxWidth:680,margin:"0 auto",padding:"24px 20px 80px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,flexWrap:"wrap",gap:8}}>
        <div style={{...sty,fontWeight:700,fontSize:15,color:T.text}}>📐 {uiLang==="ar"?"القسم الثاني: القواعد والمفردات":"Section 2: Grammar & Vocabulary"}</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{...sty,fontSize:13,color:T.textMuted}}>{Object.keys(grammarAnswers).length}/20 {uiLang==="ar"?"مجاب":"answered"}</div>
          <div style={{...sty,fontWeight:700,fontSize:15,color:grammarTime<120?T.red:grammarTime<240?T.amber:T.text,fontVariantNumeric:"tabular-nums",minWidth:40}}>⏱ {fmt(grammarTime)}</div>
        </div>
      </div>
      <TimerBar time={grammarTime}/>
      <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:16}}>
        {PLACEMENT_GRAMMAR_VOCAB.map((q,qi)=>(
          <div key={qi} style={{background:"white",border:`1.5px solid ${grammarAnswers[qi]!==undefined?T.primaryBorder:T.border}`,borderRadius:10,padding:"14px"}}>
            <div style={{...sty,fontSize:13,fontWeight:600,color:T.text,marginBottom:8,lineHeight:1.5}}>{qi+1}. {q.q}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
              {q.options.map((opt,oi)=>(
                <button key={oi} onClick={()=>setGrammarAnswers(p=>({...p,[qi]:oi}))}
                  style={{textAlign:"left",background:grammarAnswers[qi]===oi?T.primaryLight:"transparent",border:`1px solid ${grammarAnswers[qi]===oi?T.primaryBorder:T.border}`,borderRadius:7,padding:"7px 10px",cursor:"pointer",...sty,fontSize:12,color:grammarAnswers[qi]===oi?T.primary:T.textMid,fontWeight:grammarAnswers[qi]===oi?600:400,transition:"all 0.15s"}}>
                  {String.fromCharCode(65+oi)}. {opt}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div style={{textAlign:"center",marginTop:20}}>
        <button onClick={finishGrammar} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
          {uiLang==="ar"?"أنهِ الاختبار واعرض نتيجتك →":"Finish & See Results →"}
        </button>
      </div>
    </div>
  );

  // ── RESULTS ──
  if(screen==="results"&&results) {
    const {rScore,gScore,total,pct,level,readingAnswers:rAns,grammarAnswers:gAns} = results;
    const nextSteps = {
      A1:[{icon:"📝",text:uiLang==="ar"?"ابدأ بمفردات الآيلتس الأساسية":"Start with IELTS core vocabulary",view:"vocabulary"},{icon:"🎮",text:uiLang==="ar"?"العب لعبة الإملاء والقواعد يومياً":"Play spelling & grammar games daily",view:"game"},{icon:"📐",text:uiLang==="ar"?"مارس تمارين القواعد":"Practice grammar exercises",view:"exercises"}],
      A2:[{icon:"📝",text:uiLang==="ar"?"ادرس مفردات الآيلتس الأساسية":"Study IELTS vocabulary list",view:"vocabulary"},{icon:"🎮",text:uiLang==="ar"?"العب ألعاب المفردات والكتابة":"Play vocabulary & writing games",view:"game"},{icon:"✍️",text:uiLang==="ar"?"جرّب تحليل مقالة مجانية":"Try a free essay analysis",view:"analyze"}],
      B1:[{icon:"📖",text:uiLang==="ar"?"ابدأ اختبارات القراءة":"Start reading tests",view:"reading"},{icon:"✍️",text:uiLang==="ar"?"حلّل مقالتك الأولى":"Analyse your first essay",view:"analyze"},{icon:"📚",text:uiLang==="ar"?"راجع أدوات الآيلتس":"Review IELTS toolkit",view:"toolkit"}],
      B2:[{icon:"✍️",text:uiLang==="ar"?"ركّز على تحليل المقالات":"Focus on essay analysis",view:"analyze"},{icon:"📖",text:uiLang==="ar"?"أكمل جميع اختبارات القراءة":"Complete all reading tests",view:"reading"},{icon:"🏋️",text:uiLang==="ar"?"مارس تمارين الباراغراف":"Practice paraphrasing exercises",view:"exercises"}],
      C1:[{icon:"✍️",text:uiLang==="ar"?"ارفع درجتك من ٦.٥ إلى ٧+":"Push from 6.5 to Band 7+",view:"analyze"},{icon:"🗣️",text:uiLang==="ar"?"درّب مهارة المحادثة":"Practise speaking skills",view:"speaking"},{icon:"🏋️",text:uiLang==="ar"?"تمارين متقدمة وتصحيح الأخطاء":"Advanced exercises & error correction",view:"exercises"}],
      C2:[{icon:"✍️",text:uiLang==="ar"?"اتقن أسلوب Band 8-9":"Master Band 8-9 writing style",view:"analyze"},{icon:"🗣️",text:uiLang==="ar"?"راجع نماذج Band 8 للمحادثة":"Review Band 8 speaking models",view:"speaking"},{icon:"📖",text:uiLang==="ar"?"ابقَ حاداً مع اختبارات القراءة":"Stay sharp with reading tests",view:"reading"}],
    };
    const steps = nextSteps[level.cefr]||nextSteps.B1;
    const dateStr = results.date ? new Date(results.date).toLocaleDateString(uiLang==="ar"?"ar-JO":"en-GB",{day:"numeric",month:"short",year:"numeric"}) : "";

    return(
      <div style={{maxWidth:720,margin:"0 auto",padding:"32px 20px 80px"}}>

        {/* Saved badge */}
        {results.date&&(
          <div style={{...sty,fontSize:12,color:T.textMuted,textAlign:"center",marginBottom:12}}>
            {uiLang==="ar"?`✅ نتيجة محفوظة · أجريت في ${dateStr}`:`✅ Saved result · Taken on ${dateStr}`}
          </div>
        )}

        {/* Level badge */}
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",background:level.bg,border:`2px solid ${level.color}`,borderRadius:20,padding:"20px 40px",marginBottom:12}}>
            <div style={{fontFamily:"Georgia,serif",fontSize:60,fontWeight:900,color:level.color,lineHeight:1}}>{level.cefr}</div>
            <div style={{...sty,fontSize:16,fontWeight:700,color:level.color,marginTop:4}}>{level.label}</div>
          </div>
          <div style={{...sty,fontSize:15,color:T.text,fontWeight:600,marginBottom:4}}>
            {uiLang==="ar"?"تقدير درجة الآيلتس:":"Estimated IELTS Band:"} <span style={{color:T.primary}}>{level.ielts}</span>
          </div>
          <div style={{...sty,fontSize:13,color:T.textMuted}}>{uiLang==="ar"?"نتيجتك:":"Your score:"} {total}/32 ({pct}%)</div>
        </div>

        {/* Score breakdown */}
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
          {[
            {icon:"📖",label:uiLang==="ar"?"القراءة":"Reading",score:rScore,max:12},
            {icon:"📐",label:uiLang==="ar"?"القواعد والمفردات":"Grammar & Vocab",score:gScore,max:20},
          ].map((s,i)=>(
            <div key={i} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:10,padding:"14px",textAlign:"center"}}>
              <div style={{fontSize:24,marginBottom:4}}>{s.icon}</div>
              <div style={{...sty,fontSize:12,color:T.textMuted,marginBottom:4}}>{s.label}</div>
              <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:700,color:T.primary}}>{s.score}<span style={{fontSize:14,color:T.textMuted}}>/{s.max}</span></div>
              <div style={{background:T.bgGray,borderRadius:4,height:6,marginTop:8,overflow:"hidden"}}>
                <div style={{width:`${(s.score/s.max)*100}%`,height:"100%",background:T.primary,transition:"width 1s"}}/>
              </div>
            </div>
          ))}
        </div>

        {/* Advice */}
        <div style={{background:level.bg,border:`1px solid ${level.color}40`,borderRadius:10,padding:"14px 16px",marginBottom:20,direction:uiLang==="ar"?"rtl":"ltr"}}>
          <div style={{...sty,fontSize:13,color:T.text,lineHeight:1.7}}>💡 {level.advice}</div>
        </div>

        {/* Answer review toggle buttons */}
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <button onClick={()=>setReviewSection(reviewSection==="reading"?null:"reading")}
            style={{...sty,fontSize:13,fontWeight:600,padding:"9px 18px",borderRadius:8,cursor:"pointer",background:reviewSection==="reading"?T.primaryLight:"white",border:`1.5px solid ${reviewSection==="reading"?T.primary:T.border}`,color:reviewSection==="reading"?T.primary:T.textMid,transition:"all 0.2s"}}>
            📖 {uiLang==="ar"?"مراجعة القراءة":"Review Reading"} ({rScore}/12)
          </button>
          <button onClick={()=>setReviewSection(reviewSection==="grammar"?null:"grammar")}
            style={{...sty,fontSize:13,fontWeight:600,padding:"9px 18px",borderRadius:8,cursor:"pointer",background:reviewSection==="grammar"?T.primaryLight:"white",border:`1.5px solid ${reviewSection==="grammar"?T.primary:T.border}`,color:reviewSection==="grammar"?T.primary:T.textMid,transition:"all 0.2s"}}>
            📐 {uiLang==="ar"?"مراجعة القواعد":"Review Grammar"} ({gScore}/20)
          </button>
        </div>

        {/* Answer review: Reading */}
        {reviewSection==="reading"&&(
          <div style={{marginBottom:20,display:"flex",flexDirection:"column",gap:10}}>
            {PLACEMENT_READING_PASSAGE.questions.map((q,qi)=>{
              const userAns=rAns?.[qi];
              const correct=userAns===q.a;
              return(
                <div key={qi} style={{background:"white",border:`1.5px solid ${correct?"#86efac":"#fca5a5"}`,borderRadius:10,padding:"14px",borderLeft:`4px solid ${correct?T.green:T.red}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8}}>
                    <span style={{fontSize:16,flexShrink:0}}>{correct?"✅":"❌"}</span>
                    <div style={{...sty,fontSize:13,fontWeight:600,color:T.text,lineHeight:1.5}}>{qi+1}. {q.q}</div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {q.options.map((opt,oi)=>{
                      const isCorrect=oi===q.a;
                      const isUser=oi===userAns;
                      let bg="transparent",border=T.border,color=T.textMid;
                      if(isCorrect){bg="#d1fae5";border="#86efac";color="#065f46";}
                      else if(isUser&&!isCorrect){bg="#fee2e2";border="#fca5a5";color="#991b1b";}
                      return(
                        <div key={oi} style={{...sty,fontSize:12,padding:"6px 10px",borderRadius:6,background:bg,border:`1px solid ${border}`,color,fontWeight:isCorrect||isUser?600:400}}>
                          {String.fromCharCode(65+oi)}. {opt}
                          {isCorrect&&<span style={{marginLeft:8,fontSize:11}}>✓ {uiLang==="ar"?"الإجابة الصحيحة":"Correct answer"}</span>}
                          {isUser&&!isCorrect&&<span style={{marginLeft:8,fontSize:11}}>← {uiLang==="ar"?"إجابتك":"Your answer"}</span>}
                        </div>
                      );
                    })}
                    {userAns===undefined&&<div style={{...sty,fontSize:12,color:T.textMuted,fontStyle:"italic"}}>{uiLang==="ar"?"لم تجب على هذا السؤال":"Not answered"}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Answer review: Grammar */}
        {reviewSection==="grammar"&&(
          <div style={{marginBottom:20,display:"flex",flexDirection:"column",gap:10}}>
            {PLACEMENT_GRAMMAR_VOCAB.map((q,qi)=>{
              const userAns=gAns?.[qi];
              const correct=userAns===q.a;
              return(
                <div key={qi} style={{background:"white",border:`1.5px solid ${correct?"#86efac":"#fca5a5"}`,borderRadius:10,padding:"14px",borderLeft:`4px solid ${correct?T.green:T.red}`}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8,marginBottom:8}}>
                    <span style={{fontSize:16,flexShrink:0}}>{correct?"✅":"❌"}</span>
                    <div style={{...sty,fontSize:13,fontWeight:600,color:T.text,lineHeight:1.5}}>{qi+1}. {q.q}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {q.options.map((opt,oi)=>{
                      const isCorrect=oi===q.a;
                      const isUser=oi===userAns;
                      let bg="transparent",border=T.border,color=T.textMid;
                      if(isCorrect){bg="#d1fae5";border="#86efac";color="#065f46";}
                      else if(isUser&&!isCorrect){bg="#fee2e2";border="#fca5a5";color="#991b1b";}
                      return(
                        <div key={oi} style={{...sty,fontSize:12,padding:"6px 10px",borderRadius:6,background:bg,border:`1px solid ${border}`,color,fontWeight:isCorrect||isUser?600:400,lineHeight:1.4}}>
                          {String.fromCharCode(65+oi)}. {opt}
                          {isCorrect&&<div style={{fontSize:10,marginTop:2}}>✓ {uiLang==="ar"?"صحيح":"Correct"}</div>}
                          {isUser&&!isCorrect&&<div style={{fontSize:10,marginTop:2,color:"#991b1b"}}>← {uiLang==="ar"?"إجابتك":"Yours"}</div>}
                        </div>
                      );
                    })}
                  </div>
                  {userAns===undefined&&<div style={{...sty,fontSize:12,color:T.textMuted,fontStyle:"italic",marginTop:4}}>{uiLang==="ar"?"لم تجب":"Not answered"}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* Next steps */}
        <div style={{marginBottom:20}}>
          <div style={{...sty,fontWeight:700,fontSize:14,color:T.text,marginBottom:10,direction:uiLang==="ar"?"rtl":"ltr"}}>
            {uiLang==="ar"?"🗺️ خطواتك القادمة في Englishfool:":"🗺️ Your next steps on Englishfool:"}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {steps.map((s,i)=>(
              <button key={i} onClick={()=>onNavigate&&onNavigate(s.view)}
                style={{display:"flex",alignItems:"center",gap:12,background:"white",border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",cursor:"pointer",textAlign:"left",transition:"all 0.2s",direction:uiLang==="ar"?"rtl":"ltr"}}
                onMouseOver={e=>{e.currentTarget.style.borderColor=T.primary;e.currentTarget.style.background=T.primaryLight;}}
                onMouseOut={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background="white";}}>
                <span style={{fontSize:20}}>{s.icon}</span>
                <span style={{...sty,fontSize:13,color:T.text,fontWeight:500,flex:1}}>{s.text}</span>
                <span style={{color:T.primary,fontSize:14}}>→</span>
              </button>
            ))}
          </div>
          <div style={{...sty,fontSize:12,color:T.textMuted,marginTop:8,direction:uiLang==="ar"?"rtl":"ltr"}}>
            💾 {uiLang==="ar"?"نتيجتك محفوظة — ستجدها هنا في كل مرة تعود فيها":"Your result is saved — it will be here every time you return"}
          </div>
        </div>

        {/* Retake */}
        <div style={{textAlign:"center"}}>
          {isPro?(
            <button onClick={retake} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 24px",fontSize:13,...sty,color:T.textMid,cursor:"pointer"}}>
              {uiLang==="ar"?"🔄 أعد الاختبار (سيمسح نتيجتك الحالية)":"🔄 Retake Test (clears your saved result)"}
            </button>
          ):(
            <div style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,borderRadius:10,padding:"14px 20px",display:"inline-block"}}>
              <div style={{fontSize:13,color:T.amber,fontWeight:700,...sty,marginBottom:4}}>
                {uiLang==="ar"?"🔒 إعادة الاختبار متاحة لمشتركي Pro":"🔒 Retaking the test is a Pro feature"}
              </div>
              <div style={{fontSize:12,color:T.textMuted,...sty}}>
                {uiLang==="ar"?"اشترك في Pro لإعادة الاختبار وتتبع تحسّنك عبر الزمن":"Subscribe to Pro to retake and track your improvement over time"}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  return null;
};
// ── END PLACEMENT TEST ───────────────────────────────────────────
// ── FREE CONSULTATION MODAL ──────────────────────
const FB_PAGE_URL = "https://www.facebook.com/profile.php?id=61579432547860";

function ConsultationModal({onClose, uiLang="ar"}){
  const [channel, setChannel] = useState(null);
  const [form, setForm] = useState({name:"",country:"",phone:"",message:""});
  const [status, setStatus] = useState(null); // null | "sending" | "success" | "validation_error" | "send_error"
  const isAr = uiLang==="ar";

  const COUNTRIES_SHORT = ["Jordan","Saudi Arabia","UAE","Egypt","Kuwait","Qatar","Bahrain","Oman","Iraq","Syria","Lebanon","Palestine","Yemen","Libya","Tunisia","Morocco","Algeria","Sudan","United States","United Kingdom","Canada","Australia","Germany","France","Turkey","Other"];

  const handleWhatsAppSubmit = async () => {
    // Clear any previous error first
    setStatus(null);
    if(!form.name.trim()||!form.phone.trim()||!form.message.trim()){
      setStatus("validation_error"); return;
    }
    setStatus("sending");
    const body = [
      `📱 WhatsApp Consultation Request`,
      ``,
      `Name: ${form.name}`,
      `Country: ${form.country||"Not specified"}`,
      `WhatsApp: ${form.phone}`,
      ``,
      `Question:`,
      form.message
    ].join("\n");
    try {
      // Wait for emailjs to be ready (it loads async)
      let attempts=0;
      while(!window.emailjs?.send && attempts<20){ await new Promise(r=>setTimeout(r,150)); attempts++; }
      if(!window.emailjs?.send){ throw new Error("EmailJS not available"); }
      await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        from_name: `[Consultation] ${form.name}`,
        from_email: "consultation@englishfool.com",
        country: form.country||"Not specified",
        age_group: `WA: ${form.phone}`,
        message: body,
        to_email: "sartawi.ahmad@gmail.com"
      });
      setStatus("success");
    } catch(e){
      console.error("Consultation send error:", e);
      setStatus("send_error");
    }
  };

  const inp={width:"100%",background:"#f9fafb",border:`1px solid ${T.border}`,borderRadius:10,color:T.text,fontSize:14,padding:"12px 14px",fontFamily:"'Cairo',system-ui",outline:"none",boxSizing:"border-box"};
  const lbl={display:"block",fontSize:12,color:T.textMid,fontWeight:700,marginBottom:6,fontFamily:"'Cairo',system-ui",textAlign:isAr?"right":"left"};

  return(
    <div style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,0.5)",backdropFilter:"blur(4px)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div style={{background:"white",borderRadius:16,maxWidth:460,width:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.25)",position:"relative",fontFamily:"'Cairo',system-ui"}} onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{background:T.primary,padding:"20px 24px",position:"sticky",top:0,zIndex:2}}>
          <button onClick={onClose} style={{position:"absolute",top:12,left:12,background:"rgba(255,255,255,0.15)",border:"none",borderRadius:"50%",width:32,height:32,cursor:"pointer",color:"white",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:32,marginBottom:6}}>🎓</div>
            <div style={{fontWeight:800,fontSize:17,color:"white"}}>{isAr?"استشارة مجانية في الآيلتس":"Free IELTS Consultation"}</div>
            <div style={{fontSize:12,color:"rgba(255,255,255,0.7)",marginTop:3}}>{isAr?"اختر طريقة التواصل المناسبة لك":"Choose how you would like to reach us"}</div>
          </div>
        </div>

        <div style={{padding:"24px"}}>
          {/* Channel selection */}
          {!channel&&(
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <button onClick={()=>setChannel("whatsapp")} style={{display:"flex",alignItems:"center",gap:14,background:"#f0fdf4",border:"2px solid #86efac",borderRadius:12,padding:"16px 20px",cursor:"pointer",textAlign:isAr?"right":"left",direction:isAr?"rtl":"ltr",transition:"all 0.2s"}}
                onMouseOver={e=>{e.currentTarget.style.background="#dcfce7";e.currentTarget.style.borderColor="#4ade80";}}
                onMouseOut={e=>{e.currentTarget.style.background="#f0fdf4";e.currentTarget.style.borderColor="#86efac";}}>
                <span style={{fontSize:30,flexShrink:0}}>📱</span>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#166534"}}>WhatsApp</div>
                  <div style={{fontSize:12,color:"#4b7c5a",marginTop:2}}>{isAr?"أرسل لنا بياناتك وسنتواصل معك":"Leave your details and we will reach out"}</div>
                </div>
              </button>
              <button onClick={()=>{window.open(FB_PAGE_URL,"_blank");onClose();}} style={{display:"flex",alignItems:"center",gap:14,background:"#eff6ff",border:"2px solid #93c5fd",borderRadius:12,padding:"16px 20px",cursor:"pointer",textAlign:isAr?"right":"left",direction:isAr?"rtl":"ltr",transition:"all 0.2s"}}
                onMouseOver={e=>{e.currentTarget.style.background="#dbeafe";e.currentTarget.style.borderColor="#60a5fa";}}
                onMouseOut={e=>{e.currentTarget.style.background="#eff6ff";e.currentTarget.style.borderColor="#93c5fd";}}>
                <span style={{fontSize:30,flexShrink:0}}>💬</span>
                <div>
                  <div style={{fontWeight:700,fontSize:14,color:"#1d4ed8"}}>Facebook</div>
                  <div style={{fontSize:12,color:"#3b5fc0",marginTop:2}}>{isAr?"راسلنا عبر صفحتنا على Facebook":"Message us on our Facebook Page"}</div>
                </div>
              </button>
            </div>
          )}

          {/* WhatsApp form */}
          {channel==="whatsapp"&&status!=="success"&&(
            <div style={{direction:isAr?"rtl":"ltr"}}>
              <button onClick={()=>{setChannel(null);setStatus(null);setForm({name:"",country:"",phone:"",message:""});}} style={{background:"none",border:"none",color:T.primary,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:18,padding:0,display:"flex",alignItems:"center",gap:4}}>
                ← {isAr?"رجوع":"Back"}
              </button>
              <div style={{display:"flex",flexDirection:"column",gap:16}}>
                {/* Name */}
                <div>
                  <label style={lbl}>{isAr?"الاسم الكامل *":"Full Name *"}</label>
                  <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder={isAr?"اكتب اسمك...":"Your name..."} style={{...inp,direction:isAr?"rtl":"ltr"}}/>
                </div>
                {/* Country */}
                <div>
                  <label style={lbl}>{isAr?"الدولة (اختياري)":"Country (optional)"}</label>
                  <select value={form.country} onChange={e=>setForm({...form,country:e.target.value})} style={{...inp,background:"white",direction:"ltr"}}>
                    <option value="">{isAr?"اختر دولتك...":"Select your country..."}</option>
                    {COUNTRIES_SHORT.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                {/* Phone — accept any format */}
                <div>
                  <label style={lbl}>{isAr?"رقم WhatsApp *":"WhatsApp Number *"}</label>
                  <input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder={isAr?"أي صيغة مقبولة — مثال: 0792083154 أو +962792083154":"Any format — e.g. 0792083154 or +962792083154"} style={{...inp,direction:"ltr",fontSize:13}}/>
                  <div style={{fontSize:11,color:T.textMuted,marginTop:5,textAlign:isAr?"right":"left"}}>{isAr?"اكتب الرقم بأي صيغة تريدها، سنتواصل معك نحن":"Write it in any format — we will figure out the rest"}</div>
                </div>
                {/* Message */}
                <div>
                  <label style={lbl}>{isAr?"موضوع الاستشارة *":"Your question or topic *"}</label>
                  <textarea value={form.message} onChange={e=>setForm({...form,message:e.target.value})} placeholder={isAr?"مثال: درجتي الحالية 5.5 وأحتاج 7 للجامعة. كيف أحسّن Writing؟":"e.g. My current score is 5.5, I need 7 for university. How do I improve Writing?"} rows={4} style={{...inp,resize:"vertical",lineHeight:1.6,direction:isAr?"rtl":"ltr"}}/>
                </div>

                {/* Errors */}
                {status==="validation_error"&&(
                  <div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red}}>
                    ⚠️ {isAr?"يرجى ملء الاسم ورقم WhatsApp وموضوع الاستشارة":"Please fill in your name, WhatsApp number and question"}
                  </div>
                )}
                {status==="send_error"&&(
                  <div style={{background:T.redBg,border:`1px solid ${T.redBorder}`,borderRadius:8,padding:"10px 14px",fontSize:13,color:T.red}}>
                    ⚠️ {isAr?"حدث خطأ أثناء الإرسال. حاول مرة أخرى أو تواصل معنا عبر Facebook.":"Something went wrong. Please try again or contact us via Facebook."}
                  </div>
                )}

                <button onClick={handleWhatsAppSubmit} disabled={status==="sending"} style={{background:status==="sending"?"#9ca3af":T.primary,color:"white",border:"none",borderRadius:10,padding:"14px",fontSize:15,fontWeight:700,cursor:status==="sending"?"not-allowed":"pointer",transition:"background 0.2s"}}>
                  {status==="sending"?`⏳ ${isAr?"جارٍ الإرسال...":"Sending..."}`:isAr?"إرسال الطلب ←":"Submit Request →"}
                </button>
              </div>
            </div>
          )}

          {/* Success */}
          {status==="success"&&(
            <div style={{textAlign:"center",padding:"12px 0"}}>
              <div style={{fontSize:52,marginBottom:12}}>✅</div>
              <div style={{fontWeight:800,fontSize:18,color:T.green,marginBottom:10}}>{isAr?"تم الإرسال بنجاح!":"Request Sent!"}</div>
              <div style={{fontSize:14,color:T.textMid,lineHeight:1.8,direction:isAr?"rtl":"ltr",marginBottom:20}}>
                {isAr
                  ?"شكراً لك يا "+form.name+". سيتواصل معك أحمد على WhatsApp خلال 24 ساعة 🎓"
                  :"Thank you, "+form.name+"! Ahmad will contact you on WhatsApp within 24 hours 🎓"}
              </div>
              <button onClick={onClose} style={{background:T.primary,color:"white",border:"none",borderRadius:10,padding:"12px 32px",fontSize:14,fontWeight:700,cursor:"pointer"}}>{isAr?"إغلاق":"Close"}</button>
            </div>
          )}
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
              <div style={{background:"#b91c1c",color:"white",borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0,marginTop:1}}>{n}</div>
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
            <strong>Can't find the email?</strong> Check your Spam folder, or contact us via the <strong>Contact</strong> page and we'll helدك في الإلغاء خلال 24 ساعة.
          </div>
        </div>

        <button onClick={onClose} style={{width:"100%",background:"#b91c1c",color:"white",border:"none",borderRadius:10,padding:"13px",fontSize:14,fontWeight:700,cursor:"pointer"}}>
          حسناً، فهمت
        </button>
      </div>
    </div>
  );
}

// ── URL Routing ──────────────────────────────
const ROUTE_MAP = {"/":"home","/analyze":"analyze","/terms":"terms","/privacy":"privacy","/refund":"refund","/pricing":"pricing","/practice":"practice","/progress":"progress","/toolkit":"toolkit","/contact":"contact","/grammar":"grammar","/exercises":"exercises","/admin":"admin","/speaking":"speaking","/reading":"reading","/game":"game","/vocabulary":"vocabulary","/placement":"placement","/pronunciation":"pronunciation","/studyplan":"studyplan"};
const VIEW_TO_PATH = Object.fromEntries(Object.entries(ROUTE_MAP).map(([k,v])=>[v,k]));
const getViewFromPath = () => { const p = window.location.pathname.replace(/\/+$/,"") || "/"; return ROUTE_MAP[p] || "home"; };

// ── UI TRANSLATIONS ────────────────────────────────────────
const UI = {
  ar:{
    // Nav
    home:"🏠 الرئيسية", writing:"✍️ الكتابة", vocab:"📝 المفردات", placement:"📋 تحديد المستوى", speaking:"🗣️ تدريب المحادثة",
    reading:"📖 القراءة", game:"🎮 ألعاب", toolkit:"📚 أدوات",
    progress:"📈 تقدمي", contact:"✉️ اتصل بنا", pronunciation:"🔊 النطق", studyplan:"🗺️ الخطة الدراسية",
    // Account
    signIn:"تسجيل الدخول ←", getPro:"🔓 احصل على Pro", signOut:"تسجيل الخروج",
    manageSubscription:"إدارة الاشتراك",
    // Hero
    heroPill:"🎓 تعلّم الإنجليزية  ·  ارفع درجتك في الآيلتس",
    heroTitle:"تعلّم الإنجليزية. ارفع درجة الآيلتس.",
    heroSub:"اختبار تحديد مستوى · تغذية راجعة حقيقية على مقالاتك · مبني للآيلتس والأهداف الأكبر",
    heroIelts:"✅ مثالي لمن يستهدف رفع درجة الآيلتس",
    heroIelts:"✅ مثالي لمن يستهدف رفع درجة الآيلتس",
    startFree:"اكتشف مستواك — مجاناً ←",
    startFree2:"حلّل مقالتك الأولى مجاناً →",
    subscribe:"🔓 اشترك — $35 / 25 دينار",
    // Features grid
    f1t:"تقييم المقالات",f1d:"مجاني: تحليلان كاملان · Pro: تحليل غير محدود",
    f2t:"اختبارات القراءة",f2d:"مجاني: اختبار واحد · Pro: جميع الـ٧ اختبارات",
    f3t:"تدريب المحادثة مع سارة",f3d:"مجاني: محادثة حقيقية مع تصحيح فوري للقواعد والمفردات · 7 دقائق للمستخدمين المجانيين",
    f4t:"ألعاب تعليمية",f4d:"مجاني: لعبة الإملاء فقط · Pro: جميع الألعاب الـ٥",
    f5t:"قواعد وإملاء",f5d:"مجاني: ٥ فحوصات · Pro: غير محدود",
    f6t:"تمارين تدريبية",f6d:"Pro فقط · ٣٠٠+ تمرين شامل — قواعد، مفردات، تعبير، وتصحيح أخطاء",
    f7t:"أدوات الآيلتس",f7d:"مجاني: الروابط والقواعد · Pro: الأدوات الكاملة",
    f8t:"تتبع تقدمي",f8d:"Pro فقط · تابع درجاتك وتطورك عبر الزمن",
    fat:"اختبار تحديد المستوى",fad:"مجاني: اكتشف مستواك من A1 إلى C2 وتقدير درجة الآيلتس",
    f9t:"مفردات الآيلتس",f9d:"مجاني: أقسام الكتابة والقراءة · Pro: جميع الأقسام (٤٠٠+ كلمة)",
    fStart:"← ابدأ",
    // Stats bar
    stat1n:"20 min",stat1l:"اختبار تحديد المستوى المجاني",
    stat2n:"2",stat2l:"تحليل مقالة مجاني — بدون تسجيل",
    stat3n:"4",stat3l:"معايير تقييم لكل مقالة",
    stat3bn:"A1–C2",stat3bl:"إطار أوروبي مرجعي",
    stat4n:"Task 1 & 2",stat4l:"Academic + General Training",
    // Game strip
    gameTitle:"IELTS Game — تعلّم من خلال اللعب",
    gameSub:"الإملاء · القواعد · المفردات · الكتابة · القراءة",
    gameBtn:"العب الآن 🕹️",
    // Pricing comparison
    pricingTitle:"المجاني مقابل Pro — الفرق في ثانية",
    pricingSub:"3 أشهر · $35 دولي / 25 دينار أردني",
    pricingBtn:"احصل على Pro الآن ←",
    pricingNote:"الإلغاء في أي وقت · دفع آمن عبر Paddle",
    freeLabel:"المجاني", proLabel:"كل شيء مفتوح",
    // Writing sub-nav
    exercises:"🏋️ تمارين",
    wAnalyze:"🎓 تحليل المقالة",wPractice:"🖊️ تدريب",wGrammar:"✏️ قواعد وإملاء",wExercises:"🏋️ تمارين",
    // Mobile hamburger
    siteLang:"لغة الموقع",
    // Upgrade banner
    unlimitedBanner:"🎓 تحليل غير محدود · جميع الاختبارات · الألعاب · التدريبات",
    upgradeBtn:"🔓 احصل على Pro →",
    feedbackLang:"لغة التحليل",
    languageNote:"اللغة التي سيُكتب بها تحليل مقالتك",
  },
  en:{
    // Nav
    home:"🏠 Home", writing:"✍️ Writing", vocab:"📝 Vocabulary", placement:"📋 Placement Test", speaking:"🗣️ Speaking Practice",
    reading:"📖 Reading", game:"🎮 Games", toolkit:"📚 Toolkit",
    progress:"📈 Progress", contact:"✉️ Contact", pronunciation:"🔊 Pronunciation", studyplan:"🗺️ Study Plan",
    // Account
    signIn:"Sign In →", getPro:"🔓 Get Pro", signOut:"Sign Out",
    manageSubscription:"Manage Subscription",
    // Hero
    heroPill:"🎓 English Learning  ·  IELTS Preparation",
    heroTitle:"Learn English. Ace your IELTS.",
    heroSub:"A placement test, real writing feedback, and structured practice — built for IELTS and beyond.",
    heroIelts:"✅ Ideal if you're also targeting a specific IELTS band",
    heroIelts:"✅ Ideal if you're also targeting a specific IELTS band",
    startFree:"Find your level — free, no sign-up",
    startFree2:"Analyse your first essay free →",
    subscribe:"🔓 Subscribe — $35 / 25 JOD",
    // Features grid
    f1t:"Essay Analysis",f1d:"Free: 2 full analyses · Pro: Unlimited",
    f2t:"Reading Tests",f2d:"Free: 1 test · Pro: All 7 tests",
    f3t:"Speaking Practice with Sarah",f3d:"Free: Real conversation with live grammar and vocabulary corrections · 7 minutes free per session",
    f4t:"Learning Games",f4d:"Free: Spelling game only · Pro: All 5 games",
    f5t:"Grammar & Spelling",f5d:"Free: 5 checks · Pro: Unlimited",
    f6t:"Practice Exercises",f6d:"Pro only · 230+ exercises — grammar, dictation, sentence building, vocabulary and more",
    f7t:"IELTS Toolkit",f7d:"Free: Linking words & Grammar · Pro: Full toolkit",
    f8t:"Track Progress",f8d:"Pro only · Track your scores and progress over time",
    fat:"Placement Test",fad:"Free: Discover your level from A1 to C2 with an IELTS band estimate",
    f9t:"IELTS Vocabulary",f9d:"Free: Writing Task 2 & Reading categories · Pro: All categories (400+ words)",
    fStart:"Start →",
    // Stats bar
    stat1n:"20 min",stat1l:"Free placement test",
    stat2n:"2",stat2l:"Free essay analyses — no sign-up",
    stat3n:"4",stat3l:"Criteria scored per essay",
    stat3bn:"A1–C2",stat3bl:"CEFR placement test",
    stat4n:"Task 1 & 2",stat4l:"Academic + General Training",
    // Game strip
    gameTitle:"IELTS Game — Learn by Playing",
    gameSub:"Spelling · Grammar · Vocabulary · Writing · Reading",
    gameBtn:"Play Now 🕹️",
    // Pricing comparison
    pricingTitle:"Free vs Pro — The Difference at a Glance",
    pricingSub:"3 months · $35 international / 25 JOD Jordan",
    pricingBtn:"Get Pro Now →",
    pricingNote:"Cancel anytime · Secure payment via Paddle",
    freeLabel:"Free", proLabel:"Everything Unlocked",
    // Writing sub-nav
    exercises:"🏋️ Exercises",
    wAnalyze:"🎓 Analyze Essay",wPractice:"🖊️ Practice",wGrammar:"✏️ Grammar",wExercises:"🏋️ Exercises",
    // Mobile hamburger
    siteLang:"Website Language",
    // Upgrade banner
    unlimitedBanner:"🎓 Unlimited Analysis · All Tests · Games · Exercises",
    upgradeBtn:"🔓 Get Pro →",
    feedbackLang:"Analysis Language",
    languageNote:"The language your essay feedback will be written in",
  }
};


// ── STUDY PLAN PAGE ───────────────────────────
const STUDY_STEPS = {
  ar: [
    {
      num:1, free:true, view:"placement",
      title:"اختبار تحديد المستوى",
      tag:"مرة واحدة مجاناً — إعادة الاختبار Pro",
      desc:"قبل أي شيء آخر، تحتاج أن تعرف مستواك الحقيقي. الاختبار يحدد مستواك من A1 إلى C2 مع تقدير لدرجة الآيلتس.",
      tip:"لا تخمّن — أجب بصدق. النتيجة هي نقطة انطلاقك، وليست حكماً عليك.",
      action:"ابدأ الاختبار ←",
    },
    {
      num:2, free:true, view:"vocabulary",
      title:"صفحة المفردات",
      tag:"مجاني: الكتابة والقراءة — Pro: جميع الأقسام",
      desc:"تصفّح مفردات الكتابة والقراءة مجاناً. ركّز على الكلمات التي لا تعرفها — هذا وحده يكفي للبدء.",
      tip:"احضر دفتراً ورقياً. اكتب كل كلمة جديدة مع معناها بالعربي وجملة مثال. الكتابة اليدوية تثبّت الحفظ أكثر بكثير من مجرد القراءة.",
      action:"افتح المفردات ←",
    },
    {
      num:3, free:true, view:"pronunciation",
      title:"النطق الصحيح",
      tag:"مجاني: 50 كلمة أكاديمية — Pro: 289 كلمة",
      desc:"لكل كلمة كتبتها في دفترك، افتح هذه الصفحة واستمع لنطقها الصحيح. تبدأ بالكلمات الأكاديمية مجاناً.",
      tip:"تعلّم كلمة وأنت تنطقها خطأ أسوأ من عدم تعلّمها. النطق الخاطئ يبني عادة يصعب تصحيحها لاحقاً.",
      action:"افتح النطق ←",
    },
    {
      num:4, free:true, view:"game",
      title:"ألعاب الآيلتس",
      tag:"مجاني: لعبة الإملاء — Pro: جميع الألعاب",
      desc:"ابدأ بلعبة الإملاء مجاناً يومياً. تحوّل ما قرأته في الخطوات السابقة إلى معرفة فعلية. باقي الألعاب متاحة لمشتركي Pro.",
      tip:"الفرق بين أن تتعرّف على كلمة وأن تمتلكها فعلاً هو الاسترجاع النشط — وهذا بالضبط ما تفعله الألعاب.",
      action:"العب الآن ←",
    },
    {
      num:5, free:true, view:"reading",
      title:"اختبارات القراءة",
      tag:"اختبار B1 مجاني — باقي الاختبارات Pro",
      desc:"إذا كان مستواك أقل من الدرجة السادسة، ابدأ باختبار المستوى الأساسي. إذا كنت في الدرجة السادسة أو أعلى، انتقل مباشرة للاختبارات الأكاديمية أو التدريب العام.",
      tip:"التزم بالوقت بدقة — لا تعطِ نفسك دقيقة إضافية. بعد الانتهاء، راجع كل إجابة خاطئة وافهم السبب قبل أن تغلق الصفحة.",
      action:"افتح القراءة ←",
    },
    {
      num:6, free:"5 فحوصات مجانية", view:"grammar",
      title:"فحص القواعد والإملاء",
      tag:"5 فحوصات مجانية — Pro غير محدود",
      desc:"اكتب فقرة قصيرة من 100 إلى 150 كلمة عن أي موضوع. أرسلها هنا واقرأ كل خطأ رُصد بعناية.",
      tip:"لا تكتفِ بالقراءة — أعِد كتابة الفقرة كاملةً من الصفر مع تطبيق كل التصحيحات. هذا هو التدريب الحقيقي.",
      action:"افتح القواعد ←",
    },
    {
      num:7, free:"تحليلان مجانيان", view:"analyze",
      title:"تحليل المقالة",
      tag:"تحليلان مجانيان — Pro غير محدود",
      desc:"اكتب مقالتك الأولى الكاملة — 250 كلمة على الأقل. أرسلها هنا واحصل على درجتك الكاملة مع تفصيل كل معيار.",
      tip:"لا تنظر فقط إلى الدرجة — اقرأ كل خطأ، كل ترقية مفردات، والمقال النموذجي في الأسفل. انسخ المقال النموذجي في دفترك وادرس بناءه.",
      action:"حلّل مقالتك ←",
    },
    {
      num:8, free:"جزئياً مجاني", view:"toolkit",
      title:"أدوات الآيلتس",
      tag:"الروابط والقواعد مجانية — Pro للكل",
      desc:"ادرس الروابط والقوالب. هذه ليست اختصارات — هي الهيكل الذي يبني عليه الطالب الناجح في الدرجات العليا.",
      tip:"احفظ 5 روابط على الأقل من كل فئة. الطالب الذي يحفظ 'Furthermore / Moreover / In addition' فقط يبدو متكرراً. التنوع هو المطلوب.",
      action:"افتح الأدوات ←",
    },
    {
      num:9, free:true, view:"speaking",
      title:"تدريب المحادثة مع سارة",
      tag:"مجاني — 7 دقائق للمستخدمين المجانيين",
      desc:"تدرّب على المحادثة مع سارة وهي تصحح أخطاءك النحوية والمفردات في الوقت الفعلي. اختر وضع الآيلتس أو المحادثة الحرة.",
      tip:"هذه الميزة تعمل على Google Chrome فقط. استخدم الميكروفون للتحدث وانتظر ردّ سارة — الهدف هو الطلاقة والدقة معاً، وليس الكمال.",
      action:"ابدأ المحادثة ←",
    },
    {
      num:10, free:false, view:"exercises",
      title:"التمارين التدريبية",
      tag:"Pro فقط",
      desc:"قم بحل مجموعة تمارين واحدة على الأقل يومياً — قواعد، إملاء، بناء جمل، مفردات. هذه هي التدريبات التي تحوّل الفهم إلى عادة.",
      tip:"القاعدة التي تفهمها ولم تتدرّب عليها ستُخذلك تحت ضغط الامتحان. الفهم وحده لا يكفي.",
      action:"افتح التمارين ←",
    },
    {
      num:11, free:false, view:"practice",
      title:"تدريب الكتابة",
      tag:"Pro فقط",
      desc:"اكتب مقالة موقوتة أسبوعياً. استخدم التغذية الراجعة أثناء الكتابة، ثم أرسل النسخة النهائية لتحليل المقالة للحصول على الدرجة الكاملة.",
      tip:"تتبّع هل درجتك تتحسّن من أسبوع لآخر. إذا ظلّت ثابتة لأسبوعين متتاليين — شيء محدد يحتاج تغييراً في أسلوبك.",
      action:"افتح التدريب ←",
    },
    {
      num:12, free:false, view:"progress",
      title:"تتبّع تقدمك",
      tag:"Pro فقط",
      desc:"راجع هذه الصفحة كل أسبوعين. تاريخ درجاتك محفوظ تلقائياً — ستلاحظ الاتجاه بوضوح.",
      tip:"إذا لم تتحسّن درجتك بعد جهد منتظم، احجز استشارة مجانية. في الغالب يوجد شيء محدد في أسلوبك يحتاج تعديلاً — لا يتعلق بالجهد.",
      action:"افتح التقدم ←",
    },
  ],
  en: [
    {
      num:1, free:true, view:"placement",
      title:"Placement Test",
      tag:"One attempt free — retaking is Pro",
      desc:"Before anything else, you need to know your actual level. The test places you from A1 to C2 with an estimated IELTS band score.",
      tip:"Don't guess — answer honestly. The result is your starting point, not a judgement. Everything that comes after depends on getting this right.",
      action:"Take the test →",
    },
    {
      num:2, free:true, view:"vocabulary",
      title:"Vocabulary Page",
      tag:"Free: Writing & Reading · Pro: all categories",
      desc:"Browse Writing Task 2 and Reading vocabulary for free. Focus on words you don't know — that alone is enough to get started.",
      tip:"Get a physical notebook. Write every new word with its meaning and an example sentence. Handwriting fixes words in memory far better than just reading them on screen.",
      action:"Open vocabulary →",
    },
    {
      num:3, free:true, view:"pronunciation",
      title:"Pronunciation",
      tag:"Free: 50 academic words · Pro: 289 words",
      desc:"For every word you wrote in your notebook, come here and listen to how it's actually pronounced. The academic category is free to start.",
      tip:"Learning a word while mispronouncing it is worse than not learning it — it builds a habit that's hard to correct later. Do this alongside Step 2, not after.",
      action:"Open pronunciation →",
    },
    {
      num:4, free:true, view:"game",
      title:"IELTS Games",
      tag:"Free: Spelling game · Pro: all 5 games",
      desc:"Start with the free Spelling game daily. It turns what you studied passively in Steps 2 and 3 into active knowledge. All 5 games unlock with Pro.",
      tip:"The difference between recognising a word and actually owning it is active recall — which is exactly what the games force you to do.",
      action:"Play now →",
    },
    {
      num:5, free:true, view:"reading",
      title:"Reading Tests",
      tag:"B1 test free — full tests Pro",
      desc:"If your placement result was below Band 6, start with the B1 test. If you're Band 6 or above, go straight to Academic or General Training tests.",
      tip:"Time yourself strictly — no extra minutes. After finishing, review every wrong answer and understand the reason before closing the page. The review is more valuable than the test itself.",
      action:"Open reading →",
    },
    {
      num:6, free:"5 free checks", view:"grammar",
      title:"Grammar & Spelling Checker",
      tag:"5 checks free — Pro unlimited",
      desc:"Write a short paragraph of 100–150 words on any topic. Submit it here and read every flagged error carefully.",
      tip:"Don't just read the corrections — rewrite the entire paragraph from scratch applying every fix. That rewrite is the actual training.",
      action:"Open grammar →",
    },
    {
      num:7, free:"2 free analyses", view:"analyze",
      title:"Essay Analysis",
      tag:"2 analyses free — Pro unlimited",
      desc:"Write your first full essay — minimum 250 words. Submit it and get your complete score with detailed breakdown across all four IELTS criteria.",
      tip:"Don't just look at the score. Read every mistake, every vocabulary upgrade, and the model essay at the bottom. Copy the model essay into your notebook and study its structure.",
      action:"Analyse your essay →",
    },
    {
      num:8, free:"Partially free", view:"toolkit",
      title:"IELTS Toolkit",
      tag:"Linking words & grammar free — Pro for all",
      desc:"Study the linking words and essay templates. These are not shortcuts — they are the scaffolding that Band 7+ essays are built on.",
      tip:"Memorise at least 5 linking phrases per category. Students who only know 'Furthermore / Moreover / In addition' sound repetitive. Variety is what the examiner notices.",
      action:"Open toolkit →",
    },
    {
      num:9, free:true, view:"speaking",
      title:"Speaking Practice with Sarah",
      tag:"Free — 7 minutes per session",
      desc:"Have a real conversation with Sarah and get live grammar and vocabulary corrections. Choose IELTS mode or free conversation on any topic.",
      tip:"Use Google Chrome for voice input. Speak naturally, wait for Sarah's response, and pay attention to every correction — those are your most valuable learning moments.",
      action:"Start speaking →",
    },
    {
      num:10, free:false, view:"exercises",
      title:"Practice Exercises",
      tag:"Pro only",
      desc:"Do at least one exercise set per day — grammar, spelling, sentence building, vocabulary. These drills turn understanding into habit.",
      tip:"Grammar you understand but haven't drilled will fail you under exam pressure. Understanding alone is not enough — automaticity is.",
      action:"Open exercises →",
    },
    {
      num:11, free:false, view:"practice",
      title:"Writing Practice",
      tag:"Pro only",
      desc:"Write a timed essay every week. Use the live coaching feedback during writing, then submit the final version to Essay Analysis for a full score.",
      tip:"Track whether your band improves week by week. If it stays flat for two consecutive weeks, something specific in your approach needs to change — not more effort, different effort.",
      action:"Open writing practice →",
    },
    {
      num:12, free:false, view:"progress",
      title:"Progress Tracker",
      tag:"Pro only",
      desc:"Check this page every two weeks. Your score history is saved automatically — you will see the trend clearly.",
      tip:"If your score isn't moving after consistent work, book a Free Consultation. Usually there's one specific thing in your approach that needs adjusting — it's rarely about effort.",
      action:"Open progress →",
    },
  ],
};

const StudyPlanPage=({uiLang="en",onNavigate})=>{
  const isAr=uiLang==="ar";
  const dir=isAr?"rtl":"ltr";
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};
  const steps=isAr?STUDY_STEPS.ar:STUDY_STEPS.en;
  return(
    <div style={{maxWidth:780,margin:"0 auto",padding:"32px 16px 60px",...sty,direction:dir}}>
      <div style={{textAlign:"center",marginBottom:36}}>
        <div style={{fontSize:44,marginBottom:12}}>🗺️</div>
        <h1 style={{fontFamily:"Georgia,serif",fontSize:"clamp(22px,3vw,30px)",color:T.text,margin:"0 0 10px",textAlign:"center"}}>
          {isAr?"خطتك الدراسية على موقعنا":"Your Study Plan on Englishfool"}
        </h1>
        <p style={{fontSize:15,color:T.textMuted,margin:"0 auto",lineHeight:1.7,maxWidth:560,textAlign:"center"}}>
          {isAr?"اتبع هذه الخطوات بالترتيب للحصول على أفضل النتائج. الخطوات المجانية أولاً — يمكنك البدء الآن بدون اشتراك.":"Follow these steps in order for the best results. Free steps come first — you can start right now without a subscription."}
        </p>
        <div style={{display:"flex",gap:16,justifyContent:"center",marginTop:16,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:T.green}}><span style={{width:12,height:12,borderRadius:"50%",background:T.green,display:"inline-block"}}></span>{isAr?"مجاني":"Free"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:T.amber}}><span style={{width:12,height:12,borderRadius:"50%",background:T.amber,display:"inline-block"}}></span>{isAr?"مجاني جزئياً":"Partially free"}</div>
          <div style={{display:"flex",alignItems:"center",gap:6,fontSize:13,color:T.purple}}><span style={{width:12,height:12,borderRadius:"50%",background:T.purple,display:"inline-block"}}></span>Pro</div>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:14}}>
        {steps.map((step,i)=>{
          const dotColor=step.free===true?T.green:step.free===false?T.purple:T.amber;
          const tagBg=step.free===true?T.greenBg:step.free===false?T.purpleBg:T.amberBg;
          const tagColor=step.free===true?T.green:step.free===false?T.purple:T.amber;
          return(
            <div key={i} style={{background:"white",border:`1px solid ${T.border}`,borderRadius:14,padding:"20px 22px",display:"flex",flexDirection:"row",gap:16,alignItems:"flex-start",borderLeft:isAr?"none":"4px solid "+dotColor,borderRight:isAr?"4px solid "+dotColor:"none"}}>
              {/* Step number */}
              <div style={{width:36,height:36,borderRadius:"50%",background:dotColor,color:"white",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,flexShrink:0,marginTop:2}}>
                {step.num}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:6,flexDirection:"row",justifyContent:"flex-start"}}>
                  <span style={{fontSize:16,fontWeight:700,color:T.text}}>{step.title}</span>
                  <span style={{fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:20,background:tagBg,color:tagColor,flexShrink:0}}>{step.tag}</span>
                </div>
                <p style={{fontSize:14,color:T.textMid,margin:"0 0 8px",lineHeight:1.7,textAlign:isAr?"right":"left"}}>{step.desc}</p>
                <div style={{background:T.bgMuted,borderRadius:8,padding:"10px 13px",marginBottom:12,display:"flex",gap:8,alignItems:"flex-start",flexDirection:isAr?"row-reverse":"row"}}>
                  <span style={{fontSize:14,flexShrink:0,marginTop:1}}>💡</span>
                  <span style={{fontSize:13,color:T.textMid,lineHeight:1.6,textAlign:isAr?"right":"left"}}>{step.tip}</span>
                </div>
                <div style={{textAlign:isAr?"right":"left"}}>
                  <button onClick={()=>onNavigate(step.view)}
                    style={{background:dotColor,color:"white",border:"none",borderRadius:8,padding:"8px 18px",fontSize:13,fontWeight:700,cursor:"pointer",...sty,whiteSpace:"nowrap"}}>
                    {step.action}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{marginTop:32,padding:"18px 20px",background:T.primaryLight,border:`1px solid ${T.primaryBorder}`,borderRadius:12,textAlign:"center"}}>
        <div style={{fontSize:15,fontWeight:700,color:T.primary,marginBottom:6}}>
          {isAr?"هل تحتاج مساعدة شخصية؟":"Need personal guidance?"}
        </div>
        <div style={{fontSize:13,color:T.textMid,marginBottom:12}}>
          {isAr?"احجز استشارة مجانية مع فريقنا — نساعدك تحديد ما تحتاجه بالضبط.":"Book a free consultation with our team — we'll help you identify exactly what you need."}
        </div>
        <button onClick={()=>onNavigate("contact")}
          style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"10px 24px",fontSize:14,fontWeight:700,cursor:"pointer",...sty}}>
          {isAr?"احجز استشارة مجانية ←":"Book a free consultation →"}
        </button>
      </div>
    </div>
  );
};

// ── PRONUNCIATION PAGE ─────────────────────────
const PRON_WORDS=[
  // Academic & IELTS Core
  {w:"albeit",ph:"/ɔːlˈbiːɪt/",ar:"وإن كان / رغم أن",cat:"academic"},
  {w:"ambiguous",ph:"/æmˈbɪɡjuəs/",ar:"غامض / ملتبس",cat:"academic"},
  {w:"anachronism",ph:"/əˈnækrənɪzəm/",ar:"مفارقة تاريخية",cat:"academic"},
  {w:"anomaly",ph:"/əˈnɒməli/",ar:"شذوذ / استثناء",cat:"academic"},
  {w:"arbitrary",ph:"/ˈɑːbɪtrəri/",ar:"تعسفي / اعتباطي",cat:"academic"},
  {w:"articulate",ph:"/ɑːˈtɪkjulət/",ar:"واضح التعبير",cat:"academic"},
  {w:"autonomous",ph:"/ɔːˈtɒnəməs/",ar:"مستقل / ذاتي",cat:"academic"},
  {w:"catastrophic",ph:"/ˌkætəˈstrɒfɪk/",ar:"كارثي",cat:"academic"},
  {w:"coherent",ph:"/kəʊˈhɪərənt/",ar:"متماسك / منسجم",cat:"academic"},
  {w:"comprehensive",ph:"/ˌkɒmprɪˈhensɪv/",ar:"شامل / مستوعب",cat:"academic"},
  {w:"controversial",ph:"/ˌkɒntrəˈvɜːʃəl/",ar:"مثير للجدل",cat:"academic"},
  {w:"deteriorate",ph:"/dɪˈtɪəriəreɪt/",ar:"يتدهور / يسوء",cat:"academic"},
  {w:"dichotomy",ph:"/daɪˈkɒtəmi/",ar:"ثنائية / تناقض",cat:"academic"},
  {w:"dilemma",ph:"/dɪˈlemə/",ar:"معضلة / مأزق",cat:"academic"},
  {w:"empirical",ph:"/ɪmˈpɪrɪkəl/",ar:"تجريبي / استنتاجي",cat:"academic"},
  {w:"exacerbate",ph:"/ɪɡˈzæsəbeɪt/",ar:"يفاقم / يزيد سوءاً",cat:"academic"},
  {w:"exhaustive",ph:"/ɪɡˈzɔːstɪv/",ar:"شامل / مستنفِد",cat:"academic"},
  {w:"explicit",ph:"/ɪkˈsplɪsɪt/",ar:"صريح / واضح",cat:"academic"},
  {w:"fundamental",ph:"/ˌfʌndəˈmentəl/",ar:"جوهري / أساسي",cat:"academic"},
  {w:"hypothesis",ph:"/haɪˈpɒθəsɪs/",ar:"فرضية",cat:"academic"},
  {w:"implicit",ph:"/ɪmˈplɪsɪt/",ar:"ضمني / مفهوم",cat:"academic"},
  {w:"indigenous",ph:"/ɪnˈdɪdʒənəs/",ar:"أصلي / محلي",cat:"academic"},
  {w:"inevitable",ph:"/ɪnˈevɪtəbəl/",ar:"حتمي / لا مفرّ منه",cat:"academic"},
  {w:"infrastructure",ph:"/ˈɪnfrəstrʌktʃə/",ar:"بنية تحتية",cat:"academic"},
  {w:"inherent",ph:"/ɪnˈhɪərənt/",ar:"متأصّل / جوهري",cat:"academic"},
  {w:"innovative",ph:"/ˈɪnəveɪtɪv/",ar:"مبتكر / ريادي",cat:"academic"},
  {w:"integrity",ph:"/ɪnˈteɡrɪti/",ar:"نزاهة / سلامة",cat:"academic"},
  {w:"jurisdiction",ph:"/ˌdʒʊərɪsˈdɪkʃən/",ar:"اختصاص قانوني",cat:"academic"},
  {w:"legitimate",ph:"/lɪˈdʒɪtɪmət/",ar:"شرعي / مشروع",cat:"academic"},
  {w:"meticulous",ph:"/mɪˈtɪkjuləs/",ar:"دقيق / متأنٍّ",cat:"academic"},
  {w:"mitigate",ph:"/ˈmɪtɪɡeɪt/",ar:"يخفف / يقلل",cat:"academic"},
  {w:"nuance",ph:"/ˈnjuːɑːns/",ar:"فارق دقيق",cat:"academic"},
  {w:"paradigm",ph:"/ˈpærədaɪm/",ar:"نموذج / نمط",cat:"academic"},
  {w:"phenomenon",ph:"/fɪˈnɒmɪnən/",ar:"ظاهرة",cat:"academic"},
  {w:"preliminary",ph:"/prɪˈlɪmɪnəri/",ar:"تمهيدي / أولي",cat:"academic"},
  {w:"profound",ph:"/prəˈfaʊnd/",ar:"عميق / جوهري",cat:"academic"},
  {w:"proliferate",ph:"/prəˈlɪfəreɪt/",ar:"ينتشر / يتكاثر",cat:"academic"},
  {w:"proponent",ph:"/prəˈpəʊnənt/",ar:"مؤيد / مدافع",cat:"academic"},
  {w:"reconcile",ph:"/ˈrekənsaɪl/",ar:"يوفّق / يصالح",cat:"academic"},
  {w:"rhetoric",ph:"/ˈretərɪk/",ar:"خطابة / بلاغة",cat:"academic"},
  {w:"scrutiny",ph:"/ˈskruːtɪni/",ar:"تدقيق / فحص مكثف",cat:"academic"},
  {w:"sustainable",ph:"/səˈsteɪnəbəl/",ar:"مستدام",cat:"academic"},
  {w:"theoretical",ph:"/ˌθɪəˈretɪkəl/",ar:"نظري",cat:"academic"},
  {w:"ubiquitous",ph:"/juːˈbɪkwɪtəs/",ar:"في كل مكان",cat:"academic"},
  {w:"unprecedented",ph:"/ʌnˈpresɪdentɪd/",ar:"غير مسبوق",cat:"academic"},
  {w:"viable",ph:"/ˈvaɪəbəl/",ar:"قابل للتطبيق",cat:"academic"},
  {w:"ambivalent",ph:"/æmˈbɪvələnt/",ar:"متردد / مزدوج المشاعر",cat:"academic"},
  {w:"benevolent",ph:"/bɪˈnevələnt/",ar:"خيّر / محسن",cat:"academic"},
  {w:"bureaucracy",ph:"/bjʊˈrɒkrəsi/",ar:"بيروقراطية",cat:"academic"},
  {w:"circumvent",ph:"/ˌsɜːkəmˈvent/",ar:"يتحايل / يلتف حول",cat:"academic"},

  // Commonly Mispronounced
  {w:"colonel",ph:"/ˈkɜːnəl/",ar:"عقيد",cat:"tricky"},
  {w:"debt",ph:"/det/",ar:"دَين",cat:"tricky"},
  {w:"doubt",ph:"/daʊt/",ar:"شك",cat:"tricky"},
  {w:"epitome",ph:"/ɪˈpɪtəmi/",ar:"تجسيد / مثال",cat:"tricky"},
  {w:"façade",ph:"/fəˈsɑːd/",ar:"واجهة / مظهر خادع",cat:"tricky"},
  {w:"February",ph:"/ˈfebruəri/",ar:"فبراير",cat:"tricky"},
  {w:"genre",ph:"/ˈʒɒnrə/",ar:"نوع / صنف",cat:"tricky"},
  {w:"hierarchy",ph:"/ˈhaɪərɑːki/",ar:"تسلسل هرمي",cat:"tricky"},
  {w:"hyperbole",ph:"/haɪˈpɜːbəli/",ar:"مبالغة",cat:"tricky"},
  {w:"liaison",ph:"/liˈeɪzɒn/",ar:"تنسيق / اتصال",cat:"tricky"},
  {w:"mischievous",ph:"/ˈmɪstʃɪvəs/",ar:"شرير / مشاغب",cat:"tricky"},
  {w:"niche",ph:"/niːʃ/",ar:"مكانة خاصة",cat:"tricky"},
  {w:"often",ph:"/ˈɒfən/",ar:"في أغلب الأحيان",cat:"tricky"},
  {w:"onomatopoeia",ph:"/ˌɒnəˌmætəˈpiːə/",ar:"محاكاة صوتية",cat:"tricky"},
  {w:"parliament",ph:"/ˈpɑːləmənt/",ar:"برلمان",cat:"tricky"},
  {w:"particularly",ph:"/pəˈtɪkjuləli/",ar:"بشكل خاص",cat:"tricky"},
  {w:"pronunciation",ph:"/prəˌnʌnsiˈeɪʃən/",ar:"نطق",cat:"tricky"},
  {w:"queue",ph:"/kjuː/",ar:"طابور",cat:"tricky"},
  {w:"receipt",ph:"/rɪˈsiːt/",ar:"إيصال",cat:"tricky"},
  {w:"rural",ph:"/ˈrʊərəl/",ar:"ريفي",cat:"tricky"},
  {w:"salmon",ph:"/ˈsæmən/",ar:"سلمون",cat:"tricky"},
  {w:"sandwich",ph:"/ˈsænwɪdʒ/",ar:"ساندويش",cat:"tricky"},
  {w:"scissors",ph:"/ˈsɪzəz/",ar:"مقص",cat:"tricky"},
  {w:"subtle",ph:"/ˈsʌtəl/",ar:"خفي / لطيف",cat:"tricky"},
  {w:"sword",ph:"/sɔːd/",ar:"سيف",cat:"tricky"},
  {w:"temperature",ph:"/ˈtemprətʃə/",ar:"درجة الحرارة",cat:"tricky"},
  {w:"thorough",ph:"/ˈθʌrə/",ar:"شامل / دقيق",cat:"tricky"},
  {w:"through",ph:"/θruː/",ar:"عبر / خلال",cat:"tricky"},
  {w:"throughout",ph:"/θruːˈaʊt/",ar:"في جميع أنحاء",cat:"tricky"},
  {w:"unique",ph:"/juːˈniːk/",ar:"فريد",cat:"tricky"},
  {w:"vegetable",ph:"/ˈvedʒtəbəl/",ar:"خضروات",cat:"tricky"},
  {w:"vehicle",ph:"/ˈviːɪkəl/",ar:"مركبة",cat:"tricky"},
  {w:"Wednesday",ph:"/ˈwenzdeɪ/",ar:"الأربعاء",cat:"tricky"},
  {w:"comfortable",ph:"/ˈkʌmftəbəl/",ar:"مريح",cat:"tricky"},
  {w:"deteriorate",ph:"/dɪˈtɪəriəreɪt/",ar:"يتدهور",cat:"tricky"},
  {w:"entrepreneur",ph:"/ˌɒntrəprəˈnɜː/",ar:"رائد أعمال",cat:"tricky"},
  {w:"environment",ph:"/ɪnˈvaɪrənmənt/",ar:"بيئة",cat:"tricky"},
  {w:"government",ph:"/ˈɡʌvənmənt/",ar:"حكومة",cat:"tricky"},
  {w:"interesting",ph:"/ˈɪntrəstɪŋ/",ar:"مثير للاهتمام",cat:"tricky"},
  {w:"library",ph:"/ˈlaɪbrəri/",ar:"مكتبة",cat:"tricky"},
  {w:"necessary",ph:"/ˈnesəsəri/",ar:"ضروري",cat:"tricky"},
  {w:"particularly",ph:"/pəˈtɪkjuləli/",ar:"بشكل خاص",cat:"tricky"},
  {w:"probably",ph:"/ˈprɒbəbli/",ar:"على الأرجح",cat:"tricky"},
  {w:"separate",ph:"/ˈsepərət/",ar:"منفصل",cat:"tricky"},
  {w:"similar",ph:"/ˈsɪmɪlə/",ar:"مشابه",cat:"tricky"},
  {w:"specific",ph:"/spəˈsɪfɪk/",ar:"محدد / خاص",cat:"tricky"},
  {w:"studying",ph:"/ˈstʌdiɪŋ/",ar:"يدرس",cat:"tricky"},
  {w:"supposed",ph:"/səˈpəʊzd/",ar:"من المفترض",cat:"tricky"},
  {w:"technology",ph:"/tekˈnɒlədʒi/",ar:"تقنية",cat:"tricky"},
  {w:"vocabulary",ph:"/vəˈkæbjuləri/",ar:"مفردات",cat:"tricky"},

  // Science & Environment
  {w:"algorithm",ph:"/ˈælɡərɪðəm/",ar:"خوارزمية",cat:"science"},
  {w:"atmosphere",ph:"/ˈætməsfɪə/",ar:"غلاف جوي",cat:"science"},
  {w:"biodiversity",ph:"/ˌbaɪəʊdaɪˈvɜːsɪti/",ar:"تنوع بيولوجي",cat:"science"},
  {w:"biosphere",ph:"/ˈbaɪəsfɪə/",ar:"المحيط الحيوي",cat:"science"},
  {w:"carcinogen",ph:"/kɑːˈsɪnədʒən/",ar:"مادة مسرطنة",cat:"science"},
  {w:"chromosome",ph:"/ˈkrəʊməsəʊm/",ar:"كروموسوم",cat:"science"},
  {w:"climate",ph:"/ˈklaɪmɪt/",ar:"مناخ",cat:"science"},
  {w:"combustion",ph:"/kəmˈbʌstʃən/",ar:"احتراق",cat:"science"},
  {w:"deforestation",ph:"/ˌdiːˌfɒrɪˈsteɪʃən/",ar:"إزالة الغابات",cat:"science"},
  {w:"desertification",ph:"/dɪˌzɜːtɪfɪˈkeɪʃən/",ar:"تصحر",cat:"science"},
  {w:"ecosystem",ph:"/ˈiːkəʊsɪstəm/",ar:"نظام بيئي",cat:"science"},
  {w:"electromagnetic",ph:"/ɪˌlektrəʊmæɡˈnetɪk/",ar:"كهرومغناطيسي",cat:"science"},
  {w:"evolution",ph:"/ˌiːvəˈluːʃən/",ar:"تطور",cat:"science"},
  {w:"fossil",ph:"/ˈfɒsəl/",ar:"أحفوري / متحجر",cat:"science"},
  {w:"genome",ph:"/ˈdʒiːnəʊm/",ar:"جينوم / مجين",cat:"science"},
  {w:"geology",ph:"/dʒiˈɒlədʒi/",ar:"علم الجيولوجيا",cat:"science"},
  {w:"glacier",ph:"/ˈɡlæsiə/",ar:"نهر جليدي",cat:"science"},
  {w:"hydraulic",ph:"/haɪˈdrɔːlɪk/",ar:"هيدروليكي",cat:"science"},
  {w:"molecule",ph:"/ˈmɒlɪkjuːl/",ar:"جزيء",cat:"science"},
  {w:"nanotechnology",ph:"/ˌnænəʊtekˈnɒlədʒi/",ar:"تقنية النانو",cat:"science"},
  {w:"nucleus",ph:"/ˈnjuːkliəs/",ar:"نواة",cat:"science"},
  {w:"photosynthesis",ph:"/ˌfəʊtəʊˈsɪnθəsɪs/",ar:"التركيب الضوئي",cat:"science"},
  {w:"precipitation",ph:"/prɪˌsɪpɪˈteɪʃən/",ar:"هطول / ترسيب",cat:"science"},
  {w:"renewable",ph:"/rɪˈnjuːəbəl/",ar:"متجدد",cat:"science"},
  {w:"satellite",ph:"/ˈsætəlaɪt/",ar:"قمر صناعي",cat:"science"},
  {w:"seismic",ph:"/ˈsaɪzmɪk/",ar:"زلزالي",cat:"science"},
  {w:"semiconductor",ph:"/ˌsemɪkənˈdʌktə/",ar:"شبه موصل",cat:"science"},
  {w:"taxonomy",ph:"/tækˈsɒnəmi/",ar:"تصنيف علمي",cat:"science"},
  {w:"tectonic",ph:"/tekˈtɒnɪk/",ar:"تكتوني",cat:"science"},
  {w:"thermal",ph:"/ˈθɜːməl/",ar:"حراري",cat:"science"},
  {w:"trajectory",ph:"/trəˈdʒektəri/",ar:"مسار / مسارة",cat:"science"},
  {w:"velocity",ph:"/vɪˈlɒsɪti/",ar:"سرعة",cat:"science"},
  {w:"volatile",ph:"/ˈvɒlətaɪl/",ar:"متقلب / متطاير",cat:"science"},
  {w:"wavelength",ph:"/ˈweɪvleŋθ/",ar:"طول الموجة",cat:"science"},
  {w:"acoustic",ph:"/əˈkuːstɪk/",ar:"صوتي / سمعي",cat:"science"},
  {w:"catalyst",ph:"/ˈkætəlɪst/",ar:"محفّز",cat:"science"},
  {w:"centrifugal",ph:"/ˌsentrɪˈfjuːɡəl/",ar:"طارد مركزي",cat:"science"},
  {w:"chlorophyll",ph:"/ˈklɒrəfɪl/",ar:"كلوروفيل",cat:"science"},
  {w:"equilibrium",ph:"/ˌiːkwɪˈlɪbriəm/",ar:"توازن",cat:"science"},
  {w:"fluorescent",ph:"/flɔːˈresənt/",ar:"فلوري / متألق",cat:"science"},
  {w:"hypothesis",ph:"/haɪˈpɒθəsɪs/",ar:"فرضية",cat:"science"},
  {w:"inertia",ph:"/ɪˈnɜːʃə/",ar:"قصور ذاتي",cat:"science"},
  {w:"osmosis",ph:"/ɒzˈməʊsɪs/",ar:"تناضح",cat:"science"},
  {w:"phenomenon",ph:"/fɪˈnɒmɪnən/",ar:"ظاهرة",cat:"science"},
  {w:"physiology",ph:"/ˌfɪziˈɒlədʒi/",ar:"علم وظائف الأعضاء",cat:"science"},
  {w:"psychology",ph:"/saɪˈkɒlədʒi/",ar:"علم النفس",cat:"science"},
  {w:"quantum",ph:"/ˈkwɒntəm/",ar:"كم / كمي",cat:"science"},
  {w:"sociology",ph:"/ˌsəʊsiˈɒlədʒi/",ar:"علم الاجتماع",cat:"science"},
  {w:"thermodynamics",ph:"/ˌθɜːməʊdaɪˈnæmɪks/",ar:"ديناميكا حرارية",cat:"science"},

  // Economy & Society
  {w:"capitalism",ph:"/ˈkæpɪtəlɪzəm/",ar:"الرأسمالية",cat:"society"},
  {w:"collateral",ph:"/kəˈlætərəl/",ar:"ضمان / جانبي",cat:"society"},
  {w:"commodity",ph:"/kəˈmɒdɪti/",ar:"سلعة",cat:"society"},
  {w:"compensation",ph:"/ˌkɒmpənˈseɪʃən/",ar:"تعويض",cat:"society"},
  {w:"consumerism",ph:"/kənˈsjuːmərɪzəm/",ar:"استهلاكية",cat:"society"},
  {w:"corruption",ph:"/kəˈrʌpʃən/",ar:"فساد",cat:"society"},
  {w:"deficit",ph:"/ˈdefɪsɪt/",ar:"عجز",cat:"society"},
  {w:"demographics",ph:"/ˌdeməˈɡræfɪks/",ar:"إحصاءات سكانية",cat:"society"},
  {w:"depreciation",ph:"/dɪˌpriːʃiˈeɪʃən/",ar:"استهلاك / انخفاض قيمة",cat:"society"},
  {w:"discrimination",ph:"/dɪˌskrɪmɪˈneɪʃən/",ar:"تمييز",cat:"society"},
  {w:"diversity",ph:"/daɪˈvɜːsɪti/",ar:"تنوع",cat:"society"},
  {w:"dividend",ph:"/ˈdɪvɪdend/",ar:"أرباح / عائد",cat:"society"},
  {w:"entrepreneurship",ph:"/ˌɒntrəprəˈnɜːʃɪp/",ar:"ريادة الأعمال",cat:"society"},
  {w:"exploitation",ph:"/ˌeksplɔɪˈteɪʃən/",ar:"استغلال",cat:"society"},
  {w:"fiscal",ph:"/ˈfɪskəl/",ar:"مالي / ضريبي",cat:"society"},
  {w:"gentrification",ph:"/ˌdʒentrɪfɪˈkeɪʃən/",ar:"تحسين الأحياء",cat:"society"},
  {w:"globalisation",ph:"/ˌɡləʊbəlaɪˈzeɪʃən/",ar:"عولمة",cat:"society"},
  {w:"governance",ph:"/ˈɡʌvənəns/",ar:"حوكمة / إدارة",cat:"society"},
  {w:"humanitarian",ph:"/hjuːˌmænɪˈteəriən/",ar:"إنساني",cat:"society"},
  {w:"ideology",ph:"/ˌaɪdiˈɒlədʒi/",ar:"أيديولوجية",cat:"society"},
  {w:"immigration",ph:"/ˌɪmɪˈɡreɪʃən/",ar:"هجرة",cat:"society"},
  {w:"imperialism",ph:"/ɪmˈpɪəriəlɪzəm/",ar:"إمبريالية",cat:"society"},
  {w:"inequality",ph:"/ˌɪnɪˈkwɒlɪti/",ar:"عدم المساواة",cat:"society"},
  {w:"inflation",ph:"/ɪnˈfleɪʃən/",ar:"تضخم",cat:"society"},
  {w:"initiative",ph:"/ɪˈnɪʃətɪv/",ar:"مبادرة",cat:"society"},
  {w:"legislation",ph:"/ˌledʒɪˈsleɪʃən/",ar:"تشريع",cat:"society"},
  {w:"meritocracy",ph:"/ˌmerɪˈtɒkrəsi/",ar:"الجدارة",cat:"society"},
  {w:"metropolitan",ph:"/ˌmetrəˈpɒlɪtən/",ar:"عاصمة / حضري",cat:"society"},
  {w:"monopoly",ph:"/məˈnɒpəli/",ar:"احتكار",cat:"society"},
  {w:"municipality",ph:"/mjuːˌnɪsɪˈpælɪti/",ar:"بلدية",cat:"society"},
  {w:"philanthropy",ph:"/fɪˈlænθrəpi/",ar:"عمل خيري",cat:"society"},
  {w:"poverty",ph:"/ˈpɒvəti/",ar:"فقر",cat:"society"},
  {w:"privatisation",ph:"/ˌpraɪvətaɪˈzeɪʃən/",ar:"خصخصة",cat:"society"},
  {w:"propaganda",ph:"/ˌprɒpəˈɡændə/",ar:"دعاية",cat:"society"},
  {w:"protocol",ph:"/ˈprəʊtəkɒl/",ar:"بروتوكول",cat:"society"},
  {w:"recession",ph:"/rɪˈseʃən/",ar:"ركود اقتصادي",cat:"society"},
  {w:"referendum",ph:"/ˌrefəˈrendəm/",ar:"استفتاء",cat:"society"},
  {w:"rehabilitation",ph:"/ˌriːəˌbɪlɪˈteɪʃən/",ar:"إعادة تأهيل",cat:"society"},
  {w:"remuneration",ph:"/rɪˌmjuːnəˈreɪʃən/",ar:"مكافأة / أجر",cat:"society"},
  {w:"segregation",ph:"/ˌseɡrɪˈɡeɪʃən/",ar:"فصل / عزل",cat:"society"},
  {w:"sovereignty",ph:"/ˈsɒvrɪnti/",ar:"سيادة",cat:"society"},
  {w:"subsidise",ph:"/ˈsʌbsɪdaɪz/",ar:"يدعم مالياً",cat:"society"},
  {w:"surveillance",ph:"/səˈveɪləns/",ar:"مراقبة",cat:"society"},
  {w:"taxation",ph:"/tækˈseɪʃən/",ar:"ضرائب",cat:"society"},
  {w:"transparency",ph:"/trænsˈpærənsi/",ar:"شفافية",cat:"society"},
  {w:"urbanisation",ph:"/ˌɜːbənaɪˈzeɪʃən/",ar:"تحضر",cat:"society"},
  {w:"welfare",ph:"/ˈwelfeə/",ar:"رعاية / رفاهية",cat:"society"},
  {w:"xenophobia",ph:"/ˌzenəˈfəʊbiə/",ar:"كره الأجانب",cat:"society"},
  {w:"anarchism",ph:"/ˈænəkɪzəm/",ar:"فوضوية",cat:"society"},
  {w:"bureaucrat",ph:"/ˈbjʊərəkræt/",ar:"بيروقراطي",cat:"society"},

  // Medical & Health
  {w:"anaesthesia",ph:"/ˌænɪsˈθiːziə/",ar:"تخدير",cat:"medical"},
  {w:"anatomy",ph:"/əˈnætəmi/",ar:"علم التشريح",cat:"medical"},
  {w:"antibiotics",ph:"/ˌæntibaɪˈɒtɪks/",ar:"مضادات حيوية",cat:"medical"},
  {w:"cardiovascular",ph:"/ˌkɑːdiəʊˈvæskjuːlə/",ar:"قلبي وعائي",cat:"medical"},
  {w:"cholesterol",ph:"/kəˈlestərɒl/",ar:"كوليسترول",cat:"medical"},
  {w:"chronic",ph:"/ˈkrɒnɪk/",ar:"مزمن",cat:"medical"},
  {w:"clinical",ph:"/ˈklɪnɪkəl/",ar:"سريري / طبي",cat:"medical"},
  {w:"contagious",ph:"/kənˈteɪdʒəs/",ar:"معدٍ",cat:"medical"},
  {w:"dementia",ph:"/dɪˈmenʃə/",ar:"خرف / ضعف إدراكي",cat:"medical"},
  {w:"diabetes",ph:"/ˌdaɪəˈbiːtiːz/",ar:"سكري",cat:"medical"},
  {w:"diagnosis",ph:"/ˌdaɪəɡˈnəʊsɪs/",ar:"تشخيص",cat:"medical"},
  {w:"epidemic",ph:"/ˌepɪˈdemɪk/",ar:"وباء",cat:"medical"},
  {w:"immunisation",ph:"/ˌɪmjuːnaɪˈzeɪʃən/",ar:"تطعيم",cat:"medical"},
  {w:"inflammation",ph:"/ˌɪnfləˈmeɪʃən/",ar:"التهاب",cat:"medical"},
  {w:"intravenous",ph:"/ˌɪntrəˈviːnəs/",ar:"وريدي",cat:"medical"},
  {w:"malnutrition",ph:"/ˌmælnjuˈtrɪʃən/",ar:"سوء تغذية",cat:"medical"},
  {w:"metabolism",ph:"/mɪˈtæbəlɪzəm/",ar:"أيض / استقلاب",cat:"medical"},
  {w:"neurological",ph:"/ˌnjʊərəˈlɒdʒɪkəl/",ar:"عصبي",cat:"medical"},
  {w:"obese",ph:"/əʊˈbiːs/",ar:"بدين / يعاني من سمنة",cat:"medical"},
  {w:"obesity",ph:"/əʊˈbiːsɪti/",ar:"سمنة",cat:"medical"},
  {w:"pandemic",ph:"/pænˈdemɪk/",ar:"جائحة",cat:"medical"},
  {w:"parasite",ph:"/ˈpærəsaɪt/",ar:"طفيلي",cat:"medical"},
  {w:"pathogen",ph:"/ˈpæθədʒən/",ar:"مسبب المرض",cat:"medical"},
  {w:"pharmaceutical",ph:"/ˌfɑːməˈsjuːtɪkəl/",ar:"صيدلاني / دوائي",cat:"medical"},
  {w:"psychiatry",ph:"/saɪˈkaɪətri/",ar:"طب نفسي",cat:"medical"},
  {w:"rehabilitation",ph:"/ˌriːəˌbɪlɪˈteɪʃən/",ar:"إعادة تأهيل",cat:"medical"},
  {w:"respiratory",ph:"/rɪˈspɪrətəri/",ar:"تنفسي",cat:"medical"},
  {w:"symptom",ph:"/ˈsɪmptəm/",ar:"عَرَض / أعراض",cat:"medical"},
  {w:"syndrome",ph:"/ˈsɪndrəʊm/",ar:"متلازمة",cat:"medical"},
  {w:"therapeutic",ph:"/ˌθerəˈpjuːtɪk/",ar:"علاجي",cat:"medical"},
  {w:"vaccination",ph:"/ˌvæksɪˈneɪʃən/",ar:"تطعيم",cat:"medical"},
  {w:"anaemia",ph:"/əˈniːmiə/",ar:"فقر دم",cat:"medical"},
  {w:"endocrine",ph:"/ˈendəkrɪn/",ar:"غدي / صماوي",cat:"medical"},
  {w:"haemoglobin",ph:"/ˈhiːməɡləʊbɪn/",ar:"هيموغلوبين",cat:"medical"},
  {w:"ophthalmology",ph:"/ˌɒfθælˈmɒlədʒi/",ar:"طب العيون",cat:"medical"},
  {w:"orthopaedic",ph:"/ˌɔːθəˈpiːdɪk/",ar:"تقويم العظام",cat:"medical"},
  {w:"paediatric",ph:"/ˌpiːdiˈætrɪk/",ar:"طب الأطفال",cat:"medical"},
  {w:"prognosis",ph:"/prɒɡˈnəʊsɪs/",ar:"تكهن طبي",cat:"medical"},
  {w:"schizophrenia",ph:"/ˌskɪtsəˈfriːniə/",ar:"انفصام الشخصية",cat:"medical"},
  {w:"stethoscope",ph:"/ˈsteθəskəʊp/",ar:"سماعة طبية",cat:"medical"},
  {w:"ventricular",ph:"/venˈtrɪkjulə/",ar:"بطيني",cat:"medical"},

  // Arts, Culture & Literature
  {w:"aesthetic",ph:"/iːsˈθetɪk/",ar:"جمالي",cat:"culture"},
  {w:"allegory",ph:"/ˈæləɡəri/",ar:"أسلوب رمزي",cat:"culture"},
  {w:"anachronistic",ph:"/əˌnækrəˈnɪstɪk/",ar:"مناقض للحقبة",cat:"culture"},
  {w:"archaeology",ph:"/ˌɑːkiˈɒlədʒi/",ar:"علم الآثار",cat:"culture"},
  {w:"architecture",ph:"/ˈɑːkɪtektʃə/",ar:"عمارة / هندسة معمارية",cat:"culture"},
  {w:"baroque",ph:"/bəˈrɒk/",ar:"باروكي",cat:"culture"},
  {w:"bibliography",ph:"/ˌbɪbliˈɒɡrəfi/",ar:"ببليوغرافيا / قائمة مراجع",cat:"culture"},
  {w:"biography",ph:"/baɪˈɒɡrəfi/",ar:"سيرة ذاتية",cat:"culture"},
  {w:"calligraphy",ph:"/kəˈlɪɡrəfi/",ar:"الخط العربي / فن الخط",cat:"culture"},
  {w:"choreography",ph:"/ˌkɒriˈɒɡrəfi/",ar:"تصميم رقصات",cat:"culture"},
  {w:"cinematography",ph:"/ˌsɪnɪmæˈtɒɡrəfi/",ar:"تصوير سينمائي",cat:"culture"},
  {w:"civilisation",ph:"/ˌsɪvɪlaɪˈzeɪʃən/",ar:"حضارة",cat:"culture"},
  {w:"connoisseur",ph:"/ˌkɒnəˈsɜː/",ar:"خبير / ذواقة",cat:"culture"},
  {w:"contemporary",ph:"/kənˈtempərəri/",ar:"معاصر",cat:"culture"},
  {w:"cuisine",ph:"/kwɪˈziːn/",ar:"مطبخ / طهي",cat:"culture"},
  {w:"ethnicity",ph:"/eθˈnɪsɪti/",ar:"عرق / إثنية",cat:"culture"},
  {w:"eulogy",ph:"/ˈjuːlədʒi/",ar:"رثاء / مديح",cat:"culture"},
  {w:"euphemism",ph:"/ˈjuːfɪmɪzəm/",ar:"تلطيف اللفظ",cat:"culture"},
  {w:"indigenous",ph:"/ɪnˈdɪdʒənəs/",ar:"أصلي / محلي",cat:"culture"},
  {w:"irony",ph:"/ˈaɪrəni/",ar:"سخرية / تهكم",cat:"culture"},
  {w:"juxtaposition",ph:"/ˌdʒʌkstəpəˈzɪʃən/",ar:"مقارنة / تضاد",cat:"culture"},
  {w:"metaphor",ph:"/ˈmetəfə/",ar:"استعارة",cat:"culture"},
  {w:"mythology",ph:"/mɪˈθɒlədʒi/",ar:"أساطير",cat:"culture"},
  {w:"narrative",ph:"/ˈnærətɪv/",ar:"سرد / رواية",cat:"culture"},
  {w:"nostalgia",ph:"/nɒˈstældʒə/",ar:"حنين",cat:"culture"},
  {w:"orchestra",ph:"/ˈɔːkɪstrə/",ar:"أوركسترا",cat:"culture"},
  {w:"paradox",ph:"/ˈpærədɒks/",ar:"تناقض / مفارقة",cat:"culture"},
  {w:"philosophy",ph:"/fɪˈlɒsəfi/",ar:"فلسفة",cat:"culture"},
  {w:"portrayal",ph:"/pɔːˈtreɪəl/",ar:"تصوير / تجسيد",cat:"culture"},
  {w:"pseudonym",ph:"/ˈsjuːdənɪm/",ar:"اسم مستعار",cat:"culture"},
  {w:"renaissance",ph:"/rɪˈneɪsəns/",ar:"نهضة",cat:"culture"},
  {w:"satire",ph:"/ˈsætaɪə/",ar:"هجاء / تهكم",cat:"culture"},
  {w:"silhouette",ph:"/ˌsɪluˈet/",ar:"صورة ظلية",cat:"culture"},
  {w:"simultaneously",ph:"/ˌsɪməlˈteɪniəsli/",ar:"في آنٍ واحد",cat:"culture"},
  {w:"soliloquy",ph:"/səˈlɪləkwi/",ar:"مناجاة / حديث النفس",cat:"culture"},
  {w:"sophisticated",ph:"/səˈfɪstɪkeɪtɪd/",ar:"متطور / راقٍ",cat:"culture"},
  {w:"stereotype",ph:"/ˈsteriətaɪp/",ar:"صورة نمطية",cat:"culture"},
  {w:"symbolism",ph:"/ˈsɪmbəlɪzəm/",ar:"رمزية",cat:"culture"},
  {w:"symphony",ph:"/ˈsɪmfəni/",ar:"سيمفونية",cat:"culture"},
  {w:"trajectory",ph:"/trəˈdʒektəri/",ar:"مسار",cat:"culture"},
  {w:"utopian",ph:"/juːˈtəʊpiən/",ar:"طوباوي / مثالي",cat:"culture"},
  {w:"vernacular",ph:"/vəˈnækjulə/",ar:"لهجة محلية",cat:"culture"},
  {w:"virtue",ph:"/ˈvɜːtʃuː/",ar:"فضيلة",cat:"culture"},
  {w:"vulnerable",ph:"/ˈvʌlnərəbəl/",ar:"ضعيف / عرضة للخطر",cat:"culture"},
  {w:"whimsical",ph:"/ˈwɪmzɪkəl/",ar:"غريب الأطوار / خيالي",cat:"culture"},
  {w:"zeitgeist",ph:"/ˈzaɪtɡaɪst/",ar:"روح العصر",cat:"culture"},
  {w:"zenith",ph:"/ˈzenɪθ/",ar:"قمة / ذروة",cat:"culture"},
  {w:"zealous",ph:"/ˈzeləs/",ar:"متحمس / غيور",cat:"culture"},
  {w:"eloquent",ph:"/ˈeləkwənt/",ar:"بليغ / فصيح",cat:"culture"},
];

const PRON_CATS=[
  {id:"all",ar:"الكل",en:"All"},
  {id:"academic",ar:"أكاديمي",en:"Academic"},
  {id:"tricky",ar:"صعبة النطق",en:"Tricky"},
  {id:"science",ar:"علوم",en:"Science"},
  {id:"society",ar:"مجتمع",en:"Society"},
  {id:"medical",ar:"طبي",en:"Medical"},
  {id:"culture",ar:"ثقافة",en:"Culture"},
];

const PronunciationPage=({uiLang="ar",isPro=false,onUpgrade})=>{
  const [search,setSearch]=useState("");
  const [cat,setCat]=useState("all");
  const [speaking,setSpeaking]=useState("");
  const [audioCache,setAudioCache]=useState({});
  const audioRef=useRef(null);
  const isAr=uiLang==="ar";
  const dir=isAr?"rtl":"ltr";
  const sty={fontFamily:"'Cairo','Source Sans Pro',system-ui"};

  const FREE_PRON_CATS=["academic"];
  const FREE_PRON_LIMIT=50;

  const catLocked=(id)=>id!=="all"&&!isPro&&!FREE_PRON_CATS.includes(id);

  const filtered=useMemo(()=>{
    let list=PRON_WORDS;
    // Free users: only academic category
    if(!isPro) list=list.filter(w=>w.cat==="academic");
    if(cat!=="all")list=list.filter(w=>w.cat===cat);
    if(search.trim()){
      const q=search.toLowerCase().trim();
      list=list.filter(w=>w.w.toLowerCase().includes(q)||w.ar.includes(q));
    }
    // Cap free users at 50 words
    if(!isPro) list=list.slice(0,FREE_PRON_LIMIT);
    return list;
  },[cat,search,isPro]);

  const playWord=async(word)=>{
    if(speaking===word)return;
    setSpeaking(word);
    // Try cached URL first
    let url=audioCache[word];
    if(!url){
      try{
        const res=await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`);
        if(res.ok){
          const data=await res.json();
          const phonetics=(data[0]?.phonetics||[]);
          const found=phonetics.find(p=>p.audio&&p.audio.includes("uk"))||
                       phonetics.find(p=>p.audio&&p.audio.includes("us"))||
                       phonetics.find(p=>p.audio&&p.audio.length>0);
          if(found?.audio){
            url=found.audio.startsWith("http")?found.audio:"https:"+found.audio;
            setAudioCache(prev=>({...prev,[word]:url}));
          }
        }
      }catch(e){}
    }
    if(url){
      try{
        if(audioRef.current){audioRef.current.pause();audioRef.current=null;}
        const audio=new Audio(url);
        audioRef.current=audio;
        audio.onended=()=>setSpeaking("");
        audio.onerror=()=>{
          fallbackSpeak(word);
        };
        await audio.play();
        return;
      }catch(e){}
    }
    fallbackSpeak(word);
  };

  const fallbackSpeak=(word)=>{
    if(!window.speechSynthesis){setSpeaking("");return;}
    window.speechSynthesis.cancel();
    const utt=new SpeechSynthesisUtterance(word);
    utt.lang="en-GB";utt.rate=0.8;utt.pitch=1;
    const voices=window.speechSynthesis.getVoices();
    const match=voices.find(v=>v.lang==="en-GB"&&/google|natural|daniel/i.test(v.name))||
                 voices.find(v=>v.lang==="en-GB")||
                 voices.find(v=>v.lang==="en-US"&&/google|natural/i.test(v.name))||
                 voices.find(v=>v.lang.startsWith("en"));
    if(match)utt.voice=match;
    utt.onend=()=>setSpeaking("");
    utt.onerror=()=>setSpeaking("");
    window.speechSynthesis.speak(utt);
  };

  return(
    <div style={{maxWidth:900,margin:"0 auto",padding:"28px 16px",...sty,direction:dir}}>
      <h1 style={{fontFamily:"Georgia,serif",fontSize:26,color:T.text,marginBottom:4,textAlign:"center"}}>🔊 {isAr?"النطق الصحيح":"Pronunciation Guide"}</h1>
      <p style={{textAlign:"center",color:T.textMuted,fontSize:14,marginBottom:20}}>
        {isPro
          ?(isAr?`${PRON_WORDS.length} كلمة — اضغط على أي كلمة لسماع نطقها`:`${PRON_WORDS.length} words — tap any word to hear it`)
          :(isAr?"50 كلمة أكاديمية مجانية — Pro للوصول الكامل (289 كلمة)":"50 academic words free — Pro for full access (289 words)")
        }
      </p>
      {/* Search */}
      <div style={{position:"relative",marginBottom:16}}>
        <span style={{position:"absolute",top:"50%",transform:"translateY(-50%)",fontSize:16,color:T.textMuted,[isAr?"right":"left"]:12}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder={isAr?"ابحث عن كلمة...":"Search a word..."}
          style={{width:"100%",padding:`10px ${isAr?"12px":"40px"} 10px ${isAr?"40px":"12px"}`,borderRadius:10,border:`1px solid ${T.borderMid}`,fontSize:14,...sty,direction:dir,boxSizing:"border-box"}}/>
      </div>
      {/* Category tabs */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:20}}>
        {PRON_CATS.map(c=>{
          const locked=catLocked(c.id);
          return(
            <button key={c.id} onClick={()=>{if(locked){onUpgrade&&onUpgrade();}else{setCat(c.id);}}}
              style={{padding:"7px 14px",borderRadius:20,border:`1px solid ${cat===c.id?T.primary:T.border}`,background:cat===c.id?T.primaryLight:locked?T.bgMuted:"white",color:cat===c.id?T.primary:locked?T.textLight:T.textMid,fontWeight:cat===c.id?700:400,fontSize:13,cursor:"pointer",opacity:locked?0.6:1,...sty}}>
              {locked?"🔒 ":""}{isAr?c.ar:c.en}{cat===c.id?` (${filtered.length})`:``}
            </button>
          );
        })}
      </div>
      <div style={{fontSize:12,color:T.textMuted,marginBottom:14}}>
        {isAr?`عرض ${filtered.length} كلمة`:`Showing ${filtered.length} words`}
      </div>
      {/* Word grid */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:10}}>
        {filtered.map((item,i)=>(
          <div key={i}
            onClick={()=>playWord(item.w)}
            style={{background:speaking===item.w?T.primaryLight:"white",border:`1.5px solid ${speaking===item.w?T.primary:T.border}`,borderRadius:12,padding:"14px 16px",cursor:"pointer",transition:"all 0.15s",display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
              <div style={{display:"flex",alignItems:"baseline",gap:8,flexWrap:"wrap"}}>
                <span style={{fontSize:17,fontWeight:700,color:speaking===item.w?T.primary:T.text,direction:"ltr"}}>{item.w}</span>
                <span style={{fontSize:11,color:T.textMuted,fontFamily:"monospace",direction:"ltr"}}>{item.ph}</span>
              </div>
              <span style={{fontSize:18,flexShrink:0,color:speaking===item.w?T.primary:T.textMuted}}>
                {speaking===item.w?"🔊":"🔈"}
              </span>
            </div>
            <div style={{fontSize:13,color:T.textMid,direction:"rtl"}}>{item.ar}</div>
          </div>
        ))}
      </div>
      {filtered.length===0&&(
        <div style={{textAlign:"center",padding:"60px 20px",color:T.textMuted,fontSize:15}}>
          {isAr?"لا توجد نتائج — جرب كلمة أخرى":"No results — try a different word"}
        </div>
      )}
      <div style={{marginTop:24,padding:"14px",background:T.bgMuted,borderRadius:10,border:`1px solid ${T.border}`,fontSize:12,color:T.textMuted,textAlign:"center"}}>
        {isAr?"الصوت من قاموس حقيقي — اضغط أي كلمة مرة واحدة وانتظر ثانية":"Audio from a real dictionary recording — tap once and wait a moment"}
      </div>
    </div>
  );
};

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
  const [showConsultation,setShowConsultation]=useState(false);
  const [showOnboarding,setShowOnboarding]=useState(()=>{try{return!localStorage.getItem("ef_onboarded");}catch{return true;}});
  const [showAuth,setShowAuth]=useState(false);
  const [showChangePassword,setShowChangePassword]=useState(false);
  const [session,setSession]=useState(null);
  const [uses,setUses]=useState(0);
  const [lang,setLang]=useState("en");
  const [uiLang,setUiLang]=useState(()=>{try{return localStorage.getItem("ef_ui_lang")||"en";}catch{return "en";}}); // Website UI language
  const [menuOpen,setMenuOpen]=useState(false);
  const [navVisible,setNavVisible]=useState(true);
  const lastScrollY=useRef(0);
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

  // ── Smart nav hide on scroll (mobile) ──
  useEffect(()=>{
    let ticking=false;
    const onScroll=()=>{
      if(ticking)return;
      ticking=true;
      requestAnimationFrame(()=>{
        const currentY=window.scrollY;
        const delta=currentY-lastScrollY.current;
        // Hide when scrolling down >40px, show when scrolling up or near top
        if(currentY<80){setNavVisible(true);}
        else if(delta>8){setNavVisible(false);}
        else if(delta<-8){setNavVisible(true);}
        lastScrollY.current=currentY;
        ticking=false;
      });
    };
    window.addEventListener("scroll",onScroll,{passive:true});
    return()=>window.removeEventListener("scroll",onScroll);
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
    fetchProStatus(sess.email).then(isPro=>{
      setProUser(isPro);
      // If they just logged in as Pro and have a generated password, prompt to change it
      if(isPro && sess.isGeneratedPassword){
        setTimeout(()=>setShowChangePassword(true), 800);
      }
    });
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

  const [isSampleEssay, setIsSampleEssay] = useState(false);
  const trySampleEssay=()=>{
    setIsSampleEssay(true);
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
  const PAGE_TITLES = {home:"Englishfool — منصة الآيلتس الشاملة",vocabulary:"مفردات الآيلتس — Englishfool",analyze:"Englishfool — منصة الآيلتس الشاملة | تقييم مقالات + ألعاب + اختبارات",practice:"تدريب الكتابة — Englishfool",progress:"متابعة التقدم — Englishfool",toolkit:"أدوات الآيلتس — Englishfool",contact:"تواصل معنا — Englishfool",grammar:"مدقق القواعد والإملاء — Englishfool",exercises:"تمارين الآيلتس — Englishfool",admin:"Admin — Englishfool",terms:"شروط الخدمة — Englishfool",privacy:"سياسة الخصوصية — Englishfool",refund:"سياسة الاسترداد — Englishfool",pricing:"الأسعار — Englishfool",speaking:"تدريب المحادثة — Englishfool",reading:"اختبارات القراءة — Englishfool",game:"ألعاب الآيلتس — Englishfool"};
  const PAGE_DESCS = {analyze:"احصل على تقييم فوري لمقالتك بناءً على معايير كامبريدج الأربعة. مع نماذج إجابة، تصحيح أخطاء، وخطة لرفع درجتك. جرّب مجاناً.",practice:"تدرّب على كتابة الآيلتس مع تغذية راجعة فورية لكل جملة. Task 1 و Task 2 بدعم من معايير Band 8+.",reading:"7 اختبارات قراءة آيلتس كاملة (Academic + General) مع مؤقت رسمي وتصحيح فوري.",speaking:"نماذج إجابة Band 8 لجميع أجزاء الآيلتس Speaking: Part 1, 2, 3 مع مفردات وأخطاء شائعة.",game:"تعلّم الآيلتس من خلال ألعاب تفاعلية: إملاء، قواعد، مفردات، كتابة، وقراءة.",pricing:"اشتراك Pro لمدة 3 أشهر بـ 25 دينار (الأردن) أو $35 (دولي). وصول كامل لجميع الأدوات.",default:"منصة Englishfool للتحضير للآيلتس — تقييم مقالات احترافي، اختبارات قراءة، ألعاب تدريبية، وتمارين قواعد."};
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
      if(parsed.error==="non_english"){
        setLoading(false);
        setError(lang==="ar"?"يرجى كتابة مقالتك باللغة الإنجليزية. هذه الأداة تقيّم الكتابة الإنجليزية فقط.":"Please submit your essay in English. This tool evaluates English writing only.");
        return;
      }
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
      {showConsultation&&<ConsultationModal onClose={()=>setShowConsultation(false)} uiLang={uiLang}/>}



      {/* NAV BAR 2 */}
      {/* ── TWO-TIER NAV (ieltsanswers style) ───────────── */}
      <div className="sticky-nav" style={{position:"sticky",top:0,zIndex:200,boxShadow:"0 2px 8px rgba(0,0,0,0.1)",transform:navVisible?"translateY(0)":"translateY(-100%)",transition:"transform 0.25s ease"}}>

        {/* TIER 1 — White topbar: logo + language + account */}
        <div style={{background:"#ffffff",borderBottom:`1px solid ${T.border}`,padding:"0 32px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
            <Logo size={26} style={{cursor:"pointer"}} onClick={()=>switchView("home")}/>
            <div className="nav-right" style={{display:"flex",alignItems:"center",gap:10}}>
              {/* Free Consultation — desktop only */}
              <button onClick={()=>setShowConsultation(true)} style={{background:T.primary,color:"white",border:"none",borderRadius:8,padding:"7px 14px",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5,flexShrink:0,boxShadow:`0 2px 8px ${T.primary}44`}}>
                🎓 {uiLang==="ar"?"استشارة مجانية":"Free Consultation"}
              </button>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:11,color:T.textMuted,fontFamily:"'Cairo',system-ui"}}>{uiLang==="ar"?"لغة الموقع:":"Site:"}</span>
                <div style={{display:"flex",background:T.bgMuted,borderRadius:8,padding:2,gap:2}}>
                  {["ar","en"].map(l=>(
                    <button key={l} onClick={()=>{setUiLang(l);try{localStorage.setItem("ef_ui_lang",l);}catch{}}} style={{background:uiLang===l?"white":"transparent",border:"none",borderRadius:6,padding:"4px 12px",fontSize:12,fontWeight:uiLang===l?700:500,color:uiLang===l?T.primary:T.textMuted,cursor:"pointer",fontFamily:"'Cairo',system-ui",transition:"all 0.2s",boxShadow:uiLang===l?T.shadow:"none"}}>
                      {l==="ar"?"ع":"EN"}
                    </button>
                  ))}
                </div>
              </div>
              {proUser?(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:T.primary,fontWeight:700,fontFamily:"'Cairo',system-ui",background:T.primaryLight,padding:"3px 10px",borderRadius:20,border:`1px solid ${T.primaryBorder}`}}>✓ Pro</span>
                  <button onClick={()=>setShowManageSub(true)} style={{fontSize:11,color:T.textMuted,fontFamily:"'Cairo',system-ui",textDecoration:"underline",cursor:"pointer",background:"none",border:"none",padding:0}}>إدارة الاشتراك</button>
                </div>
              ):(
                <button className="upgrade-btn" onClick={()=>setShowPaywall(true)} style={{background:T.primary,color:"white",border:"none",borderRadius:6,padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>{UI[uiLang].getPro}</button>
              )}
              {session?(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:12,color:T.textMid,fontFamily:"'Cairo',system-ui",fontWeight:600}}>👤 {session.name||session.email.split("@")[0]}</span>
                  <button onClick={()=>setShowChangePassword(true)} title="Change Password" style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"4px 8px",fontSize:11,fontWeight:600,color:T.textMuted,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>🔑</button>
                  <button onClick={handleSignOut} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:4,padding:"5px 10px",fontSize:12,fontWeight:600,color:T.textMid,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>{UI[uiLang].signOut}</button>
                </div>
              ):(
                <button onClick={()=>setShowAuth(true)} style={{background:"transparent",color:T.primary,border:`1.5px solid ${T.primary}`,borderRadius:6,padding:"6px 16px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>{UI[uiLang].signIn}</button>
              )}
            </div>
            {/* Mobile-only auth strip */}
            <div className="mobile-top-controls" style={{display:"none",alignItems:"center",gap:6}}>
              <div style={{display:"flex",background:T.bgMuted,borderRadius:8,padding:2,gap:2}}>
                {["ar","en"].map(l=>(
                  <button key={l} onClick={()=>{setUiLang(l);try{localStorage.setItem("ef_ui_lang",l);}catch{}}} style={{background:uiLang===l?"white":"transparent",border:"none",borderRadius:6,padding:"4px 9px",fontSize:12,fontWeight:uiLang===l?700:500,color:uiLang===l?T.primary:T.textMuted,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>
                    {l==="ar"?"ع":"EN"}
                  </button>
                ))}
              </div>
              {proUser
                ?<span style={{fontSize:11,color:T.primary,fontWeight:700,fontFamily:"'Cairo',system-ui",background:T.primaryLight,padding:"3px 8px",borderRadius:20,border:`1px solid ${T.primaryBorder}`}}>✓ Pro</span>
                :<button onClick={()=>setShowPaywall(true)} style={{background:T.primary,color:"white",border:"none",borderRadius:6,padding:"6px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>🔓 Pro</button>
              }
              {session
                ?<button onClick={handleSignOut} style={{background:"transparent",border:`1px solid ${T.border}`,borderRadius:6,padding:"5px 8px",fontSize:11,cursor:"pointer",color:T.textMid,fontFamily:"'Cairo',system-ui"}}>{uiLang==="ar"?"خروج":"Out"}</button>
                :<button onClick={()=>setShowAuth(true)} style={{background:"transparent",color:T.primary,border:`1.5px solid ${T.primary}`,borderRadius:6,padding:"5px 10px",fontSize:11,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>{uiLang==="ar"?"دخول":"Sign In"}</button>
              }
            </div>
          </div>
        </div>

        {/* TIER 2 — Red navbar: navigation links */}
        <div style={{background:T.primary}}>
          <div style={{maxWidth:1200,margin:"0 auto",padding:"0 8px"}}>
            <div className="nav-tabs" style={{display:"flex",gap:0,alignItems:"center",direction:uiLang==="ar"?"rtl":"ltr",flexWrap:"wrap"}}>
              <MainTab label={UI[uiLang].home} active={mainView==="home"} onClick={()=>{switchView("home");trackEvent("nav_click",{page:"home"});}}/>
              <MainTab label={UI[uiLang].placement} active={mainView==="placement"} onClick={()=>{switchView("placement");trackEvent("nav_click",{page:"placement"});}}/>
              <MainTab label={UI[uiLang].writing} active={["analyze","practice","grammar"].includes(mainView)} onClick={()=>{switchView("analyze");trackEvent("nav_click",{page:"analyze"});}}/>
              <MainTab label={UI[uiLang].speaking} active={mainView==="speaking"} onClick={()=>{switchView("speaking");trackEvent("nav_click",{page:"speaking"});}}/>
              <MainTab label={UI[uiLang].exercises} active={mainView==="exercises"} onClick={()=>{switchView("exercises");trackEvent("nav_click",{page:"exercises"});}}/>
              <MainTab label={UI[uiLang].reading} active={mainView==="reading"} onClick={()=>{switchView("reading");trackEvent("nav_click",{page:"reading"});}}/>
              <MainTab label={UI[uiLang].game} active={mainView==="game"} onClick={()=>{switchView("game");trackEvent("nav_click",{page:"game"});}}/>
              <MainTab label={UI[uiLang].vocab} active={mainView==="vocabulary"} onClick={()=>{switchView("vocabulary");trackEvent("nav_click",{page:"vocabulary"});}}/>
              <MainTab label={UI[uiLang].toolkit} active={mainView==="toolkit"} onClick={()=>{switchView("toolkit");trackEvent("nav_click",{page:"toolkit"});}}/>
              <MainTab label={UI[uiLang].progress} active={mainView==="progress"} onClick={()=>{switchView("progress");trackEvent("nav_click",{page:"progress"});}}/>
              <MainTab label={UI[uiLang].studyplan} active={mainView==="studyplan"} onClick={()=>{switchView("studyplan");trackEvent("nav_click",{page:"studyplan"});}}/>
              <MainTab label={UI[uiLang].pronunciation} active={mainView==="pronunciation"} onClick={()=>{switchView("pronunciation");trackEvent("nav_click",{page:"pronunciation"});}}/>
              <MainTab label={UI[uiLang].contact} active={mainView==="contact"} onClick={()=>{switchView("contact");trackEvent("nav_click",{page:"contact"});}}/>
            </div>
          </div>
        </div>
      </div>

      {/* Writing sub-nav */}
      {["analyze","practice","grammar"].includes(mainView)&&(
        <div className="writing-subnav" style={{background:"#f9fafb",borderBottom:`1px solid ${T.border}`,padding:"0 32px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:4,overflowX:"auto",padding:"8px 0"}} className="tab-row">
            {[{v:"analyze",l:UI[uiLang].wAnalyze},{v:"practice",l:UI[uiLang].wPractice},{v:"grammar",l:UI[uiLang].wGrammar}].map(t=>(
              <button key={t.v} onClick={()=>switchView(t.v)} style={{background:mainView===t.v?T.primaryLight:"white",border:`1px solid ${mainView===t.v?T.primaryBorder:T.border}`,borderRadius:6,padding:"7px 16px",fontSize:13,fontWeight:mainView===t.v?700:500,color:mainView===t.v?T.primary:T.textMid,cursor:"pointer",fontFamily:"'Cairo',system-ui",whiteSpace:"nowrap",flexShrink:0}}>{t.l}</button>
            ))}
          </div>
        </div>
      )}

      {/* ── HERO — ieltsanswers style: big + clean + minimal ─── */}
      {mainView==="home"&&(
        <div style={{background:T.primary,padding:"80px 32px 90px",textAlign:"center",position:"relative",overflow:"hidden"}}>
          {/* Subtle pattern overlay */}
          <div style={{position:"absolute",inset:0,opacity:0.05,backgroundImage:"radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)",backgroundSize:"60px 60px"}}/>
          <div style={{maxWidth:760,margin:"0 auto",position:"relative",zIndex:2,direction:uiLang==="ar"?"rtl":"ltr",textAlign:"center"}}>
            <div style={{display:"inline-block",background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:20,padding:"5px 18px",fontSize:13,color:"rgba(255,255,255,0.9)",fontFamily:"'Cairo',system-ui",fontWeight:600,marginBottom:24}}>
              {uiLang==="ar"?"🎓 تعلّم الإنجليزية  ·  ارفع درجتك في الآيلتس":"🎓 English Learning  ·  IELTS Preparation"}
            </div>
            <h1 style={{fontSize:"clamp(32px,5vw,58px)",fontWeight:900,color:"white",fontFamily:"'Cairo',system-ui",lineHeight:1.2,margin:"0 0 20px",textShadow:"0 2px 20px rgba(0,0,0,0.2)"}}>
{uiLang==="ar"?"تعلّم الإنجليزية بشكل صحيح":"Learn English properly."}
            </h1>
            <p style={{fontSize:"clamp(16px,2vw,22px)",color:"rgba(255,255,255,0.85)",fontFamily:"'Cairo',system-ui",lineHeight:1.7,margin:"0 0 40px",fontWeight:400,direction:uiLang==="ar"?"rtl":"ltr"}}>
{uiLang==="ar"?"اختبار تحديد مستوى · تغذية راجعة حقيقية · مبني للآيلتس والأهداف الأكبر":"A placement test, real writing feedback, and structured practice — built for IELTS and beyond."}
            </p>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.12)",borderRadius:8,padding:"6px 16px",marginBottom:32,fontSize:13,color:"rgba(255,255,255,0.85)",fontFamily:"'Cairo',system-ui"}}>
              {uiLang==="ar"?"✅ مثالي لمن يستهدف رفع درجة الآيلتس":"✅ Ideal if you're also targeting a specific IELTS band"}
            </div>
            <div style={{display:"flex",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
              <button onClick={()=>switchView("placement")} style={{background:T.accent,color:"#7f1200",border:"none",borderRadius:10,padding:"18px 40px",fontSize:17,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo',system-ui",boxShadow:`0 6px 24px rgba(0,0,0,0.25)`,transition:"transform 0.15s"}}
                onMouseOver={e=>e.currentTarget.style.transform="translateY(-2px)"}
                onMouseOut={e=>e.currentTarget.style.transform="translateY(0)"}>
                {uiLang==="ar"?UI["ar"].startFree:UI["en"].startFree}
              </button>
              <button onClick={()=>{switchView("analyze");setTimeout(()=>{const el=document.getElementById("essay-input-area");if(el)el.scrollIntoView({behavior:"smooth",block:"start"});},300);}} style={{background:"rgba(255,255,255,0.12)",color:"white",border:"2px solid rgba(255,255,255,0.5)",borderRadius:10,padding:"18px 40px",fontSize:17,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo',system-ui",transition:"background 0.15s"}}
                onMouseOver={e=>e.currentTarget.style.background="rgba(255,255,255,0.2)"}
                onMouseOut={e=>e.currentTarget.style.background="rgba(255,255,255,0.12)"}>
                {uiLang==="ar"?UI["ar"].startFree2:UI["en"].startFree2}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* VALUE PROPOSITION STRIP — 4 bullets */}
      {mainView==="home"&&(
        <div style={{background:"#fafafa",borderBottom:"1px solid #e2e8f0",padding:"40px 32px"}}>
          <div style={{maxWidth:1060,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:24}}>
            {(uiLang==="ar"?[
              {icon:"📍",title:"اعرف مستواك بدقة",desc:"اختبار 20 دقيقة يحدد مستواك من A1 إلى C2 مع تقدير لدرجة الآيلتس المتوقعة."},
              {icon:"📝",title:"تغذية راجعة تعليمية حقيقية",desc:"مقالتك تُقيَّم على أربعة معايير محددة — كل خطأ يُحدَّد ويُشرح ويُصحَّح. ليس تلخيصاً."},
              {icon:"📚",title:"تدريب يقودك إلى الأمام",desc:"اختبارات قراءة وتمارين قواعد وألعاب — مرتبطة بمستواك وما تحتاج التحسين فيه."},
              {icon:"📈",title:"شاهد تقدمك بالأرقام",desc:"كل مقالة تُحفظ. سجل درجاتك يُظهر هل أنت تتحسن أم تراوح مكانك."},
            ]:[
              {icon:"📍",title:"Know where you stand",desc:"A 20-minute placement test gives you your exact level — A1 to C2 — with an estimated IELTS band."},
              {icon:"📝",title:"Writing feedback that actually teaches",desc:"Your essay gets scored on four specific criteria, with every mistake identified, explained, and corrected — not summarised."},
              {icon:"📚",title:"Practice that goes somewhere",desc:"Reading tests, vocabulary, grammar exercises, and games — all connected to your level and what you need to work on."},
              {icon:"📈",title:"See your improvement in numbers",desc:"Every essay you submit is saved. Your band score history shows whether you're improving or plateauing."},
            ]).map((item,i)=>(
              <div key={i} style={{display:"flex",gap:14,alignItems:"flex-start",direction:uiLang==="ar"?"rtl":"ltr"}}>
                <div style={{fontSize:28,flexShrink:0,marginTop:2}}>{item.icon}</div>
                <div>
                  <div style={{fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:15,color:"#1e293b",marginBottom:5}}>{item.title}</div>
                  <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"#64748b",lineHeight:1.6}}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* ── FEATURES STRIP (below hero, white background) ────── */}
      {mainView==="home"&&(
        <div style={{background:"white",borderBottom:`1px solid ${T.border}`,padding:"40px 32px"}}>
          <div style={{maxWidth:1100,margin:"0 auto",display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,textAlign:"center"}} className="features-grid">
            {[
              {icon:"📋",tk:"fat",dk:"fad",view:"placement",free:true},
              {icon:"🎓",tk:"f1t",dk:"f1d",view:"analyze",free:true},
              {icon:"📖",tk:"f2t",dk:"f2d",view:"reading",free:true},
              {icon:"🗣️",tk:"f3t",dk:"f3d",view:"speaking",free:true},
              {icon:"🎮",tk:"f4t",dk:"f4d",view:"game",free:true},
              {icon:"✏️",tk:"f5t",dk:"f5d",view:"grammar",free:true},
              {icon:"🏋️",tk:"f6t",dk:"f6d",view:"exercises",free:false},
              {icon:"📚",tk:"f7t",dk:"f7d",view:"toolkit",free:false},
              {icon:"📈",tk:"f8t",dk:"f8d",view:"progress",free:false},
              {icon:"📝",tk:"f9t",dk:"f9d",view:"vocabulary",free:true},
            ].map((f,i)=>(
              <div key={i} onClick={()=>switchView(f.view)} style={{padding:"20px 16px",cursor:"pointer",borderRadius:12,border:`1px solid transparent`,transition:"all 0.2s",direction:uiLang==="ar"?"rtl":"ltr"}}
                onMouseOver={e=>{e.currentTarget.style.background=T.primaryLight;e.currentTarget.style.borderColor=T.primaryBorder;}}
                onMouseOut={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
                  <span style={{fontSize:36}}>{f.icon}</span>
                  <span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:f.free?"#dcfce7":"#fef3c7",color:f.free?"#166534":"#92400e",border:f.free?"1px solid #86efac":"1px solid #fbbf24"}}>
                    {f.free?(uiLang==="ar"?"مجاني":"Free"):(uiLang==="ar"?"Pro 🔒":"Pro 🔒")}
                  </span>
                </div>
                <div style={{fontWeight:700,fontSize:16,color:T.primary,fontFamily:"'Cairo',system-ui",marginBottom:6}}>{UI[uiLang][f.tk]}</div>
                <div style={{fontSize:14,color:T.textMuted,fontFamily:"'Cairo',system-ui",lineHeight:1.7}}>{UI[uiLang][f.dk]}</div>
                <div style={{marginTop:10,fontSize:13,color:T.primary,fontWeight:600,fontFamily:"'Cairo',system-ui"}}>{UI[uiLang].fStart}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STATS BAR — homepage only */}
      {mainView==="home"&&<div style={{background:T.bgSurface,borderBottom:`1px solid ${T.border}`,padding:"20px 32px"}}>
        <div className="stats-inner" style={{maxWidth:1200,margin:"0 auto",display:"flex",gap:48,alignItems:"center",flexWrap:"wrap",padding:"0 8px"}}>
          {[["stat1n","stat1l"],["stat2n","stat2l"],["stat3n","stat3l"],["stat3bn","stat3bl"]].map(([nk,lk])=>(
            <div key={lk} style={{display:"flex",alignItems:"center",gap:12}}>
              <span style={{color:T.primary,fontWeight:800,fontSize:22,fontFamily:"Inter,system-ui"}}>{UI[uiLang][nk]}</span>
              <span style={{color:T.textMuted,fontSize:14,fontFamily:"'Cairo',system-ui",lineHeight:1.4}}>{UI[uiLang][lk]}</span>
            </div>
          ))}
        </div>
      </div>}


      {/* PLATFORM DESCRIPTION — homepage only */}
      {mainView==="home"&&(
        <div style={{background:"white",borderTop:"1px solid #e2e8f0",padding:"56px 32px"}}>
          <div style={{maxWidth:720,margin:"0 auto",direction:uiLang==="ar"?"rtl":"ltr",textAlign:"center"}}>
            <h2 style={{fontFamily:"Georgia,serif",fontSize:"clamp(20px,2.5vw,26px)",color:"#1e293b",margin:"0 0 16px",fontWeight:700,lineHeight:1.4}}>
              {uiLang==="ar"
                ?"مهارات القراءة والكتابة والقواعد والمفردات — كل ما تحتاجه لترفع مستوى لغتك الإنجليزية في مكان واحد."
                :"Reading, writing, grammar, and vocabulary — everything you need to improve your English, in one place."}
            </h2>
            <p style={{fontFamily:"'Cairo',system-ui",fontSize:16,color:"#475569",margin:"0 auto",lineHeight:1.8,maxWidth:600}}>
              {uiLang==="ar"
                ?"وإن كان هدفك الآيلتس، فالمنصة بُنيت أصلاً من أجل هذا."
                :"And if your goal is IELTS, this platform was built specifically for that."}
            </p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16,maxWidth:860,margin:"40px auto 0"}}>
            {(uiLang==="ar"?[
              {icon:"📍",title:"يعرف مستواك",ef:"اختبار تحديد المستوى عند أول زيارة — A1 إلى C2",sub:"بناءً على نتيجتك تعرف ماذا تفعل أولاً"},
              {icon:"📊",title:"تقييم المقالات",ef:"أربعة معايير، وصفات درجات رسمية، ودرجة محددة",sub:"تغذية راجعة حقيقية لا عامة"},
              {icon:"📈",title:"يتتبع تقدمك",ef:"تاريخ الدرجات يُحفظ تلقائياً في كل مقالة",sub:"ترى تطورك بوضوح بمرور الوقت"},
              {icon:"🗺️",title:"مسار تعلّم منظم",ef:"تمارين، ألعاب، قراءة، محادثة، ومفردات",sub:"كل شيء منظم ومترابط"},
            ]:[
              {icon:"📍",title:"Knows your level",ef:"Placement test on first visit — A1 to C2",sub:"Know exactly where to start"},
              {icon:"📊",title:"Essay scoring",ef:"Four criteria, official band descriptors, specific score",sub:"Real feedback, not generic suggestions"},
              {icon:"📈",title:"Tracks your progress",ef:"Score history saved automatically every essay",sub:"See your improvement over time"},
              {icon:"🗺️",title:"Structured learning",ef:"Exercises, games, reading, speaking, and vocabulary",sub:"Everything organised and connected"},
            ]).map((item,i)=>(
              <div key={i} style={{background:"#f8fafc",borderRadius:12,padding:"20px",border:"1px solid #e2e8f0",direction:uiLang==="ar"?"rtl":"ltr",textAlign:uiLang==="ar"?"right":"left"}}>
                <div style={{fontSize:24,marginBottom:8}}>{item.icon}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontWeight:700,fontSize:15,color:"#1e293b",marginBottom:8}}>{item.title}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"#1e293b",lineHeight:1.6,marginBottom:6}}>{item.ef}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontSize:12,color:"#64748b",lineHeight:1.5}}>{item.sub}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* GAME PROMO STRIP — desktop only, always visible on homepage */}
      {mainView==="home"&&(
        <div className="desktop-game-strip" style={{background:`linear-gradient(135deg,${T.primary} 0%,#7f1d1d 100%)`,borderTop:"1px solid rgba(212,175,55,0.2)",padding:"16px 32px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,direction:uiLang==="ar"?"rtl":"ltr"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              <span style={{fontSize:22}}>🎮</span>
              <div>
                <div style={{fontFamily:"'Cairo',system-ui",fontWeight:800,fontSize:14,color:"white"}}>{UI[uiLang].gameTitle}</div>
                <div style={{fontFamily:"'Cairo',system-ui",fontSize:12,color:"rgba(255,255,255,0.5)",marginTop:2}}>{UI[uiLang].gameSub}</div>
              </div>
            </div>
            <button onClick={()=>switchView("game")} style={{background:T.accent,color:T.primary,border:"none",borderRadius:8,padding:"9px 20px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:`0 2px 8px ${T.accent}44`,whiteSpace:"nowrap"}}>
              {uiLang==="ar"?"العب الآن 🕹️":"Play Now 🕹️"}
            </button>
          </div>
        </div>
      )}

      {/* DAILY CHALLENGE — homepage gamified widget */}
      {mainView==="home"&&(
        <div style={{background:"#0f172a",padding:"40px 32px"}}>
          <div style={{maxWidth:700,margin:"0 auto"}}>
            <div style={{textAlign:"center",marginBottom:20}}>
              <h2 style={{fontFamily:"Georgia,serif",fontSize:"clamp(18px,2.5vw,24px)",color:"white",margin:"0 0 6px",fontWeight:700}}>
                {uiLang==="ar"?"سؤال اليوم":"Question of the Day"}
              </h2>
              <p style={{fontFamily:"'Cairo',system-ui",fontSize:13,color:"rgba(255,255,255,0.45)",margin:0}}>
                {uiLang==="ar"?"سؤال يومي جديد · حافظ على تسلسلك!":"One new question daily · Keep your streak going!"}
              </p>
            </div>
            <DailyChallengeWidget uiLang={uiLang}/>
          </div>
        </div>
      )}
      {/* TESTIMONIALS — social proof on homepage */}
      {mainView==="home"&&<TestimonialsSection uiLang={uiLang}/>}

      {/* PRICING COMPARISON — clarity on free vs pro */}
      {mainView==="home"&&!proUser&&<PricingComparisonStrip uiLang={uiLang} onUpgrade={()=>setShowPaywall(true)}/>}

      {/* UPGRADE BANNER — shown to non-Pro users only */}
      {!proUser&&(
        <div style={{background:T.primary,borderTop:"1px solid rgba(255,255,255,0.08)",padding:"16px 32px"}}>
          <div style={{maxWidth:1200,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
            <div style={{display:"flex",alignItems:"center",gap:16,flexWrap:"wrap",direction:"rtl"}}>
              <span style={{fontSize:13,color:"rgba(255,255,255,0.9)",fontFamily:"'Cairo',system-ui",fontWeight:600}}>
                {UI[uiLang].unlimitedBanner}
              </span>
              <span style={{background:`${T.accent}22`,border:`1px solid ${T.accent}66`,borderRadius:20,padding:"2px 12px",fontSize:12,color:T.accent,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700}}>
                {uiLang==="ar"?"🇯🇴 CLIQ — 25 دينار (3 أشهر)":"🇯🇴 Jordan: 25 JOD via CLIQ"}
              </span>
            </div>
            <button onClick={()=>setShowPaywall(true)}
              style={{background:T.accent,color:T.primary,border:"none",borderRadius:6,padding:"9px 22px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",flexShrink:0,boxShadow:`0 2px 8px ${T.accent}44`}}>
              🔓 احصل على Pro →
            </button>
          </div>
        </div>
      )}

      {/* CONTENT AREA — visible on all non-policy tool pages */}
      {!["terms","privacy","refund","pricing","home"].includes(mainView)&&(
      <div className="content-outer" style={{maxWidth:1200,margin:"36px auto 100px",padding:"0 32px"}}>
      <div className="content-card en-content" style={{background:T.bgSurface,border:`1px solid ${T.border}`,borderRadius:12,padding:"44px 40px",boxShadow:T.shadow}}>

        {/* ANALYZE */}
        {mainView==="analyze"&&(
          <div id="essay-input-area" className="analyze-box" style={{background:"#ffffff",borderRadius:16,boxShadow:"0 20px 60px rgba(0,0,0,0.5)",padding:"32px 28px"}}>
            <div style={{marginBottom:20}}>
              <label style={{display:"block",fontSize:13,color:T.text,marginBottom:6,fontFamily:"'Cairo','Source Sans Pro',system-ui",fontWeight:700,direction:uiLang==="ar"?"rtl":"ltr"}}>{uiLang==="ar"?"اختر نوع المهمة الكتابية":"Select your writing task type"}</label>
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
                  <div style={{fontSize:12,color:T.textMid,fontFamily:"'Cairo','Source Sans Pro',system-ui",marginTop:2}}>Load a sample essay — contains intentional mistakes to show you how the analysis works.</div>
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
                {isSampleEssay&&(
                  <div style={{background:"#fefce8",border:"1px solid #fbbf24",borderRadius:10,padding:"10px 14px",marginBottom:12,direction:"ltr"}}>
                    <div style={{fontSize:12,color:"#92400e",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6}}>
                      <span style={{fontWeight:700}}>⚠️ Demo Essay: </span>
                      This essay contains intentional mistakes — it's here to show you exactly how the analysis works. Replace it with your own essay to get your real score.
                    </div>
                  </div>
                )}
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
              {!proUser&&usesLeft===1&&(
                <Card style={{background:T.amberBg,border:`1px solid ${T.amberBorder}`,textAlign:"center",direction:lang==="ar"?"rtl":"ltr"}}>
                  <span style={{color:T.amber,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    {lang==="ar"
                      ?"⚠️ هذا هو تحليلك المجاني الوحيد — شاهد كيف يعمل الموقع. "
                      :"⚠️ This is one of your 2 free analyses — see exactly how the platform works. "}
                  </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    {lang==="ar"?"احصل على Pro للتحليل غير المحدود →":"Get Pro for unlimited analyses →"}
                  </button>
                </Card>
              )}
              {!proUser&&usesLeft===0&&(
                <Card style={{background:T.redBg,border:`1px solid ${T.redBorder}`,textAlign:"center",direction:lang==="ar"?"rtl":"ltr"}}>
                  <span style={{color:T.red,fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    {lang==="ar"?"🔒 لقد استخدمت تحليلك المجاني. ":"🔒 You've used your free analysis. "}
                  </span>
                  <button onClick={()=>setShowPaywall(true)} style={{background:"none",border:"none",color:T.primary,fontWeight:700,cursor:"pointer",textDecoration:"underline",fontSize:13,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>
                    {lang==="ar"?"احصل على Pro للتحليل غير المحدود ←":"Upgrade to Pro for unlimited access →"}
                  </button>
                </Card>
              )}
              <button ref={analyzeRef} onClick={analyze} disabled={loading}
                style={{background:loading?T.bgGray:T.primary,border:"none",borderRadius:4,color:loading?T.textMuted:"#fff",fontSize:15,fontWeight:700,padding:"14px 32px",cursor:loading?"not-allowed":"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",transition:"background 0.15s",display:"flex",alignItems:"center",gap:10,justifyContent:"center",letterSpacing:"0.01em"}}>
                {loading?"⏳ Examining...":!proUser&&usesLeft<=0?`🔒 ${lang==="ar"?"احصل على Pro":"Upgrade to Pro"}`:`Analyze ${TASK_TYPES[taskType].label} →`}
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
                      {[["major",T.red,"Major"],["moderate",T.amber,"Moderate"],["minor",T.blue,"Minor"]].map(([s,c,l])=>(
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
                    {/* Disclaimer banner */}
                    <div style={{background:"#fffbeb",border:"1px solid #f59e0b",borderRadius:10,padding:"10px 14px",direction:lang==="ar"?"rtl":"ltr"}}>
                      <div style={{fontSize:12,color:"#92400e",fontFamily:"'Cairo','Source Sans Pro',system-ui",lineHeight:1.6}}>
                        <span style={{fontWeight:700}}>📋 {lang==="ar"?"ملاحظة مهمة:":"Note:"} </span>
                        {lang==="ar"
                          ?"هذا القسم يتحرى عن الأخطاء بدقة أشد مما يفعله محكّم الآيلتس الحقيقي — هدفه تطوير كتابتك، وليس تحديد درجتك. بعض هذه الأخطاء لا تؤثر على درجتك الفعلية في الآيلتس. درجتك الحقيقية تجدها في قسم Scores."
                          :"This section flags errors more strictly than a real IELTS examiner — its purpose is to help you improve your writing, not determine your band score. Many of these are minor style points that would not affect your actual IELTS result. Your official score estimate is in the Scores tab."}
                      </div>
                    </div>
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
        {mainView==="grammar"&&<GrammarChecker isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="exercises"&&<ExercisesHub isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="speaking"&&<SpeakingPage isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="reading"&&<ReadingPage isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="vocabulary"&&<VocabularyPage uiLang={uiLang} isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="placement"&&<PlacementTest uiLang={uiLang} onNavigate={switchView} isPro={proUser}/>}
        {mainView==="contact"&&<ContactPage/>}
        {mainView==="game"&&<IELTSGame proUser={proUser} onNavigate={switchView} uiLang={uiLang} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="pronunciation"&&<PronunciationPage uiLang={uiLang} isPro={proUser} onUpgrade={()=>setShowPaywall(true)}/>}
        {mainView==="studyplan"&&<StudyPlanPage uiLang={uiLang} onNavigate={switchView}/>}
        </div>
      </div>
      )}

      {mainView==="terms"&&<TermsPage onBack={()=>switchView("analyze")}/>}
      {mainView==="privacy"&&<PrivacyPage onBack={()=>switchView("analyze")}/>}
      {mainView==="refund"&&<RefundPage onBack={()=>switchView("analyze")}/>}
      {mainView==="pricing"&&<PricingPage onBack={()=>switchView("analyze")} onUpgrade={()=>setShowPaywall(true)} isPro={proUser} onManageSub={()=>setShowManageSub(true)}/> }
      {mainView==="admin"&&<AdminPage onBack={()=>{ setMainView("analyze"); window.history.replaceState({view:"analyze"},""," /"); }}/>}

      {/* FOOTER */}
      <div style={{background:"#1c1d1f",borderTop:"1px solid #333",padding:"44px 32px",marginTop:60}}>
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
              <span style={{color:"rgba(255,255,255,0.35)",fontSize:12,fontFamily:"'Cairo','Source Sans Pro',system-ui"}}>Professional IELTS preparation platform — Essay Aة للتحضير لامتحان الآيلتس</span>
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
            {/* Nav items — removed, tabs now visible directly on mobile */}
            <div style={{flex:1,overflowY:"auto",padding:"8px 0"}}>
              <div style={{height:1,background:T.border,margin:"8px 20px"}}/>
              <div style={{padding:"8px 20px"}}>
                <div style={{fontSize:11,color:T.textMuted,fontWeight:700,marginBottom:8,fontFamily:"'Cairo',system-ui",direction:"rtl"}}>{UI[uiLang].siteLang}</div>
                <div style={{display:"flex",gap:8}}>
                  {["ar","en"].map(l=>(
                    <button key={l} onClick={()=>{setUiLang(l);try{localStorage.setItem("ef_ui_lang",l);}catch{}}} style={{flex:1,background:lang===l?T.primaryLight:"transparent",border:`1px solid ${lang===l?T.primaryBorder:T.border}`,borderRadius:8,padding:"8px",fontSize:13,fontWeight:lang===l?700:400,color:lang===l?T.primary:T.textMuted,cursor:"pointer",fontFamily:"'Cairo',system-ui"}}>{l==="ar"?"🇸🇦 عربي (AR)":"🇬🇧 English (EN)"}</button>
                  ))}
                </div>
              </div>
            </div>
            {/* Upgrade button at bottom of menu */}
            {/* Upgrade button at bottom of menu */}
            {!proUser&&(
              <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:8}}>
                <button onClick={()=>{setShowPaywall(true);setMenuOpen(false);}} style={{
                  width:"100%",background:T.primary,color:"white",border:"none",
                  borderRadius:8,padding:"14px",fontSize:14,fontWeight:700,
                  cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui",boxShadow:"0 2px 8px rgba(0,86,210,0.35)"
                }}>🔓 Upgrade to Pro — $35</button>
                <button onClick={()=>{setShowPaywall(true);setMenuOpen(false);}} style={{
                  width:"100%",background:"#f0fdf4",color:T.green,border:`1px solid ${T.greenBorder}`,
                  borderRadius:8,padding:"10px",fontSize:13,fontWeight:700,
                  cursor:"pointer",fontFamily:"'Cairo','Source Sans Pro',system-ui"
                }}>🇯🇴 Jordan: Pay 25 JOD via CLIQ</button>
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
        body { font-family: 'Cairo','Source Sans Pro','Inter',system-ui,sans-serif; margin: 0; -webkit-font-smoothing: antialiased; overscroll-behavior: none; -webkit-overflow-scrolling: touch; background: #f9fafb; font-size: 16px; line-height: 1.7; }
        p, li, div { line-height: 1.7; }
        h1, h2, h3 { line-height: 1.3; }
        textarea, input, select, button { font-family: 'Cairo','Source Sans Pro','Inter',system-ui,sans-serif; }
        img { max-width: 100%; height: auto; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #F3F4F6; }
        ::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        @keyframes spin { 0% { transform:rotate(0deg); } 100% { transform:rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }

        /* ── Features grid ── */
        .features-grid { grid-template-columns: repeat(4,1fr) !important; }

        /* ── Direction rules ── */
        /* English content blocks — always LTR */
        .en-content { direction: ltr !important; text-align: left !important; }
        /* Arabic content blocks — always RTL */
        .ar-content { direction: rtl !important; text-align: right !important; }
        /* Content card: tool pages (reading, speaking, toolkit, game) are English-first */
        .content-card h1, .content-card h2, .content-card h3 { direction: ltr; text-align: left; }
        .content-card p { direction: ltr; text-align: left; }
        /* But Arabic labels stay RTL */
        .content-card [lang="ar"], .content-card .ar-label { direction: rtl; text-align: right; }
        /* Reading passages and questions */
        .reading-passage { direction: ltr !important; text-align: left !important; font-family: Georgia, serif !important; line-height: 1.9 !important; }
        @media (max-width: 700px) {
          .placement-reading-grid { grid-template-columns: 1fr !important; }
          .placement-passage { height: auto !important; max-height: 280px !important; overflow-y: auto !important; }
          .placement-questions { height: auto !important; }
          .placement-mobile-notice { display: block !important; }
        }
        .reading-question { direction: ltr !important; text-align: left !important; }
        /* Speaking model answers */
        .speaking-answer { direction: ltr !important; text-align: left !important; line-height: 1.8 !important; }

        @media (max-width: 768px) {
          /* NAV TIER 1 */
          .nav-right { display: none !important; }
          .mobile-top-controls { display: flex !important; }
          .sticky-nav div[style*="height:56"] { padding: 0 12px !important; }

          /* NAV TIER 2 — show all tabs as wrapping rows, no hamburger */
          .hamburger-btn { display: none !important; }
          .mobile-lang-toggle { display: none !important; }
          .mobile-consult-btn { display: none !important; }
          .nav-tabs { display: flex !important; flex-wrap: wrap !important; width: 100% !important; }
          .nav-tabs button { font-size: 11px !important; padding: 8px 7px !important; white-space: nowrap !important; min-height: 36px !important; }
          .sticky-nav { position: sticky !important; top: 0 !important; }

          /* HERO */
          .hero-inner { flex-direction: column-reverse !important; min-height: auto !important; padding: 20px 16px 24px !important; }
          .hero-text { flex: none !important; width: 100% !important; padding: 0 !important; }
          .hero-image { display: flex !important; flex: none !important; width: 100% !important; padding: 0 0 20px 0 !important; }
          .hero-btns { flex-direction: column !important; gap: 12px !important; }
          .hero-btns button { width: 100% !important; }
          .hero-prices { justify-content: center !important; }

          /* FEATURES GRID */
          .features-grid { grid-template-columns: 1fr 1fr !important; gap: 20px !important; }

          /* STATS BAR */
          .stats-inner { gap: 16px !important; padding: 14px 20px !important; flex-wrap: wrap !important; justify-content: center !important; }

          /* CONTENT */
          .content-outer { padding: 0 12px !important; margin: 16px auto 48px !important; }
          .content-card { padding: 20px 16px !important; border-radius: 12px !important; }
          .analyze-box { padding: 18px 14px !important; border-radius: 12px !important; }
          .task-grid { grid-template-columns: 1fr !important; }
          .result-header { padding: 18px 16px !important; }

          /* TABS */
          .tab-row { overflow-x: auto !important; flex-wrap: nowrap !important; -webkit-overflow-scrolling: touch; scrollbar-width: none !important; gap: 6px !important; padding-bottom: 4px !important; }
          .tab-row::-webkit-scrollbar { display: none !important; }
          .tab-row button { padding: 10px 14px !important; font-size: 13px !important; min-height: 42px !important; }

          /* READING */
          .reading-timer { font-size: 18px !important; }

          /* CONTACT & PRICING */
          .contact-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr !important; }

          /* FOOTER */
          .footer-top { flex-direction: column !important; gap: 16px !important; text-align: center !important; }
          .footer-links { flex-wrap: wrap !important; gap: 12px !important; justify-content: center !important; }

          /* MOBILE SPECIFIC */
          .mobile-hide { display: none !important; }
          .writing-subnav { display: none !important; }
          .desktop-game-strip { display: none !important; }
          .upgrade-btn { display: none !important; }
        }

        @media (max-width: 480px) {
          .features-grid { grid-template-columns: 1fr !important; gap: 16px !important; }
        }

        @media (max-width: 380px) {
          .content-card { padding: 14px 12px !important; }
          .tab-row button { padding: 8px 10px !important; font-size: 12px !important; }
        }

        @media (hover: none) and (pointer: coarse) {
          html, body { overscroll-behavior-y: none; touch-action: pan-y; }
        }
      `}</style>
    </div>
  );
}
