const { parentPort, workerData } = require('worker_threads');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegBin = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

const { inputPath, outputPath, format } = workerData;

(async () => {
  try {
    // ensure output folder exists
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

    ffmpeg(inputPath)
      .setFfmpegPath(ffmpegBin)
      .toFormat(format) // selectedFormat
      .on('start', cmd => parentPort.postMessage({ type: 'start', cmd }))
      .on('progress', progress => parentPort.postMessage({ type: 'progress', percent: progress.percent || 0 }))
      .on('end', () => parentPort.postMessage({ type: 'end', outputPath }))
      .on('error', err => parentPort.postMessage({ type: 'error', message: err.message }))
      .save(outputPath);

  } catch (err) {
    parentPort.postMessage({ type: 'error', message: err.message });
  }
})();