import requests
import pandas as pd
import time
import argparse
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

API_KEY = "demo" # Default demo key, user should provide their own

def fetch_earnings_data(ticker, api_key):
    """
    Fetches quarterly earnings data including analyst estimates from Alpha Vantage.
    """
    url = f"https://www.alphavantage.co/query?function=EARNINGS&symbol={ticker}&apikey={api_key}"
    try:
        response = requests.get(url)
        data = response.json()
        
        if "quarterlyEarnings" in data:
            return data["quarterlyEarnings"]
        else:
            logger.warning(f"No quarterly earnings data found for {ticker}. Response: {list(data.keys())}")
            return []
    except Exception as e:
        logger.error(f"Error fetching data for {ticker}: {e}")
        return []

def process_earnings_history(tickers, api_key, years=5):
    """
    Fetches and processes earnings history for a list of tickers.
    Returns a DataFrame with Date, Ticker, EstimatedEPS, ReportedEPS.
    """
    all_data = []
    start_year = datetime.now().year - years
    
    for ticker in tickers:
        logger.info(f"Fetching earnings history for {ticker}...")
        raw_data = fetch_earnings_data(ticker, api_key)
        
        for entry in raw_data:
            fiscal_date = entry.get('fiscalDateEnding')
            estimated_eps = entry.get('estimatedEPS')
            reported_eps = entry.get('reportedEPS')
            
            if fiscal_date and estimated_eps:
                dt = datetime.strptime(fiscal_date, '%Y-%m-%d')
                if dt.year >= start_year:
                    all_data.append({
                        'Ticker': ticker,
                        'Date': fiscal_date,
                        'Estimated_EPS': float(estimated_eps),
                        'Reported_EPS': float(reported_eps) if reported_eps and reported_eps != 'None' else None
                    })
        
        # Rate limiting: Alpha Vantage free tier is ~5 calls per minute
        # We sleep 12 seconds to be safe if running a list
        if len(tickers) > 1:
            logger.info("Sleeping 12s to respect API rate limits...")
            time.sleep(12)
            
    df = pd.DataFrame(all_data)
    if not df.empty:
        df = df.sort_values(by=['Ticker', 'Date'])
    return df

import os
from dotenv import load_dotenv

load_dotenv()

def main():
    parser = argparse.ArgumentParser(description='Fetch Historical Analyst Estimates (Alpha Vantage)')
    parser.add_argument('--key', type=str, default=None, help='Alpha Vantage API Key')
    parser.add_argument('--tickers', type=str, default='IBM', help='Comma separated tickers (e.g. IBM,MSFT)')
    args = parser.parse_args()
    
    api_key = args.key
    if not api_key:
        api_key = os.getenv("ALPHA_VANTAGE_API_KEY")
        if not api_key:
            # Fallback for compatibility if user expects old default
            api_key = 'demo' 
    
    ticker_list = [t.strip() for t in args.tickers.split(',')]
    
    safe_key = f"...{api_key[-4:]}" if api_key and len(api_key) > 4 else api_key
    logger.info(f"Starting fetch for {len(ticker_list)} tickers using key ending in {safe_key}")
    
    df = process_earnings_history(ticker_list, api_key)
    
    if not df.empty:
        filename = f"historical_estimates_{datetime.now().strftime('%Y%m%d')}.csv"
        df.to_csv(filename, index=False)
        logger.info(f"Saved {len(df)} records to {filename}")
        print(df.head())
    else:
        logger.warning("No data retrieved.")

if __name__ == "__main__":
    main()
