import requests
import sys

def update_prices(base_url, symbol):
    """Fetch price data for a symbol"""
    print(f"Fetching price data for {symbol}...")
    
    try:
        response = requests.post(
            f"{base_url}/api/update-prices",
            params={"symbol": symbol},
            timeout=60
        )
        
        data = response.json()
        
        if response.status_code == 200:
            print(f"✅ Success: {data.get('message', 'OK')}")
            print(f"   Records added: {data.get('count', 0)}")
            return True
        else:
            print(f"❌ Error: {data.get('error', 'Unknown error')}")
            return False
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python update_prices.py <WORKER_URL> <SYMBOL>")
        print("Example: python update_prices.py https://earnings-worker.brilliantforecast.workers.dev AAPL")
        sys.exit(1)
    
    url = sys.argv[1].rstrip('/')
    symbol = sys.argv[2].upper()
    
    print(f"Worker URL: {url}")
    print(f"Symbol: {symbol}\n")
    
    success = update_prices(url, symbol)
    
    if success:
        print(f"\n✅ Price data ready! Now you can analyze {symbol}")
        print(f"   Visit: {url}/?symbol={symbol}")
    else:
        print(f"\n❌ Failed to fetch price data")
        sys.exit(1)
