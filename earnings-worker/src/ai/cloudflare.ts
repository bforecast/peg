interface CloudflareMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Generate a response using Cloudflare Workers AI binding (env.AI).
 * @param ai - Cloudflare Workers AI binding (env.AI)
 * @param model - Model identifier (e.g. @cf/google/gemma-4-26b-a4b-it)
 * @param messages - Array of conversation messages (system, user, assistant)
 * @returns The AI response text
 */
export async function generateCloudflareAIResponse(
    ai: any,
    model: string,
    messages: CloudflareMessage[]
): Promise<string> {
    if (!ai) {
        return 'Error: Cloudflare Workers AI binding (env.AI) is not configured.';
    }

    try {
        console.log('[Cloudflare AI] Sending request to model:', model);
        console.log('[Cloudflare AI] Messages count:', messages.length);

        const response = await ai.run(model, {
            messages: messages,
            max_tokens: 4096
        });

        console.log('[Cloudflare AI] Response received:', typeof response);

        if (response && typeof response.response === 'string') {
            return response.response;
        }

        if (response && response.choices && response.choices.length > 0) {
            return response.choices[0].message?.content || response.choices[0].text || 'No response generated.';
        }

        if (typeof response === 'string') {
            return response;
        }

        return response?.result || JSON.stringify(response);
    } catch (error: any) {
        console.error('Cloudflare Workers AI fetch error:', error);
        return `Error: Failed to call Cloudflare Workers AI. ${error?.message || error}`;
    }
}
