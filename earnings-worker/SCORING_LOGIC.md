# Portfolio Scoring System Logic Document (系统评分逻辑文档)

本文档详细记录了 Forward PEG System 的评分计算逻辑、权重分配及优化算法，以及每项数据的具体来源。

## 0. 数据来源汇总 (Data Scores)

系统主要依赖 **Yahoo Finance API** 获取实时数据。

| Metric (指标) | Source Module (来源模块) | API Link Template (链接模板) | Field Path (字段路径) |
| :--- | :--- | :--- | :--- |
| **Profit Growth** | Financial Data | `query1.finance.yahoo.com/v10/finance/quoteSummary/{SYM}?modules=financialData` | `.financialData.earningsGrowth` or `.revenueGrowth` |
| **Industry** | Asset Profile | `query1.finance.yahoo.com/v10/finance/quoteSummary/{SYM}?modules=assetProfile` | `.assetProfile.industry` |
| **Forward PE** | Key Statistics | `query1.finance.yahoo.com/v10/finance/quoteSummary/{SYM}?modules=defaultKeyStatistics` | `.defaultKeyStatistics.forwardPE` |
| **Price History** | Chart API | `query1.finance.yahoo.com/v8/finance/chart/{SYM}` | `chart.result[0].indicators.quote` |

*注：所有 API 均通过 Cloudflare Worker 后端 (`fetcher.ts`) 调用，前端不直接访问。*

---

## 1. 总分结构 (Total Score Framework)

总分 (Total Score) 由两大部分组成，满分 100 分：

*   **Forward Metrics (前瞻指标)**: 占比 **40%** (约40分) - 侧重增长潜力和估值。
*   **Historical Metrics (历史指标)**: 占比 **60%** (约60分) - 侧重风险控制和历史表现。

公式：`Total Score = Forward Score + Historical Score`

---

## 2. 单个股票评分 (Single Stock Scoring)

每个股票都会被单独打分 (Stock Score)，满分 25 分。这个分数越高，该股票在组合中的推荐权重就越大。

### A. Profit Growth Score (盈利增长分) - 满分 15 分
*   **来源**: Yahoo Finance `financialData` 模块。
*   **具体字段**: 优先使用 `earningsGrowth` (盈利增长)，如缺失则使用 `revenueGrowth` (营收增长)，最后尝试由 `PEG` 反推。
*   **URL**: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=financialData`

| 增长率 (Growth Rate) | 分数 (Points) | 评价 |
| :--- | :--- | :--- |
| **≥ 20%** | **15 分** | High Growth |
| **≥ 10%** | **10 分** | Moderate |
| **≥ 0%** | **5 分** | Positive |
| **< 0%** | **0 分** | Negative |

### B. Industry Score (行业评分) - 满分 10 分
*   **来源**: Yahoo Finance `assetProfile` 模块。
*   **具体字段**: `industry` (例如 "Software—Infrastructure")。
*   **URL**: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=assetProfile`

*   **逻辑**: 同时考查 PMI (采购经理人指数) 和 行业增长预期。
*   目前 PMI 为模拟数据 (Hardcoded Map in `fetcher.ts`)，基于行业名称映射。

| 条件 (Condition) | 分数 (Points) |
| :--- | :--- |
| PMI > 50 **且** Industry Growth > 10% | **10 分** (Strong Sector) |
| PMI > 50 **或** Industry Growth > 10% | **5 分** (Mixed) |
| 其他 | **0 分** (Weak) |

---

## 3. 组合评分详情 (Portfolio Scoring Details)

### Part 1: Forward Component (前瞻部分) - Max ~40 Pts

1.  **Weighted Stock Score (加权个股分)**
    *   公式: `Sum(Stock Weight * Stock Score)`
    *   最大值: 25分 (如果持仓全是满分股票)。

2.  **Valuation Score (估值评分) - Max 10 Pts**
    *   **来源**: Yahoo Finance `defaultKeyStatistics` 模块。
    *   **具体字段**: `forwardPE`。
    *   **URL**: `https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=defaultKeyStatistics`
    *   基于组合的加权平均 Forward PE Percentile (绝对值映射: PE<10=Cheap, PE>60=Expensive)。
    *   **Mapped Percentile ≤ 0.2** (Cheap / Low PE): **10 分**
    *   **≤ 80th Percentile**: **5 分**
    *   **> 80th Percentile** (Expensive): **0 分**

3.  **Macro Policy Score (宏观评分) - Max 5 Pts**
    *   基于美联储政策状态。
    *   **CUT (降息周期)**: **5 分**
    *   **NEUTRAL/HIKE**: 0 分

### Part 2: Historical Component (历史部分) - Max ~60 Pts

1.  **Calmar Ratio (卡尔玛比率) - Max 20 Pts**
    *   衡量回报与最大回撤之比 (Return / Max Drawdown)。
    *   **> 3.0**: **20 分** (Excellent)
    *   **> 1.5**: **16 分**
    *   **> 0.5**: **12 分**
    *   **≤ 0.5**: **4 分**

2.  **HHI (Herfindahl-Hirschman Index - 集中度) - Max 25 Pts**
    *   衡量持仓集中度。分散度越高，分数越高。
    *   公式: `HHI = Sum(Weight^2)`
    *   **< 0.10** (Highly Diversified): **25 分**
    *   **< 0.15**: **20 分**
    *   **< 0.25**: **15 分**
    *   **≥ 0.25** (Concentrated): **5 分**

3.  **Diversification Ratio (DR) - Max 15 Pts**
    *   衡量资产间的相关性。相关性越低，DR 越高。这是一个比单纯依赖“与大盘相关性”更严谨的指标。
    *   **公式**:
        $$DR = \frac{\sum_{i=1}^{n} w_i \sigma_i}{\sigma_p}$$
    *   **计算方法**:
        *   `w_i`: 股票 `i` 的权重。
        *   `σ_i`: 股票 `i` 的年化波动率 (Annualized Std Dev)。
        *   `σ_p`: 整个投资组合的实际年化波动率。
        *   *逻辑*: 如果资产完全正相关，DR = 1。如果资产之间有对冲效果，组合波动率 `σ_p` 会小于各资产波动率的加权和，导致 DR > 1。
    *   **评分标准**:
        *   **> 2.0**: **15 分** (Excellent Diversification)
        *   **> 1.5**: **12 分**
        *   **> 1.2**: **8 分**
        *   **≤ 1.2**: **3 分**

---

## 4. 优化算法 (Optimization Algorithm)

系统使用的是 **Iterative HHI-Constraint Scan (迭代 HHI 约束扫描)** 算法。

### 目标 (Objective)
最大化：`Forward Score (Profit+Industry) + HHI Bonus`

### 步骤 (Process)
1.  **Ranking**: 将所有股票按 `Stock Score` (盈利+行业) 从高到低排序。
2.  **Scenario Testing (情景测试)**: 系统测试不同的单股最大权重限制 (Max Weight Cap):
    *   Caps: [18%, 15%, 12%, 10%, 8%, 6%]
3.  **Allocation**:
    *   在每个 Cap 下，优先填满高分股票 (Greedy Allocation)。
4.  **Evaluation**:
    *   计算该配置下的 `Weighted Stock Score`。
    *   计算该配置下的 `HHI Score` (分散度奖励)。
    *   将两者相加。
5.  **Selection**: 选取总分最高的那个 Cap 配置作为推荐配置。

### 为什么这样做？
*   如果只追求高增长 (High Growth)，系统主要买入 Top 1 股票，会导致 HHI 极高，HHI 得分仅 5 分，总分反而变低。
*   该算法会自动寻找 **"高增长"** 与 **"高分散"** 之间的最佳平衡点。
