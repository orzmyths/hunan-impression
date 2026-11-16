/* 韶山印象 服务费分配引擎 Hunan Impression service charge engine
 * 纯计算，不操作 DOM。金额一律以整数「分」处理。
 * Pure functions only (no DOM). All money is handled as integer cents.
 */
(function (root) {
  'use strict';

  var PCT_TOLERANCE = 0.0005;

  // 解析用户输入的数字；空白或无效时返回 NaN。
  function num(v) {
    if (v === null || v === undefined) return NaN;
    var s = String(v).replace(/[$,\s]/g, '');
    if (s === '') return NaN;
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function toCents(dollars) {
    return Math.round(dollars * 100);
  }

  // 最大余数法：把 total 按 weights 分配，整数合计恰好等于 total。
  function largestRemainder(total, weights) {
    var n = weights.length;
    var out = new Array(n);
    var i;
    var w = weights.map(function (x) { return (isFinite(x) && x > 0) ? x : 0; });
    var W = 0;
    for (i = 0; i < n; i++) W += w[i];
    for (i = 0; i < n; i++) out[i] = 0;
    if (W <= 0 || total === 0) return out;
    var raw = w.map(function (x) { return total * x / W; });
    var sum = 0;
    for (i = 0; i < n; i++) { out[i] = Math.floor(raw[i]); sum += out[i]; }
    var rem = total - sum;
    var order = [];
    for (i = 0; i < n; i++) order.push(i);
    order.sort(function (a, b) {
      var fa = raw[a] - Math.floor(raw[a]);
      var fb = raw[b] - Math.floor(raw[b]);
      if (fb !== fa) return fb - fa;
      return a - b;
    });
    for (i = 0; i < rem; i++) out[order[i]] += 1;
    return out;
  }

  function numbersKey(d) {
    return [d.date, d.shift, d.sales, d.sc, d.tips].join('|');
  }

  // 核心计算。即使有错误也会返回 lines，供界面即时预览。
  // errors 为空时才可保存。
  function calculate(state) {
    var d = state.draft;
    var errors = [];
    var warnings = [];
    var key = numbersKey(d);

    var sales = num(d.sales);
    var sc = num(d.sc);
    var tips = num(d.tips === '' || d.tips == null ? '0' : d.tips);

    if (d.sales !== '' && d.sales != null && (!isFinite(sales) || sales < 0)) errors.push('净销售额格式不正确，可留空。');
    if (!isFinite(sc) || sc < 0) errors.push('请输入 EOD 报表的服务费总额。');
    if (!isFinite(tips) || tips < 0) errors.push('额外自愿小费不可为负数。');

    var salesC = isFinite(sales) ? toCents(sales) : 0;
    var poolC = isFinite(sc) ? toCents(sc) : 0;
    var tipsC = isFinite(tips) ? toCents(tips) : 0;
    // 服务费总额即为分配池，直接使用。不做 18% 核对。
    // The Service Charge total entered is the pool, used as-is. No 18% cross-check.
    if (d.source && d.source !== 'manual' && d.verifiedKey !== key) {
      errors.push('请对照 EOD 报表核对每个数字，并在「新班次」勾选核对框。');
    }

    // 对照员工资料库。停用员工不进入计算。
    var lines = [];
    (d.picks || []).forEach(function (p) {
      var card = null;
      for (var k = 0; k < state.library.length; k++) {
        if (state.library[k].id === p.empId) { card = state.library[k]; break; }
      }
      if (!card) return;
      if (!card.active) {
        warnings.push(card.name + ' 已停用，本班不计算。');
        return;
      }
      var sp = (p.shiftPct === '' || p.shiftPct == null) ? NaN : num(p.shiftPct);
      lines.push({
        pick: p,
        card: card,
        hours: num(p.hours) > 0 ? num(p.hours) : 0,
        shiftPct: isFinite(sp) ? sp : card.basePct
      });
    });

    var result = {
      errors: errors,
      warnings: warnings,
      key: key,
      mode: state.mode,
      salesC: salesC,
      poolC: poolC,
      tipsC: tipsC,
      lines: [],
      houseC: 0,
      redistC: 0,
      netSumC: 0,
      tipsSumC: 0,
      reconciled: false
    };

    if (lines.length === 0) {
      errors.push('请至少在今日班次中加入一位启用中的员工。');
      return result;
    }

    var grossC = lines.map(function () { return 0; });

    if (state.mode === 'A') {
      var sumPct = 0;
      lines.forEach(function (l) { sumPct += l.shiftPct; });
      if (Math.abs(sumPct - 100) > PCT_TOLERANCE) {
        errors.push('今日百分比合计 ' + sumPct.toFixed(2) + '%，不是 100%。请修正，或点击「标准化」。');
      }
      grossC = largestRemainder(poolC, lines.map(function (l) { return l.shiftPct; }));
    } else {
      var roles = state.roles;
      var rp = roles.map(function (r) {
        var v = num(state.rolePcts[r]);
        return isFinite(v) && v >= 0 ? v : 0;
      });
      var rsum = 0;
      rp.forEach(function (v) { rsum += v; });
      if (Math.abs(rsum - 100) > PCT_TOLERANCE) {
        errors.push('角色百分比合计 ' + rsum.toFixed(2) + '%，不是 100%。');
      }
      var roleC = largestRemainder(poolC, rp);
      roles.forEach(function (r, i) {
        var idx = [];
        lines.forEach(function (l, j) { if (l.card.role === r) idx.push(j); });
        if (idx.length === 0) {
          if (rp[i] > 0) {
            errors.push(r + ' 占池 ' + rp[i] + '%，但今天没有挑选该角色的员工，这部分金额无人领取。');
          }
          return;
        }
        var hrs = idx.map(function (j) { return lines[j].hours; });
        var H = 0;
        hrs.forEach(function (h) { H += h; });
        if (rp[i] > 0 && H <= 0) errors.push('请输入今日挑选的 ' + r + ' 员工工时。');
        if (rp[i] === 0) warnings.push('模式 B 中 ' + r + ' 为 0%，今天挑选的 ' + r + ' 员工将领取 $0。');
        var shares = largestRemainder(roleC[i], hrs);
        idx.forEach(function (j, k) { grossC[j] = shares[k]; });
      });
    }

    // 每位员工的错误扣款（按其毛额的百分比）。
    var dedLines = lines.map(function (l, j) {
      var pctTotal = 0;
      var deds = (l.pick.deductions || []).map(function (x) {
        var pct = num(x.pct);
        if (!isFinite(pct) || pct <= 0 || pct > 100) {
          errors.push(l.card.name + '：每笔扣款的百分比需介于 0 到 100 之间。');
          pct = 0;
        }
        pctTotal += pct;
        return {
          id: x.id,
          pct: pct,
          reason: x.reason,
          note: x.note || '',
          dest: x.dest === 'house' ? 'house' : 'pool',
          amountC: Math.round(grossC[j] * pct / 100)
        };
      });
      if (pctTotal > 100) errors.push(l.card.name + '：扣款合计超过 100%。');
      if (pctTotal > 50 && !l.pick.bigConfirmed) {
        errors.push(l.card.name + '：扣款合计 ' + pctTotal + '%，超过 50%。请在该员工卡上勾选确认。');
      }
      var poolDed = 0, houseDed = 0;
      deds.forEach(function (x) {
        if (x.dest === 'house') houseDed += x.amountC; else poolDed += x.amountC;
      });
      return { deductions: deds, pctTotal: pctTotal, poolDedC: poolDed, houseDedC: houseDed };
    });

    var P = 0, H2 = 0;
    dedLines.forEach(function (x) { P += x.poolDedC; H2 += x.houseDedC; });

    // 「送回池」的金额，分给没有送回池扣款、且毛额大于 0 的员工，依毛额比例分配。
    var redistC = lines.map(function () { return 0; });
    var recIdx = [];
    lines.forEach(function (l, j) {
      if (dedLines[j].poolDedC === 0 && grossC[j] > 0) recIdx.push(j);
    });
    if (P > 0) {
      if (recIdx.length === 0) {
        errors.push('没有其他员工可以接收「送回池」的金额。请选择「归店家」，或增加员工。');
      } else {
        var sh = largestRemainder(P, recIdx.map(function (j) { return grossC[j]; }));
        recIdx.forEach(function (j, k) { redistC[j] = sh[k]; });
      }
    }

    // 小费：独立小池，依毛额比例分配，不混入服务费池。
    var grossSum = 0;
    grossC.forEach(function (g) { grossSum += g; });
    var tipWeights = grossSum > 0 ? grossC : lines.map(function () { return 1; });
    var tipShares = largestRemainder(tipsC, tipWeights);

    var netSum = 0;
    lines.forEach(function (l, j) {
      var dl = dedLines[j];
      var dedC = dl.poolDedC + dl.houseDedC;
      var netC = grossC[j] - dedC + redistC[j];
      netSum += netC;
      var effPct = poolC > 0 ? (netC / poolC) * 100 : 0;
      var perHour = l.hours > 0 ? netC / l.hours : null;
      result.lines.push({
        empId: l.card.id,
        name: l.card.name,
        role: l.card.role,
        basePct: l.card.basePct,
        shiftPct: l.shiftPct,
        hours: l.hours,
        grossC: grossC[j],
        deductions: dl.deductions,
        pctTotal: dl.pctTotal,
        poolDedC: dl.poolDedC,
        houseDedC: dl.houseDedC,
        dedC: dedC,
        redistC: redistC[j],
        netC: netC,
        tipC: tipShares[j],
        effPct: effPct,
        perHour: perHour
      });
    });

    result.houseC = H2;
    result.redistC = P;
    result.netSumC = netSum;
    result.tipsSumC = tipShares.reduce(function (a, b) { return a + b; }, 0);
    result.reconciled = (netSum + H2 === poolC) && (grossSum === poolC) && (result.tipsSumC === tipsC);
    if (errors.length === 0 && !result.reconciled) {
      errors.push('内部核对失败：实发金额加上店家保留金额不等于服务费池，本次未保存。');
    }
    return result;
  }

  // 标准化：把所有挑选员工的本班百分比等比例调整为合计 100。
  function normalizedPicks(state) {
    var rows = [];
    var sum = 0;
    state.draft.picks.forEach(function (p) {
      var card = null;
      for (var k = 0; k < state.library.length; k++) {
        if (state.library[k].id === p.empId) { card = state.library[k]; break; }
      }
      if (!card || !card.active) return;
      var sp = (p.shiftPct === '' || p.shiftPct == null) ? NaN : num(p.shiftPct);
      var v = isFinite(sp) ? sp : card.basePct;
      rows.push({ id: p.empId, v: v });
      sum += v;
    });
    if (sum <= 0) return null;
    var out = {};
    var acc = 0;
    rows.forEach(function (r, i) {
      var val = i === rows.length - 1 ? 100 - acc : Math.round((r.v * 100 / sum) * 1e6) / 1e6;
      acc += (i === rows.length - 1) ? 0 : val;
      out[r.id] = Number(val.toFixed(6)).toString();
    });
    return out;
  }

  var api = {
    num: num,
    toCents: toCents,
    largestRemainder: largestRemainder,
    numbersKey: numbersKey,
    calculate: calculate,
    normalizedPicks: normalizedPicks
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HIEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
