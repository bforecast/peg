import requests
import json

def test_alpha_vantage():
    # Alpha Vantage Demo Key usually works for IBM
    url = "https://www.alphavantage.co/query?function=EARNINGS&symbol=IBM&apikey=demo"
    
    try:
        r = requests.get(url)
        data = r.json()
        
        qt = data.get('quarterlyEarnings', [])
        print(f"Number of quarterly reports: {len(qt)}")
        
        if qt:
            print("First 3 records:")
            print(json.dumps(qt[:3], indent=2))
            
            print("Last 3 records:")
            print(json.dumps(qt[-3:], indent=2))
            
    except Exception as e:
        print(e)

if __name__ == "__main__":
    test_alpha_vantage()
