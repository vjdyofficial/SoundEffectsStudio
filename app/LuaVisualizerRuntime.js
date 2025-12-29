const jscanvas = document.getElementById("luacanvas")
const jsctx = jscanvas.getContext("2d")
let runningJSV = true

// ------------------------------
// Audio API (uses existing dataArrayMeter from your other JS)
// ------------------------------
const audioJSV = {
  band(name) {
    if (name === "bass") {
      let sum = 0
      for (let i = 0; i < 10; i++) sum += dataArrayMeter[i]
      return sum / 10 / 255
    } else if (name === "mid") {
      let sum = 0
      for (let i = 10; i < 50; i++) sum += dataArrayMeter[i]
      return sum / 40 / 255
    } else if (name === "treble") {
      let sum = 0
      for (let i = 50; i < 256; i++) sum += dataArrayMeter[i]
      return sum / (256 - 50) / 255
    }
    return 0
  }
}

// ------------------------------
// Draw API
// ------------------------------
function drawRectJSV({ x, y, width, height, color }) {
  jsctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`
  jsctx.fillRect(x, y, width, height)
}

// ------------------------------
// Placeholder for onFrame
// ------------------------------
let onFrameJSV = dt => {}

// ------------------------------
// Load JSV Visualizer
// ------------------------------
function loadVisualizerJSV(code) {
  eval(code) // code should set onFrameJSV
}

// ------------------------------
// Animation Loop
// ------------------------------
function loopJSV(lastTime) {
  if (!runningJSV) return
  if (!lastTime) lastTime = performance.now()
  const now = performance.now()
  const dt = (now - lastTime) / 1000

  jsctx.clearRect(0, 0, jscanvas.width, jscanvas.height) // clear once per frame
  onFrameJSV(dt)

  requestAnimationFrame(() => loopJSV(now))
}
loopJSV(performance.now())

// ------------------------------
// Stop Visualizer
// ------------------------------
function stopVisualizerJSV() {
  runningJSV = false
}

// ------------------------------
// Example Usage
// ------------------------------
const exampleJSV = `
onFrameJSV(dt => {
  const bass = audioJSV.band("bass")
  drawRectJSV({
    x: 100,
    y: 200,
    width: bass * 300,
    height: 20,
    color: { r: 255, g: 100, b: 200 }
  })

  const mid = audioJSV.band("mid")
  drawRectJSV({
    x: 100,
    y: 250,
    width: mid * 300,
    height: 20,
    color: { r: 100, g: 255, b: 100 }
  })

  const treble = audioJSV.band("treble")
  drawRectJSV({
    x: 100,
    y: 300,
    width: treble * 300,
    height: 20,
    color: { r: 100, g: 100, b: 255 }
  })
})
`
loadVisualizerJSV(exampleJSV)