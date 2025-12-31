import { Bindings } from '../types';

const PERPLEXITY_API_URL = 'https://api.perplexity.ai/chat/completions';
const DEFAULT_MODEL = 'sonar-pro'; // Real-time web search model

interface PerplexityMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface PerplexityResponse {
    id: string;
    model: string;
    choices: {
        index: number;
        finish_reason: string;
        message: {
            role: string;
            content: string;
        };
    }[];
    citations?: string[];
}

/**
 * Generate a response using the Perplexity API with real-time web search.
 * @param env - Cloudflare Worker environment bindings
 * @param userMessage - The user's input message
 * @param systemPrompt - Optional system prompt for context
 * @returns The AI response text
 */
export async function generatePerplexityResponse(
    env: Bindings,
    userMessage: string,
    systemPrompt?: string
): Promise<string> {
    const apiKey = env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        return 'Error: PERPLEXITY_API_KEY is not configured. Please set it using `wrangler secret put PERPLEXITY_API_KEY`.';
    }

    const messages: PerplexityMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    } else {
        messages.push({
            role: 'system',
            content: 'You are a helpful investment research assistant. Provide accurate, up-to-date information with citations when available. Focus on factual data and recent news.'
        });
    }

    // Add user message
    messages.push({ role: 'user', content: userMessage });

    try {
        console.log('[Perplexity] Sending request to:', PERPLEXITY_API_URL);
        console.log('[Perplexity] Model:', DEFAULT_MODEL);
        console.log('[Perplexity] Messages count:', messages.length);

        const response = await fetch(PERPLEXITY_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                messages: messages,
                temperature: 0.2, // Lower for more factual responses
                max_tokens: 1024
            })
        });

        console.log('[Perplexity] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Perplexity] API Error:', response.status, errorText);
            return `Error: Perplexity API returned status ${response.status}. ${errorText}`;
        }

        const data = await response.json() as PerplexityResponse;
        console.log('[Perplexity] Response received, choices:', data.choices?.length);

        if (data.choices && data.choices.length > 0) {
            let result = data.choices[0].message.content;

            // Note: Citations hidden per user request
            // if (data.citations && data.citations.length > 0) {
            //     result += '\n\n**Sources:**\n';
            //     data.citations.forEach((url, index) => {
            //         result += `${index + 1}. ${url}\n`;
            //     });
            // }

            return result;
        }

        return 'No response generated.';
    } catch (error) {
        console.error('Perplexity API fetch error:', error);
        return `Error: Failed to connect to Perplexity API. ${error}`;
    }
}
