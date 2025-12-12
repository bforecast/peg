import pandas as pd

def test_fetch_qqq():
    try:
        print("Attempting to read Wikipedia table...")
        # Wikipedia URL for NASDAQ-100
        url = "https://en.wikipedia.org/wiki/Nasdaq-100"
        tables = pd.read_html(url)
        
        # Usually the constituents table is the 5th table (index 4) or similar, 
        # but let's look for one with "Ticker"
        
        target_table = None
        for t in tables:
            if "Ticker" in t.columns or "Symbol" in t.columns:
                target_table = t
                break
        
        if target_table is not None:
            print(f"Found table with {len(target_table)} rows.")
            print(target_table.head())
            
            # Extract tickers
            col = "Ticker" if "Ticker" in target_table.columns else "Symbol"
            tickers = target_table[col].tolist()
            print(f"First 10 tickers: {tickers[:10]}")
        else:
            print("Could not find constituents table.")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_fetch_qqq()
