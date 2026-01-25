// safe-fs.js
const fs = require('fs');
const path = require('path');
const os = require('os');

function getBlockedPaths() {
  const platform = os.platform();

  if (platform === 'win32') {
    return [
      process.env.SystemRoot,           // C:\Windows
      'C:\\Program Files',
      'C:\\Program Files (x86)'
    ];
  }

  if (platform === 'darwin') {
    return [
      '/System',
      '/Library',
      '/Applications'
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

function guard(p) {
  if (typeof p !== 'string') return p;

  const resolved = path.resolve(p).toLowerCase();

  if (BLOCKED.some(b => resolved === b || resolved.startsWith(b + path.sep))) {
    throw new Error(`Blocked system path: ${p} - The requested operation was blocked for security reasons.`);
  }
  return p;
}

/* ===========================
   PROMISE API (GUARDED)
=========================== */

const promises = {};
for (const key of Object.keys(fs.promises)) {
  promises[key] = (...args) => {
    args[0] = guard(args[0]);
    return fs.promises[key](...args);
  };
}

/* ===========================
   CALLBACK API (GUARDED)
=========================== */

const api = {};
const PATH_METHODS = new Set([
  'access','appendFile','chmod','chown','copyFile','cp',
  'createReadStream','createWriteStream','lchmod','lchown',
  'link','mkdir','mkdtemp','open','opendir','readFile',
  'readdir','readlink','realpath','rename','rm','rmdir',
  'stat','lstat','symlink','truncate','unlink','utimes',
  'writeFile','watch','watchFile'
]);

for (const key of Object.keys(fs)) {
  if (typeof fs[key] !== 'function') continue;

  if (PATH_METHODS.has(key)) {
    api[key] = (...args) => {
      args[0] = guard(args[0]);
      return fs[key](...args);
    };
  } else {
    api[key] = fs[key].bind(fs);
  }
}

module.exports = {
  ...api,
  promises
};
