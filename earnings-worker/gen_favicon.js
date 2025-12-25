const fs = require('fs');
const path = require('path');

try {
    // UPDATED: Using new_logo.jpg (via temp.b64)
    const inputPath = 'd:/AntigravityProjects/forward_peg_system/earnings-worker/temp.b64';
    const outputPath = 'd:/AntigravityProjects/forward_peg_system/earnings-worker/src/favicon.ts';

    if (!fs.existsSync(inputPath)) {
        console.error('Input file not found:', inputPath);
        process.exit(1);
    }

    // Read base64 file
    let content = fs.readFileSync(inputPath, 'utf8');

    // Strip header/footer and newlines
    content = content.replace(/-----BEGIN CERTIFICATE-----|-----END CERTIFICATE-----/g, '');
    content = content.replace(/(\r\n|\n|\r)/gm, '');

    // Write to TS file
    fs.writeFileSync(outputPath, `export const FAVICON_BASE64 = '${content}';`);
    console.log('Successfully generated favicon.ts');
} catch (error) {
    console.error('Error:', error);
    process.exit(1);
}
