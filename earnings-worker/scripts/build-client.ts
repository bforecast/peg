import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

// Build Client Script
esbuild.build({
    entryPoints: ['src/client/main.ts'],
    bundle: true,
    outfile: 'public/js/client.js',
    minify: true,
    platform: 'browser',
    sourcemap: true,
}).then(() => {
    console.log('Client build complete: public/js/client.js');

    // Read the content and inject it into layout.ts ? 
    // Or simpler: We serve it as a static asset.
    // However, our worker serves stringified HTML. 
    // We need to read this file during WORKER build time or runtime?
    // Runtime read is slow (KV/Assets). 
    // Build time injection is better.

    const jsContent = fs.readFileSync('public/js/client.js', 'utf-8');
    const layoutPath = 'src/views/layout.ts';
    let layout = fs.readFileSync(layoutPath, 'utf-8');

    // Check if we already have the replacement marker or if we can replace the tag
    // Strategy: We will replace a placeholder or append strictly.
    // But wait, layout.ts imports SCRIPTS from scripts.ts.
    // Maybe we should update SCRIPTS in scripts.ts?

    // LET'S SIMPLIFY:
    // We will just let the worker serve it as a static file if we had `assets` binding.
    // But we don't know if user has assets binding.

    // safer: Write to a file that src/views/layout.ts imports?
    // Write to src/views/client_build.ts
    const tsContent = `export const CLIENT_JS = \`${jsContent.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;`;
    fs.writeFileSync('src/views/client_build.ts', tsContent);
    console.log('Injected into src/views/client_build.ts');

}).catch(() => process.exit(1));
