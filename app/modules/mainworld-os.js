// safe-os.js
"use strict";
const os = require("os");

module.exports = Object.freeze({
  platform: () => os.platform(),
  arch: () => os.arch(),
  type: () => os.type(),
  release: () => os.release(),
  homedir: () => os.homedir(),
  tmpdir: () => os.tmpdir(),
  cpus: () => os.cpus(), // safer than full object
  totalmem: () => os.totalmem(),
  freemem: () => os.freemem()
});
