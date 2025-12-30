const fs = require('fs');
const path = require('path');
const tsPath = path.join(__dirname, 'src/views/scripts.ts');
const { execSync } = require('child_process');

try {
    let tsContent = fs.readFileSync(tsPath, 'utf8');
    // Remove 'export' keyword and 'const' to make it global assignment
    tsContent = tsContent.replace(/export\s+const\s+SCRIPTS/, 'SCRIPTS');

    // We only want the SCRIPTS definition, so let's strip anything else if present?
    // The file seems to only contain that.

    eval(tsContent);
    console.log("Successfully evaluated scripts.ts container.");

    // Now SCRIPTS variable holds the code string.
    const scriptFile = path.join(__dirname, 'temp_client_script.js');
    fs.writeFileSync(scriptFile, SCRIPTS);
    console.log("Written extracted script to " + scriptFile);

    // Check syntax using node
    try {
        execSync(`node -c "${scriptFile}"`);
        console.log("Syntax Check PASSED");
    } catch (e) {
        console.error("Syntax Check FAILED");
        // Try to get specific error by running it (it won't run fully due to DOM, but will parse)
        try {
            execSync(`node "${scriptFile}"`);
        } catch (err) {
            console.log("Runtime/Parse Error Details:");
            console.log(err.message);
            // The stderr usually contains the syntax error
        }
    }

} catch (e) {
    console.error("Error extracting/evaluating scripts.ts:", e);
}
