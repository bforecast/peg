import numpy as np

class Metrics:
    @staticmethod
    def calculate_sharpe_ratio(daily_returns, risk_free_rate=0.0):
        """
        Calculates Annualized Sharpe Ratio.
        """
        mean_daily_return = daily_returns.mean()
        std_dev_daily_return = daily_returns.std()
        
        if std_dev_daily_return == 0:
            return 0.0
        
        # Annualize
        # Assuming 252 trading days
        annualized_return = mean_daily_return * 252
        annualized_vol = std_dev_daily_return * np.sqrt(252)
        
        sharpe = (annualized_return - risk_free_rate) / annualized_vol
        return sharpe

    @staticmethod
    def calculate_max_drawdown(equity_curve):
        """
        Calculates Maximum Drawdown.
        """
        running_max = equity_curve.cummax()
        drawdown = (equity_curve - running_max) / running_max
        max_dd = drawdown.min()
        return max_dd
        
    @staticmethod
    def calculate_cagr(equity_curve):
        """ Compound Annual Growth Rate """
        if len(equity_curve) < 2: return 0.0
        days = (equity_curve.index[-1] - equity_curve.index[0]).days
        if days == 0: return 0.0
        total_ret = (equity_curve.iloc[-1] / equity_curve.iloc[0])
        years = days / 365.25
        return (total_ret ** (1/years)) - 1

    @staticmethod
    def calculate_sortino_ratio(daily_returns, risk_free_rate=0.0):
        """ Sortino Ratio (Return / Downside Deviation) """
        mean_ret = daily_returns.mean() * 252
        downside_returns = daily_returns[daily_returns < 0]
        if len(downside_returns) == 0: return 0.0
        downside_std = downside_returns.std() * np.sqrt(252)
        if downside_std == 0: return 0.0
        return (mean_ret - risk_free_rate) / downside_std

    @staticmethod
    def calculate_calmar_ratio(cagr, max_dd):
        """ Calmar Ratio (CAGR / Max Drawdown) """
        if max_dd == 0: return 0.0
        # Max DD is typically negative, take absolute
        return cagr / abs(max_dd)

    @staticmethod
    def get_summary_stats(daily_returns, equity_curve, benchmark_returns=None, benchmark_curve=None):
        sharpe = Metrics.calculate_sharpe_ratio(daily_returns)
        max_dd = Metrics.calculate_max_drawdown(equity_curve)
        total_ret = (equity_curve.iloc[-1] / equity_curve.iloc[0]) - 1
        cagr = Metrics.calculate_cagr(equity_curve)
        sortino = Metrics.calculate_sortino_ratio(daily_returns)
        calmar = Metrics.calculate_calmar_ratio(cagr, max_dd)
        vol = daily_returns.std() * np.sqrt(252)
        
        stats = {
            "Total Return": f"{total_ret:.2%}",
            "CAGR": f"{cagr:.2%}",
            "Sharpe Ratio": f"{sharpe:.2f}",
            "Sortino Ratio": f"{sortino:.2f}",
            "Calmar Ratio": f"{calmar:.2f}",
            "Max Drawdown": f"{max_dd:.2%}",
            "Volatility": f"{vol:.2%}"
        }
        
        if benchmark_returns is not None and benchmark_curve is not None:
            # Benchmark metrics
            bm_sharpe = Metrics.calculate_sharpe_ratio(benchmark_returns)
            bm_max_dd = Metrics.calculate_max_drawdown(benchmark_curve)
            bm_total_ret = (benchmark_curve.iloc[-1] / benchmark_curve.iloc[0]) - 1
            bm_cagr = Metrics.calculate_cagr(benchmark_curve)
            bm_sortino = Metrics.calculate_sortino_ratio(benchmark_returns)
            bm_calmar = Metrics.calculate_calmar_ratio(bm_cagr, bm_max_dd)
            bm_vol = benchmark_returns.std() * np.sqrt(252)
            
            stats["Benchmark Return"] = f"{bm_total_ret:.2%}"
            stats["Benchmark CAGR"] = f"{bm_cagr:.2%}"
            stats["Benchmark Sharpe"] = f"{bm_sharpe:.2f}"
            stats["Benchmark Sortino"] = f"{bm_sortino:.2f}"
            stats["Benchmark Calmar"] = f"{bm_calmar:.2f}"
            stats["Benchmark MDD"] = f"{bm_max_dd:.2%}"
            stats["Benchmark Volatility"] = f"{bm_vol:.2%}"
            
            # Active Return (Alpha proxy)
            active_ret = total_ret - bm_total_ret
            stats["Active Return"] = f"{active_ret:.2%}"

        return stats
