import yfinance as yf
import pandas as pd
import logging
from datetime import datetime

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def fetch_current_peg_snapshot(tickers):
    """
    Fetches current Forward PEG data for a list of tickers.
    Since 'pegRatio' in yf.info is often missing, we calculate it:
    PEG = (Price / Forward EPS) / (Growth Rate * 100)
    
    We uses '+1y' estimate for Forward EPS and Growth.
    """
    results = []
    
    for ticker in tickers:
        logger.info(f"Fetching data for {ticker}...")
        try:
            t = yf.Ticker(ticker)
            
            # Get Current Price
            # Try fast_info first (faster)
            try:
                price = t.fast_info['last_price']
            except:
                hist = t.history(period="1d")
                if not hist.empty:
                    price = hist['Close'].iloc[-1]
                else:
                    logger.warning(f"Could not get price for {ticker}")
                    continue
            
            # Get Estimates
            estimates = t.earnings_estimate
            if estimates is None or estimates.empty:
                logger.warning(f"No estimates found for {ticker}")
                continue
            
            # Use '+1y' row (Next Fiscal Year)
            # Sometimes index is '+1y', sometimes '0y' depending on fiscal calendar vs today.
            # We prefer '+1y' for "Forward".
            
            row = None
            if '+1y' in estimates.index:
                row = estimates.loc['+1y']
            elif '0y' in estimates.index:
                row = estimates.loc['0y'] # Fallback
            
            if row is not None:
                eps_est = row['avg']
                growth = row['growth'] # e.g. 0.15 for 15%
                
                # Calculate Metrics
                if eps_est > 0:
                    forward_pe = price / eps_est
                else:
                    forward_pe = None # Negative earnings
                
                peg = None
                if forward_pe and growth and growth > 0:
                   # PEG formula: PE / (Growth * 100)
                   peg = forward_pe / (growth * 100)
                
                results.append({
                    'Ticker': ticker,
                    'Price': price,
                    'Forward_EPS_Est': eps_est,
                    'Growth_Est': growth,
                    'Forward_PE': forward_pe,
                    'Calculated_PEG': peg
                })
                
        except Exception as e:
            logger.error(f"Error processing {ticker}: {e}")
            
    return pd.DataFrame(results)

def main():
    # Define Universe (Same as data_loader)
    top_tech_stocks = [
        "AAPL", "MSFT", "AMZN", "GOOGL", "META", 
        "TSLA", "NVDA", "PYPL", "ADBE", "NFLX",
        "INTC", "CSCO", "CMCSA", "PEP", "AVGO"
    ]
    
    logger.info(f"Starting snapshot for {len(top_tech_stocks)} stocks...")
    df = fetch_current_peg_snapshot(top_tech_stocks)
    
    if not df.empty:
        filename = f"current_forward_peg_{datetime.today().strftime('%Y-%m-%d')}.csv"
        df.to_csv(filename, index=False)
        logger.info(f"Successfully saved snapshot to {filename}")
        print(df[['Ticker', 'Calculated_PEG', 'Forward_PE', 'Growth_Est']].head(15))
    else:
        logger.error("No data collected.")

if __name__ == "__main__":
    main()
