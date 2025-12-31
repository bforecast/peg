const fs = require('fs');
const path = require('path');

const originalHtmlPath = path.join(__dirname, '../src/ui_new.html');
const targetTsPath = path.join(__dirname, '../src/ui_html.ts');

try {
    const htmlContent = fs.readFileSync(originalHtmlPath, 'utf8');

    // Escape backticks and ${} to be safe inside a template literal
    const escapedContent = htmlContent
        .replace(/\\/g, '\\\\') // Escape backslashes first
        .replace(/`/g, '\\`')   // Escape backticks
        .replace(/\$\{/g, '\\${'); // Escape template literal start

    const tsContent = `// Auto-generated from ui_new.html
export const UI_HTML = \`${escapedContent}\`;
`;

    fs.writeFileSync(targetTsPath, tsContent);
    console.log('Successfully synced src/ui_html.ts');
} catch (error) {
    console.error('Error syncing HTML:', error);
    process.exit(1);
}
