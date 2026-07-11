/**
 * pipeline/runVideoJob.js
 *
 * Same pipeline as before (script -> beats -> voice -> visuals -> stitch ->
 * thumbnails), just no longer tied to BullMQ. Called directly by the
 * in-memory queue (queue/simpleQueue.js) inside the single API process —
 * one platform service, one process, $0 extra infrastructure.
 */

const path = require("path");
const fs = require("fs");

const { splitIntoBeats } = require("../utils/segmentSplitter");
const { generateScript, cleanPastedScript } = require("../services/scriptService");
const { generateVoiceForAllBeats } = require("../services/voiceService");
const { generateVisualsForAllBeats } = require("../services/visualService");
const { stitchFinalVideo } = require("../services/stitchService");
const { generateThumbnailVariations } = require("../services/thumbnailService");

const STORAGE_ROOT = path.join(__dirname, "..", "storage");

async function runVideoJob(jobId, data, reportProgress) {
  const {
    scriptText,
    topic,
    niche,
    durationMinutes,
    language,
    gender,
    style,
    aspectRatio,
    uploadedImagePaths,
  } = data;

  const workDir = path.join(STORAGE_ROOT, jobId);
  fs.mkdirSync(workDir, { recursive: true });

  reportProgress({ stage: "script", percent: 5 });
  const finalScript = scriptText
    ? cleanPastedScript(scriptText)
    : await generateScript({ topic, niche, durationMinutes, language });

  reportProgress({ stage: "segmenting", percent: 15 });
  const beats = splitIntoBeats(finalScript, durationMinutes * 60);

  reportProgress({ stage: "voice", percent: 30 });
  const beatsWithVoice = await generateVoiceForAllBeats({
    beats,
    language,
    gender,
    outputDir: path.join(workDir, "audio"),
  });

  reportProgress({ stage: "visuals", percent: 55 });
  const beatsWithVisuals = await generateVisualsForAllBeats({
    beats: beatsWithVoice,
    style,
    aspectRatio,
    outputDir: path.join(workDir, "visuals"),
    images: uploadedImagePaths || [],
  });

  reportProgress({ stage: "rendering", percent: 80 });
  const finalVideoPath = await stitchFinalVideo({
    beats: beatsWithVisuals,
    aspectRatio,
    outputDir: workDir,
    jobId,
  });

  reportProgress({ stage: "thumbnails", percent: 92 });
  const thumbnails = await generateThumbnailVariations({
    videoPath: finalVideoPath,
    firstBeatText: beats[0]?.text || topic || "",
    outputDir: workDir,
    jobId,
  });

  reportProgress({ stage: "done", percent: 100 });

  return {
    videoPath: finalVideoPath,
    thumbnails,
    beatCount: beats.length,
    finalScript,
  };
}

module.exports = { runVideoJob };
