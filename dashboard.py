import streamlit as st
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

st.set_page_config(page_title="Forward PEG Backtester", layout="wide")

st.title("Forward PEG Stock Selection System")

# Sidebar Configuration
st.sidebar.header("Configuration")

api_key_input = st.sidebar.text_input("Alpha Vantage API Key", value=os.getenv("ALPHA_VANTAGE_API_KEY", ""), type="password")
if not api_key_input:
    st.sidebar.warning("Please provide an API Key in .env or here.")

etf_ticker = st.sidebar.text_input("Universe ETF (Benchmark)", value="QQQ")
start_date = st.sidebar.date_input("Start Date", value=datetime(2020, 1, 1))
end_date = st.sidebar.date_input("End Date", value=datetime.today())
top_n = st.sidebar.number_input("Top N Stocks", min_value=1, max_value=20, value=5)

if st.sidebar.button("Run Backtest"):
    if not api_key_input:
        st.error("API Key is required to fetch earnings data.")
    else:
        with st.spinner("Fetching Data & Running Backtest..."):
            # 1. Initialize
            dp = DataProvider(api_key=api_key_input)
            
            # 2. Universe
            universe = dp.fetch_universe_constituents(etf_ticker)
            st.write(f"Universe Size: {len(universe)} stocks (from {etf_ticker} proxy)")
            
            # 3. Prices
            # Fetch 1 year extra data for Growth calculation (Lookback 252 days)
            buffer_start = start_date - pd.Timedelta(days=400) # 400 days to be safe for 252 trading days
            
            s_str_fetch = buffer_start.strftime('%Y-%m-%d')
            s_str_backtest = start_date.strftime('%Y-%m-%d')
            e_str = end_date.strftime('%Y-%m-%d')
            
            # Fetch Stock Prices (Extended)
            prices_full = dp.fetch_price_history(universe, s_str_fetch, e_str)
            
            # Fetch Benchmark Price (Extended)
            bm_price_full = dp.fetch_price_history([etf_ticker], s_str_fetch, e_str)
            
            if prices_full.empty:
                st.error("No price data found.")
                st.stop()
                
            # 4. Earnings / PEG
            try:
                # Use extended range for fetching earnings
                earnings_data = dp.get_forward_peg_data(universe, s_str_fetch, e_str)
                
                # PEG Calc Logic
                common_idx = prices_full.index.intersection(earnings_data.index)
                p_aligned = prices_full.loc[common_idx]
                e_aligned = earnings_data.loc[common_idx]
                
                fw_pe = p_aligned / e_aligned
                e_shift = e_aligned.shift(252) # Requires ~1 year of data
                growth = (e_aligned / e_shift) - 1
                
                # Filter growth
                growth = growth.replace([float('inf'), float('-inf')], float('nan'))
                growth[growth < 0.01] = float('nan') # Minimum 1% growth
                
                peg_ratio_full = fw_pe / (growth * 100)
                peg_ratio_full = peg_ratio_full.ffill(limit=10)
                
            except Exception as e:
                st.error(f"Error calculating PEG: {e}")
                st.stop()
                
            # --- TRIM DATA TO USER SELECTION ---
            # Now satisfying the user request: We have 2019 data used for calc, 
            # so 2020-01-01 should have valid signals.
            
            mask_prices = (prices_full.index >= s_str_backtest)
            prices = prices_full.loc[mask_prices]
            
            mask_peg = (peg_ratio_full.index >= s_str_backtest)
            peg_ratio = peg_ratio_full.loc[mask_peg]
            
            if not bm_price_full.empty:
                mask_bm = (bm_price_full.index >= s_str_backtest)
                bm_price = bm_price_full.loc[mask_bm]
            else:
                bm_price = pd.DataFrame()
            
            # Align indices exactly
            common_dates = prices.index.intersection(peg_ratio.index)
            prices = prices.loc[common_dates]
            peg_ratio = peg_ratio.loc[common_dates]
            
            if not bm_price.empty:
                # Benchmark aligned to same start date (it might have slightly diff trading days if yahoo issues, but usually fine)
                # Just ensure it starts >= start_date
                pass

            # 5. Strategy
            strat = PegStrategy(top_n=top_n, rebalance_freq='ME')
            weights = strat.generate_signals(peg_ratio, prices.index)
            
            # 6. Backtest Portfolio
            bt = Backtester(initial_capital=10000.0)
            res_port = bt.run_backtest(prices, weights)
            
            # 7. Backtest Benchmark (Buy and Hold)
            # Create weights 1.0 for benchmark
            if not bm_price.empty:
                bm_weights = pd.DataFrame(1.0, index=bm_price.index, columns=bm_price.columns)
                res_bm = bt.run_backtest(bm_price, bm_weights)
            else:
                res_bm = None
            
            # 8. Metrics Comparison
            st.subheader("Performance Metrics")
            
            bm_ret = res_bm['Daily_Return'] if res_bm is not None else None
            bm_curve = res_bm['Portfolio_Value'] if res_bm is not None else None
            
            stats = Metrics.get_summary_stats(
                res_port['Daily_Return'], 
                res_port['Portfolio_Value'],
                benchmark_returns=bm_ret,
                benchmark_curve=bm_curve
            )
            
            # Display Metrics
            # Display Metrics
            st.divider()
            
            # Row 1: Key Performance
            k1, k2, k3, k4 = st.columns(4)
            k1.metric("Strategy Return", stats.get("Total Return"), delta=stats.get("Active Return"))
            k2.metric("CAGR", stats.get("CAGR"))
            k3.metric("Sharpe Ratio", stats.get("Sharpe Ratio"))
            k4.metric("Max Drawdown", stats.get("Max Drawdown"))
            
            # Row 2: Advanced Risk/Return
            a1, a2, a3, a4 = st.columns(4)
            a1.metric("Volatility (Ann.)", stats.get("Volatility"))
            a2.metric("Sortino Ratio", stats.get("Sortino Ratio"))
            a3.metric("Calmar Ratio", stats.get("Calmar Ratio"))
            a4.metric("Active Return", stats.get("Active Return", "N/A"))
            
            # Benchmark Comparison Row
            if res_bm is not None:
                st.markdown("### Benchmark Performance (QQQ)")
                b1, b2, b3, b4 = st.columns(4)
                b1.metric("Benchmark Return", stats.get("Benchmark Return"))
                b2.metric("Benchmark CAGR", stats.get("Benchmark CAGR"))
                b3.metric("Benchmark Sharpe", stats.get("Benchmark Sharpe"))
                b4.metric("Benchmark MDD", stats.get("Benchmark MDD"))
                
                b5, b6, b7, b8 = st.columns(4)
                b5.metric("Benchmark Volatility", stats.get("Benchmark Volatility"))
                b6.metric("Benchmark Sortino", stats.get("Benchmark Sortino"))
                b7.metric("Benchmark Calmar", stats.get("Benchmark Calmar"))
                b8.empty()
            st.divider()
            
            # Debug Prints to Console
            print("--- Dashboard Debug ---")
            print("Portfolio Value Head:")
            print(res_port['Portfolio_Value'].head())
            print("Portfolio Value Tail:")
            print(res_port['Portfolio_Value'].tail())
            
            # 9. Charts
            st.subheader("Equity Curve Comparison")
            
            # Use native Streamlit chart (proven to work)
            chart_data = res_port[['Portfolio_Value']].rename(columns={'Portfolio_Value': 'Strategy'})
            
            if res_bm is not None:
                 # Normalize benchmark to same start capital
                 start_val_port = res_port['Portfolio_Value'].iloc[0]
                 start_val_bm = res_bm['Portfolio_Value'].iloc[0]
                 if start_val_bm > 0:
                     bm_norm = res_bm['Portfolio_Value'] * (start_val_port / start_val_bm)
                     chart_data['Benchmark'] = bm_norm
            
            st.line_chart(chart_data)
            
            # 10. Drawdown Chart
            st.subheader("Drawdown Analysis")
            dd_port = (res_port['Portfolio_Value'] / res_port['Portfolio_Value'].cummax()) - 1
            dd_df = pd.DataFrame(dd_port).rename(columns={'Portfolio_Value': 'Strategy'})
            
            if res_bm is not None:
                dd_bm = (res_bm['Portfolio_Value'] / res_bm['Portfolio_Value'].cummax()) - 1
                dd_df['Benchmark'] = dd_bm
            
            st.area_chart(dd_df)
            
            # Show Rebalance Details
            st.subheader("Rebalancing History")
            with st.expander("See Monthly Rebalance Details", expanded=True):
                # Logic to extract rebalance events
                # Problem: weights.diff() skips months where portfolio didn't change.
                # Fix: Explicitly selecting the first trading day of each month to show the standing portfolio.
                
                # Resample to get the first entry of each month (MS = Month Start)
                # We need the ACTUAL dates, so we can't just use resample().first() which might set index to 1st of month.
                # Instead, we identify the indices.
                
                weights.index.name = 'Date' # Still good practice
                weights['YearMonth'] = weights.index.to_period('M')
                # Safer groupby that doesn't rely on reset_index column naming
                rebal_dates = weights.index.to_series().groupby(weights['YearMonth']).first()
                # Drop the simple column we added to not mess up valid_pegs check later if we reused 'weights'
                weights = weights.drop(columns=['YearMonth'])
                
                rebal_events = weights.loc[rebal_dates]
                
                details = []
                for date, row in rebal_events.iterrows():
                    # Get non-zero tickers
                    holdings = row[row > 0.001].index.tolist()
                    
                    if holdings:
                         # Look up PEG values for these holdings at this date
                         # We need to ensure we look at the date *before* the shift if we were strict,
                         # but here 'peg_ratio' is aligned to 'weights' dates.
                         # Weights are generated from peg_ratio at 'date'.
                         
                         holdings_str = []
                         for ticker in holdings:
                             try:
                                 val = peg_ratio.loc[date, ticker]
                                 holdings_str.append(f"{ticker} ({val:.2f})")
                             except:
                                 holdings_str.append(f"{ticker} (N/A)")
                         
                         details.append({
                            "Date": date.strftime('%Y-%m-%d'),
                            "Holdings": ", ".join(holdings_str),
                            "Count": len(holdings)
                        })
                
                df_details = pd.DataFrame(details)
                st.dataframe(df_details, use_container_width=True)

else:
    st.info("Configure parameters on the left sidebar and click 'Run Backtest'.")
