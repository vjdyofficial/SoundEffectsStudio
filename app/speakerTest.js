const speakerTest = document.getElementById('speakertest');
const speakerLeft = document.getElementById('speakertestL');
const speakerFreq = document.getElementById('speakertestFreq');
const speakerRight = document.getElementById('speakertestR');
const speakerTestBass = document.getElementById('speakertestLowpass');
const speakerTestMid = document.getElementById('speakertestMidpass');
const speakerTestHigh = document.getElementById('speakertestHighpass');

let audiotestvalue;

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
}

function audiotest() {
    document.getElementById('testspkDialog').show();
    speakerTest.src = `audio/speakertest.wav`;
    speakerTest.currentTime = 0;
    speakerTest.play();
}

function audiotestStereo() {
    document.getElementById('testspkDialog').show();
    speakerLeft.src = `audio/speakertest-l.wav`;
    speakerRight.src = `audio/speakertest-r.wav`;
    speakerLeft.currentTime = 0;
    speakerLeft.play();
}

function audiotestFreq() {
    document.getElementById('testspkDialog').show();
    speakerFreq.src = `audio/speakertest-frequency.wav`;
    speakerFreq.currentTime = 0;
    speakerFreq.play();
}

function audiotestBass() {
    document.getElementById('testspkDialog').show();
    speakerTestBass.src = `audio/speakertest-bass.wav`;
    speakerTestBass.currentTime = 0;
    speakerTestBass.play();
}

speakerTest.addEventListener('ended', () => {
    endtest();
});

// Start the ritual
speakerTestBass.addEventListener('ended', () => {
    endtest();
});

function audiotestMid() {
    document.getElementById('testspkDialog').show();
    speakerTestMid.src = `audio/speakertest-mid.wav`;
    speakerTestMid.currentTime = 0;
    speakerTestMid.play();
}

// Start the ritual
speakerTestMid.addEventListener('ended', () => {
    endtest();
});

speakerFreq.addEventListener('ended', () => {
    endtest();
});

function audiotestHigh() {
    document.getElementById('testspkDialog').show();
    speakerTestHigh.src = `audio/speakertest-high.wav`;
    speakerTestHigh.currentTime = 0;
    speakerTestHigh.play();
}

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