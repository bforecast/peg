import logging
import pandas as pd
import numpy as np
from datetime import datetime
import argparse

from data_loader import DataProvider
from strategy import PegStrategy
from backtester import Backtester
from metrics import Metrics

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

import os
from dotenv import load_dotenv

# Load env vars
load_dotenv()

def main():
    parser = argparse.ArgumentParser(description='Forward PEG Stock Selection Backtest System')
    parser.add_argument('--etf', type=str, default='QQQ', help='ETF ticker to define universe')
    parser.add_argument('--start', type=str, default='2020-01-01', help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, default=datetime.today().strftime('%Y-%m-%d'), help='End date (YYYY-MM-DD)')
    parser.add_argument('--top_n', type=int, default=5, help='Number of stocks to select')
    parser.add_argument('--api_key', type=str, default=None, help='Alpha Vantage API Key for Real Data')
    args = parser.parse_args()

    # Priority: Command Line > Environment Variable
    api_key = args.api_key
    if not api_key:
        api_key = os.getenv("ALPHA_VANTAGE_API_KEY")

    logger.info("Starting Forward PEG System...")
    
    # 1. Load Data
    data_provider = DataProvider(api_key=api_key)
    
    # Use expanded universe (from data_loader)
    universe_tickers = data_provider.fetch_universe_constituents(args.etf)
    
    # 2. Fetch Prices
    prices = data_provider.fetch_price_history(universe_tickers, args.start, args.end)
    if prices.empty:
        logger.error("No price data found. Exiting.")
        return

    # 3. Fetch Earnings Estimates (Forward EPS)
    # The data_loader now returns Estimated EPS (Annualized)
    logger.info("Fetching Forward Earnings Estimates (this may take time with rate limits)...")
    eps_estimates = data_provider.get_forward_peg_data(universe_tickers, args.start, args.end)
    
    # 4. Calculate Forward PEG
    # PEG = (Price / Estimated_EPS) / (Growth_Rate * 100)
    
    # A. Calculate Forward PE
    # Align dates
    common_idx = prices.index.intersection(eps_estimates.index)
    prices_aligned = prices.loc[common_idx]
    eps_aligned = eps_estimates.loc[common_idx]
    
    forward_pe = prices_aligned / eps_aligned
    
    # B. Calculate Growth Rate
    # We estimate growth as the 1-year change in the Estimated EPS itself
    # Growth = (EPS_t / EPS_{t-1y}) - 1
    # Shift 252 days
    eps_shifted = eps_aligned.shift(252)
    growth_rate = (eps_aligned / eps_shifted) - 1
    
    # Clean growth rate: replace 0, inf, or negative growth
    growth_rate = growth_rate.replace([np.inf, -np.inf], np.nan)
    # Filter reasonable growth (e.g. > 1%) 
    growth_rate[growth_rate < 0.01] = np.nan
    
    # C. PEG Calculation
    # PEG = PE / (Growth * 100). 
    # Note: Traditional PEG uses Growth as integer (20 for 20%), so * 100.
    peg_ratio = forward_pe / (growth_rate * 100)
    
    # Fill missing with previous valid
    peg_ratio = peg_ratio.ffill(limit=10)
    
    # If no API key was provided, peg_ratio will be all NaN (since eps_estimates is empty/NA)
    # In that case, we should probably warn or fallback?
    # For now, we proceed as normal, Strategy handles empty data.
    
    if api_key is None:
        logger.warning("!!! NO API KEY PROVIDED !!!")
        logger.warning("System cannot fetch real earnings. PEG data is missing.")
        logger.warning("Set ALPHA_VANTAGE_API_KEY in .env or use --api_key.")
    
    # 5. Run Strategy
    logger.info("Running Strategy Logic...")
    strategy = PegStrategy(top_n=args.top_n, rebalance_freq='ME')
    weights = strategy.generate_signals(peg_ratio, prices.index)
    
    # 6. Backtest
    logger.info("Running Backtest Simulation...")
    backtester = Backtester()
    results = backtester.run_backtest(prices, weights)
    
    # 7. Metrics
    stats = Metrics.get_summary_stats(results['Daily_Return'], results['Portfolio_Value'])
    
    print("\n" + "="*40)
    print(f" BACKTEST RESULTS ({args.etf})")
    print(f" Universe Size: {len(universe_tickers)}")
    print(f" Top {args.top_n} Stocks by Forward PEG")
    print("="*40)
    for k, v in stats.items():
        print(f" {k:<15}: {v}")
    print("="*40 + "\n")
    
    # Optional: Save results
    results.to_csv("backtest_results.csv")
    peg_ratio.to_csv("derived_peg_ratios.csv")
    
    # 8. Save Rebalance Details
    # Extract snapshot of holdings and PEG at each rebalance
    # We look at weights at month ends (Strategy Freq 'ME' logic)
    # Using 'ME' resample to mimic strategy trigger points
    rebalance_snapshots = weights.resample('ME').last()
    
    rebalance_log = []
    
    for date, row in rebalance_snapshots.iterrows():
        # Find stocks with positive weight
        held_stocks = row[row > 0].index.tolist()
        
        # Look up PEG values. 
        # Note: Strategy uses PEG data available ON that date.
        # We handle case where date might not be in peg_ratio index (weekend), assume ffill valid
        # But 'weights' index logic in strategy handles this. 
        # Generally 'date' in resample matches roughly.
        
        # Safe lookup in peg_ratio
        if date in peg_ratio.index:
            current_pegs = peg_ratio.loc[date]
        else:
            # Try to find nearest preceding date
            idx = peg_ratio.index.get_indexer([date], method='ffill')
            if idx[0] == -1:
                continue
            current_pegs = peg_ratio.iloc[idx[0]]
            
        for ticker in held_stocks:
            val = current_pegs.get(ticker, np.nan)
            rebalance_log.append({
                "Rebalance_Date": date.strftime('%Y-%m-%d'),
                "Ticker": ticker,
                "Forward_PEG": val,
                "Weight": row[ticker]
            })
            
    if rebalance_log:
        pd.DataFrame(rebalance_log).to_csv("rebalance_details.csv", index=False)
        logger.info(f"Rebalance details saved to rebalance_details.csv ({len(rebalance_log)} records)")
    
    logger.info("Results saved to backtest_results.csv")

if __name__ == "__main__":
    main()
