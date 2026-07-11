/**
 * stitchService.js
 *
 * The "again again yehi hota raha" step: takes the list of beats (each one
 * already has a visual clip + a voice clip) and stitches them back-to-back
 * into a single finished video, in the chosen aspect ratio, with captions
 * burned in and background music mixed under the voice.
 *
 * Pipeline per beat:  [visual.mp4 (silent)] + [voice.mp3] -> beat_final.mp4
 * Then: concat all beat_final.mp4 files -> one output.mp4
 */

const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const fs = require("fs");

const DIMS = {
  "9:16": "1080x1920",
  "16:9": "1920x1080",
  "1:1": "1080x1080",
  "4:5": "1080x1350",
};

/** Combines one beat's silent visual with its voiceover track. */
function muxBeat({ visualPath, audioPath, outputPath }) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(visualPath)
      .input(audioPath)
      .outputOptions(["-c:v copy", "-c:a aac", "-shortest"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

/** Writes captions burned into the bottom third of frame for one beat. */
function addCaption({ inputPath, text, outputPath, dims }) {
  // Escape characters ffmpeg's drawtext filter treats specially.
  const safeText = text.replace(/:/g, "\\:").replace(/'/g, "\u2019");
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .videoFilters([
        {
          filter: "drawtext",
          options: {
            text: safeText,
            fontcolor: "white",
            fontsize: Math.round(parseInt(dims.split("x")[0]) * 0.045),
            box: 1,
            boxcolor: "black@0.55",
            boxborderw: 14,
            x: "(w-text_w)/2",
            y: "h*0.78",
          },
        },
      ])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

/** Concatenates all beat clips into one final video using the concat demuxer. */
function concatBeats({ beatPaths, outputPath, workDir }) {
  const listPath = path.join(workDir, "concat_list.txt");
  const listContent = beatPaths.map((p) => `file '${p}'`).join("\n");
  fs.writeFileSync(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions(["-c copy"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

/** Optionally mixes a royalty-free background track under the final video, ducked low. */
function addBackgroundMusic({ inputPath, musicPath, outputPath }) {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .input(musicPath)
      .complexFilter([
        "[1:a]volume=0.12,aloop=loop=-1:size=2e9[bg]",
        "[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]",
      ])
      .outputOptions(["-map 0:v", "-map [aout]", "-c:v copy"])
      .output(outputPath)
      .on("end", () => resolve(outputPath))
      .on("error", reject)
      .run();
  });
}

/**
 * Full stitch: beats (with visualPath + audioPath) -> one finished video file.
 */
async function stitchFinalVideo({ beats, aspectRatio, outputDir, jobId, musicPath = null }) {
  const dims = DIMS[aspectRatio] || DIMS["9:16"];
  const muxedPaths = [];

  for (const beat of beats) {
    const muxedPath = path.join(outputDir, `beat_${String(beat.index).padStart(3, "0")}_muxed.mp4`);
    await muxBeat({ visualPath: beat.visualPath, audioPath: beat.audioPath, outputPath: muxedPath });

    const captionedPath = muxedPath.replace("_muxed.mp4", "_captioned.mp4");
    await addCaption({ inputPath: muxedPath, text: beat.text, outputPath: captionedPath, dims });

    muxedPaths.push(captionedPath);
  }

  const rawOutput = path.join(outputDir, `${jobId}_raw.mp4`);
  await concatBeats({ beatPaths: muxedPaths, outputPath: rawOutput, workDir: outputDir });

  let finalOutput = rawOutput;
  if (musicPath && fs.existsSync(musicPath)) {
    finalOutput = path.join(outputDir, `${jobId}_final.mp4`);
    await addBackgroundMusic({ inputPath: rawOutput, musicPath, outputPath: finalOutput });
  }

  return finalOutput;
}

module.exports = { stitchFinalVideo, DIMS };
