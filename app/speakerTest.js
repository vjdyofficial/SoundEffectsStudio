const speakerTest = document.getElementById('speakertest');
const speakerLeft = document.getElementById('speakertestL');
const speakerFreq = document.getElementById('speakertestFreq');
const speakerRight = document.getElementById('speakertestR');
const speakerTestBass = document.getElementById('speakertestLowpass');
const speakerTestMid = document.getElementById('speakertestMidpass');
const speakerTestHigh = document.getElementById('speakertestHighpass');

function endtest() {
    const dialogOnInit = document.getElementById('testspkDialog');
    speakerTest.src = ``;
    speakerLeft.src = ``;
    speakerRight.src = ``;
    speakerFreq.src = ``;
    speakerTestBass.src = ``;
    speakerTestMid.src = ``;
    speakerTestHigh.src = ``;

    const { ipcRenderer } = require('electron');
    const text = `Sampler and Media`
    ipcRenderer.send('sendtoVUMeter', text);
    CloseAnimationInit(dialogOnInit);
}

function startTest() {
    document.getElementById(`stopBtn_1`).click();
    document.getElementById(`stopBtn_2`).click();
    document.getElementById(`stopBtnA`).click();
    document.getElementById(`stopBtnB`).click();
    document.getElementById(`stopBtnC`).click();
    document.getElementById(`stopBtnD`).click();
    StopAllAudio();

    const { ipcRenderer } = require('electron');
    const text = `Audio Test Mode`
    ipcRenderer.send('sendtoVUMeter', text);
}

function audiotest() {
    startTest();
    document.getElementById('testspkDialog').showModal();
    speakerTest.src = `audio/speakertest.wav`;
    speakerTest.currentTime = 0;
    speakerTest.play();
}

function audiotestStereo() {
    const value = document.getElementById('reduceSlider').value
    if (value <= 0) {
        startTest();
        document.getElementById('testspkDialog').showModal();
        speakerLeft.src = `audio/speakertest-l.wav`;
        speakerRight.src = `audio/speakertest-r.wav`;
        speakerLeft.currentTime = 0;
        speakerLeft.play();
    } else {
        const Text = `Can't test the Left/Right Channel on 3D Surround Sound Mode.`
        snackbar(Text);
    }
}

function audiotestFreq() {
    startTest();
    document.getElementById('testspkDialog').showModal();
    speakerFreq.src = `audio/speakertest-frequency.wav`;
    speakerFreq.currentTime = 0;
    speakerFreq.play();
}

function audiotestBass() {
    startTest();
    document.getElementById('testspkDialog').showModal();
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
    startTest();
    document.getElementById('testspkDialog').showModal();
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
    startTest();
    document.getElementById('testspkDialog').showModal();
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