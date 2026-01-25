// safe-fs.js
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// Blocked system paths by platform
function getBlockedPaths() {
  const platform = os.platform();
  if (platform === 'win32') {
    return [process.env.SystemRoot, 'C:\\Program Files', 'C:\\Program Files (x86)'];
  }
  if (platform === 'darwin') {
    return ['/System', '/Library', '/Applications'];
  }
  return ['/bin','/boot','/dev','/etc','/lib','/lib64','/proc','/root','/sbin','/sys','/usr'];
}

const BLOCKED = getBlockedPaths()
  .filter(Boolean)
  .map(p => path.resolve(p).toLowerCase());

// 🔒 Guard function
function guard(p) {
  if (typeof p !== 'string') return p;
  const resolved = path.resolve(p).toLowerCase();
  if (BLOCKED.some(b => resolved === b || resolved.startsWith(b + path.sep))) {
    throw new Error(`Blocked system path: ${p}`);
  }
  return p;
}

/* ===========================
   PROMISE API (GUARDED)
=========================== */
const safeFs = {};

// Wrap every fs/promises function with guard
for (const key of Object.keys(fs)) {
  if (typeof fs[key] === 'function') {
    safeFs[key] = async (...args) => {
      if (args.length > 0) args[0] = guard(args[0]);
      return fs[key](...args);
    };
  }
}

module.exports = safeFs;
