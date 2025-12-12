export interface EarningsData {
    symbol: string;
    quarterlyEarnings: Array<{
        fiscalDateEnding: string;
        reportedDate: string;
        reportedEPS: string;
        estimatedEPS: string;
        surprise: string;
        surprisePercentage: string;
    }>;
}

export async function fetchEarnings(symbol: string, apiKey: string): Promise<EarningsData | { error: string }> {
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${symbol}&apikey=${apiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
        return { error: `HTTP Error: ${response.status} ${response.statusText}` };
    }

    const data: any = await response.json();

    // Check for common AV errors
    if (data['Information']) {
        return { error: `API Limit/Info: ${data['Information']}` };
    }
    if (data['Error Message']) {
        return { error: `API Error: ${data['Error Message']}` };
    }

    // Basic validation
    if (!data || !data.quarterlyEarnings) {
        return { error: `Invalid Data Structure: ${JSON.stringify(data).substring(0, 100)}...` };
    }

    return {
        symbol: data.symbol,
        quarterlyEarnings: data.quarterlyEarnings
    };
}
