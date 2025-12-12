import yfinance as yf
import pandas as pd

msft = yf.Ticker("MSFT")

print(f"Current PEG Ratio (info): {msft.info.get('pegRatio')}")

print("\n--- Earnings Estimate (Next 2 years usually) ---")
try:
    # It returns a DataFrame typically
    print(msft.earnings_estimate) 
except Exception as e:
    print(f"Error getting earnings_estimate: {e}")

print("\n--- Earnings History (Past 4 quarters) ---")
try:
    print(msft.earnings_history)
except Exception as e:
    print(f"Error getting earnings_history: {e}")

