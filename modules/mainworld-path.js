// safe-path.js
"use strict";
const path = require("path");

function guard(input) {
  if (typeof input !== "string") {
    throw new TypeError("Path must be a string");
  }
  return input;
}

module.exports = Object.freeze({
  join: (...args) => path.join(...args.map(guard)),
  resolve: (...args) => path.resolve(...args.map(guard)),
  basename: p => path.basename(guard(p)),
  dirname: p => path.dirname(guard(p)),
  extname: p => path.extname(guard(p)),
  normalize: p => path.normalize(guard(p)),
  sep: path.sep,
  delimiter: path.delimiter
});
