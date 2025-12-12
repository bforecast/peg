import yfinance as yf
import pandas as pd

print("Testing yfinance download for single ticker...")
try:
    data = yf.download("AAPL", period="1mo", progress=False)
    print("Download complete.")
    print(data.head())
except Exception as e:
    print(f"Download failed: {e}")
