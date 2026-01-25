const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ------------------------ Helpers ------------------------
function generateRecordingFilename() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const s = String(now.getSeconds()).padStart(2, "0");
  return `SFXStudio_Recording_${y}-${m}-${d}_${h}-${min}-${s}`;
}

async function convertAudio(inputPath, outputPath, format) {
  document.getElementById("titleDisplay").textContent = "Encoding...";
  document.getElementById("timerDisplay").textContent = `--%`;

  return new Promise((resolve, reject) => {
    const command = ffmpeg(inputPath).toFormat(format);

    // Set MP3 bitrate if format is mp3
    if (format === "mp3") {
      command.audioBitrate(document.getElementById("bitrateSelector").value);
    }

    command
      .on("start", cmd => console.log("FFmpeg command:", cmd))
      .on("progress", progress => {
        if (progress.percent) {
          document.getElementById("titleDisplay").textContent = "Encoding...";
          document.getElementById("timerDisplay").textContent = `${progress.percent.toFixed(1)}%`;
        }
      })
      .on("end", () => {
        console.log("Conversion finished:", outputPath);
        resolve(outputPath);
      })
      .on("error", err => {
        reject(err)
        playRenderSound(false);

        alert(err.message, "Encoding error!");

        async function clearOutputFolder() {
          const outputFolder = path.join(__dirname, "output");

          try {
            await fs.promises.rm(outputFolder, { recursive: true, force: true });
            await fs.promises.mkdir(outputFolder, { recursive: true });
            console.log("Output folder cleaned.");
          } catch (err) {
            console.error("Failed to clean output folder:", err);
          }
        }

        clearOutputFolder();

        document.getElementById("titleDisplay").textContent = "Record";
        document.getElementById("timerDisplay").textContent = "Inactive";

        document.getElementById("startRec").style.display = "inherit";
        document.getElementById("stopRec").style.display = "none";
        document.getElementById("stopRec").disabled = false;

        chunks = [];
      })
      .save(outputPath);
  });
}

function formatNumber(num) {
  if (num < 1000) return num.toString();
  if (num < 1_000_000) return (num / 1000).toFixed(1) + "k";
  if (num < 1_000_000_000) return (num / 1_000_000).toFixed(1) + "m";
  return (num / 1_000_000_000).toFixed(1) + "b";
}

// Save AudioBuffer → WAV on disk
async function saveBufferAsWav(audioBuffer, filePath) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const samples = audioBuffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  let offset = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset++, str.charCodeAt(i));
  }

  // RIFF header
  writeString("RIFF");
  view.setUint32(offset, 36 + dataSize, true); offset += 4;
  writeString("WAVE");

  // fmt chunk
  writeString("fmt ");
  view.setUint32(offset, 16, true); offset += 4; // chunk size
  view.setUint16(offset, 1, true); offset += 2;  // PCM format
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * blockAlign, true); offset += 4;
  view.setUint16(offset, blockAlign, true); offset += 2;
  view.setUint16(offset, bytesPerSample * 8, true); offset += 2;

  // data chunk
  writeString("data");
  view.setUint32(offset, dataSize, true); offset += 4;

  const batch = 8192; // write little chunks per tick
  let count = 0;

  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let s = audioBuffer.getChannelData(ch)[i];
      s = Math.max(-1, Math.min(1, s));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
      count++;

      if (count >= batch) {
        await new Promise(r => setTimeout(r, 0)); // let UI breathe
        count = 0;
        let percent = (i / samples) * 100;
        if (percent > 100) percent = 100;
        document.getElementById("titleDisplay").textContent = "Chunking...";
        document.getElementById("timerDisplay").textContent = `Offset: ${percent.toFixed(1)}%`;
      }
    }

    if (i % batch === 0) {
      await new Promise(r => setTimeout(r, 0)); // let UI breathe
    }
  }

  document.getElementById("titleDisplay").textContent = "Rendering...";
  document.getElementById("timerDisplay").textContent = `--%`;

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Convert ArrayBuffer → Buffer
  const wavBuffer = Buffer.from(buffer);

  // Write in stream chunks with progress
  await new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    const chunkSize = 64 * 1024; // 64KB per write
    let offset = 0;

    function writeNextChunk() {
      const chunk = wavBuffer.subarray(offset, offset + chunkSize);
      offset += chunkSize;

      // Emit progress % to renderer?
      const percent = Math.min((offset / wavBuffer.length) * 100, 100);
      document.getElementById("titleDisplay").textContent = "Rendering...";
      document.getElementById("timerDisplay").textContent = `${percent.toFixed(1)}%`;

      if (!writeStream.write(chunk)) {
        // backpressure: resume when drained
        writeStream.once("drain", writeNextChunk);
      } else if (offset < wavBuffer.length) {
        // keep writing
        setImmediate(writeNextChunk);
      } else {
        // Done
        writeStream.end();
      }
    }

    writeStream.on("finish", () => {
      resolve();
    });

    writeStream.on("error", reject);

    writeNextChunk();
  });

  return filePath;
}


// Export AudioBuffer → selected format
async function exportRecording(audioBuffer, selectedFormat, saveBasePath) {
  const wavPath = `${saveBasePath}.wav`;
  await saveBufferAsWav(audioBuffer, wavPath);

  if (selectedFormat === "audio/wav") return wavPath;

  const formatMap = {
    "audio/mpeg": "mp3",
    "audio/opus": "opus",
    "audio/flac": "flac",
  };
  const ext = formatMap[selectedFormat];
  if (!ext) throw new Error("Unsupported format: " + selectedFormat);

  const outputPath = `${saveBasePath}.${ext}`;
  await convertAudio(wavPath, outputPath, ext);
  return outputPath;
}

// ------------------------ Merge Recording ------------------------
async function mergeRecording(existingFileUrl, recordedChunks, outroFileUrl) {
  const introArrayBuffer = await (await fetch(existingFileUrl)).arrayBuffer();
  const introBuffer = await audioCtx.decodeAudioData(introArrayBuffer);

  const recordedBlob = new Blob(recordedChunks, { type: "audio/webm" });
  const recordedArrayBuffer = await recordedBlob.arrayBuffer();
  const recordedBuffer = await audioCtx.decodeAudioData(recordedArrayBuffer);

  let outroBuffer = null;
  if (outroFileUrl) {
    const outroArrayBuffer = await (await fetch(outroFileUrl)).arrayBuffer();
    outroBuffer = await audioCtx.decodeAudioData(outroArrayBuffer);
  }

  const length = document.getElementById("audioWatermark").checked
    ? introBuffer.length + recordedBuffer.length + (outroBuffer ? outroBuffer.length : 0)
    : recordedBuffer.length;

  const numberOfChannels = Math.max(
    introBuffer.numberOfChannels,
    recordedBuffer.numberOfChannels,
    outroBuffer ? outroBuffer.numberOfChannels : 1
  );

  const sampleRate = introBuffer.sampleRate;
  const finalBuffer = audioCtx.createBuffer(numberOfChannels, length, sampleRate);

  for (let ch = 0; ch < numberOfChannels; ch++) {
    const finalData = finalBuffer.getChannelData(ch);

    if (document.getElementById("audioWatermark").checked) {
      const intro = introBuffer.getChannelData(ch % introBuffer.numberOfChannels);
      finalData.set(intro, 0);

      const recorded = recordedBuffer.getChannelData(ch % recordedBuffer.numberOfChannels);
      finalData.set(recorded, intro.length);

      if (outroBuffer) {
        const outro = outroBuffer.getChannelData(ch % outroBuffer.numberOfChannels);
        finalData.set(outro, intro.length + recorded.length);
      }
    } else {
      const recorded = recordedBuffer.getChannelData(ch % recordedBuffer.numberOfChannels);
      finalData.set(recorded, 0);
    }
  }

  return finalBuffer; // return AudioBuffer for export
}

