import { Bindings } from '../types';
import { ALL_TOOLS, dispatchToolCall } from './tools';

type ChatMessage = {
    role: 'user' | 'model' | 'function'; // Gemini uses 'model' instead of 'assistant', and 'function' for tool responses
    parts: { text?: string; functionCall?: any; functionResponse?: any }[];
};

export async function chatWithGemini(
    messages: ChatMessage[],
    env: Bindings,
    systemPrompt: string
) {
    if (!env.GEMINI_API_KEY) {
        return { error: "GEMINI_API_KEY is not configured." };
    }

    // User requested 'gemini-2.5-flash' - requires thought_signature preservation
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;

    // 1. Construct Initial Request
    const toolsPayload = {
        function_declarations: ALL_TOOLS
    };

    // We maintain 'currentContents' which grows as turns happen in the loop
    let currentContents = messages.map(m => ({
        role: m.role,
        parts: m.parts
    }));

    const MAX_TURNS = 5;
    let turnCount = 0;

    while (turnCount < MAX_TURNS) {
        turnCount++;

        const payload: any = {
            contents: currentContents,
            tools: [toolsPayload],
            system_instruction: {
                parts: [{ text: systemPrompt }]
            }
        };

        try {
            console.log(`[Gemini] Sending request (Turn ${turnCount})...`);
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const err = await response.text();
                // Check if it's the specific thought_signature error to help debug
                // But generally just log it
                console.error("[Gemini] API Error:", err);
                const cleanErr = err.substring(0, 300).replace(/"/g, "'");
                return { error: `Gemini API Error: ${response.status} Details: ${cleanErr}` };
            }

            const data: any = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate) return { error: "No response from Gemini" };

            const parts = candidate.content?.parts || [];

            // Check for Tool Calls
            const functionCalls = parts.filter((p: any) => p.functionCall);

            if (functionCalls.length > 0) {
                // Log tool usage
                console.log(`[Gemini] Tool Call detected: ${functionCalls.length}`);

                // Execute First Tool (Currently executing only the first tool call in the list per turn)
                // TODO: Handle parallel function calls if needed loop over functionCalls
                const fc = functionCalls[0].functionCall;
                const toolName = fc.name;
                const toolArgs = fc.args;

                console.log(`[Gemini] Executing ${toolName} with`, toolArgs);
                const toolResult = await dispatchToolCall(toolName, toolArgs, env);

                // Append Model Turn (CRITICAL: include original parts for thought_signature)
                // And Append Function Response
                currentContents = currentContents.concat([
                    { role: 'model', parts: parts },
                    { role: 'function', parts: [{ functionResponse: { name: toolName, response: { result: toolResult } } }] }
                ]);

                // Continue loop to get next response
                continue;
            }

            // No tool call? Check for text
            const textPart = parts.find((p: any) => p.text);
            if (textPart) {
                return { text: textPart.text };
            }

            // If we are here, we got no tool call AND no text.
            return { text: `[Debug] Empty response. FinishReason: ${candidate.finishReason}` };

        } catch (e: any) {
            console.error("[Gemini] Exception (Turn " + turnCount + "):", e);
            return { error: e.message };
        }
    }

    return { error: "Max conversation turns reached." };
}
