import requests
import time
import sys

# Tickers from src/tickers.ts
QQQ_TICKERS = [
    "AAPL", "MSFT", "AMZN", "AVGO", "NVDA", "META", "TSLA", "GOOGL", "GOOG", "COST",
    "ADBE", "AMD", "NFLX", "PEP", "CSCO", "TMUS", "CMCSA", "INTC", "QCOM", "TXN",
    "AMGN", "HON", "INTU", "AMAT", "BKNG", "SBUX", "ISRG", "MDLZ", "GILD", "ADP",
    "VRTX", "ADI", "REGN", "LRCX", "PYPL", "PANW", "SNPS", "MELI", "KLAC", "CDNS",
    "CHTR", "CSX", "MAR", "ORLY", "ASML", "CTAS", "NXPI", "MNST", "WDAY", "ODFL",
    "AEP", "CPRT", "LULU", "PCAR", "DXCM", "PAYX", "ROST", "IDXX", "ADSK", "KDP",
    "EXC", "MRVL", "BKR", "AZN", "FAST", "CTSH", "EA", "VRSK", "CSGP", "GEHC",
    "XEL", "MCHP", "BIIB", "TEAM", "GFS", "ON", "DLTR", "ANSS", "WBD", "CEG",
    "TTD", "FANG", "ALGN", "ILMN", "WBA", "CRWD", "DDOG", "ZS", "LCID", "SIRI"
]

from requests.adapters import HTTPAdapter
from requests.packages.urllib3.util.retry import Retry

def backfill(base_url, delay=15):
    print(f"Starting backfill for {len(QQQ_TICKERS)} tickers...")
    print(f"Target URL: {base_url}")
    print(f"Delay between requests: {delay} seconds")
    
    # Configure session with retries and headers
    session = requests.Session()
    retries = Retry(total=5, backoff_factor=2, status_forcelist=[502, 503, 504])
    session.mount('https://', HTTPAdapter(max_retries=retries))
    session.headers.update({
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })

    success_count = 0
    fail_count = 0
    
    for i, symbol in enumerate(QQQ_TICKERS):
        print(f"[{i+1}/{len(QQQ_TICKERS)}] Updating {symbol}...", end=' ', flush=True)
        try:
            # Note: The worker endpoint expects POST
            response = session.post(f"{base_url}/api/update", params={"symbol": symbol}, timeout=30)
            if response.status_code == 200:
                data = response.json()
                print(f"OK - {data.get('message', 'No msg')} (Count: {data.get('count', 0)})")
                success_count += 1
            else:
                print(f"Failed ({response.status_code}): {response.text}")
                fail_count += 1
        except Exception as e:
            print(f"Error: {e}")
            fail_count += 1
            
        if i < len(QQQ_TICKERS) - 1:
            time.sleep(delay)
            
    print("\n--------------------------")
    print(f"Backfill Complete. Success: {success_count}, Failed: {fail_count}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python backfill_earnings.py <WORKER_URL> [DELAY_SECONDS]")
        print("Example: python backfill_earnings.py https://my-worker.workers.dev 15")
        print("Example (Local): python backfill_earnings.py http://localhost:8787 5")
        sys.exit(1)
        
    url = sys.argv[1].rstrip('/')
    delay_sec = int(sys.argv[2]) if len(sys.argv) > 2 else 15
    
    backfill(url, delay_sec)
