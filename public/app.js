(function () {
  'use strict';

  var E = window.HIEngine;
  var KEY = 'hunan-impression-scd-v2';
  var REASONS = ['上菜顺序错误', '餐点破损', '客人投诉', '迟到', '其他'];
  var DEFAULT_ROLES = ['服务员', '厨房', '传菜员', '收银员', '其他'];
  var SHIFTS = ['午市', '晚市'];
  var root = document.getElementById('app');

  var storageOK = true;
  var dlCap = null;
  var ui = {
    tab: 'shift',
    histId: null,
    modal: null,
    dedForm: null,
    pasteText: '',
    photoUrl: null,
    newRole: '',
    toast: null,
    panel: null,
    advanced: false,
    step: 1
  };

  // ---------- 工具函数 helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(c) {
    var neg = c < 0;
    var v = Math.abs(c) / 100;
    var s = '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (neg ? '−' : '') + s;
  }
  function pctText(x) {
    return (Math.round(x * 100) / 100).toFixed(2) + '%';
  }
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function todayISO() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function bind(name, id) {
    var fk = name + '#' + (id == null ? '' : id);
    return ' data-bind="' + name + '" data-id="' + esc(id == null ? '' : id) + '" data-fk="' + esc(fk) + '"';
  }
  function findCard(id) {
    for (var i = 0; i < state.library.length; i++) if (state.library[i].id === id) return state.library[i];
    return null;
  }
  function findPick(id) {
    for (var i = 0; i < state.draft.picks.length; i++) if (state.draft.picks[i].empId === id) return state.draft.picks[i];
    return null;
  }
  function lineFor(res, id) {
    for (var i = 0; i < res.lines.length; i++) if (res.lines[i].empId === id) return res.lines[i];
    return null;
  }
  function sumPickDed(p) {
    var t = 0;
    (p.deductions || []).forEach(function (d) { t += (E.num(d.pct) || 0); });
    return t;
  }
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function amt(c) { return (c / 100).toFixed(2); }
  function modeLabel(m) { return m === 'B' ? '模式 B（角色比例后按工时）' : '模式 A（直接百分比）'; }
  function destLabel(d) { return d === 'house' ? '归店家' : '送回池'; }

  // ---------- 状态 state ----------
  function sampleLibrary() {
    return [
      { id: 's1', name: '示例服务员A', role: '服务员', basePct: 20, active: true, sample: true },
      { id: 's2', name: '示例服务员B', role: '服务员', basePct: 15, active: true, sample: true },
      { id: 's3', name: '示例服务员C', role: '服务员', basePct: 10, active: true, sample: true },
      { id: 's4', name: '示例厨师1', role: '厨房', basePct: 20, active: true, sample: true },
      { id: 's5', name: '示例厨师2', role: '厨房', basePct: 15, active: true, sample: true },
      { id: 's6', name: '示例传菜员', role: '传菜员', basePct: 10, active: true, sample: true },
      { id: 's7', name: '示例收银员', role: '收银员', basePct: 10, active: true, sample: true },
      { id: 's8', name: '示例洗碗工（已停用）', role: '其他', basePct: 0, active: false, sample: true }
    ];
  }
  function blankPick(id, hours) {
    return { empId: id, hours: hours || '', shiftPct: '', deductions: [], bigConfirmed: false };
  }
  function defaultState() {
    var ids = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'];
    var hours = { s1: '6', s2: '5', s3: '4', s4: '8', s5: '7', s6: '5', s7: '6' };
    return {
      v: 2,
      library: sampleLibrary(),
      roles: DEFAULT_ROLES.slice(),
      rolePcts: { '服务员': 50, '厨房': 30, '传菜员': 20, '收银员': 0, '其他': 0 },
      mode: 'A',
      history: [],
      lastPicks: ids.slice(),
      draft: {
        date: todayISO(),
        shift: '晚市',
        sales: '10000',
        sc: '1800',
        tips: '0',
        source: 'manual',
        verifiedKey: null,
        picks: []
      }
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      var s = JSON.parse(raw);
      var d = defaultState();
      if (!Array.isArray(s.library)) return d;
      s.roles = Array.isArray(s.roles) && s.roles.length ? s.roles : DEFAULT_ROLES.slice();
      s.rolePcts = s.rolePcts || d.rolePcts;
      s.mode = s.mode === 'B' ? 'B' : 'A';
      s.history = Array.isArray(s.history) ? s.history : [];
      s.lastPicks = Array.isArray(s.lastPicks) ? s.lastPicks : [];
      s.draft = s.draft && Array.isArray(s.draft.picks) ? s.draft : d.draft;
      return s;
    } catch (e) {
      return defaultState();
    }
  }
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      storageOK = true;
    } catch (e) {
      storageOK = false;
    }
  }
  var state = load();

  // ---------- 渲染 rendering ----------
  function render() {
    var a = document.activeElement;
    var fk = a && a.getAttribute ? a.getAttribute('data-fk') : null;
    var selS = null, selE = null;
    try {
      if (a && typeof a.selectionStart === 'number') { selS = a.selectionStart; selE = a.selectionEnd; }
    } catch (e) { /* 非文字栏位 not a text field */ }
    root.innerHTML = view();
    if (window.HIHooks && HIHooks.afterRender) HIHooks.afterRender(root);
    if (fk) {
      var all = root.querySelectorAll('[data-fk]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute('data-fk') === fk) {
          all[i].focus();
          try { if (selS != null) all[i].setSelectionRange(selS, selE); } catch (e) { /* 忽略 ignore */ }
          break;
        }
      }
    }
  }
  function commit() { save(); render(); }
  function toast(msg) {
    ui.toast = msg;
    setTimeout(function () { ui.toast = null; render(); }, 4500);
  }
  function ask(msg, okLabel) {
    return new Promise(function (resolve) {
      ui.modal = { type: 'confirm', msg: msg, okLabel: okLabel || '继续', resolve: resolve };
      render();
    });
  }

  function view() {
    var res = E.calculate(state);
    var body;
    if (!ui.advanced) body = viewSimple(res);
    else if (ui.tab === 'shift') body = viewShift(res);
    else if (ui.tab === 'cards') body = viewCards(res);
    else if (ui.tab === 'results') body = viewResults(res);
    else body = viewHistory();

    var sampleCount = state.library.filter(function (c) { return c.sample; }).length;
    var banners = '';
    if (!storageOK) {
      banners += '<div class="alert warn">此浏览器无法保存数据（存储被封锁）。关闭页面前请先导出备份。</div>';
    }
    if (sampleCount) {
      banners += '<div class="alert demo"><strong>示例名单。</strong>示例员工的名称与百分比仅供测试，不是韶山印象的真实规则。请替换为真实员工卡后，再删除示例。 <button class="small" data-act="remove-samples">删除示例员工卡</button></div>';
    }

    var tabs = [
      { id: 'shift', label: '新班次' },
      { id: 'cards', label: '员工卡' },
      { id: 'results', label: res.errors.length ? '结果（需修正）' : '结果' },
      { id: 'history', label: '历史记录（' + state.history.length + '）' }
    ].map(function (t) {
      return '<button class="tab' + (ui.tab === t.id ? ' active' : '') + '" data-act="tab" data-id="' + t.id + '">' + esc(t.label) + '</button>';
    }).join('');

    var toastHTML = ui.toast ? '<div class="toast">' + esc(ui.toast) + '</div>' : '';

    return '' +
      '<header class="top"><div><h1>Hunan Impression 韶山印象</h1>' +
      '<p class="sub">服务费分配 · 5152 Moorpark Ave #30, San Jose, CA 95129</p></div><a class="recs" href="records.html">查看记录页</a></header>' +
      (ui.advanced ? '<nav class="tabs">' + tabs + '</nav>' : '') +
      '<main>' + banners + '<div class="toggle-row"><button data-act="toggle-advanced">' + (ui.advanced ? '回到简单模式' : '进阶设置') + '</button></div>' + body + '</main>' +
      toastHTML + modalHTML();
  }


  // ---------- 简单模式（四步） simple mode ----------
  function viewSimple(res) {
    var steps = ['今天的营业', '今天上班的人', '每人实拿', '存档'];
    var bar = '<ol class="steps">' + steps.map(function (label, i) {
      var n = i + 1;
      var cls = ui.step === n ? 'on' : (ui.step > n ? 'done' : '');
      return '<li class="' + cls + '" data-act="step" data-id="' + n + '">' + n + '. ' + esc(label) + '</li>';
    }).join('') + '</ol>';
    var body = ui.step === 1 ? simpleStep1(res)
      : ui.step === 2 ? simpleStep2(res)
      : ui.step === 3 ? simpleStep3(res)
      : simpleStep4(res);
    var nav = '<div class="btnrow navrow">' +
      (ui.step > 1 ? '<button data-act="step-prev">← 上一步</button>' : '') +
      (ui.step < 4 ? '<button class="primary big" data-act="step-next">下一步 →</button>' : '') +
      '</div>';
    return bar + '<section class="card">' + body + '</section>' + nav + panelHTML();
  }

  function simpleStep1(res) {
    var d = state.draft;
    var key = E.numbersKey(d);
    var preview = ui.photoUrl ? '<img class="preview" alt="收银报表照片" src="' + ui.photoUrl + '">' : '';
    var verify = d.source !== 'manual'
      ? '<label class="check"><input type="checkbox"' + bind('verify') + (d.verifiedKey === key ? ' checked' : '') + '> 我已对照收银报表核对上方数字。</label>'
      : '';
    var moreOpen = (d.sales !== '' || (d.tips !== '' && d.tips !== '0') || d.source !== 'manual') ? ' open' : '';
    return '<h2>第一步：今天的营业</h2>' +
      '<div id="consent-slot"></div>' +
      '<div id="ai-slot"></div>' +
      '<p class="hint">服务费就是今天要分的钱。请直接填收银报表上的「服务费总额」。</p>' +
      '<div class="fields2">' +
        '<label>日期<input type="date"' + bind('date') + ' value="' + esc(d.date) + '"></label>' +
        '<label>班次<select' + bind('shift') + '>' + SHIFTS.map(function (x) {
          return '<option' + (d.shift === x ? ' selected' : '') + '>' + x + '</option>';
        }).join('') + '</select></label>' +
      '</div>' +
      '<label class="big-field">服务费总额 ($)<input type="text" inputmode="decimal"' + bind('sc') + ' value="' + esc(d.sc) + '" placeholder="例如 1800.00"></label>' +
      '<p class="hint">今天要分的服务费：<strong>' + money(res.poolC) + '</strong></p>' +
      '<details' + moreOpen + '><summary>更多选项（选填）</summary>' +
        '<label>净销售额（选填，仅供记录） ($)<input type="text" inputmode="decimal"' + bind('sales') + ' value="' + esc(d.sales) + '" placeholder="例如 10000.00"></label>' +
        '<label>额外自愿小费，如有 ($)<input type="text" inputmode="decimal"' + bind('tips') + ' value="' + esc(d.tips) + '" placeholder="0.00"></label>' +
        '<p class="hint">额外小费是独立的小池，不会与服务费混合。</p>' +
        verify +
      '</details>';
  }

  function simpleStep2(res) {
    var rows = state.library.map(function (c) {
      var p = findPick(c.id);
      var actions = '<button class="small" data-act="edit-card" data-id="' + esc(c.id) + '">编辑</button>';
      if (p) {
        actions += '<button class="small" data-act="unpick" data-id="' + esc(c.id) + '">今天不上班</button>';
      } else if (c.active) {
        actions = '<button class="primary small" data-act="add-pick" data-id="' + esc(c.id) + '">今天上班</button>' + actions;
      }
      var head = '<div class="pick-head"><div><strong>' + esc(c.name) + '</strong> <span class="pill">' + esc(c.role) + '</span>' +
        (c.active ? '' : ' <span class="pill grey">已停用，不计算</span>') + '</div>' +
        '<div class="btnrow">' + actions + '</div></div>';
      if (!p) {
        return '<div class="pick off">' + head + '<p class="hint">今天没有上班</p></div>';
      }
      return '<div class="pick">' + head +
        '<div class="fields2">' +
          '<label>今天工时（选填）<input type="text" inputmode="decimal"' + bind('pick-hours', p.empId) + ' value="' + esc(p.hours) + '" placeholder="0"></label>' +
          '<label>今天占比（留空 = 固定比例 ' + esc(c.basePct) + '%）<input type="text" inputmode="decimal"' + bind('pick-shift', p.empId) + ' value="' + esc(p.shiftPct) + '" placeholder="' + esc(c.basePct) + '"></label>' +
        '</div></div>';
    }).join('') || '<p class="muted">还没有员工。请点击「＋ 新增员工」。</p>';

    var sum = res.lines.reduce(function (a, l) { return a + l.shiftPct; }, 0);
    var sumLine = '';
    if (res.lines.length) {
      sumLine = Math.abs(sum - 100) < 0.0005
        ? '<div class="alert ok">占比合计 100% ✓</div>'
        : '<div class="alert warn">占比合计 ' + pctText(sum) + '，' + (sum > 100 ? '多了' : '少了') + '。<div class="btnrow"><button class="primary" data-act="normalize">自动调整到 100%</button></div></div>';
    }

    return '<h2>第二步：今天上班的人</h2>' +
      '<p class="hint">默认所有人都没上班。请在下面点「今天上班」选出今天的人，也可以点「编辑」修改名字与角色。</p>' +
      '<div class="btnrow wrapbtn"><button data-act="preload">载入上一班名单</button><button data-act="new-card">＋ 新增员工</button></div>' +
      rows + sumLine;
  }

  function simpleDedForm() {
    var f = ui.dedForm;
    var pcts = [5, 10, 20, 50].map(function (v) {
      return '<button class="opt' + (String(f.pct) === String(v) ? ' on' : '') + '" data-act="ded-pct-pick" data-v="' + v + '">' + v + '%</button>';
    }).join('');
    var reasons = REASONS.map(function (r) {
      return '<button class="opt' + (f.reason === r ? ' on' : '') + '" data-act="ded-reason-pick" data-v="' + esc(r) + '">' + esc(r) + '</button>';
    }).join('');
    return '<div class="dedform">' +
      '<p><strong>扣多少？</strong></p><div class="btnrow wrapbtn">' + pcts + '</div>' +
      '<label>或自己输入 (%)<input type="text" inputmode="decimal"' + bind('ded-pct') + ' value="' + esc(f.pct) + '"></label>' +
      '<p><strong>为什么扣？</strong></p><div class="btnrow wrapbtn">' + reasons + '</div>' +
      '<label>备注（选填）<input type="text"' + bind('ded-note') + ' value="' + esc(f.note) + '"></label>' +
      '<p><strong>这笔钱去哪里？</strong></p>' +
      '<div class="btnrow">' +
        '<button class="opt big' + (f.dest !== 'house' ? ' on' : '') + '" data-act="ded-dest-pick" data-v="pool">给其他上班的人</button>' +
        '<button class="opt big' + (f.dest === 'house' ? ' on' : '') + '" data-act="ded-dest-pick" data-v="house">店家留下</button>' +
      '</div>' +
      '<p class="hint">「给其他上班的人」会归到当班其他人身上；「店家留下」由餐厅保留，不会给员工。</p>' +
      '<div class="btnrow"><button class="primary big" data-act="add-ded">确定扣款</button><button data-act="cancel-ded">取消</button></div>' +
    '</div>';
  }

  function simpleStep3(res) {
    var head = '<h2>第三步：每人实拿</h2>';
    if (res.errors.length) {
      return head + '<div class="alert warn"><strong>还不能分钱，请先处理：</strong><ul>' +
        res.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
        '</ul></div><p class="hint">可以点「← 上一步」回去修改。</p>';
    }
    var warns = res.warnings.length
      ? '<div class="alert info"><ul>' + res.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>'
      : '';
    var cards = res.lines.map(function (l) {
      var p = findPick(l.empId);
      var dl = l.deductions.map(function (x) {
        return '<div class="ded-item"><span>−' + esc(x.pct) + '% ' + esc(x.reason) + ' · ' + (x.dest === 'house' ? '店家留下' : '给其他人') + '</span>' +
          '<span class="neg">' + money(-x.amountC) + '</span>' +
          '<button class="small" data-act="del-ded" data-id="' + esc(l.empId) + '" data-ded="' + esc(x.id) + '">删除</button></div>';
      }).join('');
      var formOpen = ui.dedForm && ui.dedForm.pickId === l.empId;
      var big = (l.pctTotal > 50 && p)
        ? '<label class="check warnline"><input type="checkbox"' + bind('pick-big', l.empId) + (p.bigConfirmed ? ' checked' : '') + '> 扣款超过 50%，我确认无误。</label>'
        : '';
      return '<article class="env simple-env"><header><div><h3>' + esc(l.name) + '</h3><div class="muted">' + esc(l.role) + '</div></div></header>' +
        '<div class="row-line"><span>应得</span><b>' + money(l.grossC) + '</b></div>' +
        (dl ? '<div class="deds">' + dl + '</div>' : '') +
        (l.redistC > 0 ? '<div class="row-line green"><span>别人扣的钱分给你</span><b>+' + money(l.redistC) + '</b></div>' : '') +
        '<div class="net"><span>实拿</span><b>' + money(l.netC) + '</b></div>' +
        big +
        (formOpen ? simpleDedForm() : '<div class="btnrow"><button data-act="open-ded" data-id="' + esc(l.empId) + '">＋ 扣款</button></div>') +
      '</article>';
    }).join('');
    var check = '<div class="sum-check">服务费 ' + money(res.poolC) + ' = 实拿合计 ' + money(res.netSumC) +
      ' + 店家留下 ' + money(res.houseC) + (res.reconciled ? ' ✓ 分完了，一分不差' : ' ✗ 不相符') + '</div>';
    var tipsLine = res.tipsC > 0 ? '<p class="hint">额外小费另外发放：' + money(res.tipsC) + '</p>' : '';
    return head + warns + '<div class="envs">' + cards + '</div>' + check + tipsLine;
  }

  function simpleStep4(res) {
    if (res.errors.length) {
      return '<h2>第四步：存档</h2><div class="alert warn">还有问题，请先回到前面的步骤修正。</div>';
    }
    var d = state.draft;
    return '<h2>第四步：存档</h2>' +
      '<table class="kv">' +
        '<tr><td>日期</td><td>' + esc(d.date) + ' ' + esc(d.shift) + '</td></tr>' +
        '<tr><td>服务费（今天要分的钱）</td><td>' + money(res.poolC) + '</td></tr>' +
        '<tr><td>实拿合计</td><td>' + money(res.netSumC) + '</td></tr>' +
        '<tr><td>店家留下</td><td>' + money(res.houseC) + '</td></tr>' +
        '<tr><td>上班人数</td><td>' + res.lines.length + ' 人</td></tr>' +
      '</table>' +
      '<div class="btnrow"><button class="primary big" data-act="save-shift">存到历史纪录</button><button data-act="show-csv" data-id="live">导出表格（CSV）</button></div>' +
      '<p class="hint">存档后，今天的数字会清空，名单会自动带入给下一班。</p>';
  }

  // ---------- 第 1 画面：新班次 ----------
  function viewShift(res) {
    var d = state.draft;
    var key = E.numbersKey(d);
    var verify = d.source !== 'manual'
      ? '<label class="check"><input type="checkbox"' + bind('verify') + (d.verifiedKey === key ? ' checked' : '') + '> 我已对照 EOD 报表核对上方每一个数字。</label>'
      : '';

    var preview = ui.photoUrl ? '<img class="preview" alt="EOD 报表照片" src="' + ui.photoUrl + '">' : '';

    var modeB = state.mode === 'B';
    var roleRows = state.roles.map(function (r) {
      var used = state.library.some(function (c) { return c.role === r; });
      return '<tr><td>' + esc(r) + '</td><td><input type="number" step="0.01" min="0" max="100" class="pct"' +
        bind('role-pct', r) + ' value="' + esc(state.rolePcts[r] == null ? 0 : state.rolePcts[r]) + '"> %</td><td>' +
        (used ? '<span class="muted">使用中</span>' : '<button class="small" data-act="role-remove" data-id="' + esc(r) + '">删除</button>') +
        '</td></tr>';
    }).join('');
    var roleSum = state.roles.reduce(function (a, r) { return a + (E.num(state.rolePcts[r]) || 0); }, 0);

    var roles = '<div class="roles"><h3>角色</h3><p class="hint">角色会显示在每张员工卡上。占池比例只在模式 B 使用。</p>' +
      (modeB ? '<table class="grid-t"><thead><tr><th>角色</th><th>占池比例</th><th></th></tr></thead><tbody>' + roleRows +
        '<tr><td><strong>合计</strong></td><td><strong class="' + (Math.abs(roleSum - 100) < 0.0005 ? 'okt' : 'badt') + '">' + pctText(roleSum) + '</strong></td><td></td></tr></tbody></table>' : '') +
      '<div class="btnrow"><input type="text" placeholder="新角色名称"' + bind('new-role') + ' value="' + esc(ui.newRole) + '"><button data-act="role-add">新增角色</button></div></div>';

    var gate = res.errors.length
      ? '<div class="alert warn"><strong>计算前请先确认：</strong><ul>' + res.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>'
      : '<div class="alert ok">已就绪。请确认数字后计算，即可看到每位员工的分配。</div>';
    var warns = res.warnings.length
      ? '<div class="alert info"><ul>' + res.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>'
      : '';

    return '' +
      '<div class="cols">' +
      '<section class="card">' +
        '<h2>班次资料</h2>' +
        '<div class="fields3">' +
          '<label>日期<input type="date"' + bind('date') + ' value="' + esc(d.date) + '"></label>' +
          '<label>班次<select' + bind('shift') + '>' + SHIFTS.map(function (s) {
            return '<option' + (d.shift === s ? ' selected' : '') + '>' + s + '</option>';
          }).join('') + '</select></label>' +
          '<label>净销售额（选填，仅供记录） ($)<input type="text" inputmode="decimal"' + bind('sales') + ' value="' + esc(d.sales) + '" placeholder="10000.00"></label>' +
        '</div>' +
        '<div class="fields2">' +
          '<label>EOD 报表服务费总额 ($)<input type="text" inputmode="decimal"' + bind('sc') + ' value="' + esc(d.sc) + '" placeholder="1800.00"></label>' +
          '<label>额外自愿小费，如有 ($)<input type="text" inputmode="decimal"' + bind('tips') + ' value="' + esc(d.tips) + '" placeholder="0.00"><span class="hint">独立的小池，不会与服务费混合。</span></label>' +
        '<p class="hint">本班服务费池：<strong>' + money(res.poolC) + '</strong>（直接使用上方输入的服务费总额，不做其他核对）</p>' +
        '</div>' +
      '</section>' +
      '</div>' +
      '<div class="cols">' +
      '<section class="card">' +
        '<h2>EOD 报表：照片或粘贴</h2>' +
        '<label class="btn file-btn">上传 EOD 照片<input type="file" accept="image/*" data-act="photo" class="hide"></label>' +
        preview +
        '<p class="hint">尚未接入 OCR，照片仅供参考。请在下方粘贴 EOD 文字或直接输入数字，并核对。</p>' +
        '<textarea rows="4" placeholder="例如：&#10;净销售额 10,000.00&#10;服务费 1,800.00"' + bind('paste') + '>' + esc(ui.pasteText) + '</textarea>' +
        '<div class="btnrow"><button data-act="parse-paste">从粘贴文字填入</button></div>' +
        verify +
      '</section>' +
      '<section class="card">' +
        '<h2>分配模式</h2>' +
        '<label class="radio"><input type="radio" name="mode" value="A"' + bind('mode') + (state.mode === 'A' ? ' checked' : '') + '> <strong>模式 A（预设）：</strong>每位员工直接使用员工卡或本班的百分比。</label>' +
        '<label class="radio"><input type="radio" name="mode" value="B"' + bind('mode') + (state.mode === 'B' ? ' checked' : '') + '> <strong>模式 B：</strong>先依角色占池比例分配，再依角色内的工时分配。</label>' +
        roles +
      '</section>' +
      '</div>' +
      '<section class="card">' + gate + warns +
        '<div class="btnrow"><button class="primary big" data-act="calc">确认并计算 →</button></div>' +
      '</section>';
  }

  // ---------- 第 2 画面：员工卡 ----------
  function viewCards(res) {
    var pickedIds = state.draft.picks.map(function (p) { return p.empId; });

    var libRows = state.library.map(function (c) {
      var picked = pickedIds.indexOf(c.id) >= 0;
      return '<div class="emp' + (c.active ? '' : ' off') + '">' +
        '<div class="emp-main"><strong>' + esc(c.name) + '</strong> <span class="pill">' + esc(c.role) + '</span> ' +
        '<span class="muted">基本 ' + esc(c.basePct) + '%</span> ' +
        (c.active ? '' : '<span class="pill grey">已停用</span> ') +
        (c.sample ? '<span class="pill amber">示例</span> ' : '') +
        (picked ? '<span class="pill ok">今日已加入</span>' : '') + '</div>' +
        '<div class="btnrow">' +
          (!picked && c.active ? '<button data-act="add-pick" data-id="' + c.id + '">加入今日班次</button>' : '') +
          '<button data-act="edit-card" data-id="' + c.id + '">编辑</button>' +
          '<button data-act="toggle-card" data-id="' + c.id + '">' + (c.active ? '设为停用' : '设为启用') + '</button>' +
          '<button class="danger" data-act="del-card" data-id="' + c.id + '">删除</button>' +
        '</div></div>';
    }).join('') || '<p class="muted">尚无员工卡，请点击「+ 新增员工卡」。</p>';

    var sumA = res.lines.reduce(function (a, l) { return a + l.shiftPct; }, 0);
    var canNorm = state.mode === 'A' && res.lines.length > 0 && Math.abs(sumA - 100) > 0.0005;
    var totalLine = state.mode === 'A'
      ? (Math.abs(sumA - 100) < 0.0005
          ? '<div class="alert ok">今日百分比合计 ' + pctText(sumA) + '。✓</div>'
          : '<div class="alert warn">今日百分比合计 ' + pctText(sumA) + '，不是 100%。请修正，或点击「标准化」。</div>')
      : '<p class="hint">模式 B：工时决定各角色内部的分配。角色占池比例请在「新班次」设定。</p>';

    var pickRows = state.draft.picks.map(function (p) {
      var c = findCard(p.empId);
      if (!c) return '';
      var line = lineFor(res, p.empId);
      var grossText = line ? money(line.grossC) : '—';
      var dedTotal = sumPickDed(p);
      var deds = (p.deductions || []).map(function (x) {
        var lx = line ? line.deductions.filter(function (y) { return y.id === x.id; })[0] : null;
        var amount = lx ? lx.amountC : 0;
        return '<div class="ded-item"><span>−' + esc(x.pct) + '% · ' + esc(x.reason) + (x.note ? '（' + esc(x.note) + '）' : '') + ' <em>→ ' + destLabel(x.dest) + '</em></span>' +
          '<span class="neg">' + money(-amount) + '</span>' +
          '<button class="small" data-act="del-ded" data-id="' + esc(p.empId) + '" data-ded="' + esc(x.id) + '">×</button></div>';
      }).join('');
      var form = '';
      if (ui.dedForm && ui.dedForm.pickId === p.empId) {
        var f = ui.dedForm;
        form = '<div class="dedform">' +
          '<label>扣款 %<input type="text" inputmode="decimal"' + bind('ded-pct') + ' value="' + esc(f.pct) + '"></label>' +
          '<label>原因<select' + bind('ded-reason') + '>' + REASONS.map(function (r) {
            return '<option' + (r === f.reason ? ' selected' : '') + '>' + esc(r) + '</option>';
          }).join('') + '</select></label>' +
          '<label>备注（选填）<input type="text"' + bind('ded-note') + ' value="' + esc(f.note) + '"></label>' +
          '<fieldset><legend>金额去向</legend>' +
            '<label class="radio"><input type="radio" name="ded-dest-' + esc(p.empId) + '" value="pool"' + bind('ded-dest') + (f.dest !== 'house' ? ' checked' : '') + '> 送回池（与其他上班员工分摊）</label>' +
            '<label class="radio"><input type="radio" name="ded-dest-' + esc(p.empId) + '" value="house"' + bind('ded-dest') + (f.dest === 'house' ? ' checked' : '') + '> 归店家（由餐厅保留）</label>' +
          '</fieldset>' +
          '<div class="btnrow"><button class="primary" data-act="add-ded">新增扣款</button><button data-act="cancel-ded">取消</button></div>' +
        '</div>';
      }
      var bigBox = dedTotal > 50
        ? '<label class="check warnline"><input type="checkbox"' + bind('pick-big', p.empId) + (p.bigConfirmed ? ' checked' : '') + '> 扣款合计 ' + pctText(dedTotal) + '。我确认此金额正确。</label>'
        : '';
      return '<div class="pick' + (c.active ? '' : ' off') + '">' +
        '<div class="pick-head"><div><strong>' + esc(c.name) + '</strong> <span class="pill">' + esc(c.role) + '</span> ' +
          '<span class="muted">卡片 ' + esc(c.basePct) + '%</span>' + (c.active ? '' : ' <span class="pill grey">已停用，不计算</span>') + '</div>' +
          '<div class="gross">毛额 ' + grossText + '</div></div>' +
        '<div class="fields2">' +
          '<label>本班工时<input type="text" inputmode="decimal"' + bind('pick-hours', p.empId) + ' value="' + esc(p.hours) + '" placeholder="0"></label>' +
          '<label>本班 %（留空 = 卡片 %）<input type="text" inputmode="decimal"' + bind('pick-shift', p.empId) + ' value="' + esc(p.shiftPct) + '" placeholder="' + esc(c.basePct) + '"></label>' +
        '</div>' +
        (deds ? '<div class="deds">' + deds + '</div><div class="row-line red"><span>扣款合计 ' + pctText(dedTotal) + '</span></div>' : '') +
        bigBox + form +
        '<div class="btnrow">' +
          '<button data-act="open-ded" data-id="' + esc(p.empId) + '">+ 新增错误扣款</button>' +
          '<button data-act="unpick" data-id="' + esc(p.empId) + '">从今日移出（员工卡保留在资料库）</button>' +
        '</div></div>';
    }).join('') || '<p class="muted">今天还没有挑选员工。请从「全部员工」加入。</p>';

    return '' +
      '<section class="card">' +
        '<div class="row between wrap"><h2>全部员工（资料库）</h2>' +
        '<div class="btnrow">' +
          '<button class="primary" data-act="new-card">+ 新增员工卡</button>' +
          '<button data-act="export-backup">导出备份（JSON）</button>' +
          '<label class="btn file-btn">导入备份<input type="file" accept=".json,application/json" data-act="import-backup" class="hide"></label>' +
        '</div></div>' +
        '<p class="hint">员工卡会自动保存在此浏览器中。每班请在下方挑选当天上班的人员。从今日班次移出不会删除员工卡。</p>' +
        libRows +
      '</section>' +
      '<section class="card">' +
        '<div class="row between wrap"><h2>今日班次 · ' + esc(state.draft.date) + ' ' + esc(state.draft.shift) + '</h2>' +
        '<div class="btnrow">' +
          '<button data-act="preload">载入上一班名单</button>' +
          (canNorm ? '<button data-act="normalize">标准化为 100%</button>' : '') +
        '</div></div>' +
        totalLine + pickRows +
      '</section>' +
      panelHTML();
  }

  // ---------- 第 3 画面：结果 ----------
  function viewResults(res) {
    if (res.errors.length) {
      return '<section class="card"><h2>结果</h2>' +
        '<div class="alert warn"><strong>尚未计算。</strong><ul>' + res.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>' +
        '<p class="hint">请到「新班次」或「员工卡」修正后，再回到此页。</p></section>';
    }
    var meta = { date: state.draft.date, shift: state.draft.shift, mode: state.mode, salesC: res.salesC, rolePcts: state.mode === 'B' ? snapshotRoles() : null };
    var warns = res.warnings.length ? '<div class="alert info"><ul>' + res.warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' : '';
    return '<section class="card"><h2>本班结果</h2>' + warns + breakdownHTML(res, meta) +
      '<div class="btnrow sticky">' +
        '<button class="primary big" data-act="save-shift">保存到历史记录</button>' +
        '<button data-act="show-csv" data-id="live">导出 CSV</button>' +
      '</div></section>' + panelHTML();
  }

  function snapshotRoles() {
    var o = {};
    state.roles.forEach(function (r) { o[r] = E.num(state.rolePcts[r]) || 0; });
    return o;
  }

  // ---------- 第 4 画面：历史记录 ----------
  function viewHistory() {
    if (ui.histId) {
      var rec = null;
      for (var i = 0; i < state.history.length; i++) if (state.history[i].id === ui.histId) rec = state.history[i];
      if (!rec) { ui.histId = null; return viewHistory(); }
      return '<section class="card"><div class="row between wrap"><h2>已保存班次 · ' + esc(rec.date) + ' ' + esc(rec.shift) + '</h2>' +
        '<div class="btnrow"><button data-act="hist-back">← 返回历史列表</button><button data-act="show-csv" data-id="' + rec.id + '">导出 CSV</button></div></div>' +
        '<p class="hint">保存于 ' + esc(new Date(rec.savedAt).toLocaleString('zh-CN')) + '。过去的班次仅供查看。</p>' +
        breakdownHTML(rec.result, { date: rec.date, shift: rec.shift, mode: rec.mode, salesC: rec.salesC, rolePcts: rec.rolePcts }) +
        '</section>' + panelHTML();
    }
    if (!state.history.length) {
      return '<section class="card"><h2>历史记录</h2><p class="muted">尚无保存的班次。计算后保存，即可在此查看。</p></section>';
    }
    var rows = state.history.map(function (h) {
      return '<tr class="click" data-act="open-hist" data-id="' + h.id + '"><td>' + esc(h.date) + '</td><td>' + esc(h.shift) + '</td>' +
        '<td>' + money(h.result.poolC) + '</td><td>' + money(h.result.netSumC) + '</td><td>' + money(h.result.houseC) + '</td>' +
        '<td>' + h.result.lines.length + '</td></tr>';
    }).join('');
    return '<section class="card"><h2>历史记录</h2><p class="hint">点击任一列可查看完整明细。</p>' +
      '<div class="scroll"><table class="grid-t"><thead><tr><th>日期</th><th>班次</th><th>服务费池</th><th>员工实发合计</th><th>店家保留</th><th>人数</th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }

  // ---------- 共用明细 shared breakdown ----------
  function breakdownHTML(r, meta) {
    var gross = 0, ded = 0;
    r.lines.forEach(function (l) { gross += l.grossC; ded += l.dedC; });
    var P = r.redistC, H = r.houseC;

    var chips = '<div class="chips">' +
      '<div class="chip"><span>日期 · 班次</span><b>' + esc(meta.date) + ' · ' + esc(meta.shift) + '</b></div>' +
      '<div class="chip"><span>净销售额</span><b>' + money(meta.salesC) + '</b></div>' +
      '<div class="chip"><span>服务费池</span><b>' + money(r.poolC) + '</b></div>' +
      '<div class="chip"><span>额外小费（独立）</span><b>' + money(r.tipsC) + '</b></div>' +
      '<div class="chip"><span>模式</span><b>' + modeLabel(meta.mode) + '</b></div>' +
      '</div>';

    var envs = r.lines.map(function (l) {
      var dl = l.deductions.map(function (x) {
        return '<div class="ded-line"><span>−' + esc(x.pct) + '% · ' + esc(x.reason) + (x.note ? '（' + esc(x.note) + '）' : '') + ' <em>→ ' + destLabel(x.dest) + '</em></span><b>' + money(-x.amountC) + '</b></div>';
      }).join('');
      return '<article class="env">' +
        '<header><div><h3>' + esc(l.name) + '</h3><div class="muted">' + esc(l.role) + ' · 卡片 ' + esc(l.basePct) + '% · 本班 ' + pctText(l.shiftPct) + '</div></div>' +
        '<div class="hrs">' + (l.hours > 0 ? esc(l.hours) + ' 小时' : '未填工时') + '</div></header>' +
        '<div class="row-line"><span>毛额</span><b>' + money(l.grossC) + '</b></div>' +
        (l.deductions.length
          ? '<div class="deds">' + dl + '</div><div class="row-line red"><span>扣款合计</span><b>' + money(-l.dedC) + '</b></div>'
          : '<div class="row-line muted"><span>无错误扣款</span><span>$0.00</span></div>') +
        (l.redistC > 0 ? '<div class="row-line green"><span>从他人扣款重新分配</span><b>+' + money(l.redistC) + '</b></div>' : '') +
        '<div class="net"><span>实发金额（服务费）</span><b>' + money(l.netC) + '</b></div>' +
        '<div class="small muted">占池比例 ' + (Math.round(l.effPct * 100) / 100).toFixed(2) + '% · ' +
          (l.perHour != null ? money(Math.round(l.perHour)) + ' / 每小时' : '未填工时') +
          ' · 额外小费（另计）：' + money(l.tipC) + '</div>' +
      '</article>';
    }).join('');

    var okRec = (r.netSumC + H === r.poolC);
    var recon = '<table class="grid-t recon"><tbody>' +
      '<tr><td>服务费池</td><td>' + money(r.poolC) + '</td></tr>' +
      '<tr><td>毛额合计</td><td>' + money(gross) + '</td></tr>' +
      '<tr class="red"><td>错误扣款合计</td><td>' + money(-ded) + '</td></tr>' +
      '<tr class="sub"><td>· 送回池（重新分配）</td><td>' + money(P) + '</td></tr>' +
      '<tr class="sub"><td>· 归店家（保留）</td><td>' + money(H) + '</td></tr>' +
      '<tr class="green"><td>重新分配给其他员工</td><td>+' + money(P) + '</td></tr>' +
      '<tr><td><strong>员工实发合计</strong></td><td><strong>' + money(r.netSumC) + '</strong></td></tr>' +
      '<tr><td><strong>店家保留</strong></td><td><strong>' + money(H) + '</strong></td></tr>' +
      '<tr class="' + (okRec ? 'okrow' : 'badrow') + '"><td>核对：实发 + 店家保留 = 服务费池</td><td>' + (okRec ? '✓ 精准到分相符' : '✗ 不相符') + '</td></tr>' +
      '<tr><td>额外小费（独立小池）</td><td>' + money(r.tipsC) + ' · 已发放 ' + money(r.tipsSumC) + '</td></tr>' +
      '</tbody></table>';

    var rolesNote = meta.rolePcts ? '<p class="hint">本班使用的角色比例：' + Object.keys(meta.rolePcts).map(function (k) { return esc(k) + ' ' + esc(meta.rolePcts[k]) + '%'; }).join('，') + '</p>' : '';

    return chips + rolesNote + '<div class="envs">' + envs + '</div><h3>对账</h3>' + recon;
  }

  // ---------- CSV 与备份 ----------
  function buildCSV(meta, r) {
    var rows = [];
    rows.push(['韶山印象 服务费分配 Hunan Impression']);
    rows.push(['日期', meta.date, '班次', meta.shift, '模式', meta.mode === 'B' ? 'B（角色比例后按工时）' : 'A（直接百分比）']);
    rows.push(['净销售额（选填）', amt(meta.salesC), '服务费池', amt(r.poolC), '额外自愿小费（独立）', amt(r.tipsC)]);
    rows.push([]);
    rows.push(['员工', '角色', '基本 %', '本班 %', '工时', '毛额', '扣款合计', '扣款明细', '重新分配收入', '实发金额', '占池比例 %', '每小时', '额外小费（独立）']);
    r.lines.forEach(function (l) {
      rows.push([
        l.name, l.role, l.basePct, l.shiftPct.toFixed(4), l.hours || '',
        amt(l.grossC), amt(l.dedC),
        l.deductions.map(function (d) {
          return d.pct + '% ' + d.reason + (d.note ? '（' + d.note + '）' : '') + ' 去向 ' + destLabel(d.dest) + ' ' + amt(d.amountC);
        }).join('; '),
        amt(l.redistC), amt(l.netC), (Math.round(l.effPct * 100) / 100).toFixed(2),
        l.perHour != null ? amt(Math.round(l.perHour)) : '', amt(l.tipC)
      ]);
    });
    rows.push([]);
    rows.push(['送回池（重新分配）', amt(r.redistC)]);
    rows.push(['归店家（保留）', amt(r.houseC)]);
    rows.push(['员工实发合计', amt(r.netSumC)]);
    rows.push(['核对：实发 + 店家保留 = 服务费池', (r.netSumC + r.houseC === r.poolC) ? '是' : '否']);
    // 加上 UTF-8 BOM，让 Excel 正确显示中文
    return '﻿' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
  }

  function snapshotBackup() {
    return JSON.stringify({
      app: '韶山印象 服务费分配 Hunan Impression',
      version: 2,
      exportedAt: new Date().toISOString(),
      library: state.library,
      roles: state.roles,
      rolePcts: state.rolePcts,
      history: state.history
    }, null, 2);
  }

  function panelHTML() {
    var p = ui.panel;
    if (!p) return '';
    return '<section class="card panel"><div class="row between wrap"><h2>' + esc(p.title) + '</h2>' +
      '<div class="btnrow">' +
        '<button data-act="copy-panel">复制到剪贴板</button>' +
        (dlCap ? '<button data-act="download-panel">下载文件</button>' : '') +
        '<button data-act="close-panel">关闭</button></div></div>' +
      '<p class="hint">复制下方文字，贴入表格或文件。文件名：' + esc(p.filename) + '</p>' +
      '<textarea class="code" rows="12" readonly>' + esc(p.text) + '</textarea></section>';
  }

  // ---------- 弹窗 modals ----------
  function modalHTML() {
    var m = ui.modal;
    if (!m) return '';
    if (m.type === 'confirm') {
      return '<div class="modal-bg" data-act="close-modal"><div class="modal" role="dialog" aria-modal="true">' +
        '<p>' + esc(m.msg) + '</p>' +
        '<div class="btnrow"><button class="primary" data-act="confirm-yes">' + esc(m.okLabel) + '</button><button data-act="confirm-no">取消</button></div>' +
        '</div></div>';
    }
    if (m.type === 'card') {
      var d = m.data;
      return '<div class="modal-bg" data-act="close-modal"><div class="modal" role="dialog" aria-modal="true">' +
        '<h3>' + (m.id ? '编辑员工卡' : '新增员工卡') + '</h3>' +
        (m.error ? '<div class="alert warn">' + esc(m.error) + '</div>' : '') +
        '<label>全名<input type="text"' + bind('card-name') + ' value="' + esc(d.name) + '"></label>' +
        '<label>角色<select' + bind('card-role') + '>' + state.roles.map(function (r) {
          return '<option' + (r === d.role ? ' selected' : '') + '>' + esc(r) + '</option>';
        }).join('') + '</select></label>' +
        '<label>基本占池比例（%）<input type="text" inputmode="decimal"' + bind('card-base') + ' value="' + esc(d.base) + '"></label>' +
        '<label class="check"><input type="checkbox"' + bind('card-active') + (d.active ? ' checked' : '') + '> 启用（停用的卡会保存，但不参与计算）</label>' +
        '<p class="hint">姓名与角色会一起显示，方便区分同名员工。</p>' +
        '<div class="btnrow"><button class="primary" data-act="card-save">保存员工卡</button><button data-act="card-cancel">取消</button></div>' +
        '</div></div>';
    }
    return '';
  }

  // ---------- 动作 actions ----------
  var actions = {
    'tab': function (el) { ui.tab = el.dataset.id; ui.histId = null; ui.panel = null; },

    'calc': function () {
      var r = E.calculate(state);
      if (r.errors.length) { toast('请先修正「计算前请先确认」中列出的项目。'); return; }
      ui.tab = 'results';
    },

    'save-shift': async function () {
      var r = E.calculate(state);
      if (r.errors.length) { toast('请先修正结果中的问题，再保存。'); return; }
      var d = state.draft;
      if (state.history.some(function (h) { return h.date === d.date && h.shift === d.shift; })) {
        var ok = await ask('已有 ' + d.date + ' ' + d.shift + ' 的保存记录。仍要再保存一笔吗？', '仍然保存');
        if (!ok) return false;
      }
      var rec = {
        id: uid(),
        savedAt: new Date().toISOString(),
        date: d.date,
        shift: d.shift,
        mode: r.mode,
        salesC: r.salesC,
        rolePcts: state.mode === 'B' ? snapshotRoles() : null,
        result: {
          poolC: r.poolC, tipsC: r.tipsC, houseC: r.houseC, redistC: r.redistC,
          netSumC: r.netSumC, tipsSumC: r.tipsSumC, lines: r.lines
        }
      };
      state.history.unshift(rec);
      if (window.HIHooks && HIHooks.onSaved) HIHooks.onSaved(rec, r);
      state.lastPicks = r.lines.map(function (l) { return l.empId; });
      state.draft = {
        date: d.date,
        shift: d.shift,
        sales: '',
        sc: '',
        tips: '0',
        source: 'manual',
        verifiedKey: null,
        picks: []
      };
      ui.dedForm = null;
      ui.pasteText = '';
      if (ui.advanced) { ui.tab = 'history'; ui.histId = rec.id; } else { ui.step = 1; }
      toast('已保存至历史记录。今日班次已重置，本班扣款已清空。');
    },

    'toggle-advanced': function () {
      ui.advanced = !ui.advanced;
      if (ui.advanced) { ui.tab = 'shift'; return; }
      ui.step = 1;
      ui.dedForm = null;
      if (state.mode !== 'A') { state.mode = 'A'; toast('已切换为简单模式（直接占比）。'); }
    },
    'step': function (el) { ui.step = Number(el.dataset.id); },
    'step-next': function () {
      var r = E.calculate(state);
      if (ui.step === 1 && !isFinite(E.num(state.draft.sc))) { toast('请先填写服务费总额。'); return false; }
      if (ui.step === 2 && !r.lines.length) { toast('请至少加入一位上班的人。'); return false; }
      if (ui.step === 3 && r.errors.length) { toast(r.errors[0]); return false; }
      ui.step = Math.min(4, ui.step + 1);
    },
    'step-prev': function () { ui.step = Math.max(1, ui.step - 1); },
    'ded-pct-pick': function (el) { if (!ui.dedForm) return false; ui.dedForm.pct = el.dataset.v; },
    'ded-reason-pick': function (el) { if (!ui.dedForm) return false; ui.dedForm.reason = el.dataset.v; },
    'ded-dest-pick': function (el) { if (!ui.dedForm) return false; ui.dedForm.dest = el.dataset.v === 'house' ? 'house' : 'pool'; },

    'open-hist': function (el) { ui.histId = el.dataset.id; ui.panel = null; },
    'hist-back': function () { ui.histId = null; ui.panel = null; },

    'show-csv': function (el) {
      var id = el.dataset.id;
      if (id === 'live') {
        var r = E.calculate(state);
        if (r.errors.length) { toast('请先完成计算（无错误）再导出。'); return; }
        var meta = { date: state.draft.date, shift: state.draft.shift, mode: state.mode, salesC: r.salesC };
        ui.panel = { title: 'CSV（本次计算）', filename: 'hunan-impression-' + meta.date + '-' + meta.shift + '.csv', text: buildCSV(meta, r) };
      } else {
        var rec = state.history.filter(function (h) { return h.id === id; })[0];
        if (!rec) return;
        var m2 = { date: rec.date, shift: rec.shift, mode: rec.mode, salesC: rec.salesC };
        ui.panel = { title: 'CSV · ' + rec.date + ' ' + rec.shift, filename: 'hunan-impression-' + rec.date + '-' + rec.shift + '.csv', text: buildCSV(m2, rec.result) };
      }
    },

    'export-backup': function () {
      ui.panel = { title: '备份（JSON）', filename: 'hunan-impression-backup.json', text: snapshotBackup() };
    },
    'close-panel': function () { ui.panel = null; },
    'copy-panel': function () {
      var text = ui.panel ? ui.panel.text : '';
      try {
        navigator.clipboard.writeText(text).then(function () { toast('已复制。'); }, function () { toast('复制被阻止，请手动选取文字复制。'); });
      } catch (e) { toast('复制被阻止，请手动选取文字复制。'); }
      return false;
    },
    'download-panel': function () {
      if (!dlCap || !ui.panel) return false;
      var p = ui.panel;
      Promise.resolve(dlCap.save({ filename: p.filename, data: p.text })).then(function () {
        toast('文件已保存。');
      }, function () { toast('文件未保存。'); });
      return false;
    },

    'import-backup': null, // 在 change 事件中处理 handled on change
    'photo': null,         // 在 change 事件中处理 handled on change

    'parse-paste': function () {
      var t = ui.pasteText || '';
      var num = '([\\d,]+(?:\\.\\d{1,2})?)';
      var ms = new RegExp('(?:net\\s*sales|净销售额?)[^\\d]*' + num, 'i').exec(t);
      var mc = new RegExp('(?:service\\s*charge|服务费)[^\\d]*' + num, 'i').exec(t);
      if (!ms && !mc) { toast('找不到「净销售额」或「服务费」的行，请直接输入数字。'); return false; }
      if (ms) state.draft.sales = ms[1].replace(/,/g, '');
      if (mc) state.draft.sc = mc[1].replace(/,/g, '');
      state.draft.source = 'paste';
      state.draft.verifiedKey = null;
      toast('已由粘贴文字填入，请逐一核对，并勾选核对框。');
    },

    'role-add': function () {
      var name = (ui.newRole || '').trim();
      if (!name) { toast('请先输入角色名称。'); return false; }
      if (state.roles.indexOf(name) >= 0) { toast('此角色已存在。'); return false; }
      state.roles.push(name);
      state.rolePcts[name] = 0;
      ui.newRole = '';
    },
    'role-remove': function (el) {
      var r = el.dataset.id;
      if (state.library.some(function (c) { return c.role === r; })) { toast('请先将此角色的员工卡移到其他角色。'); return false; }
      state.roles = state.roles.filter(function (x) { return x !== r; });
      delete state.rolePcts[r];
    },

    'new-card': function () {
      ui.modal = { type: 'card', id: null, error: '', data: { name: '', role: state.roles[0], base: '', active: true } };
    },
    'edit-card': function (el) {
      var c = findCard(el.dataset.id);
      if (!c) return false;
      ui.modal = { type: 'card', id: c.id, error: '', data: { name: c.name, role: c.role, base: String(c.basePct), active: c.active } };
    },
    'card-save': function () {
      var m = ui.modal;
      if (!m || m.type !== 'card') return false;
      var d = m.data;
      var name = (d.name || '').trim();
      var base = E.num(d.base);
      if (!name) { m.error = '请输入全名。'; return false; }
      if (state.roles.indexOf(d.role) < 0) { m.error = '请从列表中选择角色。'; return false; }
      if (!isFinite(base) || base < 0 || base > 100) { m.error = '基本比例必须是 0 到 100 之间的数字。'; return false; }
      if (m.id) {
        var c = findCard(m.id);
        c.name = name; c.role = d.role; c.basePct = base; c.active = !!d.active;
      } else {
        state.library.push({ id: uid(), name: name, role: d.role, basePct: base, active: !!d.active });
      }
      ui.modal = null;
    },
    'card-cancel': function () { ui.modal = null; },
    'close-modal': function (el, ev) {
      if (ev.target !== el) return false;
      if (ui.modal && ui.modal.type === 'confirm') { ui.modal.resolve(false); }
      ui.modal = null;
    },
    'confirm-yes': function () { var m = ui.modal; ui.modal = null; if (m && m.resolve) m.resolve(true); },
    'confirm-no': function () { var m = ui.modal; ui.modal = null; if (m && m.resolve) m.resolve(false); },

    'toggle-card': function (el) {
      var c = findCard(el.dataset.id);
      if (!c) return false;
      c.active = !c.active;
    },
    'del-card': async function (el) {
      var c = findCard(el.dataset.id);
      if (!c) return false;
      var ok = await ask('确定从资料库删除 ' + c.name + '（' + c.role + '）吗？也会从今日班次移除。历史记录会保留自己的副本。', '删除员工卡');
      if (!ok) return false;
      state.library = state.library.filter(function (x) { return x.id !== c.id; });
      state.draft.picks = state.draft.picks.filter(function (p) { return p.empId !== c.id; });
      state.lastPicks = state.lastPicks.filter(function (id) { return id !== c.id; });
    },
    'remove-samples': async function () {
      var n = state.library.filter(function (c) { return c.sample; }).length;
      var ok = await ask('要从资料库和今日班次移除 ' + n + ' 张示例员工卡吗？真实员工卡不受影响。', '删除示例');
      if (!ok) return false;
      var ids = state.library.filter(function (c) { return c.sample; }).map(function (c) { return c.id; });
      state.library = state.library.filter(function (c) { return !c.sample; });
      state.draft.picks = state.draft.picks.filter(function (p) { return ids.indexOf(p.empId) < 0; });
      state.lastPicks = state.lastPicks.filter(function (id) { return ids.indexOf(id) < 0; });
    },

    'add-pick': function (el) {
      var id = el.dataset.id;
      if (findPick(id) || !findCard(id)) return false;
      state.draft.picks.push(blankPick(id));
    },
    'unpick': function (el) {
      var id = el.dataset.id;
      state.draft.picks = state.draft.picks.filter(function (p) { return p.empId !== id; });
      if (ui.dedForm && ui.dedForm.pickId === id) ui.dedForm = null;
    },
    'preload': async function () {
      var ids = state.lastPicks.filter(function (id) { var c = findCard(id); return c && c.active; });
      if (!ids.length) { toast('没有可载入的上一班名单。'); return false; }
      if (state.draft.picks.length) {
        var ok = await ask('要用上一班的 ' + ids.length + ' 位员工替换今日挑选名单吗？今日已挑选者的工时与扣款会被清空。', '替换名单');
        if (!ok) return false;
      }
      state.draft.picks = ids.map(function (id) { return blankPick(id); });
      ui.dedForm = null;
    },
    'normalize': function () {
      var map = E.normalizedPicks(state);
      if (!map) { toast('没有可标准化的内容。'); return false; }
      state.draft.picks.forEach(function (p) {
        if (map[p.empId] != null) p.shiftPct = map[p.empId];
      });
      toast('已将本班百分比按比例调整为合计 100%，员工卡百分比未改变。');
    },

    'open-ded': function (el) {
      ui.dedForm = { pickId: el.dataset.id, pct: '', reason: REASONS[0], note: '', dest: 'pool' };
    },
    'cancel-ded': function () { ui.dedForm = null; },
    'add-ded': function () {
      var f = ui.dedForm;
      if (!f) return false;
      var p = findPick(f.pickId);
      if (!p) { ui.dedForm = null; return false; }
      var pct = E.num(f.pct);
      if (!isFinite(pct) || pct <= 0 || pct > 100) { toast('扣款百分比需介于 0 到 100 之间。'); return false; }
      p.deductions = p.deductions || [];
      p.deductions.push({ id: uid(), pct: pct, reason: f.reason, note: (f.note || '').trim(), dest: f.dest === 'house' ? 'house' : 'pool' });
      if (sumPickDed(p) > 50) toast('该员工扣款合计超过 50%，请在其员工卡上勾选确认。');
      ui.dedForm = null;
    },
    'del-ded': function (el) {
      var p = findPick(el.dataset.id);
      if (!p) return false;
      p.deductions = p.deductions.filter(function (x) { return x.id !== el.dataset.ded; });
    }
  };

  // ---------- 给 AI 模块使用的接口 hooks for ai.js ----------
  window.HIHooks = {
    getDraft: function () { return state.draft; },
    setDraft: function (fields) {
      Object.keys(fields).forEach(function (k) { state.draft[k] = fields[k]; });
      save();
    },
    refresh: function () { render(); },
    clearLocal: function () {
      try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 ignore */ }
      state = defaultState();
      ui.dedForm = null;
      save();
      toast('已删除本设备上的员工卡与历史记录。');
      render();
    },
    toast: function (m) { toast(m); },
    afterRender: null,
    onSaved: null
  };

  // ---------- 事件绑定 event wiring ----------
  function bindField(name, id, val) {
    var d = state.draft;
    switch (name) {
      case 'date': case 'shift': case 'sales': case 'sc': case 'tips':
        d[name] = val; return true;
      case 'verify':
        d.verifiedKey = val ? E.numbersKey(d) : null; return true;
      case 'mode':
        state.mode = val === 'B' ? 'B' : 'A'; return true;
      case 'role-pct':
        state.rolePcts[id] = val; return true;
      case 'pick-hours': {
        var p1 = findPick(id); if (p1) p1.hours = val; return true;
      }
      case 'pick-shift': {
        var p2 = findPick(id); if (p2) p2.shiftPct = val; return true;
      }
      case 'pick-big': {
        var p3 = findPick(id); if (p3) p3.bigConfirmed = !!val; return true;
      }
      case 'ded-pct': case 'ded-reason': case 'ded-note': case 'ded-dest':
        if (ui.dedForm) ui.dedForm[name.slice(4)] = val; return false;
      case 'paste':
        ui.pasteText = val; return false;
      case 'new-role':
        ui.newRole = val; return false;
      case 'card-name': case 'card-role': case 'card-base': case 'card-active':
        if (ui.modal && ui.modal.type === 'card') ui.modal.data[name.slice(5)] = val; return false;
    }
    return false;
  }

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.dataset.act;
    var fn = actions[act];
    if (!fn) return;
    if (act === 'close-modal' && ev.target !== el) return;
    var out = fn(el, ev);
    Promise.resolve(out).then(function (ret) {
      if (ret === false) { render(); return; }
      commit();
    });
  });

  function onField(ev) {
    var el = ev.target;
    if (!el || !el.dataset || !el.dataset.bind) return;
    var val = el.type === 'checkbox' ? el.checked : el.value;
    var persist = bindField(el.dataset.bind, el.dataset.id, val);
    if (persist) commit(); else { save(); render(); }
  }
  document.addEventListener('input', onField);
  document.addEventListener('change', function (ev) {
    var el = ev.target;
    if (el && el.dataset && el.dataset.bind) {
      // 文字栏位在输入时已即时保存，忽略失焦时的 change。Text fields already save on every keystroke.
      if (el.tagName === 'TEXTAREA' || el.type === 'text' || el.type === 'number' || el.type === 'date') return;
      onField(ev);
      return;
    }
    if (!el || !el.dataset) return;
    if (el.dataset.act === 'photo') {
      var f = el.files && el.files[0];
      if (!f) return;
      if (ui.photoUrl) { try { URL.revokeObjectURL(ui.photoUrl); } catch (e) { /* 忽略 ignore */ } }
      ui.photoUrl = URL.createObjectURL(f);
      if (state.draft.source === 'manual') state.draft.source = 'photo';
      state.draft.verifiedKey = null;
      toast('照片已载入。尚未接入 OCR，请输入或粘贴数字并核对。');
      commit();
      return;
    }
    if (el.dataset.act === 'import-backup') {
      importBackup(el);
    }
  });

  function importBackup(el) {
    var f = el.files && el.files[0];
    if (!f) return;
    var fr = new FileReader();
    fr.onload = async function () {
      var data;
      try { data = JSON.parse(String(fr.result)); } catch (e) { toast('无法读取：不是有效的 JSON 文件。'); render(); return; }
      if (!data || !Array.isArray(data.library)) { toast('这不像韶山印象的备份文件。'); render(); return; }
      var ok = await ask('要用此备份取代目前的资料库与历史记录吗？此操作无法复原。', '取代资料');
      if (!ok) { render(); return; }
      var lib = data.library.filter(function (c) { return c && typeof c.name === 'string'; }).map(function (c) {
        return { id: c.id || uid(), name: c.name, role: c.role || '其他', basePct: Number(c.basePct) || 0, active: c.active !== false, sample: !!c.sample };
      });
      state.library = lib;
      if (Array.isArray(data.roles) && data.roles.length) state.roles = data.roles.map(String);
      if (data.rolePcts) state.rolePcts = data.rolePcts;
      if (Array.isArray(data.history)) state.history = data.history;
      var ids = {};
      lib.forEach(function (c) { ids[c.id] = true; });
      state.draft.picks = state.draft.picks.filter(function (p) { return ids[p.empId]; });
      state.lastPicks = state.lastPicks.filter(function (id) { return ids[id]; });
      toast('备份已导入。');
      commit();
    };
    fr.readAsText(f);
    el.value = '';
  }

  // 可选：downloads 能力（页面声明后才可用）。Optional downloads capability.
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      Promise.resolve(window.claude.use('downloads')).then(function (cap) {
        if (cap) { dlCap = cap; render(); }
      }, function () { /* 无此能力 no capability */ });
    }
  } catch (e) { /* 忽略 ignore */ }

  save();
  render();
})();
