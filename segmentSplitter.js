/**
 * segmentSplitter.js
 *
 * Takes a full script (string) and breaks it into ~5-second "beats".
 * This is the heart of the "5 sec visual -> 5 sec voice -> repeat" pipeline:
 * every beat returned here becomes exactly one visual clip + one voice clip
 * that get stitched back-to-back by the stitch service.
 *
 * Average natural speaking pace ~ 2.5 words/second (150 wpm), so a 5-second
 * beat holds roughly 12-13 words. We split on sentence boundaries first,
 * then pack words into ~5s chunks so we don't cut a sentence awkwardly
 * mid-word.
 */

const WORDS_PER_SECOND = 2.5;
const BEAT_SECONDS = 5;
const WORDS_PER_BEAT = Math.round(WORDS_PER_SECOND * BEAT_SECONDS); // ~12-13 words

function splitIntoSentences(script) {
  return script
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

/**
 * @param {string} script - full script text
 * @param {number} targetDurationSeconds - desired total video length
 * @returns {Array<{ index: number, startTime: number, endTime: number, text: string }>}
 */
function splitIntoBeats(script, targetDurationSeconds) {
  const sentences = splitIntoSentences(script);
  const beats = [];
  let currentWords = [];

  const flushBeat = () => {
    if (currentWords.length === 0) return;
    beats.push(currentWords.join(" "));
    currentWords = [];
  };

  for (const sentence of sentences) {
    const words = sentence.split(" ");
    for (const word of words) {
      currentWords.push(word);
      if (currentWords.length >= WORDS_PER_BEAT) {
        flushBeat();
      }
    }
  }
  flushBeat();

  // Attach timestamps (5s each, sequential) — this is what the frontend
  // timeline strip visualizes as 00:00, 00:05, 00:10, ...
  const timedBeats = beats.map((text, i) => ({
    index: i,
    startTime: i * BEAT_SECONDS,
    endTime: (i + 1) * BEAT_SECONDS,
    text,
  }));

  // Sanity check against requested duration — log a warning if the script
  // is meaningfully shorter/longer than what the user asked for, so the
  // script-generation step can be tuned.
  const actualSeconds = timedBeats.length * BEAT_SECONDS;
  const drift = Math.abs(actualSeconds - targetDurationSeconds);
  if (drift > targetDurationSeconds * 0.15) {
    console.warn(
      `[segmentSplitter] script length drifted from target: wanted ${targetDurationSeconds}s, got ~${actualSeconds}s`
    );
  }

  return timedBeats;
}

module.exports = { splitIntoBeats, BEAT_SECONDS };
