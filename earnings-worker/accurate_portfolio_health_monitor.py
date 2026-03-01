import numpy as np
import pandas as pd
import yfinance as yf
from scipy.stats import entropy
import matplotlib.pyplot as plt
import matplotlib
# 设置支持中文的字体
matplotlib.rcParams['font.sans-serif'] = ['DejaVu Sans', 'SimHei', 'Microsoft YaHei', 'SimSun', 'Arial Unicode MS', 'Lucida Grande', 'WenQuanYi Micro Hei']
matplotlib.rcParams['axes.unicode_minus'] = False  # 正常显示负号

class AccuratePortfolioHealthMonitor:
    def __init__(self, tickers, window=30):
        self.tickers = tickers
        self.window = window
        # 文章中定义的 5 个核心"歌手"指标
        self.features = ['RSI', 'BBW', 'ATR', 'VolOsc', 'CMF']

    def get_indicators(self, df):
        """为单只资产提取 5 维行为指纹"""
        f = pd.DataFrame(index=df.index)
        
        # 根据数据结构获取相应列
        if 'Adj Close' in df.columns:
            c, h, l, v = df['Adj Close'], df['High'], df['Low'], df['Volume']
        else:
            c, h, l, v = df['Close'], df['High'], df['Low'], df['Volume']
        
        # 1. RSI (动量)
        delta = c.diff()
        g = (delta.where(delta > 0, 0)).rolling(14).mean()
        ls = (-delta.where(delta < 0, 0)).rolling(14).mean()
        f['RSI'] = 100 - (100 / (1 + g / (ls + 1e-9)))
        
        # 2. BBW (波动率)
        f['BBW'] = (4 * c.rolling(20).std()) / (c.rolling(20).mean() + 1e-9)
        
        # 3. ATR (风险范围)
        tr = pd.concat([h-l, abs(h-c.shift()), abs(l-c.shift())], axis=1).max(axis=1)
        f['ATR'] = tr.rolling(14).mean() / (c + 1e-9)
        
        # 4. VolOsc (活跃度)
        f['VolOsc'] = (v.rolling(5).mean() - v.rolling(20).mean()) / (v.rolling(20).mean() + 1e-9)
        
        # 5. CMF (资金流)
        mfv = ((c-l)-(h-c))/(h-l+1e-9)*v
        f['CMF'] = mfv.rolling(20).sum()/(v.rolling(20).sum()+1e-9)
        
        return f.dropna()

    def calculate_health_score(self, combined_data):
        """ 
        计算归一化健康熵 (Standardized Health Index) 
        High = Diverse/Healthy, Low = Collapsed/Risk 
        """
        D = combined_data.shape[1]  # 总维度 (N_assets * 5)
        corr_matrix = combined_data.corr()
        
        # 检查相关矩阵是否有效
        if corr_matrix.isna().any().any():
            return None
        
        # 特征值分解
        try:
            eigvals = np.linalg.eigvals(np.nan_to_num(corr_matrix)).real
            eigvals = np.abs(eigvals)
        except np.linalg.LinAlgError:
            return None
        
        # 计算冯·诺依曼熵 (base=2)
        p = eigvals / eigvals.sum()
        h_actual = entropy(p, base=2)
        h_max = np.log2(D)  # 理论上最高熵
        
        # --- 归一化健康得分 ---
        # 结果在 0 到 1 之间，不受维度 D 影响
        if h_max == 0:
            health_index = 0
        else:
            health_index = h_actual / h_max
        
        return np.clip(health_index, 0, 1)

    def run_analysis(self):
        # 1. 抓取数据
        raw = yf.download(self.tickers, period="2y")
        
        # 2. 构建特征
        all_feats = []
        all_prices = {}
        for t in self.tickers:
            if isinstance(raw.columns, pd.MultiIndex):
                t_df = raw.xs(t, axis=1, level=1)
                # 保存价格数据
                all_prices[t] = raw['Close'][t]
            else:
                t_df = raw
                # 对于单资产情况，我们假设它就是第一个资产
                all_prices[self.tickers[0]] = raw['Close']
            all_feats.append(self.get_indicators(t_df))
        
        # 找到公共索引
        common_idx = all_feats[0].index
        for f in all_feats[1:]:
            common_idx = common_idx.intersection(f.index)
        
        results = []
        for i in range(self.window, len(common_idx)):
            curr_date = common_idx[i]
            
            # 1. Calculate Portfolio Health (Combined)
            # 合并当前窗口所有资产的多维特征
            combined = pd.concat([f.loc[:curr_date].tail(self.window) for f in all_feats], axis=1)
            portfolio_health = self.calculate_health_score(combined)
            
            row = {'Date': curr_date, 'Health_Index_Portfolio': portfolio_health}

            # 2. Calculate Individual Asset Health
            for j, ticker in enumerate(self.tickers):
                # 获取该资产的特征 (5 columns)
                asset_feats = all_feats[j].loc[:curr_date].tail(self.window)
                asset_health = self.calculate_health_score(asset_feats)
                row[f'Health_Index_{ticker}'] = asset_health
            
            # 只要有一个有效就记录 (通常Portfolio有效则都有效)
            if portfolio_health is not None:
                results.append(row)
        
        # 将结果转换为DataFrame
        results_df = pd.DataFrame(results).set_index('Date')
        
        # User requested to NOT fill in holidays/missing dates with NaNs
        # We return the dataframe containing only valid calculation dates
        return results_df, all_prices, all_feats

    def visualize(self, results, all_prices, all_feats):
        """可视化健康指数和资产价格走势，带彩色散点图"""
        n_assets = len(self.tickers)
        n_subplots = n_assets + 2  # Assets + Portfolio + Health Index

        plt.figure(figsize=(14, 4 * n_subplots))
        
        # 计算整个投资组合的价格（简单平均，等权分配）
        portfolio_prices = pd.DataFrame()
        for ticker in self.tickers:
            if ticker in all_prices:
                common_dates = results.index.intersection(all_prices[ticker].index)
                if len(common_dates) > 0:
                    aligned_price = all_prices[ticker].reindex(common_dates)
                    portfolio_prices[ticker] = aligned_price
        
        # 计算等权投资组合价值
        if not portfolio_prices.empty:
            equal_weight_portfolio = portfolio_prices.mean(axis=1)
        
        # --- 1. Plot Individual Assets ---
        for i, ticker in enumerate(self.tickers):
            plt.subplot(n_subplots, 1, i+1)
            
            if ticker in all_prices:
                prices = all_prices[ticker]
                common_dates = results.index.intersection(prices.index)
                
                if len(common_dates) > 0:
                    aligned_prices = prices.reindex(common_dates)
                    # Use INDIVIDUAL asset health index
                    if f'Health_Index_{ticker}' in results.columns:
                        health_values = results.reindex(common_dates)[f'Health_Index_{ticker}'] * 100
                    else:
                        health_values = pd.Series(np.nan, index=common_dates)

                    # Valid points
                    valid_mask = ~health_values.isna()
                    if valid_mask.any():
                        plt.scatter(common_dates[valid_mask], aligned_prices[valid_mask], 
                                  c=health_values[valid_mask], cmap='RdYlGn', s=10, alpha=0.8)
                    
                    # Missing points
                    invalid_mask = ~valid_mask
                    if invalid_mask.any():
                        plt.scatter(common_dates[invalid_mask], aligned_prices[invalid_mask], 
                                  c='lightgray', s=10, alpha=0.3, label='No Health Data')
                    
                    plt.title(f"{ticker} Price Trend (Color = {ticker} Health Index)")
                    plt.ylabel("Price ($)")
                    plt.grid(True, alpha=0.3)
                    # Add a colorbar logic if needed, but keeping simple for now
        
        # --- 2. Plot Portfolio Combined Price ---
        plt.subplot(n_subplots, 1, n_assets + 1)
        if not portfolio_prices.empty and not equal_weight_portfolio.isna().all():
            common_dates = results.index.intersection(equal_weight_portfolio.index)
            if len(common_dates) > 0:
                aligned_portfolio = equal_weight_portfolio.reindex(common_dates)
                # Use PORTFOLIO health index
                health_values = results.reindex(common_dates)['Health_Index_Portfolio'] * 100
                
                valid_mask = ~health_values.isna()
                if valid_mask.any():
                    plt.scatter(common_dates[valid_mask], aligned_portfolio[valid_mask], 
                              c=health_values[valid_mask], cmap='RdYlGn', s=12, alpha=0.9)
                
                invalid_mask = ~valid_mask
                if invalid_mask.any():
                    plt.scatter(common_dates[invalid_mask], aligned_portfolio[invalid_mask], 
                              c='lightgray', s=10, alpha=0.3, label='No Health Data')
                
                plt.title("Equal-Weight Portfolio Price Trend (Color = Portfolio Combined Health Index)")
                plt.ylabel("Portfolio Value ($)")
                plt.grid(True, alpha=0.3)
        
        # --- 3. Plot Health Indices (Comparison) ---
        plt.subplot(n_subplots, 1, n_assets + 2)
        
        # Plot Individual Health Indices (Thinner lines)
        colors = ['tab:blue', 'tab:orange', 'tab:purple', 'tab:brown', 'tab:pink', 'tab:cyan']
        for i, ticker in enumerate(self.tickers):
            col_name = f'Health_Index_{ticker}'
            if col_name in results.columns:
                h_data = results[col_name].dropna() * 100
                if not h_data.empty:
                    color = colors[i % len(colors)]
                    plt.plot(h_data.index, h_data, label=f'{ticker} Health', 
                             color=color, linewidth=1, alpha=0.6, linestyle='--')

        # Plot Portfolio Health Index (Thick, prominent line)
        valid_health = results['Health_Index_Portfolio'].dropna() * 100
        if not valid_health.empty:
            plt.plot(valid_health.index, valid_health, color='darkgreen', linewidth=2.5, label='Portfolio Combined Health')
        
        # Thresholds
        plt.axhline(y=50, color='orange', linestyle=':', alpha=0.5)
        plt.axhline(y=30, color='red', linestyle=':', alpha=0.5)
        
        plt.fill_between(results.index, 0, 30, color='red', alpha=0.05, label='High Risk Zone (<30)')
        plt.fill_between(results.index, 30, 50, color='orange', alpha=0.05, label='Attention Zone (30-50)')
        plt.fill_between(results.index, 50, 100, color='green', alpha=0.05, label='Healthy Zone (>50)')
        
        plt.title("Health Index Comparison: Individual Assets vs Portfolio Combined")
        plt.ylabel("Health Index (%)")
        plt.xlabel("Date")
        plt.legend(loc='lower left', ncol=2, fontsize='small')
        plt.grid(True, alpha=0.3)
        
        plt.tight_layout()
        plt.savefig('accurate_portfolio_health_monitor.png', dpi=300, bbox_inches='tight')
        plt.show()

# --- 实时分析 ---
if __name__ == "__main__":
    # 无论是 3 个标的还是更多，评价标准都统一在 0-100%
    assets = ['NVDA']#, 'IAU', 'QQQ']
    monitor = AccuratePortfolioHealthMonitor(assets)
    res_df, prices, feats = monitor.run_analysis()
    
    # 检查数据完整性
    total_possible_points = len(res_df)
    valid_points = len(res_df.dropna())
    missing_points = total_possible_points - valid_points
    
    print(f"\n=== Portfolio Structure Health Report ===")
    print(f"Assets Monitored: {assets}")
    print(f"Total Possible Data Points: {total_possible_points}")
    print(f"Valid Data Points: {valid_points}")
    print(f"Missing Data Points: {missing_points}")
    print(f"Data Completeness: {valid_points/total_possible_points*100:.2f}%")
    
    if valid_points > 0:
        latest_health = res_df['Health_Index_Portfolio'].dropna().iloc[-1] * 100
        print(f"Current Structural Health Index: {latest_health:.1f}%")
        
        if latest_health < 30:
            print("[WARNING: Low Entropy Collapse] Portfolio highly folded, independence lost, extremely high risk!")
        elif latest_health < 50:
            print("[ATTENTION: Structural Convergence] Correlation increasing, diversification effectiveness weakening.")
        else:
            print("[STATUS: High Entropy Healthy] System structure complex and diverse, with good resilience.")
    
    # Save to CSV as requested
    output_file = 'portfolio_health_monitor_results.csv'
    res_df.to_csv(output_file)
    print(f"Results saved to {output_file}")
    print("Note: res_df contains the Health Index for the *entire portfolio* combined, not individual stocks.")

    # 可视化结果
    monitor.visualize(res_df, prices, feats)