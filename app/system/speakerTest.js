const speakerTest = document.getElementById('speakertest');
const speakerLeft = document.getElementById('speakertestL');
const speakerFreq = document.getElementById('speakertestFreq');
const speakerRight = document.getElementById('speakertestR');
const speakerTestBass = document.getElementById('speakertestLowpass');
const speakerTestMid = document.getElementById('speakertestMidpass');
const speakerTestHigh = document.getElementById('speakertestHighpass');

let audiotestvalue;

function startTest() {
    document.getElementById('testspkDialog').show();
    masterVolume.disconnect();
}

function endtest() {
    const dialogOnInit = document.getElementById('testspkDialog');
    speakerTest.src = ``;
    speakerLeft.src = ``;
    speakerRight.src = ``;
    speakerFreq.src = ``;
    speakerTestBass.src = ``;
    speakerTestMid.src = ``;
    speakerTestHigh.src = ``;
    CloseAnimationInit(dialogOnInit);
    snackbar('Speaker test completed.')
    masterVolume.connect(audioCtx.destination);
    masterVolume.connect(meterMixerNode);
}

function audiotest() {
    document.getElementById('testspkDialog').show();
    speakerTest.src = `audio/speakertest.wav`;
    speakerTest.currentTime = 0;
    speakerTest.play();
    startTest();
}

function audiotestStereo() {
    speakerLeft.src = `audio/speakertest-l.wav`;
    speakerRight.src = `audio/speakertest-r.wav`;
    speakerLeft.currentTime = 0;
    speakerLeft.play();
    startTest();
}

function audiotestFreq() {
    speakerFreq.src = `audio/speakertest-frequency.wav`;
    speakerFreq.currentTime = 0;
    speakerFreq.play();
    startTest();
}

function audiotestBass() {
    speakerTestBass.src = `audio/speakertest-bass.wav`;
    speakerTestBass.currentTime = 0;
    speakerTestBass.play();
    startTest();
}

function audiotestMid() {
    speakerTestMid.src = `audio/speakertest-mid.wav`;
    speakerTestMid.currentTime = 0;
    speakerTestMid.play();
    startTest();
}

function audiotestHigh() {
    speakerTestHigh.src = `audio/speakertest-high.wav`;
    speakerTestHigh.currentTime = 0;
    speakerTestHigh.play();
    startTest();
}

speakerTest.addEventListener('ended', () => {
    endtest();
});

// Start the ritual
speakerTestBass.addEventListener('ended', () => {
    endtest();
});

// Start the ritual
speakerTestMid.addEventListener('ended', () => {
    endtest();
});

speakerFreq.addEventListener('ended', () => {
    endtest();
});

// Start the ritual
speakerTestHigh.addEventListener('ended', () => {
    endtest();
});

// Left channel complete → summon right
speakerLeft.addEventListener('ended', () => {
    speakerRight.currentTime = 0;
    speakerRight.play();
});

speakerRight.addEventListener('ended', () => {
    endtest();
});