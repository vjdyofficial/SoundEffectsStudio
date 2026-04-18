const { parentPort, workerData } = require('worker_threads');
const ffmpegExec = require('../modules/fluent-ffmpeg');

const {
  tempAudioPath,
  ffmpegBin,
  canvasWidth,
  canvasHeight,
  canvasWidth2,
  canvasHeight2,
  cachePath,
  cachePath2
} = workerData;

function runFFmpegWaveform() {
  return new Promise((resolve, reject) => {
    ffmpegExec(tempAudioPath)
      .setFfmpegPath(ffmpegBin)
      .complexFilter([
        {
          filter: 'showwavespic',
          options: { s: `${canvasWidth}x${canvasHeight}`, colors: '#c1e471ff' }
        }
      ])
      .frames(16)
      .output(cachePath)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

function runFFmpegSpectrum() {
  return new Promise((resolve, reject) => {
    ffmpegExec(tempAudioPath)
      .setFfmpegPath(ffmpegBin)
      .complexFilter([
        {
          filter: 'showspectrumpic',
          options: {
            s: `${canvasWidth2}x${canvasHeight2}`,
            legend: 0,
            color: 'fiery',
            scale: 'log',
          }
        }
      ])
      .frames(16)
      .output(cachePath2)
      .on('end', resolve)
      .on('error', reject)
      .run();
  });
}

(async () => {
  try {
    await runFFmpegWaveform();
    await runFFmpegSpectrum();

    parentPort.postMessage({ success: true });
  } catch (err) {
    parentPort.postMessage({ success: false, error: err.message });
  }
})();