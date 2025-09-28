const fs = require('fs');
const path = require('path');

// Load package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));

// Product info
const productName = pkg.productName || pkg.name;
const exeName = `${productName}.exe`;

// Determine Electron build output folder (win-unpacked)
let outputFolder = 'dist/win-unpacked';
if (pkg.build && pkg.build.directories && pkg.build.directories.output) {
  outputFolder = path.join(pkg.build.directories.output, 'win-unpacked');
}

// Convert to absolute path for NSIS
outputFolder = path.resolve(outputFolder);

// Generate NSIS defines
const nsisVars = `
!define PRODUCT_NAME "${productName}"
!define PRODUCT_EXE "${exeName}"
!define OUTPUT_FOLDER "${outputFolder}"
`;

fs.writeFileSync('installer-vars.nsh', nsisVars.trim());
console.log('✅ Generated installer-vars.nsh');
