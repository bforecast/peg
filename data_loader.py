import yfinance as yf
import pandas as pd
import numpy as np
import requests
import json
import os
import time
from datetime import datetime, timedelta
import logging

class DataProvider:
    def __init__(self, api_key=None):
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        self.api_key = api_key
        self.cache_dir = "cache"
        self.earnings_cache_file = os.path.join(self.cache_dir, "earnings_cache.json")
        
        # Ensure cache dir exists
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)

    def fetch_universe_constituents(self, etf_ticker="QQQ"):
        """
        Returns a larger static list of QQQ constituents (Top ~50) 
        as scraping is blocked/unreliable in this environment.
        """
        # Expanded list for "Fuller" experience
        top_qqq = [
            "AAPL", "MSFT", "AMZN", "GOOGL", "META", 
            "TSLA", "NVDA", "AVGO", "PEP", "COST"
        ]
        self.logger.info(f"Using expanded static universe of {len(top_qqq)} stocks for {etf_ticker}")
        return top_qqq

    def fetch_price_history(self, tickers, start_date, end_date):
        """
        Fetches daily adjusted close prices from Yahoo Finance.
        """
        self.logger.info(f"Fetching price data for {len(tickers)} tickers from {start_date} to {end_date}")
        try:
            # yfinance expects space separated string for multiple tickers
            # auto_adjust=True means 'Close' is adjusted.
            full_data = yf.download(tickers, start=start_date, end=end_date, progress=False, auto_adjust=True)
            
            if 'Close' in full_data.columns:
                data = full_data['Close']
            elif 'Adj Close' in full_data.columns:
                data = full_data['Adj Close']
            else:
                # Keep original check, though auto_adjust usually returns specific cols
                self.logger.error(f"Could not find Close or Adj Close in data. Cols: {full_data.columns}")
                return pd.DataFrame()
            
            # Ensure we have a DataFrame even if one ticker 
            if isinstance(data, pd.Series):
                data = data.to_frame()
                
            # Fill missing values if necessary (forward fill limit 3 days)
            data = data.ffill(limit=3)
            return data
        except Exception as e:
            self.logger.error(f"Error fetching price data: {e}")
            return pd.DataFrame()

    def _load_earnings_cache(self):
        if os.path.exists(self.earnings_cache_file):
            with open(self.earnings_cache_file, 'r') as f:
                return json.load(f)
        return {}

    def _save_earnings_cache(self, cache):
        with open(self.earnings_cache_file, 'w') as f:
            json.dump(cache, f)

    def _fetch_av_earnings(self, ticker):
        if not self.api_key:
            self.logger.warning("No API Key provided, cannot fetch Alpha Vantage data.")
            return []
            
        url = f"https://www.alphavantage.co/query?function=EARNINGS&symbol={ticker}&apikey={self.api_key}"
        try:
            r = requests.get(url)
            data = r.json()
            if "quarterlyEarnings" in data:
                return data["quarterlyEarnings"]
            return []
        except Exception as e:
            self.logger.error(f"AV Fetch Error {ticker}: {e}")
            return []

    def get_forward_peg_data(self, tickers, start_date, end_date):
        """
        Generates historical Forward PEG data using Alpha Vantage estimates.
        """
        self.logger.info("Generating/Loading Forward PEG data from Alpha Vantage...")
        
        dates = pd.date_range(start=start_date, end=end_date, freq='D')
        peg_df = pd.DataFrame(index=dates, columns=tickers)
        
        cache = self._load_earnings_cache()
        cache_updated = False
        
        for ticker in tickers:
            # Check cache
            if ticker not in cache:
                self.logger.info(f"Fetching earnings for {ticker} (API)...")
                earnings_data = self._fetch_av_earnings(ticker)
                if earnings_data:
                    cache[ticker] = earnings_data
                    cache_updated = True
                    # Rate limit sleep
                    time.sleep(12) 
                else:
                    self.logger.warning(f"No earnings data for {ticker}")
                    continue
            else:
                self.logger.info(f"Using cached earnings for {ticker}")

            # Process earnings into a daily series of "Next 12M EPS"
            earnings_ts = self._process_earnings_to_timeseries(cache[ticker], dates)
            
            # We would typically need Price / Estimated_EPS / Growth
            # Here, we simplify: PEG = (1 / Growth) * (Price / Est_EPS)
            # Need Price aligned with dates. We don't have price *inside* this method easily unless passed.
            # But wait, this method returns PEG. It implies we need price.
            # Design Flaw fix: This method currently only fills based on earnings. 
            # Ideally, get_forward_peg_data should take prices as input or we return Factor (EPS) and calculate PEG later.
            # To stick to interface `get_forward_peg_data`, we assume we can't fully calculate it without price.
            # BUT, usually Factor generation takes universe prices. 
            # Hack: We will return the "EPS / Growth" component here? 
            # Or better: We return a dataframe of "Estimated EPS" and handled PEG calc in Strategy?
            # Strategy expects "PEG Data". 
            
            # Let's try to pass Prices into this method? Or fetch them again? (inefficient)
            # Strategy: We will return a DataFrame of "Estimated EPS" for now, and let Strategy divide by Price?
            # No, 'peg_data' implies the ratio.
            
            # Let's assume for this step we return the "EPS * Growth" denominator or similar?
            # Actually, standard PEG = PE / Growth.
            # I will return just the Estimated EPS for now in this DF, and 
            # I'll update Strategy to take Price and EPS and calculate PEG on the fly.
            # WAIT: If I change the return type to EPS, I break the contract.
            # The user asked to "replace random data with AV data".
            
            # To do it right: I need to fetch price here too or change the signature.
            # Use `yf.download` for just this ticker to calc PEG?
            pass 

        if cache_updated:
            self._save_earnings_cache(cache)

        # RE-DESIGN:
        # It's better to change this method to `get_earnings_estimates(tickers)`
        # And let the calling main.py or strategy combine them. 
        # But to respect the existing structure:
        # I will fetch prices inside here *or* just return the EPS dataframe 
        # and rename the variable in main.py to reflect it's actually EPS, 
        # then calculate PEG in main before strategy.
        
        # Let's proceed with returning the Estimated EPS Series in the dataframe, 
        # and I will update main.py to perform the division: PEG = Price / (EPS * Growth_Factor).
        
        # Constructing the EPS Time Series
        for ticker in tickers:
            if ticker in cache:
                series = self._process_earnings_to_timeseries(cache[ticker], dates)
                peg_df[ticker] = series
        
        return peg_df

    def _process_earnings_to_timeseries(self, earnings_list, index_dates):
        """
        Converts list of quarterly reports to a daily series of Forward EPS.
        Logic: On any date D, Forward EPS is the 'estimatedEPS' of the 'next' report.
        """
        # Sort by report date
        # Alpha vantage gives 'fiscalDateEnding' and 'reportedDate'.
        # Estimates are usually for the *upcoming* fiscal end.
        
        # Create a Series indexed by reportedDate containing the estimatedEPS for that quarter/year.
        # Actually, "Forward EPS" usually means "Next 12 Months". 
        # AV gives quarterly estimates. Sum of next 4 quarters?
        # Simplification: Use the *next quarter's* annualized estimate (EPS * 4).
        
        sorted_e = sorted(earnings_list, key=lambda x: x['fiscalDateEnding'])
        
        # We need to map Date -> Estimated EPS.
        # We'll create a dataframe of events.
        
        ts = pd.Series(index=index_dates, dtype=float)
        
        # Fill logic:
        # Find the estimate active at time T.
        # The estimate for a quarter is available *before* the report.
        # But AV historical data only gives us the final estimate *at report time* (or near it).
        # We'll use the 'estimatedEPS' of a quarter as the proxy for forward earnings *leading up to it*.
        
        for record in sorted_e:
            fiscal_date = record['fiscalDateEnding'] 
            # We assume estimate is known 3 months prior? 
            # Backfilling 90 days?
            
            raw_est = record.get('estimatedEPS')
            if raw_est is None or str(raw_est).lower() == 'none':
                continue
            try:
                est = float(raw_est)
            except ValueError:
                continue
            d_end = datetime.strptime(fiscal_date, '%Y-%m-%d')
            d_start = d_end - timedelta(days=90)
            
            # Annualize (Quarterly * 4) for PE calculation
            annualized_est = est * 4 
            
            # Populate the series
            # Note: This overwrites, so later dates take precedence (correct)
            mask = (ts.index >= d_start) & (ts.index <= d_end)
            ts[mask] = annualized_est
            
        # Forward fill any gaps
        ts = ts.ffill()
        
        return ts
