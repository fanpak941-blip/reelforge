/**
 * voiceService.js
 *
 * Generates voiceover audio for each 5-second beat using Microsoft Edge-TTS,
 * which is completely free and supports natural-sounding multi-language
 * voices (English, German, Spanish, and 50+ others).
 *
 * Upgrade path: when there are paying users, swap this for ElevenLabs
 * (higher quality, paid) behind the same generateVoiceForBeat() interface —
 * nothing else in the pipeline needs to change.
 */

const { EdgeTTS } = require("node-edge-tts");
const path = require("path");
const fs = require("fs");

// Map our simple "language + gender" choices to real Edge-TTS voice IDs.
const VOICE_MAP = {
  "english-male": "en-US-GuyNeural",
  "english-female": "en-US-JennyNeural",
  "german-male": "de-DE-ConradNeural",
  "german-female": "de-DE-KatjaNeural",
  "spanish-male": "es-ES-AlvaroNeural",
  "spanish-female": "es-ES-ElviraNeural",
};

function resolveVoiceId(language, gender) {
  const key = `${language.toLowerCase()}-${gender.toLowerCase()}`;
  return VOICE_MAP[key] || VOICE_MAP["english-male"];
}

/**
 * Generates one audio file for one beat's text.
 * @returns {Promise<{ filePath: string, durationEstimateSeconds: number }>}
 */
async function generateVoiceForBeat({ text, language, gender, outputDir, beatIndex }) {
  const voice = resolveVoiceId(language, gender);
  const outputPath = path.join(outputDir, `beat_${String(beatIndex).padStart(3, "0")}.mp3`);

  const tts = new EdgeTTS({
    voice,
    lang: language.toLowerCase().startsWith("de") ? "de-DE" : language.toLowerCase().startsWith("es") ? "es-ES" : "en-US",
    outputFormat: "audio-24khz-48kbitrate-mono-mp3",
  });

  await tts.ttsPromise(text, outputPath);

  // Rough duration estimate (real duration is read back during stitching
  // via ffprobe so beats can be padded/trimmed to stay in sync).
  const wordCount = text.split(" ").length;
  const durationEstimateSeconds = wordCount / 2.5;

  return { filePath: outputPath, durationEstimateSeconds };
}

/**
 * Generates voice for every beat in sequence, returning enriched beats
 * with an attached audio file path each.
 */
async function generateVoiceForAllBeats({ beats, language, gender, outputDir }) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const enriched = [];
  for (const beat of beats) {
    const { filePath, durationEstimateSeconds } = await generateVoiceForBeat({
      text: beat.text,
      language,
      gender,
      outputDir,
      beatIndex: beat.index,
    });
    enriched.push({ ...beat, audioPath: filePath, durationEstimateSeconds });
  }
  return enriched;
}

module.exports = { generateVoiceForAllBeats, resolveVoiceId, VOICE_MAP };
