export type StationType = 'intro' | 'teach' | 'twoway' | 'scenario' | 'plan' | 'reflect'
export type RoleKey = 'marketing' | 'java'

export interface Query { at: number; who: string; text: string }
export interface RubricItem { key: string; name: string; hint: string }
export interface AIAnalysis { summary: string; obs: string[]; scores: Record<string, number> }

export interface Step {
  id: string
  type: StationType
  title: string
  durationSec: number
  blurb: string
  topic: string
  image?: string
  queries?: Query[]
  notes?: boolean
  rubric: RubricItem[]
  ai: AIAnalysis
}

export interface Role {
  label: string
  sub: string
  steps: Step[]
}

const INTRO_PROMPT = "In about 90 seconds, tell us:<br>1. Who you are<br>2. What you teach<br>3. One belief that shapes how you teach<br><br>Then, why would you be a good fit for students who may be first-generation graduates, come from Tier-2/3 backgrounds, and use English as a second language?"
const DILEMMA_SCN = 'A student says: "Sir, I\'m thinking of dropping out. My family wants me to start earning, and I feel guilty continuing my studies while they are struggling financially."'
const REFLECT = "In 30 seconds: (1) how do you think you performed today, and (2) one thing you would do differently in a real classroom?"

export const RUBRIC: Record<string, RubricItem[]> = {
  intro: [{ key: "communication", name: "Communication & presence", hint: "On-camera clarity & warmth" }, { key: "motivation", name: "Motivation to teach", hint: "Why they teach" }, { key: "fit", name: "Fit for learner profile", hint: "Suits our students" }],
  teach: [{ key: "mastery", name: "Subject mastery", hint: "Accuracy & depth" }, { key: "clarity", name: "Teaching clarity", hint: "Easy to follow" }, { key: "interruptions", name: "Handling interruptions", hint: "Doubts handled live" }, { key: "pacing", name: "Structure & pacing", hint: "Build-up & timing" }],
  twoway: [{ key: "adaptability", name: "Adaptability", hint: "Switches register" }, { key: "audience", name: "Audience awareness", hint: "Reads the listener" }, { key: "depth", name: "Depth on demand", hint: "Goes deeper well" }],
  doubt: [{ key: "diagnosis", name: "Diagnosing confusion", hint: "Finds the real gap" }, { key: "quality", name: "Explanation quality", hint: "Simple & concrete" }, { key: "check", name: "Checking understanding", hint: "Confirms it landed" }],
  wrong: [{ key: "accuracy", name: "Accuracy", hint: "Fixes the fact" }, { key: "encouragement", name: "Encouragement", hint: "Protects confidence" }, { key: "moment", name: "Teaching-moment creation", hint: "Teaches the whole class" }],
  difficult: [{ key: "composure", name: "Composure", hint: "Calm, not defensive" }, { key: "control", name: "Classroom control", hint: "Re-establishes order" }, { key: "redirection", name: "Respectful redirection", hint: "No humiliation" }],
  dilemma: [{ key: "empathy", name: "Empathy", hint: "Hears them out" }, { key: "judgment", name: "Judgment", hint: "Practical & balanced" }, { key: "escalation", name: "Escalation awareness", hint: "Knows when to refer" }],
  relevance: [{ key: "relevance", name: "Relevance", hint: "Connects to real life" }, { key: "employability", name: "Employability orientation", hint: "Ties to careers" }, { key: "persuasion", name: "Persuasion", hint: "Wins them over" }],
  silent: [{ key: "engagement", name: "Engagement", hint: "Gets a response" }, { key: "confidence", name: "Confidence", hint: "Composed in silence" }, { key: "activation", name: "Classroom activation", hint: "Energises the room" }],
  plan: [{ key: "planning", name: "Planning", hint: "Clear plan" }, { key: "prioritization", name: "Prioritization", hint: "Essentials first" }, { key: "structure", name: "Teaching structure", hint: "Logical build-up" }],
  integrity: [{ key: "integrity", name: "Integrity", hint: "Principled boundary" }, { key: "judgment", name: "Professional judgment", hint: "Sound, fair call" }],
  reflect: [{ key: "selfaware", name: "Self-awareness", hint: "Honest about performance" }, { key: "coachability", name: "Coachability", hint: "Open to growth" }],
}

export const AI: Record<string, AIAnalysis> = {
  intro: { summary: "Clear and warm; gave a genuine teaching belief. Could connect more explicitly to first-gen / Tier-2-3 learners.", obs: ["Spoke clearly at a good pace.", "Stated a real belief, not clichés.", "Learner-fit was implied more than stated."], scores: { communication: 8, motivation: 7, fit: 7 } },
  teach: { summary: "Strong opening and a usable example; handled the early doubts but the last one felt rushed.", obs: ["Defined the idea before the formula.", "Used a relatable, everyday example.", "Momentum dipped after an interruption."], scores: { mastery: 8, clarity: 7, interruptions: 6, pacing: 6 } },
  twoway: { summary: "Two clear registers; the simple version landed, the interview-level version could go deeper.", obs: ["Plain language for the lost student.", "Shifted tone deliberately between the two.", "Advanced version stayed a bit surface-level."], scores: { adaptability: 7, audience: 7, depth: 7 } },
  doubt: { summary: "Found the root confusion and reframed it simply; did not fully confirm understanding.", obs: ["Targeted the real misconception.", "Jargon-light explanation.", "Skipped a check-for-understanding."], scores: { diagnosis: 8, quality: 8, check: 6 } },
  wrong: { summary: "Corrected the error accurately and kindly; could have turned it into a class-wide teaching moment.", obs: ["Fixed the fact precisely.", "Did not embarrass the student.", "Limited use for the whole class."], scores: { accuracy: 8, encouragement: 7, moment: 7 } },
  difficult: { summary: "Stayed calm and non-defensive, then redirected; no mention of a private word after class.", obs: ["Did not match the aggression.", "Re-engaged the class quickly.", "No after-class follow-up mentioned."], scores: { composure: 8, control: 7, redirection: 8 } },
  dilemma: { summary: "Led with empathy and gave practical options; missed pointing to a counsellor or mentor.", obs: ["Heard the student out first.", "Offered real alternatives, not platitudes.", "Did not flag formal support."], scores: { empathy: 9, judgment: 7, escalation: 6 } },
  relevance: { summary: "Tied the topic to careers and re-engaged with energy; leaned on assertion over example.", obs: ["Connected the subject to real jobs.", "Respected the student's view.", "Could add one concrete proof-point."], scores: { relevance: 7, employability: 7, persuasion: 7 } },
  silent: { summary: "Stayed composed in the silence and tried to draw students in; the activation move could be sharper.", obs: ["Did not panic or lecture over the silence.", "Attempted to re-engage the room.", "A pair-share or named, simpler question would land harder."], scores: { engagement: 7, confidence: 8, activation: 6 } },
  plan: { summary: "Clear, sequenced plan with sensible board use; the time felt optimistic for weak students.", obs: ["Logical build-up from basics.", "Specific about board content.", "Underestimated time for the hard part."], scores: { planning: 7, prioritization: 6, structure: 7 } },
  integrity: { summary: "Held a firm, fair boundary without making it personal.", obs: ["Declined the request clearly and fairly.", "Framed it around fairness to all students.", "Stayed professional under social pressure."], scores: { integrity: 8, judgment: 7 } },
  reflect: { summary: "Honest, specific self-assessment with a concrete improvement.", obs: ["Acknowledged what went well and what didn't.", "Named a concrete change for a real classroom.", "Showed openness to feedback."], scores: { selfaware: 7, coachability: 7 } },
}

const baseSteps = (marketingTopics: Partial<Step>[], javaTopics: Partial<Step>[]) => {
  // steps shared across roles with role-specific topics injected
  return { marketingTopics, javaTopics }
}
void baseSteps

export const ROLES: Record<RoleKey, Role> = {
  marketing: {
    label: "MBA · Marketing", sub: "Marketing Management",
    steps: [
      { id: "intro", type: "intro", title: "Intro & teaching philosophy", durationSec: 120, blurb: "A short introduction to the hiring panel.", topic: INTRO_PROMPT, rubric: RUBRIC.intro, ai: AI.intro },
      { id: "teach", type: "teach", title: "Micro-teaching + live doubts", durationSec: 300, blurb: "Teach the topic as if you are teaching a first-year offline class. Student doubts will appear during the session.", topic: "Teach “Price Elasticity of Demand” using a real Indian example.", queries: [{ at: 40, who: "Priya", text: "If the price increases and people still buy it, does that mean demand is inelastic?" }, { at: 100, who: "Rahul", text: "Why are some products affected by price changes and others are not?" }, { at: 180, who: "Sneha", text: "Can you give one example from a brand we use every day?" }], rubric: RUBRIC.teach, ai: AI.teach },
      { id: "twoway", type: "twoway", title: "Explain it two ways", durationSec: 180, blurb: "Explain the same concept twice. Adapt your explanation to the learner.", topic: "Explain “Market Segmentation”.<br><b>Part 1:</b> to a student who is completely lost.<br><b>Part 2:</b> to a student preparing for a marketing internship interview.", rubric: RUBRIC.twoway, ai: AI.twoway },
      { id: "doubt", type: "scenario", title: "Doubt resolution", durationSec: 120, blurb: "A student holds a misconception. Resolve it the way you would in class.", topic: "A student says: “Sir, marketing is basically selling, right?”", image: "step4-marketing.png", rubric: RUBRIC.doubt, ai: AI.doubt },
      { id: "wrong", type: "scenario", title: "The confident wrong answer", durationSec: 120, blurb: "A student answers confidently — and incorrectly. Correct the concept without discouraging them.", topic: "You ask: “What is branding?” A student answers: “Branding is just the logo and tagline.”", image: "step5-marketing.png", rubric: RUBRIC.wrong, ai: AI.wrong },
      { id: "difficult", type: "scenario", title: "Difficult student", durationSec: 120, blurb: "Respond as you would in a live classroom.", topic: "A student interrupts repeatedly and says: “Sir, all this sounds good in theory. How much of it have you actually done in industry?”", image: "step6.png", rubric: RUBRIC.difficult, ai: AI.difficult },
      { id: "dilemma", type: "scenario", title: "Student dilemma", durationSec: 150, blurb: "Respond to the student as if they are sitting in front of you.", topic: DILEMMA_SCN, image: "step7.png", rubric: RUBRIC.dilemma, ai: AI.dilemma },
      { id: "relevance", type: "scenario", title: "Why should I study this?", durationSec: 120, blurb: "A student questions the relevance of the subject.", topic: "A student says: “I don’t want a marketing job. Why do I need to learn this?”", image: "step8-marketing.png", rubric: RUBRIC.relevance, ai: AI.relevance },
      { id: "silent", type: "scenario", title: "Silent classroom", durationSec: 120, blurb: "You ask a question and nobody responds.", topic: "You ask the class: “Can anyone give an example of good brand positioning?” Nobody responds. What do you do next?", image: "step9.png", rubric: RUBRIC.silent, ai: AI.silent },
      { id: "plan", type: "plan", title: "Lesson planning", durationSec: 90, blurb: "Write your lesson plan, then record a short spoken explanation.", topic: "Topic: “The Marketing Funnel” — students have never heard the concept before.<br>Cover: how you would start · what examples you would use · what goes on the board · how you would check understanding.", notes: true, rubric: RUBRIC.plan, ai: AI.plan },
      { id: "integrity", type: "scenario", title: "Integrity check", durationSec: 120, blurb: "A professional judgment scenario.", topic: "A student asks you to increase his internal marks because his family has strong industry connections. What do you do?", image: "step11-marketing.png", rubric: RUBRIC.integrity, ai: AI.integrity },
      { id: "reflect", type: "reflect", title: "Reflection", durationSec: 60, blurb: "A short reflection on how your session went.", topic: REFLECT, rubric: RUBRIC.reflect, ai: AI.reflect },
    ]
  },
  java: {
    label: "B.Tech CS · Java", sub: "Programming in Java",
    steps: [
      { id: "intro", type: "intro", title: "Intro & teaching philosophy", durationSec: 120, blurb: "A short introduction to the hiring panel.", topic: INTRO_PROMPT, rubric: RUBRIC.intro, ai: AI.intro },
      { id: "teach", type: "teach", title: "Micro-teaching + live doubts", durationSec: 300, blurb: "Teach the topic as if you are teaching a first-year offline class. Student doubts will appear during the session.", topic: "Teach the “for loop” to first-year students who have recently learned variables.", queries: [{ at: 40, who: "Aditya", text: "How does the loop know when to stop?" }, { at: 110, who: "Neha", text: "What happens if I forget to update the counter variable?" }, { at: 180, who: "Karan", text: "When would I use a loop in a real program?" }], rubric: RUBRIC.teach, ai: AI.teach },
      { id: "twoway", type: "twoway", title: "Explain it two ways", durationSec: 180, blurb: "Explain the same concept twice. Adapt your explanation to the learner.", topic: "Explain the difference between a Class and an Object.<br><b>Part 1:</b> to a student seeing programming for the first time.<br><b>Part 2:</b> to a student preparing for a technical interview.", rubric: RUBRIC.twoway, ai: AI.twoway },
      { id: "doubt", type: "scenario", title: "Doubt resolution", durationSec: 120, blurb: "A student holds a misconception. Resolve it the way you would in class.", topic: "A student says: “Sir, Java and JavaScript are basically the same thing, right?”", image: "step4-java.png", rubric: RUBRIC.doubt, ai: AI.doubt },
      { id: "wrong", type: "scenario", title: "The confident wrong answer", durationSec: 120, blurb: "A student answers confidently — and incorrectly. Correct the concept without discouraging them.", topic: "You ask: “What makes a program correct?” A student answers: “If the code runs once without errors, it means the program is correct.”", image: "step5-java.png", rubric: RUBRIC.wrong, ai: AI.wrong },
      { id: "difficult", type: "scenario", title: "Difficult student", durationSec: 120, blurb: "Respond as you would in a live classroom.", topic: "A student interrupts repeatedly and says: “Sir, everything you’re teaching is already available on YouTube.”", image: "step6.png", rubric: RUBRIC.difficult, ai: AI.difficult },
      { id: "dilemma", type: "scenario", title: "Student dilemma", durationSec: 150, blurb: "Respond to the student as if they are sitting in front of you.", topic: DILEMMA_SCN, image: "step7.png", rubric: RUBRIC.dilemma, ai: AI.dilemma },
      { id: "relevance", type: "scenario", title: "Why should I study this?", durationSec: 120, blurb: "A student questions the relevance of the subject.", topic: "A student says: “AI can already write code. Why do I need to learn Java?”", image: "step8-java.png", rubric: RUBRIC.relevance, ai: AI.relevance },
      { id: "silent", type: "scenario", title: "Silent classroom", durationSec: 120, blurb: "You ask a question and nobody responds.", topic: "You ask the class: “When would you use an ArrayList instead of an Array?” Nobody responds. What do you do next?", image: "step9.png", rubric: RUBRIC.silent, ai: AI.silent },
      { id: "plan", type: "plan", title: "Lesson planning", durationSec: 90, blurb: "Write your lesson plan, then record a short spoken explanation.", topic: "Topic: “Arrays vs ArrayList” — students struggle with programming basics.<br>Cover: how you would start · what examples you would use · what goes on the board · how you would check understanding.", notes: true, rubric: RUBRIC.plan, ai: AI.plan },
      { id: "integrity", type: "scenario", title: "Integrity check", durationSec: 120, blurb: "A professional judgment scenario.", topic: "A student asks you to share the coding test questions before the assessment. What do you do?", image: "step11-java.png", rubric: RUBRIC.integrity, ai: AI.integrity },
      { id: "reflect", type: "reflect", title: "Reflection", durationSec: 60, blurb: "A short reflection on how your session went.", topic: REFLECT, rubric: RUBRIC.reflect, ai: AI.reflect },
    ]
  }
}
