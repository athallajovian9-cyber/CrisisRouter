// lib/crisisRouter.ts
// Pure deterministic crisis router logic — no network, no LLM, no framework imports.
// Imported by app/api/crisis-router/route.ts and by tests.


/* ------------------------------- domain types ------------------------------ */

type Category = "Food" | "Shelter" | "Medical" | "Financial";
type Urgency = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface CrisisRoutePayload {
  primary_categories: Category[];
  urgency_level: Urgency;
  search_tokens: string[];
  actionable_next_steps: string[];
}

interface ErrorPayload {
  error: string;
}

/** [normalized term, weight] — weights: 3 strong/unambiguous, 2 moderate, 1 weak. */
type Lexicon = readonly (readonly [string, number])[];

/* -------------------------------- constants -------------------------------- */

const MAX_QUERY_LENGTH = 8_000;
const MAX_CATEGORIES = 3;
const MAX_TOKENS = 8;
const MAX_STEPS = 8;

/** Canonical tie-break order — guarantees stable output for identical scores. */
const CATEGORY_ORDER: readonly Category[] = ["Food", "Shelter", "Medical", "Financial"];

/**
 * Baseline-needs fallback used only when zero category signals are detected.
 * A crisis router must never return an empty category array to the directory layer.
 */
const FALLBACK_CATEGORIES: readonly Category[] = ["Food", "Shelter"];

const CATEGORY_LEXICON: Record<Category, Lexicon> = {
  Food: [
    ["food bank", 3],
    ["foodbank", 3],
    ["food pantry", 3],
    ["pantry", 3],
    ["soup kitchen", 3],
    ["free meal", 3],
    ["hot meal", 3],
    ["free meals", 3],
    ["meals on wheels", 3],
    ["snap", 3],
    ["ebt", 3],
    ["wic", 3],
    ["groceries", 3],
    ["grocery", 3],
    ["grocery store", 3],
    ["food assistance", 3],
    ["food stamps", 3],
    ["food stamps card", 3],
    ["feeding america", 3],
    ["emergency food", 3],
    ["no food", 3],
    ["cant afford food", 3],
    ["cannot afford food", 3],
    ["cant afford groceries", 3],
    ["cant eat", 3],
    ["cannot eat", 3],
    ["food desert", 3],
    ["baby food", 3],
    ["baby formula", 3],
    ["formula", 2],
    ["hunger", 2],
    ["hungry", 2],
    ["starving", 2],
    ["starve", 2],
    ["starving kids", 3],
    ["family hungry", 3],
    ["meal", 2],
    ["meals", 2],
    ["eat", 2],
    ["eating", 2],
    ["nutrition program", 2],
    ["summer meals", 2],
    ["school lunch", 2],
    ["school meals", 2],
    ["food line", 2],
    ["food distribution", 2],
    ["free breakfast", 2],
    ["free lunch", 2],
    ["free dinner", 2],
    ["community kitchen", 2],
    ["food vouchers", 2],
    ["grocery vouchers", 2],
    ["diapers", 1],
    ["food", 1],
    ["meal replacement", 1],
  ],
  Shelter: [
    ["emergency shelter", 3],
    ["overnight shelter", 3],
    ["homeless shelter", 3],
    ["shelter bed", 3],
    ["shelter", 3],
    ["homeless", 3],
    ["no home", 3],
    ["lost my home", 3],
    ["eviction", 3],
    ["evicted", 3],
    ["evict", 3],
    ["eviction notice", 3],
    ["illegal eviction", 3],
    ["forcible entry", 3],
    ["foreclosure", 3],
    ["warming center", 3],
    ["cooling center", 3],
    ["transitional housing", 3],
    ["emergency housing", 3],
    ["supportive housing", 3],
    ["section 8", 3],
    ["housing authority", 3],
    ["motel voucher", 3],
    ["hotel voucher", 3],
    ["safe house", 3],
    ["safe home", 3],
    ["refuge", 3],
    ["nowhere to go", 3],
    ["no place to stay", 3],
    ["no place to sleep", 3],
    ["nowhere to sleep", 3],
    ["nowhere to live", 3],
    ["nothing to eat", 2],
    ["sleeping in my car", 3],
    ["living in my car", 3],
    ["sleeping outside", 3],
    ["sleeping on the street", 3],
    ["sleeping rough", 3],
    ["living on the street", 3],
    ["on the streets", 3],
    ["couch surfing", 2],
    ["couch hopping", 2],
    ["bouncing around", 2],
    ["kicked out", 3],
    ["kicked out of my house", 3],
    ["thrown out", 3],
    ["threw me out", 3],
    ["no place to live", 3],
    ["landlord", 2],
    ["landlord kicking me out", 3],
    ["rent due", 2],
    ["back rent", 2],
    ["behind on rent", 2],
    ["lost my apartment", 3],
    ["losing my apartment", 3],
    ["losing my home", 3],
    ["tent", 2],
    ["encampment", 2],
    ["living in a tent", 3],
    ["domestic violence", 3],
    ["domestic abuse", 3],
    ["fleeing abuse", 3],
    ["leaving abusive partner", 3],
    ["abusive relationship", 3],
    ["abusive husband", 3],
    ["abusive wife", 3],
    ["boyfriend hitting me", 3],
    ["partner hitting me", 3],
    ["violence at home", 3],
    ["unsafe at home", 3],
    ["hitting me", 3],
    ["hits me", 3],
    ["hurting me", 3],
    ["beating me", 3],
    ["yells at me", 2],
    ["screaming at me", 2],
    ["destroying my things", 2],
    ["controlling me", 2],
    ["isolating me", 2],
    ["scared of my", 2],
    ["afraid of my", 2],
    ["need shelter", 3],
    ["emergency bed", 3],
    ["youth shelter", 3],
    ["family shelter", 3],
    ["women shelter", 3],
    ["women's shelter", 3],
    ["housing", 1],
    ["rent", 1],
    ["room", 1],
    ["stay", 1],
    ["motel", 2],
    ["hotel", 2],
    ["place to stay", 3],
  ],
  Medical: [
    ["emergency room", 3],
    ["er visit", 3],
    ["free clinic", 3],
    ["sliding scale clinic", 3],
    ["community health", 3],
    ["urgent care", 3],
    ["walk in clinic", 3],
    ["walk-in clinic", 3],
    ["county hospital", 3],
    ["charity hospital", 3],
    ["prescription", 3],
    ["cant afford medication", 3],
    ["cannot afford medication", 3],
    ["cant afford my medication", 3],
    ["need medication", 3],
    ["need medicine", 3],
    ["cant pay for medication", 3],
    ["refill", 2],
    ["prescription assistance", 3],
    ["patient assistance program", 3],
    ["medication", 3],
    ["insulin", 3],
    ["out of insulin", 3],
    ["need insulin", 3],
    ["inhaler", 3],
    ["epipen", 3],
    ["overdose", 3],
    ["overdosed", 3],
    ["withdrawal", 3],
    ["detox", 3],
    ["detox center", 3],
    ["substance abuse", 3],
    ["drug rehab", 3],
    ["alcohol rehab", 3],
    ["naloxone", 3],
    ["narcan", 3],
    ["need a doctor", 3],
    ["cant see a doctor", 3],
    ["no insurance", 3],
    ["uninsured", 3],
    ["underinsured", 3],
    ["need insurance", 3],
    ["health insurance", 2],
    ["medicaid", 3],
    ["medicare", 2],
    ["dental", 2],
    ["dentist", 2],
    ["toothache", 2],
    ["tooth pain", 2],
    ["broken tooth", 2],
    ["eye exam", 2],
    ["glasses", 1],
    ["eye care", 2],
    ["mental health", 3],
    ["mental health crisis", 3],
    ["therapist", 2],
    ["counseling", 2],
    ["counselor", 2],
    ["psychiatric", 2],
    ["psychiatrist", 2],
    ["psych eval", 3],
    ["panic attack", 3],
    ["anxiety attack", 3],
    ["having a panic attack", 3],
    ["depression", 2],
    ["depressed", 2],
    ["cptsd", 2],
    ["ptsd", 2],
    ["need a therapist", 3],
    ["doctor", 2],
    ["hospital", 2],
    ["medicine", 2],
    ["pills", 2],
    ["pharmacy", 2],
    ["cant afford doctor", 3],
    ["sick", 2],
    ["illness", 2],
    ["infection", 2],
    ["injury", 2],
    ["injured", 2],
    ["pain", 2],
    ["chronic pain", 2],
    ["need a dentist", 3],
    ["need dental", 3],
    ["free dental", 3],
    ["dental clinic", 3],
    ["hiv test", 2],
    ["sti test", 2],
    ["std testing", 2],
    ["pregnancy care", 2],
    ["prenatal", 2],
    ["prenatal care", 3],
    ["family planning", 2],
    ["vaccination", 2],
    ["vaccine", 2],
    ["physical therapy", 2],
    ["wheelchair", 2],
    ["medical bills", 2],
    ["health", 1],
    ["medical", 1],
    ["hurt", 1],
    ["clinic", 1],
    ["nurse", 2],
    ["paramedic", 2],
    ["therapy", 2],
    ["rehab", 2],
  ],
  Financial: [
    ["cash assistance", 3],
    ["general assistance", 3],
    ["emergency cash", 3],
    ["rent assistance", 3],
    ["help with rent", 3],
    ["cant afford rent", 3],
    ["utility assistance", 3],
    ["utility shut off", 3],
    ["utility shutoff", 3],
    ["shutoff notice", 3],
    ["shut off notice", 3],
    ["disconnection notice", 3],
    ["power is off", 3],
    ["electricity off", 3],
    ["no electricity", 3],
    ["no power", 3],
    ["no gas", 3],
    ["no water", 3],
    ["no heat", 3],
    ["heat shut off", 3],
    ["water shut off", 3],
    ["electric bill", 3],
    ["electricity bill", 3],
    ["gas bill", 3],
    ["water bill", 3],
    ["phone bill", 3],
    ["internet bill", 3],
    ["cant pay bills", 3],
    ["cant pay my bills", 3],
    ["cant afford bills", 3],
    ["security deposit", 3],
    ["first month rent", 3],
    ["tanf", 3],
    ["t anf", 3],
    ["cash aid", 3],
    ["ssi", 3],
    ["ssdi", 3],
    ["social security", 3],
    ["disability benefits", 3],
    ["unemployment", 3],
    ["unemployment benefits", 3],
    ["unemployment insurance", 3],
    ["lost my job", 3],
    ["lost job", 3],
    ["got fired", 3],
    ["laid off", 3],
    ["job layoff", 3],
    ["workforce center", 3],
    ["career center", 2],
    ["eviction payment", 3],
    ["late fee", 2],
    ["overdraft", 2],
    ["bank fees", 2],
    ["repossessed", 3],
    ["car repossessed", 3],
    ["car payment", 2],
    ["loan payment", 2],
    ["debt collection", 2],
    ["collections call", 2],
    ["garnishment", 2],
    ["wage garnishment", 3],
    ["tax refund", 2],
    ["stimulus check", 2],
    ["benefits", 2],
    ["food vouchers", 2],
    ["clothing vouchers", 2],
    ["bus pass", 2],
    ["bus fare", 2],
    ["gas money", 2],
    ["money for gas", 2],
    ["gas money for work", 3],
    ["job interview", 2],
    ["interview outfit", 2],
    ["childcare assistance", 3],
    ["daycare assistance", 3],
    ["free daycare", 3],
    ["child care subsidy", 3],
    ["head start", 3],
    ["weatherization", 2],
    ["furnace assistance", 3],
    ["heating assistance", 3],
    ["liheap", 3],
    ["liheap program", 3],
    ["energy assistance", 3],
    ["project warm", 3],
    ["tax preparation", 1],
    ["money", 2],
    ["cash", 2],
    ["bills", 2],
    ["bill", 2],
    ["utility", 2],
    ["debt", 2],
    ["paycheck", 2],
    ["income", 2],
    ["pay stub", 2],
    ["minimum wage", 2],
    ["two jobs", 2],
    ["second job", 2],
    ["overtime", 1],
    ["afford", 1],
    ["cost", 1],
    ["pay", 1],
    ["diaper", 2],
    ["diapers", 1],
  ],
};

/** Any hit escalates to CRITICAL — safety-dominant, never overridden. */
const CRITICAL_MARKERS: readonly string[] = [
  "suicidal",
  "suicide",
  "kill myself",
  "killing myself",
  "end my life",
  "end it all",
  "want to die",
  "wanna die",
  "want to kill myself",
  "plan to kill myself",
  "overdose",
  "overdosed",
  "took all my pills",
  "took too many pills",
  "pills and alcohol",
  "hurt myself",
  "harm myself",
  "self harm",
  "self-harm",
  "cutting myself",
  "cut myself",
  "burning myself",
  "not breathing",
  "cant breathe",
  "cannot breathe",
  "struggling to breathe",
  "chest pain",
  "heart attack",
  "stroke",
  "seizure",
  "unconscious",
  "passed out",
  "not waking up",
  "bleeding heavily",
  "severe bleeding",
  "cant stop bleeding",
  "anaphylaxis",
  "allergic reaction",
  "throat closing",
  "insulin shock",
  "diabetic emergency",
  "blood sugar",
  "hypothermia",
  "heat stroke",
  "freezing",
  "freezing to death",
  "no food for days",
  "havent eaten",
  "have not eaten",
  "days without food",
  "days without eating",
  "no food left",
  "out of insulin",
  "baby has no formula",
  "children are hungry",
  "kids are starving",
  "my baby is hungry",
  "being attacked",
  "someone is attacking",
  "someone trying to kill me",
  "someone is trying to hurt me",
  "threatened me",
  "threatening me",
  "gun",
  "gun pointed at me",
  "knife",
  "weapon",
  "in danger",
  "unsafe right now",
  "nowhere safe",
  "no safe place",
  "afraid to go home",
  "scared to go home",
  "being abused",
  "being beaten",
  "he is hitting me",
  "she is hitting me",
  "he beat me up",
  "she beat me up",
];

/** weight 10 toward the urgency score. */
const HIGH_MARKERS: readonly string[] = [
  "tonight",
  "today",
  "tomorrow",
  "right now",
  "immediately",
  "urgent",
  "asap",
  "emergency",
  "ran out",
  "out of medication",
  "kicked out",
  "evicted",
  "eviction notice",
  "shutoff notice",
  "shut off notice",
  "nowhere to go",
  "no place to stay",
  "sleeping outside",
  "sleeping in my car",
  "on the street",
  "streets",
  "desperate",
  "cant wait",
  "this week",
  "no money",
  "no electricity",
  "no power",
  "no heat",
  "no water",
  "lost my job",
  "got fired",
  "laid off",
  "hours cut",
  "behind on rent",
  "behind on bills",
  "about to be homeless",
  "getting kicked out",
  "leaving tonight",
  "by tonight",
  "need shelter",
  "need a shelter",
  "need somewhere to sleep",
  "pantry closes",
  "benefits run out",
  "insurance ran out",
  "lost insurance",
  "eviction court",
  "court date",
  "final notice",
  "past due",
  "overdue",
];

/** weight 1 toward the urgency score. */
const MEDIUM_MARKERS: readonly string[] = [
  "soon",
  "next week",
  "few days",
  "struggling",
  "struggle",
  "behind",
  "overdue",
  "worried",
  "worrying",
  "scared",
  "afraid",
  "anxious",
  "anxiety",
  "stressed",
  "overwhelmed",
  "cant afford",
  "cannot afford",
  "cant pay",
  "cannot pay",
  "need help",
  "need assistance",
  "need resources",
  "looking for",
  "searching for",
  "searching",
  "applying",
  "application",
  "applied already",
  "denied",
  "turned away",
  "referred here",
  "part time",
  "minimum wage",
  "notice",
  "this month",
  "next month",
  "borrowing money",
  "asking for help",
  "anyone know",
  "where can i",
  "how can i",
  "how do i",
  "where to go",
  "who can help",
];

/** DB-query signal terms, ordered most-specific-first to maximize precision. */
const SIGNAL_TERMS: readonly string[] = [
  "food bank",
  "food pantry",
  "soup kitchen",
  "meals on wheels",
  "free meal",
  "free meals",
  "hot meal",
  "snap",
  "ebt",
  "wic",
  "food stamps",
  "food assistance",
  "emergency food",
  "formula",
  "baby formula",
  "diapers",
  "groceries",
  "emergency shelter",
  "overnight shelter",
  "homeless shelter",
  "family shelter",
  "women shelter",
  "youth shelter",
  "warming center",
  "cooling center",
  "motel voucher",
  "hotel voucher",
  "transitional housing",
  "emergency housing",
  "supportive housing",
  "safe house",
  "section 8",
  "housing authority",
  "eviction notice",
  "eviction",
  "illegal eviction",
  "foreclosure",
  "rent assistance",
  "help with rent",
  "security deposit",
  "homeless",
  "place to stay",
  "free clinic",
  "walk in clinic",
  "urgent care",
  "charity hospital",
  "county hospital",
  "community health",
  "prescription",
  "prescription assistance",
  "insulin",
  "inhaler",
  "epipen",
  "medication",
  "medicaid",
  "no insurance",
  "dental clinic",
  "free dental",
  "mental health",
  "mental health crisis",
  "panic attack",
  "substance abuse",
  "drug rehab",
  "detox",
  "withdrawal",
  "prenatal care",
  "cash assistance",
  "general assistance",
  "tanf",
  "ssi",
  "ssdi",
  "disability benefits",
  "unemployment",
  "unemployment benefits",
  "laid off",
  "lost my job",
  "utility assistance",
  "utility shutoff",
  "shutoff notice",
  "electric bill",
  "gas bill",
  "water bill",
  "heating assistance",
  "energy assistance",
  "liheap",
  "childcare assistance",
  "free daycare",
  "bus fare",
  "bus pass",
  "rent",
];

/** Removed from token fallback extraction only — never from lexicon matching. */
const STOPWORDS: ReadonlySet<string> = new Set([
  "a", "about", "after", "again", "all", "am", "an", "and", "any", "are", "as", "at",
  "be", "because", "been", "before", "being", "but", "by", "can", "cant", "could",
  "did", "do", "does", "doing", "dont", "down", "during", "each", "few", "for", "from",
  "get", "got", "had", "has", "have", "having", "he", "her", "here", "hers", "him",
  "his", "how", "i", "if", "im", "in", "into", "is", "it", "its", "ive", "just",
  "like", "me", "more", "most", "my", "need", "no", "nor", "not", "now", "of", "off",
  "on", "once", "only", "or", "other", "our", "out", "over", "own", "please", "she",
  "should", "so", "some", "such", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
  "up", "us", "very", "was", "we", "were", "what", "when", "where", "which", "while",
  "who", "whom", "why", "will", "with", "would", "you", "your", "yours",
]);

const BASE_STEPS: Record<Category, readonly string[]> = {
  Food: [
    "Query the resource directory for food pantries and hot-meal sites within 5 miles",
    "Apply for SNAP/EBT benefits through the state benefits portal",
    "Request an emergency food box from a local distribution center",
  ],
  Shelter: [
    "Query the resource directory for emergency shelter and warming-center beds",
    "Contact the local housing authority about emergency rental assistance",
    "Request a motel voucher through the coordinated entry system",
  ],
  Medical: [
    "Query the resource directory for free and sliding-scale clinics",
    "Contact a community health center for same-day triage",
    "Request prescription assistance through a patient-assistance program",
  ],
  Financial: [
    "Query the resource directory for emergency cash and utility assistance programs",
    "Apply for TANF/General Assistance through the county human services office",
    "Request a utility shutoff moratorium from the provider",
  ],
};

const CRITICAL_STEPS: readonly string[] = [
  "Call 911 immediately if there is active medical or physical danger",
  "Call or text 988 for immediate mental-health crisis support",
];

const HIGH_STEPS: readonly string[] = [
  "Call 211 now to reach a live crisis navigator",
];

const CLARIFY_STEP = "Escalate to a 211 specialist to clarify the specific unmet need";

/* --------------------------------- helpers --------------------------------- */

/**
 * Folds arbitrary emotional text into a lowercase, punctuation-free, space-padded
 * token stream. Apostrophes/smart quotes are DELETED (not spaced) so "can't" -> "cant".
 * Character class is linear (no nested quantifiers) — ReDoS-safe.
 */
function normalizeQuery(raw: string): string {
  const normalized = raw
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc\u0060']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length === 0 ? " " : ` ${normalized} `;
}

/** Whole-term membership test against a space-padded haystack. */
function containsTerm(padded: string, term: string): boolean {
  return padded.includes(` ${term} `);
}

function pushUnique(list: string[], value: string): void {
  if (list.length >= MAX_TOKENS) return;
  if (!list.includes(value)) list.push(value);
}

function scoreLexicon(padded: string, lexicon: Lexicon): number {
  let score = 0;
  for (const [term, weight] of lexicon) {
    if (containsTerm(padded, term)) score += weight;
  }
  return score;
}

function countMarkers(padded: string, markers: readonly string[]): number {
  let hits = 0;
  for (const marker of markers) {
    if (containsTerm(padded, marker)) hits += 1;
  }
  return hits;
}

function rankCategories(padded: string): Category[] {
  const scored: Array<{ category: Category; score: number; order: number }> = [];

  for (let i = 0; i < CATEGORY_ORDER.length; i += 1) {
    const category = CATEGORY_ORDER[i];
    const score = scoreLexicon(padded, CATEGORY_LEXICON[category]);
    if (score > 0) scored.push({ category, score, order: i });
  }

  scored.sort((a, b) => (b.score - a.score) || (a.order - b.order));

  const ranked = scored.slice(0, MAX_CATEGORIES).map((entry) => entry.category);
  return ranked.length > 0 ? ranked : [...FALLBACK_CATEGORIES];
}

function evaluateUrgency(padded: string): Urgency {
  if (countMarkers(padded, CRITICAL_MARKERS) > 0) return "CRITICAL";

  const score =
    countMarkers(padded, HIGH_MARKERS) * 10 +
    countMarkers(padded, MEDIUM_MARKERS);

  if (score >= 10) return "HIGH";
  if (score >= 3) return "MEDIUM";
  return "LOW";
}

function extractTokens(padded: string, categories: readonly Category[]): string[] {
  const tokens: string[] = [];

  // 1) Ordered DB signal terms (most specific first).
  for (const term of SIGNAL_TERMS) {
    if (tokens.length >= MAX_TOKENS) break;
    if (containsTerm(padded, term)) pushUnique(tokens, term);
  }

  // 2) Single-word category signals already located, ordered by first occurrence in the query.
  const singles: string[] = [];
  for (const category of categories) {
    for (const [term, weight] of CATEGORY_LEXICON[category]) {
      if (weight >= 2 && !term.includes(" ") && containsTerm(padded, term)) {
        singles.push(term);
      }
    }
  }
  singles.sort((a, b) => padded.indexOf(` ${a} `) - padded.indexOf(` ${b} `));
  for (const term of singles) {
    if (tokens.length >= MAX_TOKENS) break;
    pushUnique(tokens, term);
  }

  // 3) Content-word fallback so the directory query is never token-empty.
  if (tokens.length === 0) {
    for (const word of padded.trim().split(" ")) {
      if (tokens.length >= 4) break;
      if (word.length >= 4 && !STOPWORDS.has(word)) pushUnique(tokens, word);
    }
  }

  return tokens;
}

function buildNextSteps(categories: readonly Category[], urgency: Urgency): string[] {
  const steps: string[] = [];

  if (urgency === "CRITICAL") {
    for (const step of CRITICAL_STEPS) steps.push(step);
  } else if (urgency === "HIGH") {
    for (const step of HIGH_STEPS) steps.push(step);
  }

  for (const category of categories) {
    for (const step of BASE_STEPS[category]) {
      if (steps.length >= MAX_STEPS) break;
      if (!steps.includes(step)) steps.push(step);
    }
  }

  if (steps.length < MAX_STEPS && !steps.includes(CLARIFY_STEP)) steps.push(CLARIFY_STEP);

  return steps.slice(0, MAX_STEPS);
}

function buildPayload(userQuery: string): CrisisRoutePayload {
  const padded = ` ${normalizeQuery(userQuery)} `;

  const primary_categories = rankCategories(padded);
  const urgency_level = evaluateUrgency(padded);
  const search_tokens = extractTokens(padded, primary_categories);
  const actionable_next_steps = buildNextSteps(primary_categories, urgency_level);

  return {
    primary_categories,
    urgency_level,
    search_tokens,
    actionable_next_steps,
  };
}

/* ------------------------------ test exports ------------------------------- */
export {
  normalizeQuery,
  rankCategories,
  evaluateUrgency,
  extractTokens,
  buildNextSteps,
  buildPayload,
  CATEGORY_LEXICON,
  CRITICAL_MARKERS,
};