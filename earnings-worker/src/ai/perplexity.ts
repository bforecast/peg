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
 * @param messages - Array of conversation messages (user, assistant, system)
 * @returns The AI response text
 */
export async function generatePerplexityResponse(
    apiKey: string,
    chatMessages: PerplexityMessage[]
): Promise<string> {

    if (!apiKey) {
        return 'Error: PERPLEXITY_API_KEY is not configured. Please set it using `wrangler secret put PERPLEXITY_API_KEY`.';
    }

    try {
        console.log('[Perplexity] Sending request to:', PERPLEXITY_API_URL);
        console.log('[Perplexity] Model:', DEFAULT_MODEL);
        console.log('[Perplexity] Messages count:', chatMessages.length);

        const response = await fetch(PERPLEXITY_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: DEFAULT_MODEL,
                messages: chatMessages,
                temperature: 0.2, // Lower for more factual responses
                max_tokens: 8192
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
