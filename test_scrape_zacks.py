import requests
from bs4 import BeautifulSoup
import re
import json

def fetch_zacks_peg(ticker="NVDA"):
    url = f"https://www.zacks.com/stock/chart/{ticker}/fundamental/peg-ratio-ttm"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://www.google.com/"
    }
    
    print(f"Fetching {url}...")
    try:
        response = requests.get(url, headers=headers)
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            html = response.text
            with open("zacks_dump.html", "w", encoding="utf-8") as f:
                f.write(html)
            print("Saved HTML to zacks_dump.html")
            
            # Look for the data usually embedded in highcharts or similar
            # Common patterns: "data: [...]", "chart_data = {...}"
            
            # Pattern 1: Look for JSON assignment
            # document.obj_data = { ... } which Zacks often uses
            match = re.search(r'document\.obj_data\s*=\s*({.*?});', html, re.DOTALL)
            if match:
                print("Found document.obj_data!")
                json_str = match.group(1)
                try:
                    data = json.loads(json_str)
                    print("Successfully parsed JSON.")
                    # Preview keys
                    print("Keys:", data.keys())
                    # Look for PEG data specifically
                    if "peg_ratio_ttm" in str(data):
                        print("Found 'peg_ratio_ttm' in data structure.")
                    else:
                        print("Data found but 'peg_ratio_ttm' not explicitly key. Might be nested.")
                        # Print a snippet
                        print("Snippet:", str(data)[:500])
                except json.JSONDecodeError:
                    print("Failed to decode JSON from regex match.")
            else:
                print("Could not find 'document.obj_data'. Dumping first 500 chars of scripts to see pattern...")
                soup = BeautifulSoup(html, 'html.parser')
                scripts = soup.find_all('script')
                for i, s in enumerate(scripts):
                    if s.string and "peg-ratio-ttm" in s.string:
                        print(f"Script {i} contains 'peg-ratio-ttm':")
                        print(s.string[:200])
                        break
        else:
            print("Failed to retrieve page.")
            
            with open("zacks_dump.html", "w", encoding="utf-8") as f:
                f.write(html)
            print("Saved HTML to zacks_dump.html")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fetch_zacks_peg()
