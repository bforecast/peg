v5.0 评分系统执行方案
面向开发的完整实施指南
一、系统概述
分化能力提升 4.5 倍（从 50.6-69.5 → 15-100+）

二、数据结构定义
Portfolio 级别数据结构
javascript
{
  portfolio_id: string,           // 如 "PORT_001"
  portfolio_name: string,         // 如 "Growth Tech Hedged"
  
  // 回测核心指标（必填）
  cagr: number,                   // 年化复合收益率，如 0.18
  max_drawdown: number,           // 最大回撤，如 -0.245
  sharpe_ratio: number,           // Sharpe 比率，如 1.68
  sortino_ratio: number,          // Sortino 比率，如 2.34
  annual_volatility: number,      // 年化波动率，如 0.168
  dr_ratio: number,               // 分散化比率，如 1.52

  // 持股数据（数组，每只股票一项）
  holdings: [
    {
      symbol: string,                    // 股票代码，如 "AAPL"
      weight: number,                    // 权重，如 0.12
      
      // PE 数据（可选，有备选逻辑）
      pe_ratio: number | null,          // 当前 PE，可为 null
      forward_pe: number | null,        // Forward PE，可为 null
      
      // 增长数据（可选，有备选逻辑）
      forward_earnings_growth_1y: number | null,      // 预期 1 年增长
      
      // PEG 数据
      peg_ratio_forward: number | null,  // Forward PEG，系统计算
      

    }
  ]
}
三、5 维度评分逻辑
Dimension 1: 绝对收益能力 (权重 30%)
计算函数签名：

javascript
function dim1_absolute_return_capability(portfolio)
输入参数：

portfolio.cagr：年化复合收益率

portfolio.annual_volatility：年化波动率

评分规则：

CAGR ≥ 20% → 100 分

CAGR 15-20% → 90 分

CAGR 10-15% → 75 分

CAGR 7-10% → 55 分

CAGR 5-7% → 35 分

CAGR < 5% → 15 分

波动率调整（20% 权重）：

波动率 ≤ 12% → 加分

波动率 > 28% → 减分

返回格式：

javascript
{
  score: number,        // 0-100
  details: {
    cagr_pct: string,
    excess_return_pct: string,
    annual_volatility_pct: string
  }
}
Dimension 2: 风险调整收益 (权重 25%)
计算函数签名：

javascript
function dim2_risk_adjusted_return(portfolio)
输入参数：

portfolio.sharpe_ratio：Sharpe 比率

portfolio.sortino_ratio：Sortino 比率

评分规则（Sharpe，60% 权重）：

Sharpe ≥ 2.5 → 100 分

Sharpe 2.0-2.5 → 95 分

Sharpe 1.5-2.0 → 85 分

Sharpe 1.0-1.5 → 70 分

Sharpe 0.5-1.0 → 50 分

Sharpe < 0.5 → 20 分

评分规则（Sortino，40% 权重）：

Sortino ≥ 3.5 → 100 分

Sortino 3.0-3.5 → 95 分

Sortino 2.0-3.0 → 85 分

Sortino 1.5-2.0 → 75 分

Sortino 1.0-1.5 → 60 分

Sortino < 1.0 → 30 分

关键特性：分化最强的维度

Dimension 3: 风险控制能力 (权重 20%)
计算函数签名：

javascript
function dim3_risk_control(portfolio)
输入参数：

portfolio.max_drawdown：最大回撤绝对值

portfolio.cagr：用于计算 Calmar 比率

2个子维度：

A. 回撤深度 (40% 权重)

回撤 ≤ 10% → 100 分

回撤 10-15% → 90 分

回撤 15-20% → 80 分

回撤 20-25% → 70 分

回撤 25-35% → 50 分

回撤 > 35% → 25 分

B. Calmar 比率 (60% 权重)

Calmar = CAGR / |MaxDD|

Calmar ≥ 1.5 → 100 分

Calmar 1.0-1.5 → 90 分

Calmar 0.75-1.0 → 75 分

Calmar 0.5-0.75 → 55 分

Calmar < 0.5 → 25 分

Dimension 4: 组合估值吸引力 (权重 15%)
计算函数签名：

javascript
function dim4_valuation_attractiveness(portfolio)
输入参数：

portfolio.holdings：持股数组

PE 数据处理：

如果有 forward_pe，用 forward_pe（优先级高）

评分规则

PEG 评分（如果有 PEG 数据，60% 权重分配给估值水位）：

PEG < 0.8 → 100 分

PEG 0.8-1.0 → 95 分

PEG 1.0-1.3 → 85 分

PEG 1.3-1.6 → 75 分

PEG 1.6-2.0 → 60 分

PEG ≥ 2.0 → 40 分

PE 评分（当 PEG 缺失，40% 权重分配给估值水位）：

假设合理 PE = 25x

PE/25 ≤ 0.7 → 95 分

PE/25 0.7-0.85 → 85 分

PE/25 0.85-1.0 → 75 分

PE/25 1.0-1.2 → 60 分

PE/25 1.2-1.5 → 45 分

PE/25 > 1.5 → 30 分

动量调整（如果有 momentum 数据）：

动量 ≥ 30% → +5 分

动量 10-30% → +0 分

动量 0-10% → -5 分

动量 < 0% → -10 分

Dimension 5: 多元化效果 (权重 10%)
计算函数签名：

javascript
function dim5_diversification(portfolio)
输入参数：

portfolio.dr_ratio：分散化比率

评分规则：

DR ≥ 1.60 → 100 分

DR 1.40-1.60 → 90 分

DR 1.30-1.40 → 85 分

DR 1.20-1.30 → 75 分

DR 1.10-1.20 → 60 分

DR 1.00-1.10 → 45 分

DR < 1.00 → 25 分

四、综合评分函数
函数签名：

javascript
function comprehensive_expert_scoring_v5(portfolio)
执行步骤：

第 1 步：计算 5 个维度分数

dim1_score = dim1_absolute_return_capability(portfolio).score

dim2_score = dim2_risk_adjusted_return(portfolio).score

dim3_score = dim3_risk_control(portfolio).score

dim4_score = dim4_valuation_attractiveness(portfolio).score

dim5_score = dim5_diversification(portfolio).score

第 2 步：计算一致性调整

consistency_score = 基于 winning_months_pct

月胜率 ≥ 70% → +5 分调整

月胜率 60-70% → +2 分调整

月胜率 50-60% → 0 分调整

月胜率 < 50% → -3 分调整

第 3 步：加权合成总分

weighted_score = (dim1_score * 0.30) + (dim2_score * 0.25) + (dim3_score * 0.20) + (dim4_score * 0.15) + (dim5_score * 0.10)

final_score = Math.max(0, Math.min(100, weighted_score + consistency_adjustment))

第 4 步：确定评级

total_score ≥ 85 → "A+"

total_score ≥ 75 → "A"

total_score ≥ 60 → "B+"

total_score ≥ 50 → "B"

total_score ≥ 40 → "C"

total_score < 40 → "D"

返回格式：

javascript
{
  portfolio_id: string,
  portfolio_name: string,
  total_score: number,          // 0-100
  rating: string,               // A+ / A / B+ / B / C / D
  dimensions: {
    dim1: { score: number, weight: 0.30, name: "..." },
    dim2: { score: number, weight: 0.25, name: "..." },
    dim3: { score: number, weight: 0.20, name: "..." },
    dim4: { score: number, weight: 0.15, name: "..." },
    dim5: { score: number, weight: 0.10, name: "..." }
  },
  details: { ... },  // 各维度详细数据
  summary: { ... }   // 关键指标摘要
}

六、缺失值处理流程

七、权重规范化
当某只股票数据不完整时，权重调整方式：

javascript
function normalize_holdings_weights(holdings)
步骤：

逐只计算完整度和调整权重

adjusted_weight = original_weight * completeness_factor

重新规范化权重总和为 1

sum_adjusted = sum(adjusted_weight)

final_weight = adjusted_weight / sum_adjusted

用最终权重计算加权平均指标

示例：

text
原始权重     完整度    调整权重   规范化后
AAPL: 0.12   100%   = 0.120      → 0.134
MSFT: 0.15   80%    = 0.120      → 0.134
GOOGL: 0.10  40%    = 0.040      → 0.045
其他: 0.63   100%   = 0.630      → 0.704

十五、关键指标快速查询
对标数值：

优秀范围：

CAGR ≥ 20%

Sharpe ≥ 2.0

Sortino ≥ 2.5

MaxDD ≤ 10%

Recovery ≤ 3M

Calmar ≥ 1.5

Winning % ≥ 70%

PEG < 1.0

DR ≥ 1.5

一般范围：

CAGR 10-15%

Sharpe 1.0-1.5

Sortino 1.5-2.0

MaxDD 15-25%

Recovery 6-12M

Calmar 0.75-1.0

Winning % 55-65%

PEG 1.3-1.6

DR 1.2-1.3

差的范围：

CAGR < 10%

Sharpe < 0.5

Sortino < 1.0

MaxDD > 35%

Recovery > 18M

Calmar < 0.5

Winning % < 50%

PEG > 2.0

DR < 1.0

