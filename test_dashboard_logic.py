import pandas as pd
from datetime import datetime
import os
import sys

# Ensure d:/AntigravityProjects/forward_peg_system is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from data_loader import DataProvider
from strategy import PegStrategy
from backtester import Backtester
from metrics import Metrics
from dotenv import load_dotenv

# Load env variables (API Key)
load_dotenv()

def run_test():
    print("Starting Dashboard Logic Test...")
    
    api_key = os.getenv("ALPHA_VANTAGE_API_KEY", "")
    if not api_key:
        print("WARNING: ALPHA_VANTAGE_API_KEY not found in env.")

    etf_ticker = "QQQ"
    start_date = datetime(2020, 1, 1)
    end_date = datetime.now()
    top_n = 5
    
    # 1. Initialize
    print("1. Initializing DataProvider...")
    dp = DataProvider(api_key=api_key)
    
    # 2. Universe
    print(f"2. Fetching Universe for {etf_ticker}...")
    universe = dp.fetch_universe_constituents(etf_ticker)
    print(f"   Universe Size: {len(universe)} stocks")
    
    # 3. Prices
    print("3. Fetching Prices...")
    buffer_start = start_date - pd.Timedelta(days=400)
    s_str_fetch = buffer_start.strftime('%Y-%m-%d')
    s_str_backtest = start_date.strftime('%Y-%m-%d')
    e_str = end_date.strftime('%Y-%m-%d')
    
    prices_full = dp.fetch_price_history(universe, s_str_fetch, e_str)
    print(f"   Prices Shape: {prices_full.shape}")
    
    bm_price_full = dp.fetch_price_history([etf_ticker], s_str_fetch, e_str)
    
    if prices_full.empty:
        print("ERROR: No price data found.")
        return

    # 4. Earnings / PEG
    print("4. Calculating PEG...")
    try:
        earnings_data = dp.get_forward_peg_data(universe, s_str_fetch, e_str)
        
        common_idx = prices_full.index.intersection(earnings_data.index)
        p_aligned = prices_full.loc[common_idx]
        e_aligned = earnings_data.loc[common_idx]
        
        fw_pe = p_aligned / e_aligned
        e_shift = e_aligned.shift(252)
        growth = (e_aligned / e_shift) - 1
        
        growth = growth.replace([float('inf'), float('-inf')], float('nan'))
        growth[growth < 0.01] = float('nan')
        
        peg_ratio_full = fw_pe / (growth * 100)
        peg_ratio_full = peg_ratio_full.ffill(limit=10)
        print("   PEG Ratio Calculated.")
        
    except Exception as e:
        print(f"ERROR calculating PEG: {e}")
        return

    # Trim Data
    mask_prices = (prices_full.index >= s_str_backtest)
    prices = prices_full.loc[mask_prices]
    
    mask_peg = (peg_ratio_full.index >= s_str_backtest)
    peg_ratio = peg_ratio_full.loc[mask_peg]
    
    if not bm_price_full.empty:
        mask_bm = (bm_price_full.index >= s_str_backtest)
        bm_price = bm_price_full.loc[mask_bm]
    else:
        bm_price = pd.DataFrame()
    
    common_dates = prices.index.intersection(peg_ratio.index)
    prices = prices.loc[common_dates]
    peg_ratio = peg_ratio.loc[common_dates]
    
    # 5. Strategy
    print("5. Running Strategy...")
    strat = PegStrategy(top_n=top_n, rebalance_freq='ME')
    weights = strat.generate_signals(peg_ratio, prices.index)
    print("   Signals Generated.")

    # 6. Backtest Portfolio
    print("6. Running Backtest...")
    bt = Backtester(initial_capital=10000.0)
    res_port = bt.run_backtest(prices, weights)
    print(f"   Final Portfolio Value: {res_port['Portfolio_Value'].iloc[-1]:.2f}")

    # 7. Backtest Benchmark
    if not bm_price.empty:
        bm_weights = pd.DataFrame(1.0, index=bm_price.index, columns=bm_price.columns)
        res_bm = bt.run_backtest(bm_price, bm_weights)
        print(f"   Final Benchmark Value: {res_bm['Portfolio_Value'].iloc[-1]:.2f}")
    else:
        res_bm = None

    # 8. Metrics
    print("8. Calculating Metrics...")
    bm_ret = res_bm['Daily_Return'] if res_bm is not None else None
    bm_curve = res_bm['Portfolio_Value'] if res_bm is not None else None
    
    stats = Metrics.get_summary_stats(
        res_port['Daily_Return'], 
        res_port['Portfolio_Value'],
        benchmark_returns=bm_ret,
        benchmark_curve=bm_curve
    )
    
    print("\n--- PERFORMANCE METRICS ---")
    for k, v in stats.items():
        print(f"{k}: {v}")
        
    print("\nDashboard logic test completed successfully.")

if __name__ == "__main__":
    run_test()
