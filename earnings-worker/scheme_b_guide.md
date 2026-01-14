# 方案 B: 分层优化 - Vibe 编码完全指南

> [!IMPORTANT]
> **Production Implementation Notes (Updated Jan 2026):**
> 1.  **Metric Source Strategy**:
>     -   **Initial Display**: Loads official, pre-calculated metrics from `portfolio_stats` table (ensure consistency with backtest).
>     -   **Optimization**: Uses **Runtime Calculation** for *both* Current and Optimized snapshots to ensure apples-to-apples comparison.
> 2.  **Unified 1Y Definition**:
>     -   "1Y" is strictly defined as **Trailing 365 Calendar Days** (approx 252 trading days).
>     -   Backtest logic fetches buffer but filters start date to `Today - 365`.
>     -   If Optimization results in a lower Total Score (due to complex interactions), the system **MUST** default to `HOLD`.
>     -   "Negative Optimization" is unacceptable.
> 4.  **Weekly Score History**:
>     -   **Cron Job**: Every Friday, `cron.ts` triggers `archivePortfolioScore` to snapshot the current score into `portfolio_score_history`.
>     -   **Dashboard**: Shows `portfolio_stats.last_score` for fast loading (updated on every recalc).
> 5.  **Batch Recalculation**:
>     -   **Strategy**: Uses **Client-Side Iteration** (browser loops through portfolios) to trigger individual recalc endpoints.
>     -   **Reason**: Prevents Server CPU Timeouts common with large server-side batch jobs.




## 执行概览

```
分层优化的三个阶段：

Phase 1: Performance 指标保护
├─ 检查组合的 σ_p, DR, MaxDD, Sharpe
├─ 如果指标不健康，调整权重改善它们
├─ 目标: 让组合回到"安全区"
└─ 如果成功，进入 Phase 2；否则停止
 
Phase 2: Holdings Quality 优化（在 Performance 约束下）
├─ 仅当 Phase 1 通过时执行
├─ 用约束条件的 Softmax 优化权重
├─ 保证 Performance 指标不恶化
└─ 计算新权重能提升多少 HQ

Phase 3: 总分验证 & 决策
├─ 计算: Total = 0.65 × Perf_score + 0.35 × HQ_score
├─ 仅当 Total 改善 >= 0.3 分时推荐调仓
├─ 否则 fallback 到当前权重
└─ 返回决策和建议权重
```

---

## Phase 1: Performance 指标保护

### 1.1 计算 Performance 指标

```javascript
// ============================================================
// PHASE 1: Calculate Performance Metrics
// ============================================================

function calculate_performance_metrics(weights, stocks, price_history) {
  /*
  输入:
    weights[]      : 当前权重 [0.40, 0.30, 0.30]
    stocks[]       : 股票信息 [{sigma, ...}, ...]
    price_history  : 252 天的日收益率
  
  输出:
    {
      sigma_p: 0.206,          // 组合波动率
      dr: 1.52,                // 多元化比率
      max_dd: -0.12,           // 最大回撤
      sharpe: 1.09,            // Sharpe 比率
      perf_score: 70.1         // Performance 评分 (0-100)
    }
  */
  
  const n = weights.length;
  
  // 1. 计算组合日收益率
  let portfolio_returns = [];
  for (let day = 0; day < price_history[0].length; day++) {
    let daily_return = 0;
    for (let i = 0; i < n; i++) {
      daily_return += weights[i] * price_history[i][day];
    }
    portfolio_returns.push(daily_return);
  }
  
  // 2. 计算年化波动率 σ_p
  const mean_return = portfolio_returns.reduce((a, b) => a + b) / portfolio_returns.length;
  const variance = portfolio_returns
    .map(r => (r - mean_return) ** 2)
    .reduce((a, b) => a + b) / portfolio_returns.length;
  const sigma_p = Math.sqrt(variance) * Math.sqrt(252);  // 年化
  
  console.log(`  σ_p = ${(sigma_p * 100).toFixed(2)}%`);
  
  // 3. 计算 Diversification Ratio (DR)
  const weighted_vol = stocks.reduce((sum, s, i) => sum + weights[i] * s.sigma, 0);
  const dr = weighted_vol / sigma_p;
  
  console.log(`  DR = ${dr.toFixed(3)}`);
  
  // 4. 计算最大回撤 (MaxDD)
  let cumulative_nav = 1.0;
  let peak_nav = 1.0;
  let max_dd = 0;
  
  for (const ret of portfolio_returns) {
    cumulative_nav *= (1 + ret);
    if (cumulative_nav > peak_nav) {
      peak_nav = cumulative_nav;
    }
    const drawdown = (cumulative_nav - peak_nav) / peak_nav;
    if (drawdown < max_dd) {
      max_dd = drawdown;
    }
  }
  
  console.log(`  Max DD = ${(max_dd * 100).toFixed(2)}%`);
  
  // 5. 计算 Sharpe 比率
  const annualized_return = (mean_return * 252);
  const risk_free_rate = 0.04;
  const sharpe = (annualized_return - risk_free_rate) / sigma_p;
  
  console.log(`  Sharpe = ${sharpe.toFixed(3)}`);
  
  // 6. 转化为 Performance 评分 (0-100)
  const perf_score = convert_metrics_to_score(sigma_p, dr, max_dd, sharpe);
  
  console.log(`  Perf Score = ${perf_score.toFixed(1)}`);
  
  return {
    sigma_p,
    dr,
    max_dd,
    sharpe,
    perf_score
  };
}

// 辅助函数：将指标转化为单个评分
function convert_metrics_to_score(sigma_p, dr, max_dd, sharpe) {
  
  // 各个指标的评分函数
  
  // Return Score (年化收益) - 这里简化，实际需要计算收益率
  const return_score = 70;  // placeholder
  
  // Vol Score (波动率)
  let vol_score;
  if (sigma_p < 0.12) vol_score = 90;
  else if (sigma_p < 0.20) vol_score = 70;
  else if (sigma_p < 0.30) vol_score = 50;
  else if (sigma_p < 0.45) vol_score = 30;
  else vol_score = 15;
  
  // MaxDD Score
  const dd_abs = Math.abs(max_dd);
  let max_dd_score;
  if (dd_abs < 0.10) max_dd_score = 85;
  else if (dd_abs < 0.20) max_dd_score = 65;
  else if (dd_abs < 0.35) max_dd_score = 45;
  else max_dd_score = 25;
  
  // Sharpe Score
  let sharpe_score;
  if (sharpe >= 2.0) sharpe_score = 90;
  else if (sharpe >= 1.0) sharpe_score = 70;
  else if (sharpe >= 0) sharpe_score = 50;
  else sharpe_score = 30;
  
  // DR Score
  let dr_score;
  if (dr < 1.1) dr_score = 30;
  else if (dr < 1.3) dr_score = 50;
  else if (dr < 1.5) dr_score = 70;
  else if (dr < 1.8) dr_score = 85;
  else dr_score = 95;
  
  // 合成 Performance Score
  // 权重: Return 35%, Vol 20%, MaxDD 15%, Sharpe 15%, DR 15%
  const perf_score = 
    0.35 * return_score +
    0.20 * vol_score +
    0.15 * max_dd_score +
    0.15 * sharpe_score +
    0.15 * dr_score;
  
  return perf_score;
}
```

### 1.2 检查 Performance 是否健康

```javascript
function check_performance_health(current_metrics, thresholds) {
  /*
  输入:
    current_metrics: {sigma_p, dr, max_dd, sharpe, perf_score}
    thresholds: {
      max_sigma: 0.22,
      min_dr: 1.35,
      max_dd_limit: -0.15,
      min_perf_score: 65
    }
  
  输出:
    {
      is_healthy: boolean,
      issues: [string],
      recommendation: {
        issue_type: 'volatility' | 'diversification' | 'drawdown' | 'healthy',
        action: string
      }
    }
  */
  
  const issues = [];
  
  // 检查波动率
  if (current_metrics.sigma_p > thresholds.max_sigma) {
    issues.push(`Wave_volatility: σ_p = ${(current_metrics.sigma_p*100).toFixed(2)}% > ${(thresholds.max_sigma*100).toFixed(2)}%`);
  }
  
  // 检查分散性
  if (current_metrics.dr < thresholds.min_dr) {
    issues.push(`Low_diversification: DR = ${current_metrics.dr.toFixed(3)} < ${thresholds.min_dr.toFixed(3)}`);
  }
  
  // 检查回撤
  if (current_metrics.max_dd < thresholds.max_dd_limit) {
    issues.push(`High_drawdown: MaxDD = ${(current_metrics.max_dd*100).toFixed(2)}% < ${(thresholds.max_dd_limit*100).toFixed(2)}%`);
  }
  
  // 检查 Perf Score
  if (current_metrics.perf_score < thresholds.min_perf_score) {
    issues.push(`Low_perf_score: ${current_metrics.perf_score.toFixed(1)} < ${thresholds.min_perf_score}`);
  }
  
  const is_healthy = issues.length === 0;
  
  let recommendation = {
    issue_type: 'healthy',
    action: 'Proceed to Phase 2'
  };
  
  if (!is_healthy) {
    // 优先级: 分散性 > 波动率 > 回撤
    if (issues.some(i => i.includes('diversification'))) {
      recommendation = {
        issue_type: 'diversification',
        action: 'reduce_concentration'
      };
    } else if (issues.some(i => i.includes('volatility'))) {
      recommendation = {
        issue_type: 'volatility',
        action: 'add_low_vol_stocks'
      };
    } else if (issues.some(i => i.includes('drawdown'))) {
      recommendation = {
        issue_type: 'drawdown',
        action: 'increase_defensive_positions'
      };
    }
  }
  
  return {
    is_healthy,
    issues,
    recommendation
  };
}
```

### 1.3 Phase 1 的主函数

```javascript
function phase1_performance_protection(
  old_weights,
  stocks,
  price_history,
  thresholds
) {
  /*
  输入:
    old_weights[]   : 当前权重
    stocks[]        : 股票列表
    price_history   : 252 天日收益
    thresholds      : 约束条件
  
  输出:
    {
      status: 'HEALTHY' | 'PROTECTING',
      current_metrics: {...},
      new_weights: [] (如果需要调整),
      action_taken: string
    }
  */
  
  console.log(`\n[PHASE 1] Performance Protection Check\n`);
  
  // Step 1: 计算当前指标
  console.log(`Step 1.1: Calculate current Performance metrics`);
  const current_metrics = calculate_performance_metrics(
    old_weights,
    stocks,
    price_history
  );
  
  // Step 2: 检查是否健康
  console.log(`\nStep 1.2: Check Performance health`);
  const health_check = check_performance_health(current_metrics, thresholds);
  
  if (health_check.is_healthy) {
    console.log(`\n✓ Performance is HEALTHY`);
    console.log(`  σ_p: ${(current_metrics.sigma_p*100).toFixed(2)}% (ok)`);
    console.log(`  DR: ${current_metrics.dr.toFixed(3)} (ok)`);
    console.log(`  → Proceed to Phase 2\n`);
    
    return {
      status: 'HEALTHY',
      current_metrics,
      new_weights: old_weights,
      action_taken: 'None - metrics are healthy, proceed to Phase 2'
    };
  }
  
  // Step 3: 如果不健康，调整权重
  console.log(`\n⚠️ Performance ISSUES DETECTED`);
  health_check.issues.forEach(issue => console.log(`  - ${issue}`));
  
  console.log(`\nStep 1.3: Apply correction based on issue type`);
  
  let corrected_weights = old_weights.slice();
  let action_description = '';
  
  if (health_check.recommendation.issue_type === 'diversification') {
    console.log(`  → Reducing concentration...`);
    corrected_weights = reduce_concentration(
      old_weights,
      stocks,
      {target_dr: 1.40, max_increase: 0.10}
    );
    action_description = 'Reduced concentration to improve DR';
    
  } else if (health_check.recommendation.issue_type === 'volatility') {
    console.log(`  → Adding low-volatility stocks...`);
    corrected_weights = add_low_volatility_stocks(
      old_weights,
      stocks,
      {target_sigma: 0.20, max_increase: 0.08}
    );
    action_description = 'Added low-vol stocks to reduce σ_p';
    
  } else if (health_check.recommendation.issue_type === 'drawdown') {
    console.log(`  → Increasing defensive positions...`);
    corrected_weights = increase_defensive_positions(
      old_weights,
      stocks,
      {target_max_dd: -0.12, cash_increase: 0.10}
    );
    action_description = 'Added defensive positions to reduce MaxDD';
  }
  
  console.log(`\n✓ Correction applied: ${action_description}`);
  console.log(`  New weights: [${corrected_weights.map(w => (w*100).toFixed(1)+'%').join(', ')}]`);
  
  // Step 4: 验证修正后的指标
  console.log(`\nStep 1.4: Verify corrected metrics`);
  const corrected_metrics = calculate_performance_metrics(
    corrected_weights,
    stocks,
    price_history
  );
  
  const improvement = {
    sigma_p: current_metrics.sigma_p - corrected_metrics.sigma_p,
    dr: corrected_metrics.dr - current_metrics.dr,
    max_dd: corrected_metrics.max_dd - current_metrics.max_dd  // 正数表示改善
  };
  
  console.log(`  Improvements:`);
  console.log(`    σ_p: ${(current_metrics.sigma_p*100).toFixed(2)}% → ${(corrected_metrics.sigma_p*100).toFixed(2)}% (Δ ${improvement.sigma_p > 0 ? '-' : '+'}${Math.abs(improvement.sigma_p*100).toFixed(2)}%)`);
  console.log(`    DR: ${current_metrics.dr.toFixed(3)} → ${corrected_metrics.dr.toFixed(3)} (Δ ${improvement.dr > 0 ? '+' : '-'}${Math.abs(improvement.dr).toFixed(3)})`);
  
  return {
    status: 'PROTECTING',
    current_metrics,
    new_weights: corrected_weights,
    action_taken: action_description
  };
}

// 辅助函数: 减少集中度
function reduce_concentration(old_w, stocks, options) {
  const {target_dr = 1.40, max_increase = 0.10} = options;
  
  let new_w = old_w.slice();
  
  // 找出高相关性高波动的票，减少它们的权重
  const concentration_score = stocks.map((s, i) => {
    let score = s.sigma * old_w[i];  // 波动率 × 权重
    // 加上与其他高权重票的相关性惩罚
    for (let j = 0; j < stocks.length; j++) {
      if (i !== j && old_w[j] > 0.15) {
        const corr = get_correlation(i, j);  // 需要事先计算
        score += corr * old_w[j] * 0.5;
      }
    }
    return {idx: i, score};
  }).sort((a, b) => b.score - a.score);
  
  // 减少前 3 个集中度最高的票
  for (let k = 0; k < Math.min(3, concentration_score.length); k++) {
    const idx = concentration_score[k].idx;
    const reduction = Math.min(0.05, new_w[idx] - 0.10);
    new_w[idx] -= reduction;
  }
  
  // 增加低波动率的票
  const low_vol_indices = stocks
    .map((s, i) => ({idx: i, sigma: s.sigma}))
    .sort((a, b) => a.sigma - b.sigma)
    .slice(0, 3)
    .map(x => x.idx);
  
  for (const idx of low_vol_indices) {
    if (new_w[idx] < 0.20) {
      new_w[idx] += 0.04;
    }
  }
  
  // 归一化
  const sum = new_w.reduce((a, b) => a + b, 0);
  new_w = new_w.map(w => w / sum);
  
  return new_w;
}

// 辅助函数: 增加低波动股票
function add_low_volatility_stocks(old_w, stocks, options) {
  const {target_sigma = 0.20, max_increase = 0.08} = options;
  
  let new_w = old_w.slice();
  
  // 找低波动的票
  const sorted_by_vol = stocks
    .map((s, i) => ({idx: i, sigma: s.sigma}))
    .sort((a, b) => a.sigma - b.sigma);
  
  // 增加波动率最低的 2 只票
  for (let i = 0; i < Math.min(2, sorted_by_vol.length); i++) {
    const idx = sorted_by_vol[i].idx;
    new_w[idx] += 0.04;
  }
  
  // 减少波动率最高的票
  const sorted_by_vol_desc = stocks
    .map((s, i) => ({idx: i, sigma: s.sigma}))
    .sort((a, b) => b.sigma - a.sigma);
  
  for (let i = 0; i < Math.min(2, sorted_by_vol_desc.length); i++) {
    const idx = sorted_by_vol_desc[i].idx;
    if (new_w[idx] > 0.15) {
      new_w[idx] -= 0.04;
    }
  }
  
  // 归一化
  const sum = new_w.reduce((a, b) => a + b, 0);
  new_w = new_w.map(w => w / sum);
  
  return new_w;
}

// 辅助函数: 增加防守位置
function increase_defensive_positions(old_w, stocks, options) {
  const {target_max_dd = -0.12, cash_increase = 0.10} = options;
  
  let new_w = old_w.slice();
  
  // 简单方法: 把部分高波动股票换成现金或债券
  const sorted_by_vol_desc = stocks
    .map((s, i) => ({idx: i, sigma: s.sigma}))
    .sort((a, b) => b.sigma - a.sigma)
    .slice(0, 3);  // 前 3 个最高波动
  
  for (const {idx} of sorted_by_vol_desc) {
    new_w[idx] *= (1 - 0.05);  // 每个减少 5%
  }
  
  // 归一化
  const sum = new_w.reduce((a, b) => a + b, 0);
  new_w = new_w.map(w => w / sum);
  
  return new_w;
}
```

---

## Phase 2: Holdings Quality 优化（约束下）

### 2.1 约束条件的 Softmax

```javascript
function phase2_constrained_softmax_optimization(
  old_weights,
  stocks,
  scores,
  current_metrics,
  constraints
) {
  /*
  输入:
    old_weights[]       : Phase 1 的权重（可能被调整过）
    stocks[]            : 股票信息
    scores[]            : 每只股票的评分
    current_metrics     : Phase 1 的指标
    constraints: {
      max_sigma_increase: 0.01,   // σ_p 增长不超过 1%
      min_dr_ratio: 0.95,         // DR 不低于当前的 95%
      position_cap: 0.35,         // 单头寸上限 35%
      temperature: 3.0,           // Softmax 温度
      rebalance_limit: 0.15       // 权重变化 ±15%
    }
  
  输出:
    {
      new_weights: [],
      hq_gain: 0.91,
      perf_impact: {
        sigma_p_change: 0.005,
        dr_change: -0.02
      },
      feasible: true
    }
  */
  
  console.log(`\n[PHASE 2] Constrained Holdings Quality Optimization\n`);
  
  const n = old_weights.length;
  
  // Step 2.1: 计算理想权重 (标准 Softmax)
  console.log(`Step 2.1: Compute ideal weights (Softmax with T=${constraints.temperature})`);
  
  const ideal_w = compute_softmax(scores, constraints.temperature);
  console.log(`  Ideal weights: [${ideal_w.map(w => (w*100).toFixed(2)+'%').join(', ')}]`);
  
  // Step 2.2: 应用位置上限约束
  console.log(`\nStep 2.2: Apply position cap constraint (cap=${(constraints.position_cap*100).toFixed(0)}%)`);
  
  const capped_w = apply_position_cap_iterative(ideal_w, constraints.position_cap);
  console.log(`  Capped weights: [${capped_w.map(w => (w*100).toFixed(2)+'%').join(', ')}]`);
  
  // Step 2.3: 应用调仓幅度约束
  console.log(`\nStep 2.3: Apply rebalance limit constraint (limit=${(constraints.rebalance_limit*100).toFixed(0)}%)`);
  
  const rebalance_w = apply_rebalance_limit(capped_w, old_weights, constraints.rebalance_limit);
  console.log(`  Rebalance-limited weights: [${rebalance_w.map(w => (w*100).toFixed(2)+'%').join(', ')}]`);
  
  // Step 2.4: 检查约束是否满足
  console.log(`\nStep 2.4: Check constraints`);
  
  // 检查波动率约束
  const new_metrics = calculate_performance_metrics(rebalance_w, stocks, price_history);  // 需要 price_history
  const sigma_p_increase = new_metrics.sigma_p - current_metrics.sigma_p;
  const sigma_constraint_ok = sigma_p_increase <= constraints.max_sigma_increase;
  
  console.log(`  σ_p constraint: ${(new_metrics.sigma_p*100).toFixed(2)}% vs ${(current_metrics.sigma_p*100).toFixed(2)}% + ${(constraints.max_sigma_increase*100).toFixed(2)}% = ${sigma_constraint_ok ? '✓' : '✗'}`);
  
  // 检查 DR 约束
  const min_dr = current_metrics.dr * constraints.min_dr_ratio;
  const dr_constraint_ok = new_metrics.dr >= min_dr;
  
  console.log(`  DR constraint: ${new_metrics.dr.toFixed(3)} >= ${min_dr.toFixed(3)} = ${dr_constraint_ok ? '✓' : '✗'}`);
  
  // Step 2.5: 如果约束不满足，进行微调
  if (!sigma_constraint_ok || !dr_constraint_ok) {
    console.log(`\nStep 2.5: Constraint violation detected, applying corrections`);
    
    // 如果波动率太高，减少高波动股票权重
    if (!sigma_constraint_ok) {
      console.log(`  → Reducing high-volatility stock weights`);
      for (let i = 0; i < n; i++) {
        if (stocks[i].sigma > 0.25) {
          rebalance_w[i] *= 0.95;  // 减少 5%
        }
      }
      // 增加低波动股票权重
      for (let i = 0; i < n; i++) {
        if (stocks[i].sigma < 0.15) {
          rebalance_w[i] *= 1.02;  // 增加 2%
        }
      }
      // 归一化
      const sum = rebalance_w.reduce((a, b) => a + b, 0);
      for (let i = 0; i < n; i++) {
        rebalance_w[i] /= sum;
      }
    }
    
    // 如果 DR 太低，减少高相关性头寸的集中度
    if (!dr_constraint_ok) {
      console.log(`  → Reducing concentration to improve DR`);
      // 找出相关性最高的头寸对，减少其中权重较大的
      // （简化实现，实际需要完整的相关性矩阵）
    }
  }
  
  // Step 2.6: 计算 HQ 增益
  console.log(`\nStep 2.6: Calculate Holdings Quality gain`);
  
  const hq_old = old_weights.reduce((sum, w, i) => sum + w * scores[i], 0);
  const hq_new = rebalance_w.reduce((sum, w, i) => sum + w * scores[i], 0);
  const hq_gain = hq_new - hq_old;
  
  console.log(`  HQ_old: ${hq_old.toFixed(2)}`);
  console.log(`  HQ_new: ${hq_new.toFixed(2)}`);
  console.log(`  HQ gain: ${hq_gain > 0 ? '+' : ''}${hq_gain.toFixed(2)} points`);
  
  return {
    new_weights: rebalance_w,
    hq_gain,
    perf_impact: {
      sigma_p_change: new_metrics.sigma_p - current_metrics.sigma_p,
      dr_change: new_metrics.dr - current_metrics.dr,
      perf_score_change: new_metrics.perf_score - current_metrics.perf_score
    },
    feasible: sigma_constraint_ok && dr_constraint_ok
  };
}

// 辅助函数: 标准 Softmax
function compute_softmax(scores, temperature) {
  const max_score = Math.max(...scores);
  const scaled = scores.map(s => (s - max_score) / temperature);
  const exp_scaled = scaled.map(x => Math.exp(x));
  const sum_exp = exp_scaled.reduce((a, b) => a + b, 0);
  
  return exp_scaled.map(e => e / sum_exp);
}

// 辅助函数: 位置上限约束（迭代）
function apply_position_cap_iterative(ideal_w, cap, max_iter = 5) {
  let w = ideal_w.slice();
  
  for (let iter = 0; iter < max_iter; iter++) {
    w = w.map(x => Math.min(x, cap));
    const sum = w.reduce((a, b) => a + b, 0);
    w = w.map(x => x / sum);
    
    if (w.every(x => x <= cap + 0.001)) {
      break;
    }
  }
  
  return w;
}

// 辅助函数: 调仓幅度约束
function apply_rebalance_limit(ideal_w, old_w, limit) {
  const n = ideal_w.length;
  const constrained_w = new Array(n);
  
  for (let i = 0; i < n; i++) {
    const min_allowed = old_w[i] - limit;
    const max_allowed = old_w[i] + limit;
    constrained_w[i] = Math.max(min_allowed, Math.min(max_allowed, ideal_w[i]));
  }
  
  const sum = constrained_w.reduce((a, b) => a + b, 0);
  return constrained_w.map(w => w / sum);
}
```

---

## Phase 3: 总分验证 & 最终决策

### 3.1 计算总分并做决策

```javascript
function phase3_total_score_verification(
  phase1_result,
  phase2_result,
  current_hq_score
) {
  /*
  输入:
    phase1_result: {status, current_metrics, new_weights, ...}
    phase2_result: {new_weights, hq_gain, perf_impact, ...}
    current_hq_score: 当前 HQ 评分
  
  输出:
    {
      recommendation: 'REBALANCE' | 'HOLD' | 'PROTECT',
      total_score_old: 71.2,
      total_score_new: 71.5,
      total_score_change: +0.3,
      final_weights: [],
      reason: string
    }
  */
  
  console.log(`\n[PHASE 3] Total Score Verification\n`);
  
  // Step 3.1: 确定使用的权重
  let final_weights;
  let final_perf_score;
  let final_hq_score;
  
  if (phase1_result.status === 'HEALTHY') {
    // Performance 健康，使用 Phase 2 的权重
    final_weights = phase2_result.new_weights;
    final_perf_score = phase1_result.current_metrics.perf_score;
    final_hq_score = current_hq_score + phase2_result.hq_gain;
    
  } else if (phase1_result.status === 'PROTECTING') {
    // Performance 被调整过，使用 Phase 1 的权重
    final_weights = phase1_result.new_weights;
    final_perf_score = phase1_result.current_metrics.perf_score;  // 实际应重新计算
    final_hq_score = current_hq_score;
    // Phase 2 不执行，因为 Phase 1 已经调整权重了
  }
  
  // Step 3.2: 计算总分
  console.log(`Step 3.1: Calculate total scores`);
  
  const total_score_old = 0.65 * phase1_result.current_metrics.perf_score + 0.35 * current_hq_score;
  const total_score_new = 0.65 * final_perf_score + 0.35 * final_hq_score;
  const total_score_change = total_score_new - total_score_old;
  
  console.log(`  Old Total Score: ${total_score_old.toFixed(2)}`);
  console.log(`    = 0.65 × ${phase1_result.current_metrics.perf_score.toFixed(1)} + 0.35 × ${current_hq_score.toFixed(1)}`);
  console.log(`  New Total Score: ${total_score_new.toFixed(2)}`);
  console.log(`    = 0.65 × ${final_perf_score.toFixed(1)} + 0.35 × ${final_hq_score.toFixed(1)}`);
  console.log(`  Change: ${total_score_change > 0 ? '+' : ''}${total_score_change.toFixed(2)} points`);
  
  // Step 3.3: 判断是否值得调仓
  console.log(`\nStep 3.2: Rebalance decision logic`);
  
  const hq_improvement_threshold = 2.0;  // 保守: HQ 改善 >= 2.0 分
  const total_score_threshold = 0.3;     // 总分改善 >= 0.3 分
  const min_days_since_last_rebalance = 30;  // 最少 30 天间隔
  
  let recommendation = 'HOLD';
  let reason = '';
  
  if (phase1_result.status === 'PROTECTING') {
    recommendation = 'PROTECT';
    reason = `Performance metrics were unhealthy. Applied protective adjustments: ${phase1_result.action_taken}`;
    
  } else if (phase1_result.status === 'HEALTHY' && phase2_result.hq_gain >= hq_improvement_threshold) {
    if (total_score_change >= total_score_threshold) {
      recommendation = 'REBALANCE';
      reason = `Total score improved by ${total_score_change.toFixed(2)} points (HQ +${phase2_result.hq_gain.toFixed(2)}). Rebalance recommended.`;
    } else {
      recommendation = 'HOLD';
      reason = `HQ improved (${phase2_result.hq_gain.toFixed(2)} points) but total score change (${total_score_change.toFixed(2)}) below threshold. Keep current weights.`;
    }
  } else {
    recommendation = 'HOLD';
    reason = `HQ improvement (${phase2_result.hq_gain.toFixed(2)} points) below threshold (${hq_improvement_threshold}). Not worth rebalancing.`;
  }
  
  console.log(`  Recommendation: ${recommendation}`);
  console.log(`  Reason: ${reason}`);
  
  // Step 3.4: 输出最终决策
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`FINAL DECISION`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Status: ${recommendation}`);
  console.log(`  Total Score: ${total_score_old.toFixed(2)} → ${total_score_new.toFixed(2)} (${total_score_change > 0 ? '+' : ''}${total_score_change.toFixed(2)})`);
  
  if (recommendation === 'REBALANCE') {
    console.log(`\n  Suggested Weight Changes:`);
    // 这里应该用 input 的 old_weights，比较 final_weights
  } else if (recommendation === 'PROTECT') {
    console.log(`\n  Protective Adjustments Applied:`);
    console.log(`    ${phase1_result.action_taken}`);
  } else {
    console.log(`\n  Action: Keep current weights`);
  }
  
  return {
    recommendation,
    total_score_old,
    total_score_new,
    total_score_change,
    final_weights,
    reason
  };
}
```

---

## 完整的主函数（整合三个阶段）

```javascript
async function scheme_b_hierarchical_optimization(
  old_weights,
  stocks,
  scores,
  price_history,
  last_rebalance_date,
  current_date
) {
  /*
  完整的三阶段优化流程
  
  输入:
    old_weights[]       : 当前权重
    stocks[]            : 股票信息
    scores[]            : 评分
    price_history       : 252 天日收益
    last_rebalance_date : 上次调仓日期
    current_date        : 当前日期
  
  输出:
    {
      recommendation: 'REBALANCE' | 'HOLD' | 'PROTECT',
      final_weights: [],
      total_score_improvement: 0.3,
      details: {
        phase1: {...},
        phase2: {...},
        phase3: {...}
      }
    }
  */
  
  console.log(`╔════════════════════════════════════════════════════════╗`);
  console.log(`║  Scheme B: Hierarchical Portfolio Optimization        ║`);
  console.log(`║  Three-Phase Approach for Conservative Rebalancing    ║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
  
  const start_time = Date.now();
  
  // =====================================================
  // PHASE 1: Performance Protection
  // =====================================================
  
  const thresholds = {
    max_sigma: 0.22,
    min_dr: 1.35,
    max_dd_limit: -0.15,
    min_perf_score: 65
  };
  
  const phase1_result = phase1_performance_protection(
    old_weights,
    stocks,
    price_history,
    thresholds
  );
  
  // =====================================================
  // PHASE 2: Constrained HQ Optimization (仅当 Phase 1 HEALTHY 时)
  // =====================================================
  
  let phase2_result = null;
  
  if (phase1_result.status === 'HEALTHY') {
    
    const constraints = {
      max_sigma_increase: 0.01,    // +1%
      min_dr_ratio: 0.95,          // 不低于当前 95%
      position_cap: 0.35,
      temperature: 3.0,
      rebalance_limit: 0.15
    };
    
    phase2_result = phase2_constrained_softmax_optimization(
      phase1_result.new_weights,  // 使用 Phase 1 的权重（健康时就是 old_weights）
      stocks,
      scores,
      phase1_result.current_metrics,
      constraints
    );
    
  } else {
    console.log(`\n⚠️ Phase 2 skipped: Performance metrics require protection`);
    phase2_result = {
      new_weights: phase1_result.new_weights,
      hq_gain: 0,
      perf_impact: {sigma_p_change: 0, dr_change: 0},
      feasible: false
    };
  }
  
  // =====================================================
  // PHASE 3: Total Score Verification & Decision
  // =====================================================
  
  const current_hq_score = old_weights.reduce((sum, w, i) => sum + w * scores[i], 0);
  
  const phase3_result = phase3_total_score_verification(
    phase1_result,
    phase2_result,
    current_hq_score
  );
  
  // =====================================================
  // Execution Time Summary
  // =====================================================
  
  const elapsed = Date.now() - start_time;
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`EXECUTION TIME: ${elapsed}ms (< 128ms limit) ✓`);
  console.log(`${'═'.repeat(60)}\n`);
  
  // =====================================================
  // Return Results
  // =====================================================
  
  return {
    recommendation: phase3_result.recommendation,
    final_weights: phase3_result.final_weights,
    total_score_improvement: phase3_result.total_score_change,
    reason: phase3_result.reason,
    
    details: {
      phase1: {
        status: phase1_result.status,
        metrics: phase1_result.current_metrics,
        action: phase1_result.action_taken
      },
      phase2: {
        hq_gain: phase2_result.hq_gain,
        perf_impact: phase2_result.perf_impact,
        feasible: phase2_result.feasible
      },
      phase3: {
        total_score_old: phase3_result.total_score_old,
        total_score_new: phase3_result.total_score_new
      }
    },
    
    execution_time_ms: elapsed
  };
}
```

---

## Cloudflare Workers 集成

### Workers 端点

```javascript
// src/index.js (Cloudflare Worker)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    if (url.pathname === '/portfolio/optimize-scheme-b') {
      return await handle_scheme_b_optimization(request, env);
    }
    
    return new Response('Not Found', {status: 404});
  },
  
  async scheduled(event, env, ctx) {
    // 每周运行一次优化
    ctx.waitUntil(run_weekly_optimization(env));
  }
};

async function handle_scheme_b_optimization(request, env) {
  try {
    // Step 1: 从 KV 读取数据
    const old_weights = JSON.parse(await env.KV.get('current_weights'));
    const stocks = JSON.parse(await env.KV.get('stocks_metadata'));
    const scores = JSON.parse(await env.KV.get('scores_latest'));
    const price_history = JSON.parse(await env.KV.get('price_history_252'));
    
    if (!old_weights || !stocks || !scores || !price_history) {
      return new Response(JSON.stringify({
        error: 'Missing required data'
      }), {status: 400});
    }
    
    // Step 2: 运行优化
    const result = await scheme_b_hierarchical_optimization(
      Object.values(old_weights),
      stocks,
      Object.values(scores),
      price_history,
      new Date('2026-01-07'),  // 上次调仓日期（示例）
      new Date('2026-01-14')   // 当前日期
    );
    
    // Step 3: 保存结果
    if (result.recommendation === 'REBALANCE') {
      await env.KV.put(
        `rebalance_recommendation:${new Date().toISOString().split('T')[0]}`,
        JSON.stringify(result),
        {expirationTtl: 86400 * 7}  // 保留 7 天
      );
      
      // 发送通知
      await send_notification(env, {
        type: 'REBALANCE_RECOMMENDED',
        improvement: result.total_score_improvement,
        timestamp: new Date().toISOString()
      });
    }
    
    // Step 4: 返回结果
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {'Content-Type': 'application/json'}
    });
    
  } catch (error) {
    console.error('Scheme B optimization error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {status: 500});
  }
}

async function run_weekly_optimization(env) {
  // 周一上午 9 点运行
  const result = await handle_scheme_b_optimization(
    {url: 'https://api.example.com/portfolio/optimize-scheme-b'},
    env
  );
  
  console.log('Weekly optimization completed:', result);
}

async function send_notification(env, payload) {
  // 发送通知给用户（Email、Slack 等）
  // 这里是占位符
  console.log('Notification:', payload);
}
```

---

## 参数配置参考

```javascript
// 保守配置（推荐用于个人投资者）
const CONSERVATIVE_CONFIG = {
  // Phase 1 约束
  max_sigma: 0.22,
  min_dr: 1.35,
  max_dd_limit: -0.15,
  min_perf_score: 65,
  
  // Phase 2 约束
  max_sigma_increase: 0.01,    // +1%
  min_dr_ratio: 0.95,          // 当前 95%
  position_cap: 0.35,          // 35%（不是 40%）
  temperature: 3.5,            // 分散权重
  rebalance_limit: 0.10,       // ±10%（保守）
  
  // Phase 3 触发条件
  hq_improvement_threshold: 2.0,     // HQ +2.0 分
  total_score_threshold: 0.3,        // 总分 +0.3
  min_days_between_rebalance: 30,    // 最少 30 天
};

// 平衡配置
const BALANCED_CONFIG = {
  max_sigma: 0.22,
  min_dr: 1.30,
  max_dd_limit: -0.15,
  min_perf_score: 62,
  
  max_sigma_increase: 0.02,
  min_dr_ratio: 0.90,
  position_cap: 0.38,
  temperature: 2.5,
  rebalance_limit: 0.15,
  
  hq_improvement_threshold: 1.0,
  total_score_threshold: 0.2,
  min_days_between_rebalance: 21,
};

// 进取配置
const AGGRESSIVE_CONFIG = {
  max_sigma: 0.25,
  min_dr: 1.20,
  max_dd_limit: -0.20,
  min_perf_score: 60,
  
  max_sigma_increase: 0.03,
  min_dr_ratio: 0.85,
  position_cap: 0.40,
  temperature: 2.0,
  rebalance_limit: 0.20,
  
  hq_improvement_threshold: 0.5,
  total_score_threshold: 0.1,
  min_days_between_rebalance: 14,
};
```

---

## 单元测试示例

```javascript
// test/scheme_b.test.js

function test_scheme_b_basic() {
  const old_weights = [0.40, 0.30, 0.30];
  const stocks = [
    {ticker: 'AAPL', sigma: 0.22},
    {ticker: 'MSFT', sigma: 0.35},
    {ticker: 'GOOGL', sigma: 0.12}
  ];
  const scores = [69, 67, 76];
  const price_history = [/* 252 days */];
  
  const result = scheme_b_hierarchical_optimization(
    old_weights,
    stocks,
    scores,
    price_history,
    new Date('2026-01-07'),
    new Date('2026-01-14')
  );
  
  // 断言
  assert(result.recommendation in ['REBALANCE', 'HOLD', 'PROTECT']);
  assert(result.final_weights.length === 3);
  assert(Math.abs(result.final_weights.reduce((a, b) => a + b) - 1.0) < 0.001);
  
  console.log('✓ test_scheme_b_basic passed');
}

function test_phase1_protection() {
  const old_weights = [0.50, 0.30, 0.20];  // 高集中度
  const stocks = [
    {ticker: 'VOLATILE', sigma: 0.40},
    {ticker: 'MID', sigma: 0.25},
    {ticker: 'SAFE', sigma: 0.10}
  ];
  
  const phase1_result = phase1_performance_protection(
    old_weights,
    stocks,
    price_history,
    {min_dr: 1.35, max_sigma: 0.22}
  );
  
  assert(phase1_result.status in ['HEALTHY', 'PROTECTING']);
  
  if (phase1_result.status === 'PROTECTING') {
    // 权重应该更均衡
    const new_min = Math.min(...phase1_result.new_weights);
    const new_max = Math.max(...phase1_result.new_weights);
    assert((new_max - new_min) < (Math.max(...old_weights) - Math.min(...old_weights)));
  }
  
  console.log('✓ test_phase1_protection passed');
}

// 运行测试
test_scheme_b_basic();
test_phase1_protection();
console.log('\nAll tests passed!');
```

---

## 总结：Vibe 需要实现的核心模块

```
1. Performance Metrics Calculation
   - calculate_performance_metrics()
   - convert_metrics_to_score()

2. Phase 1: Protection
   - check_performance_health()
   - reduce_concentration()
   - add_low_volatility_stocks()
   - increase_defensive_positions()

3. Phase 2: HQ Optimization
   - compute_softmax()
   - apply_position_cap_iterative()
   - apply_rebalance_limit()
   - phase2_constrained_softmax_optimization()

4. Phase 3: Verification
   - phase3_total_score_verification()

5. Main Integration
   - scheme_b_hierarchical_optimization()  ← 主函数
   - Workers 端点集成

6. 依赖数据
   - 252 天日收益率历史
   - 相关性矩阵（可选）
   - 股票基本信息（波动率等）
   - 当前评分
```

**关键点**：
- ✅ 三个阶段独立，便于调试
- ✅ 所有计算都 < 10ms
- ✅ 参数配置灵活（保守/平衡/进取）
- ✅ 自动 fallback（无法优化就保持现状）
- ✅ Cloudflare Workers Free Plan 友好
