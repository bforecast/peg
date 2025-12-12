import pandas as pd
import numpy as np

class PegStrategy:
    def __init__(self, top_n=5, rebalance_freq='ME'):
        self.top_n = top_n
        self.rebalance_freq = rebalance_freq # 'ME', 'QE', 'W'

    def generate_signals(self, peg_data, prices_dates):
        """
        Generates target weights for each asset over time.
        
        Args:
            peg_data (pd.DataFrame): Index=Date, Cols=Tickers, Vals=PEG Ratio
            prices_dates (pd.DatetimeIndex): The dates for which we have price data (to align rebalancing)
            
        Returns:
            pd.DataFrame: Target weights (Index=Date, Cols=Tickers)
        """
        # Resample logic to find rebalance dates
        # We want to rebalance at the END of each period
        rebalance_dates = peg_data.resample(self.rebalance_freq).last().index
        
        # Initialize weights dataframe with zeros, aligned to price data dates
        weights = pd.DataFrame(0.0, index=peg_data.index, columns=peg_data.columns)
        
        last_weights = pd.Series(0.0, index=peg_data.columns)
        
        # Iterate through dates. For efficiency in this demo, we can just set weights at rebalance points
        # and forward fill, but let's be precise about "signal available at close".
        
        next_rebalance_idx = 0
        
        for date in peg_data.index:
            # Check if this date is a rebalance date or if we passed one
            if next_rebalance_idx < len(rebalance_dates) and date >= rebalance_dates[next_rebalance_idx]:
                # Time to rebalance
                current_pegs = peg_data.loc[date]
                
                # Filter for valid PEG (> 0)
                valid_pegs = current_pegs[current_pegs > 0]
                
                if not valid_pegs.empty:
                    # Sort ascending (Lower PEG is "better" usually)
                    selected = valid_pegs.sort_values().head(self.top_n)
                    
                    # Equal weights
                    w = 1.0 / len(selected)
                    
                    new_weights = pd.Series(0.0, index=peg_data.columns)
                    new_weights[selected.index] = w
                    last_weights = new_weights
                
                next_rebalance_idx += 1
            
            weights.loc[date] = last_weights

        return weights
