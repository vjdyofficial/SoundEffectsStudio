// safe-fs.js
const fs = require('fs');
const path = require('path');
const os = require('os');

// =====================
// Blocked System Paths
// =====================
function getBlockedPaths() {
  const platform = os.platform();

  if (platform === 'win32') {
    return [
      process.env.SystemRoot,           // C:\Windows
      'C:\\Program Files', 'C:\\Program Files (x86)'
    ];
  }

  if (platform === 'darwin') {
    return [
      '/System', '/Library', '/Applications'
    ];
  }

  // linux
  return [
    '/bin',
    '/boot',
    '/dev',
    '/etc',
    '/lib',
    '/lib64',
    '/proc',
    '/root',
    '/sbin',
    '/sys',
    '/usr'
  ];
}

const BLOCKED = getBlockedPaths()
  .filter(Boolean)
  .map(p => path.resolve(p).toLowerCase());

// =====================
// Guard Function
// =====================
function guardWrite(p) {
  if (typeof p !== 'string') return p;

  const resolved = path.resolve(p).toLowerCase();

  if (BLOCKED.some(b => resolved === b || resolved.startsWith(b + path.sep))) {
    throw new Error(`Blocked system path: ${p} - Write/delete operations are blocked for security reasons.`);
  }
  return p;
}

// =====================
// Helper: determine if path needs write guard
// =====================
const WRITE_METHODS = new Set([
  'appendFile','chmod','chown','copyFile','cp',
  'createWriteStream','lchmod','lchown','link',
  'mkdir','mkdtemp','open','opendir','rename','rm','rmdir',
  'symlink','truncate','unlink','utimes',
  'writeFile'
]);

// =====================
// PROMISE API (GUARDED)
// =====================
const promises = {};
for (const key of Object.keys(fs.promises)) {
  if (WRITE_METHODS.has(key)) {
    promises[key] = (...args) => {
      args[0] = guardWrite(args[0]);
      return fs.promises[key](...args);
    };
  } else {
    // read operations: allow all paths
    promises[key] = (...args) => fs.promises[key](...args);
  }
}

// =====================
// CALLBACK API (GUARDED)
// =====================
const api = {};
for (const key of Object.keys(fs)) {
  if (typeof fs[key] !== 'function') continue;

  if (WRITE_METHODS.has(key)) {
    api[key] = (...args) => {
      args[0] = guardWrite(args[0]);
      return fs[key](...args);
    };
  } else {
    // read operations: allow all paths
    api[key] = fs[key].bind(fs);
  }
}

// =====================
// EXPORT
// =====================
module.exports = {
  ...api,
  promises
};