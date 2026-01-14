专业级投资组合评分系统 - 完整规范与测试案例
执行概要
核心理念：

组合历史表现（Performance_port）占 65%：真实回报-风险-分散特征

持仓质量（Holdings_quality）占 35%：当前配置的未来预期

偏进取、成长导向：Value（PEG主导）40%、Momentum 25%、Risk 35%

数据精简：只需 forward PE、PEG、一年日价格、当前权重

一、数据输入
对每只股票 i 和每个交易日 t：

text
P[i,t]     : 股票i日期t收盘价（252天）
PE[i]      : forward PE
PEG[i]     : forward PEG  
w[i]       : 当前权重（Σw[i]=1）
rf = 0.04  : 无风险利率（4%）
二、单只股票评分 Score_i
text
Score[i] = 0.40 × Value[i] + 0.25 × Momentum[i] + 0.35 × Risk[i]
2.1 Value[i]（估值/质量）
PE_score[i]：

text
PE[i] < 10        → 85
10 ≤ PE[i] < 20   → 75  
20 ≤ PE[i] < 30   → 60
30 ≤ PE[i] < 50   → 45
PE[i] ≥ 50        → 30
PEG_score[i]：

text
PEG[i] < 0.7     → 90
0.7 ≤ PEG[i] < 1 → 80
1 ≤ PEG[i] < 1.5 → 65
1.5 ≤ PEG[i] < 2 → 50
PEG[i] ≥ 2       → 35
合成：

text
Value[i] = 0.70 × PEG_score[i] + 0.30 × PE_score[i]
2.2 Momentum[i]
一年总收益率：

text
R[i] = (P[i,end] - P[i,start]) / P[i,start]
区间打分：

text
R[i] ≥ 0.50    → 85
0.20 ≤ R[i] < 0.50 → 75
0 ≤ R[i] < 0.20    → 60
-0.20 ≤ R[i] < 0   → 45
R[i] < -0.20       → 30
2.3 Risk[i]（单股风险）
日收益：r[i,t] = (P[i,t] - P[i,t-1]) / P[i,t-1]

年化波动率：σ[i] = std(r[i,t]) × √252

最大回撤 MaxDD[i]：基于累计净值 NAV[i,t]

年化收益：Return[i] = R[i]

Sharpe[i]：(Return[i] - 0.04) / σ[i]

Vol_score[i]：

text
σ[i] < 0.15    → 90
0.15 ≤ σ[i] < 0.25 → 70
0.25 ≤ σ[i] < 0.35 → 50
0.35 ≤ σ[i] < 0.50 → 30
σ[i] ≥ 0.50       → 15
MaxDD_score[i]（d = |MaxDD[i]|）：

text
d < 0.10 → 85
0.10 ≤ d < 0.20 → 65
0.20 ≤ d < 0.40 → 45
d ≥ 0.40       → 25
Sharpe_score[i]：

text
Sharpe[i] ≥ 2.0 → 90
1.0 ≤ Sharpe[i] < 2.0 → 70
0 ≤ Sharpe[i] < 1.0 → 50
Sharpe[i] < 0     → 30
合成：

text
Risk[i] = 0.40 × Vol_score[i] + 0.30 × MaxDD_score[i] + 0.30 × Sharpe_score[i]
三、Holdings_quality
text
Holdings_quality = Σ(w[i] × Score[i])
四、Performance_port（组合历史表现，含DR）
4.1 组合指标
组合日收益：r_p[t] = Σ(w[i] × r[i,t])

组合波动率：σ_p = std(r_p[t]) × √252

组合最大回撤：MaxDD_p（同单股逻辑）

组合收益：Return_p = NAV_p[end] - NAV_p[start]

组合Sharpe：Sharpe_p = (Return_p - 0.04) / σ_p

DR：DR = Σ(w[i] × σ[i]) / σ_p

4.2 组合层打分
Return_score_p：

text
Return_p ≥ 0.20 → 90
0.10 ≤ Return_p < 0.20 → 75
0 ≤ Return_p < 0.10 → 60
-0.10 ≤ Return_p < 0 → 45
Return_p < -0.10 → 30
Vol_score_p：

text
σ_p < 0.12 → 90
0.12 ≤ σ_p < 0.20 → 70
0.20 ≤ σ_p < 0.30 → 50
0.30 ≤ σ_p < 0.45 → 30
σ_p ≥ 0.45 → 15
MaxDD_score_p（d_p = |MaxDD_p|）：

text
d_p < 0.10 → 85
0.10 ≤ d_p < 0.20 → 65
0.20 ≤ d_p < 0.35 → 45
d_p ≥ 0.35 → 25
Sharpe_score_p：

text
Sharpe_p ≥ 2.0 → 90
1.0 ≤ Sharpe_p < 2.0 → 70
0 ≤ Sharpe_p < 1.0 → 50
Sharpe_p < 0 → 30
DR_score：

text
DR < 1.1 → 30
1.1 ≤ DR < 1.3 → 50
1.3 ≤ DR < 1.5 → 70
1.5 ≤ DR < 1.8 → 85
DR ≥ 1.8 → 95
合成：

text
Performance_port = 0.35×Return_score_p + 0.20×Vol_score_p + 0.15×MaxDD_score_p + 0.15×Sharpe_score_p + 0.15×DR_score
五、最终组合评分
text
Score_port = 0.65 × Performance_port + 0.35 × Holdings_quality
六、测试案例
输入数据
text
Stock A: PE=24, PEG=1.2, R=35%, σ=22%, MaxDD=-18%, w=40%
Stock B: PE=45, PEG=0.8, R=80%, σ=35%, MaxDD=-32%, w=30%
Stock C: PE=12, PEG=0.6, R=5%,  σ=12%, MaxDD=-8%,  w=30%

组合结果：Return_p=38%, σ_p=20.6%, MaxDD_p=-18.2%, Sharpe_p=1.65, DR=1.112
预期输出
text
Stock A: Score=69
Stock B: Score=67  
Stock C: Score=76

Holdings_quality = 70.5
Performance_port = 67.5
Score_port = 68.5-69
调仓建议
text
增仓 Stock C（76分>平均）
观望 Stock B（67分<平均，高风险）
DR=1.11偏低，需改善分散性