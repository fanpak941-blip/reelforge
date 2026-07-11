/**
 * scriptService.js
 *
 * Two jobs:
 *  1. If the user pasted their own script -> just validate/clean it.
 *  2. If the user gave only a topic + niche -> write a script for them,
 *     timed to the requested duration, using Groq's free-tier LLM API
 *     (OpenAI-compatible endpoint, Llama 3.1 models, generous free quota).
 */

const axios = require("axios");

const WORDS_PER_MINUTE = 150;

const NICHE_PROMPTS = {
  "make-money-online": "a practical, no-fluff make-money-online tip with one concrete actionable step",
  "ai-technology": "an accessible explainer on an AI/tech trend, written for a non-technical viewer",
  programming: "a quick, useful programming tip or concept explained simply",
  "mobile-apps": "a roundup or tip about mobile apps that solves a real problem",
  gaming: "an energetic gaming tip, news angle, or strategy breakdown",
  "trading-crypto": "an educational (non-financial-advice) breakdown of a trading/crypto concept",
  ecommerce: "a tactical e-commerce/dropshipping tip for sellers on eBay, Shopify, or Etsy",
  "health-fitness": "a motivating, practical fitness tip grounded in real technique",
  "diet-nutrition": "a clear, myth-busting nutrition tip backed by general consensus",
  "beauty-skincare": "a skincare or beauty routine tip explained simply",
  travel: "a vivid, practical travel tip or destination highlight",
  "food-recipes": "a simple, appetizing recipe or cooking tip",
  education: "a study tip or learning technique explained clearly",
  freelancing: "a practical freelancing tip about clients, pricing, or workflow",
  "personal-finance": "a clear, actionable personal finance tip (not financial advice)",
  "home-decoration": "a simple, visual home decor tip or trend",
  pets: "a warm, practical pet care tip",
  fashion: "a styling tip or trend explained with personality",
  "photography-video": "a practical photography or video editing tip",
  "graphic-design": "a quick, useful graphic design principle or tool tip",
};

async function generateScript({ topic, niche, durationMinutes, language = "English" }) {
  const targetWords = Math.round(WORDS_PER_MINUTE * durationMinutes);
  const nicheGuidance = NICHE_PROMPTS[niche] || "an engaging, useful short-form video topic";

  const systemPrompt = `You write spoken-word YouTube scripts. Output ONLY the script text the narrator will read aloud — no stage directions, no headers, no markdown, no "[pause]" tags. Write in ${language}. Keep sentences short and punchy, built for voiceover pacing.`;

  const userPrompt = `Write a ${durationMinutes}-minute video script (~${targetWords} words) about: "${topic}".
This should be ${nicheGuidance}.
Open with a strong hook in the first sentence. End with a short call-to-action.`;

  const response = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.1-70b-versatile",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  return response.data.choices[0].message.content.trim();
}

/**
 * Cleans a user-pasted script: collapse whitespace, strip stage directions
 * in brackets/parens that wouldn't make sense read aloud.
 */
function cleanPastedScript(rawScript) {
  return rawScript
    .replace(/\[[^\]]*\]/g, "") // strip [pause], [music], etc.
    .replace(/\s+/g, " ")
    .trim();
}

module.exports = { generateScript, cleanPastedScript, NICHE_PROMPTS };
