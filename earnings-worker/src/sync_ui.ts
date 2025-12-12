
import fs from 'fs';
import path from 'path';

const htmlPath = path.join(__dirname, 'ui_new.html');
const tsPath = path.join(__dirname, 'ui_html.ts');

const html = fs.readFileSync(htmlPath, 'utf8');

// Escape backticks not already escaped
// But wait, existing content doesn't have escaped backticks.
// We need to escape backticks for the TS template literal wrapper.
// Also escape ${ for TS template literal wrapper.

const escapedHtml = html
    .replace(/\\/g, '\\\\') // Escape backslashes first (e.g. \n in JS strings)
    .replace(/`/g, '\\`')   // Escape backticks
    .replace(/\${/g, '\\${'); // Escape template interpolation start

const fileContent = `// Auto-generated from ui_new.html
export const UI_HTML = \`${escapedHtml}\`;
`;

fs.writeFileSync(tsPath, fileContent);
console.log('Synced ui_html.ts from ui_new.html');
