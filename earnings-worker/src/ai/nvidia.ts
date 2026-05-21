import { Bindings } from '../types';

const NVIDIA_API_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

interface NvidiaMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Generate a response using the NVIDIA API Catalog (build.nvidia.com).
 * @param apiKey - NVIDIA catalog API Key
 * @param model - Model identifier (e.g. nemotron-3-super-120b-a12b)
 * @param messages - Array of conversation messages (system, user, assistant)
 * @returns The AI response text
 */
export async function generateNvidiaResponse(
    apiKey: string,
    model: string,
    messages: NvidiaMessage[]
): Promise<string> {
    if (!apiKey) {
        return 'Error: NVIDIA_API_KEY is not configured. Please set it using `wrangler secret put NVIDIA_API_KEY`.';
    }

    try {
        console.log('[NVIDIA] Sending request to:', NVIDIA_API_URL);
        console.log('[NVIDIA] Model:', model);
        console.log('[NVIDIA] Messages count:', messages.length);

        const modelName = model.startsWith('nvidia/') ? model : `nvidia/${model}`;

        const response = await fetch(NVIDIA_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: modelName,
                messages: messages,
                temperature: 0.2, // Low temperature for highly factual analysis
                max_tokens: 4096
            })
        });

        console.log('[NVIDIA] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[NVIDIA] API Error:', response.status, errorText);
            return `Error: NVIDIA API returned status ${response.status}. ${errorText}`;
        }

        const data = await response.json() as any;
        console.log('[NVIDIA] Response received, choices:', data.choices?.length);

        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content;
        }

        return 'No response generated.';
    } catch (error) {
        console.error('NVIDIA API fetch error:', error);
        return `Error: Failed to connect to NVIDIA API. ${error}`;
    }
}
