import requests
import pandas as pd
from io import StringIO

def fetch_qqq_robust():
    url = "https://en.wikipedia.org/wiki/Nasdaq-100"
    try:
        # Use requests with verify=False to bypass SSL issues in this env
        response = requests.get(url, verify=False)
        response.raise_for_status()
        
        tables = pd.read_html(StringIO(response.text))
        
        target_table = None
        for t in tables:
            if "Ticker" in t.columns or "Symbol" in t.columns:
                target_table = t
                break
                
        if target_table is not None:
            col = "Ticker" if "Ticker" in target_table.columns else "Symbol"
            tickers = target_table[col].tolist()
            print(f"SUCCESS: Found {len(tickers)} tickers.")
            print(f"First 10: {tickers[:10]}")
            return tickers
        else:
            print("Failed to find table in parsed HTML.")
            return []

    except Exception as e:
        print(f"Error fetching QQQ: {e}")
        return []

if __name__ == "__main__":
    fetch_qqq_robust()
