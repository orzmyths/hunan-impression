/* AI 读取模块：照片或文字 → 草稿 → 人工核对 → 再计算
   AI extraction module: photo or text → draft → manager confirms. */
(function () {
  'use strict';

  var LIMIT_MSG = 'You have reached the limit for this hour, try again later';
  var FAIL_MSG = 'AI 暂时无法读取，请手动输入数字。';
  var MAX_BYTES = 5 * 1024 * 1024;
  var LABELS = { date: '日期', shift: '班次', net_sales: '净销售额', service_charge: '服务费' };

  var S = {
    busy: false,
    kind: null,          // 'limit' | 'fail' | 'ok' | null
    text: '',
    photoB64: null,
    preview: null,
    fileName: '',
    fileSize: 0,
    unreadable: [],
    recordId: null
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // 把照片缩小到长边 1600 像素的 JPEG，避免超过 Vercel 的请求体上限
  // Downscale to a JPEG with a 1600 px long side to stay under the Vercel body limit.
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var s = Math.min(1, 1600 / Math.max(w, h));
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
    var text = S.text.trim();
    var hasPhoto = !!S.photoB64;
    if (!hasPhoto && !text) { HIHooks.toast('请先选择照片或粘贴报表文字。'); return; }

    S.busy = true; S.kind = null; HIHooks.refresh();
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
    }
    HIHooks.refresh();
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
    return '<div class="ai-box">' +
      '<h3>用 AI 读取收银报表（草稿）</h3>' +
      '<p class="hint">上传报表照片，或粘贴报表文字。AI 只会填入草稿，必须由你核对后才能计算。不想用 AI 也可以直接手动输入。</p>' +
      '<div class="ai-row">' +
        '<label class="btn file-btn">选择报表照片<input type="file" accept="image/jpeg,image/png,image/webp" data-ai="file" class="hide"></label>' +
        '<span class="hint">' + esc(S.fileName || '尚未选择照片') + '</span>' +
      '</div>' +
      (S.preview ? '<img class="preview" alt="报表照片预览" src="' + S.preview + '">' : '') +
      '<textarea rows="3" data-ai="text" data-fk="ai-text" placeholder="或把报表文字贴在这里">' + esc(S.text) + '</textarea>' +
      '<div class="btnrow"><button class="primary" data-ai="read"' + (S.busy ? ' disabled' : '') + '>' +
        (S.busy ? '读取中…' : '用 AI 读取') + '</button></div>' +
      msg + banner +
    '</div>';
  }

  var css = document.createElement('style');
  css.textContent =
    '.ai-box{border:1.5px dashed var(--accent);border-radius:12px;padding:12px;margin-bottom:14px;background:#fffaf3}' +
    '.ai-box h3{margin:0 0 6px}' +
    '.ai-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}' +
    '.ai-box textarea{width:100%;margin-top:8px;box-sizing:border-box}' +
    '.ai-box .btnrow{margin-top:8px}' +
    '.recs{color:var(--accent);font-weight:600;text-decoration:none;border:1px solid var(--accent);padding:6px 10px;border-radius:999px;white-space:nowrap}';
  document.head.appendChild(css);

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
      S.kind = null;
    } catch (e) {
      HIHooks.toast('无法读取这张照片，请换一张或手动输入。');
    }
    HIHooks.refresh();
  });

  document.addEventListener('input', function (ev) {
    if (ev.target && ev.target.dataset && ev.target.dataset.ai === 'text') S.text = ev.target.value;
  });

  document.addEventListener('click', function (ev) {
    var el = ev.target && ev.target.closest ? ev.target.closest('[data-ai="read"]') : null;
    if (el && !S.busy) readReport();
  });

  // 保存班次时同步到服务器（历史与记录页）
  // Archive each saved shift on the server and link it to the AI record, if any.
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
    S.text = ''; S.kind = null; S.unreadable = [];
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
    var slot = root.querySelector('#ai-slot');
    if (slot) slot.innerHTML = panelHTML();
  };

  HIHooks.refresh();
})();
