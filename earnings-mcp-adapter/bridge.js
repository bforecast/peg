#!/usr/bin/env node

/**
 * earnings-mcp-adapter
 * 
 * Authenticated bridge between local MCP clients (Gemini/Claude) via Stdio
 * and the remote Earnings Cloudflare Worker.
 */

import * as readline from 'readline';

// Worker URL - Remote Endpoint
const WORKER_URL = "https://earnings-mcp-server.brilliantforecast.workers.dev/mcp";

// Simple logger that uses stderr to avoid corrupting the stdout JSON-RPC stream
function log(msg) {
    if (process.env.DEBUG) {
        console.error(`[Adapter] ${msg}`);
    }
}

log("Starting Earnings MCP Adapter...");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on('line', (line) => {
    if (!line.trim()) return;
    log(`Received: ${line}`);
    try {
        const request = JSON.parse(line);
        handleRequest(request);
    } catch (e) {
        log(`Parse Error: ${e.message}`);
    }
});

async function handleRequest(request) {
    const isNotification = request.id === undefined || request.id === null;
    try {
        log(`Fetching ${WORKER_URL} for method ${request.method} (ID: ${request.id})...`);

        // Increase timeout to 120s for AI models which can be slow
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 120000);

        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            log(`Worker Error: ${response.status} ${response.statusText}`);
            try {
                const txt = await response.text();
                log(`Worker Error Body: ${txt}`);
            } catch (e) { }
            return;
        }

        // Suppress responses for Notifications (like 'notifications/initialized')
        // to prevent client-side "Method not found" or processing errors.
        if (isNotification) {
            log(`Skipping response for notification ${request.method}`);
            return;
        }

        const data = await response.json();
        log(`Response: ${JSON.stringify(data).substring(0, 50)}...`); // Truncate log

        // MCP Strictness: Output must be exactly one JSON line
        process.stdout.write(JSON.stringify(data) + "\n");

    } catch (error) {
        log(`Bridge Connection Error: ${error.message}`);

        // Only report fatal errors to the client if it expects a response
        if (!isNotification) {
            const errorResponse = {
                jsonrpc: "2.0",
                id: request.id,
                error: {
                    code: -32001,
                    message: `Adapter Error: ${error.message}`
                }
            };
            process.stdout.write(JSON.stringify(errorResponse) + "\n");
        }
    }
}
