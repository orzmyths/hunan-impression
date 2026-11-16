/* AI 读取模块 · AI extraction module
   照片或文字 → 草稿 → 人工核对 → 再计算 · photo or text → draft → manager confirms → calculate */
(function () {
  'use strict';

  var LIMIT_MSG = 'You have reached the limit for this hour, try again later';
  var FAIL_MSG = 'AI 暂时无法读取，请手动输入数字。';
  var DOUBT_ZH = '我不确定这次读取是否正确：关键数字没有读出来。请不要使用这组数字 — 请联系值班店长确认，或联系开发者 David Chen。';
  var DOUBT_EN = 'I am not sure about this reading: a key number could not be read. Do not use these numbers — please check with the manager on duty, or contact the developer, David Chen.';
  var PHOTO_NOTE_ZH = '照片会先在你的设备上压缩并去除定位信息，然后才发送给 AI。';
  var PHOTO_NOTE_EN = 'The photo is compressed on your device and its location metadata is removed before it is sent to the AI.';
  var TEXT_NOTE_ZH = '粘贴的文字只会发送与日期、班次、金额有关的行，其他内容不会离开你的设备。';
  var TEXT_NOTE_EN = 'Only lines about the date, shift, and amounts are sent; everything else never leaves your device.';
  var CONSENT = [
    {
      zh: '本应用收集你上传的收银报表照片或粘贴的报表文字，以及你填写的日期、班次、金额和员工姓名与工时。',
      en: 'This app collects the end-of-day report photo or pasted report text you provide, and the dates, shifts, amounts, employee names and hours you enter.'
    },
    {
      zh: '报表内容会发送给 Google 的 Gemini AI 读取；每次 AI 使用的时间、输入内容和读取结果会保存在本应用的数据库中，任何人都可以在公开的记录页看到。',
      en: "Report content is sent to Google's Gemini AI to be read. Each AI use — its time, input, and result — is saved in this app's database, and anyone can see it on the public records page."
    },
    {
      zh: '你可以随时删除自己的资料：下方按钮能删除保存在本设备上的员工卡与历史，也能删除数据库中你这个浏览器的使用记录；其他问题请联系开发者 David Chen。',
      en: 'You can delete your data at any time: the buttons below delete the employee cards and history stored on this device, and delete your browser\'s usage records from the database. For anything else, contact the developer, David Chen.'
    }
  ];
  var MAX_BYTES = 5 * 1024 * 1024;
  var MAX_EDGE = 1280;
  var LABELS = { date: '日期', shift: '班次', net_sales: '净销售额', service_charge: '服务费' };
  // 只保留与日期、班次、金额有关的行 · keep only lines about date, shift and amounts
  var KEEP_RE = /日期|班次|净销售额|服务费|小费|Date|Shift|Net\s*Sales|Service\s*Charge|Tips?|\$\s*\d|\d+\.\d{1,2}|\d{1,3}(?:,\d{3})+/i;

  var S = {
    busy: false,
    kind: null,          // 'limit' | 'fail' | 'ok' | 'doubt' | null
    doubt: false,        // 显示「不确定」提示 show the "not sure" warning
    text: '',
    photoB64: null,
    preview: null,
    fileName: '',
    fileSize: 0,
    unreadable: [],
    recordId: null,
    notice: ''
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function filterReportText(text) {
    return String(text || '').split(/\r?\n/).filter(function (l) { return KEEP_RE.test(l); }).join('\n').trim();
  }

  function isDoubtful(o) {
    var unread = Array.isArray(o.unreadable_fields) ? o.unreadable_fields : [];
    return o.service_charge == null || unread.indexOf('service_charge') >= 0 || unread.length >= 2;
  }

  // 压缩到长边 1280 像素的 JPEG；canvas 重新编码会去除 EXIF 定位信息
  // Re-encode as JPEG with a 1280 px long side; canvas re-encoding drops EXIF (including GPS).
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, MAX_EDGE / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * s));
        c.height = Math.max(1, Math.round(h * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        var dataUrl = c.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], previewUrl: dataUrl });
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  function applyResult(o) {
    var f = { source: 'ai', verifiedKey: null };
    if (o.date) f.date = o.date;
    if (o.shift) f.shift = o.shift;
    if (o.service_charge != null) f.sc = String(o.service_charge);
    if (o.net_sales != null) f.sales = String(o.net_sales);
    HIHooks.setDraft(f);
    S.unreadable = Array.isArray(o.unreadable_fields) ? o.unreadable_fields : [];
  }

  async function readReport() {
    var hasPhoto = !!S.photoB64;
    var rawText = S.text.trim();
    var text = hasPhoto ? '' : filterReportText(rawText);

    if (!hasPhoto && !rawText) { HIHooks.toast('请先选择照片或粘贴报表文字。'); return; }
    if (!hasPhoto && !text) {
      // 没有任何相关的行：不呼叫 AI，直接显示「不确定」 no relevant lines: do not call AI
      S.kind = 'doubt'; S.doubt = true; HIHooks.refresh(); return;
    }

    S.busy = true; S.kind = null; S.doubt = false; HIHooks.refresh();
    var body = hasPhoto
      ? { imageBase64: S.photoB64, mimeType: 'image/jpeg', fileName: S.fileName, fileSize: S.fileSize }
      : { text: text };

    var res = null, data = null;
    try {
      res = await fetch('/api/extract', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      try { data = await res.json(); } catch (e) { data = null; }
    } catch (e) { res = null; }

    S.busy = false;
    if (res && res.status === 429) {
      S.kind = 'limit';
    } else if (!res || !res.ok || !data || !data.data) {
      S.kind = 'fail';
    } else {
      applyResult(data.data);
      S.recordId = data.recordId || null;
      S.kind = 'ok';
      S.doubt = isDoubtful(data.data);
    }
    HIHooks.refresh();
  }

  function doubtHTML() {
    return '<div class="doubt" role="alert"><p class="zh">' + esc(DOUBT_ZH) + '</p>' +
      '<p class="en">' + esc(DOUBT_EN) + '</p></div>';
  }

  function panelHTML() {
    var d = HIHooks.getDraft();
    var banner = d.source === 'ai'
      ? '<div class="alert warn ai-draft">AI 读取结果为草稿，请核对并修改后再计算。</div>'
      : '';
    var msg = '';
    if (S.kind === 'limit') {
      msg = '<div class="alert warn">' + esc(LIMIT_MSG) + '</div>';
    } else if (S.kind === 'fail') {
      msg = '<div class="alert warn">' + esc(FAIL_MSG) + '</div>';
    } else if (S.kind === 'ok') {
      var miss = S.unreadable.map(function (k) { return LABELS[k] || k; });
      msg = '<div class="alert info">已读取，请核对下方数字。' +
        (miss.length ? ' 无法辨识的栏位：' + esc(miss.join('、')) + '，请手动输入。' : '') + '</div>';
    }
    var doubt = (S.kind === 'doubt' || (S.kind === 'ok' && S.doubt)) ? doubtHTML() : '';
    return '<div class="ai-box">' +
      '<h3>用 AI 读取收银报表（草稿）</h3>' +
      '<p class="hint">上传报表照片，或粘贴报表文字。AI 只会填入草稿，必须由你核对后才能计算。不想用 AI 也可以直接手动输入。</p>' +
      '<div class="ai-row">' +
        '<label class="btn file-btn">选择报表照片<input type="file" accept="image/jpeg,image/png,image/webp" data-ai="file" class="hide"></label>' +
        '<span class="hint">' + esc(S.fileName || '尚未选择照片') + '</span>' +
      '</div>' +
      '<p class="note">' + esc(PHOTO_NOTE_ZH) + '<br><span class="en">' + esc(PHOTO_NOTE_EN) + '</span></p>' +
      (S.preview ? '<img class="preview" alt="报表照片预览" src="' + S.preview + '">' : '') +
      '<textarea rows="3" data-ai="text" data-fk="ai-text" placeholder="或把报表文字贴在这里">' + esc(S.text) + '</textarea>' +
      '<p class="note">' + esc(TEXT_NOTE_ZH) + '<br><span class="en">' + esc(TEXT_NOTE_EN) + '</span></p>' +
      '<div class="btnrow"><button class="primary" data-ai="read"' + (S.busy ? ' disabled' : '') + '>' +
        (S.busy ? '读取中…' : '用 AI 读取') + '</button></div>' +
      msg + doubt + banner +
    '</div>';
  }

  function consentHTML() {
    var items = CONSENT.map(function (c) {
      return '<li><p class="zh">' + esc(c.zh) + '</p><p class="en">' + esc(c.en) + '</p></li>';
    }).join('');
    return '<div class="consent" role="note">' +
      '<h3>使用前请先阅读 · Please read before you use</h3>' +
      '<ol>' + items + '</ol>' +
      '<div class="btnrow">' +
        '<button data-ai="clear-local">删除本设备上的资料</button>' +
        '<button data-ai="clear-db">删除数据库中我的使用记录</button>' +
      '</div>' +
      (S.notice ? '<p class="hint">' + esc(S.notice) + '</p>' : '') +
    '</div>';
  }

  var css = document.createElement('style');
  css.textContent =
    '.consent{border:1px solid var(--accent);border-radius:12px;padding:12px 14px;margin:0 0 14px;background:#fdf6ee}' +
    '.consent h3{margin:0 0 6px}' +
    '.consent ol{margin:0 0 8px 18px;padding:0}' +
    '.consent li{margin-bottom:8px}' +
    '.consent p{margin:2px 0}' +
    '.en{display:block;font-size:12px;color:#7a6f69;margin-top:2px}' +
    '.note{font-size:12px;color:#5b4f49;margin:6px 0}' +
    '.doubt{border:2px solid #b00020;background:#fff0f0;color:#7a0016;border-radius:12px;padding:12px;margin-top:10px;font-weight:600}' +
    '.doubt .en{font-weight:400}' +
    '.ai-box{border:1.5px dashed var(--accent);border-radius:12px;padding:12px;margin-bottom:14px;background:#fffaf3}' +
    '.ai-box h3{margin:0 0 6px}' +
    '.ai-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
    '.ai-box textarea{width:100%;margin-top:8px;box-sizing:border-box}' +
    '.ai-box .btnrow{margin-top:8px}' +
    '.recs{color:var(--accent);font-weight:600;text-decoration:none;border:1px solid var(--accent);padding:6px 10px;border-radius:999px;white-space:nowrap}';
  document.head.appendChild(css);

  async function clearDb() {
    if (!window.confirm('确定删除数据库中属于你这个浏览器的使用记录吗？此操作无法复原。')) return;
    try {
      var res = await fetch('/api/records', { method: 'DELETE', credentials: 'same-origin' });
      var d = await res.json();
      if (!res.ok) throw new Error('delete');
      S.notice = '已删除 ' + d.deleted + ' 笔你的使用记录。';
    } catch (e) {
      S.notice = '删除失败，请稍后再试。';
    }
    HIHooks.refresh();
  }

  function clearLocal() {
    if (!window.confirm('确定删除本设备上的员工卡与历史记录吗？此操作无法复原。')) return;
    S.notice = '';
    HIHooks.clearLocal();
  }

  document.addEventListener('change', async function (ev) {
    var el = ev.target;
    if (!el || !el.dataset || el.dataset.ai !== 'file') return;
    var f = el.files && el.files[0];
    if (!f) return;
    if (f.size > MAX_BYTES) { HIHooks.toast('照片超过 5 MB，请换一张较小的照片。'); return; }
    try {
      var c = await compress(f);
      S.photoB64 = c.base64;
      S.preview = c.previewUrl;
      S.fileName = f.name;
      S.fileSize = f.size;
      S.kind = null; S.doubt = false;
    } catch (e) {
      HIHooks.toast('无法读取这张照片，请换一张或手动输入。');
    }
    HIHooks.refresh();
  });

  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.dataset && ev.target.dataset.ai === 'text') S.text = ev.target.value;
  });

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-ai]') : null;
    if (!el || el.disabled) return;
    var act = el.dataset.ai;
    if (act === 'read' && !S.busy) readReport();
    else if (act === 'clear-local') clearLocal();
    else if (act === 'clear-db') clearDb();
  });

  // 保存班次时同步到服务器（只送出汇总数字）
  // Archive each saved shift on the server; only totals and the person count are sent.
  HIHooks.onSaved = function (rec, r) {
    var body = {
      date: rec.date,
      shift: rec.shift,
      poolCents: r.poolC,
      houseCents: r.houseC,
      netCents: r.netSumC,
      people: r.lines.length,
      recordId: S.recordId
    };
    S.recordId = null;
    S.photoB64 = null; S.preview = null; S.fileName = ''; S.fileSize = 0;
    S.text = ''; S.kind = null; S.doubt = false; S.unreadable = [];
    fetch('/api/shifts', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (res) {
      if (!res.ok) throw new Error('save');
    }).catch(function () {
      HIHooks.toast('已存到本机历史，但服务器存档失败。');
    });
  };

  HIHooks.afterRender = function (root) {
    var c = root.querySelector('#consent-slot');
    if (c) c.innerHTML = consentHTML();
    var slot = root.querySelector('#ai-slot');
    if (slot) slot.innerHTML = panelHTML();
  };

  // 供测试使用 exposed for tests
  window.HIAI = { filterReportText: filterReportText, isDoubtful: isDoubtful };

  HIHooks.refresh();
})();
