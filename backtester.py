import pandas as pd
import numpy as np

class Backtester:
    def __init__(self, initial_capital=100000.0):
        self.initial_capital = initial_capital

    def run_backtest(self, prices, weights):
        """
        Simulate portfolio performance.
        
        Args:
            prices (pd.DataFrame): Daily Close/Adj Close prices.
            weights (pd.DataFrame): Target weights for each day (0 to 1).
            
        Returns:
            pd.DataFrame: Portfolio metrics (Total Value, Daily Return)
        """
        # Align data
        common_index = prices.index.intersection(weights.index)
        prices = prices.loc[common_index]
        weights = weights.loc[common_index]
        
        # Shift weights by 1 day to avoid lookahead bias
        # Logic: Signal generated at T close, Trade executed at T+1 Close (simplification)
        # or Trade at T+1 Open. If we use Adj Close for prices, T+1 Close is easier to vectorize.
        weights = weights.shift(1).fillna(0)
        
        # Calculate daily returns of the universe assets
        # pct_change gives (P_t - P_{t-1}) / P_{t-1}
        asset_returns = prices.pct_change().fillna(0)
        
        # Portfolio daily return = sum(weight_{t-1} * asset_return_t)
        # Note: This assumes daily rebalancing to target weights, which ignores transaction costs.
        # For a monthly strategy, 'weights' will be constant for a month.
        # This acts as if we drift, then reset, if we strictly followed the 'weights' dataframe which is ffilled.
        # Actually, if weights are constant, it implies daily rebalancing to keep them constant.
        # To simulate "Drift", we would need a more complex loop. 
        # For a "Sharp Ratio" estimation, the daily rebalancing assumption (Strategy Index) is often acceptable
        # and standard for strictly factor-based backtests.
        
        portfolio_returns = (weights * asset_returns).sum(axis=1)
        
        # Calculate equity curve
        equity_curve = (1 + portfolio_returns).cumprod() * self.initial_capital
        
        results = pd.DataFrame({
            'Portfolio_Value': equity_curve,
            'Daily_Return': portfolio_returns
        })
        
        return results
