/**
 * NQ-Assistant - Float Panel (injected into page)
 * 替代 chrome.sidePanel，作为浮动面板直接嵌入页面
 */
(function () {
  'use strict';

  if (window.__nqFloatPanel) return;
  window.__nqFloatPanel = true;

  // ============ DOM 注入 ============
  function injectDOM() {
    if (document.getElementById('nq-float-ball')) return;

    var ball = document.createElement('div');
    ball.id = 'nq-float-ball';
    ball.style.bottom = '24px';
    ball.style.right = '24px';
    ball.innerHTML = '<img class="nq-ball-icon" src="' + chrome.runtime.getURL('icons/icon48.png') + '" draggable="false"><span class="nq-badge" id="nq-ball-badge"></span>';
    ball.title = 'NQ-Assistant';

    var overlay = document.createElement('div');
    overlay.id = 'nq-overlay';

    var panel = document.createElement('div');
    panel.id = 'nq-float-panel';
    panel.innerHTML = '\
      <div class="nq-resize-handle" id="nq-resize-handle"></div>\
      <div class="nq-panel-header">\
        <span class="nq-panel-title"><img class="nq-panel-logo" src="' + chrome.runtime.getURL('icons/icon48.png') + '" draggable="false"> NQ-Assistant</span>\
        <div class="nq-panel-actions">\
          <button class="nq-btn nq-btn-sm" id="nq-btnSelectAll" title="全选">☑</button>\
          <button class="nq-btn nq-btn-sm" id="nq-btnDeselectAll" title="取消全选">☐</button>\
          <button class="nq-btn nq-btn-icon" id="nq-btnClear" title="清空">🗑</button>\
          <button class="nq-btn nq-btn-icon" id="nq-btnTheme" title="切换主题">🌓</button>\
          <button class="nq-btn nq-btn-icon" id="nq-btnClose" title="关闭">✕</button>\
        </div>\
      </div>\
      <div class="nq-status-bar" id="nq-statusBar">\
        <span id="nq-statusText">等待捕获...</span>\
        <span class="nq-badge" id="nq-msgCount">0 条</span>\
        <span class="nq-badge" id="nq-selectedCount" style="display:none">已选 0</span>\
      </div>\
      <div class="nq-panel-body" id="nq-panelBody">\
        <div class="nq-empty" id="nq-emptyState">\
          <span class="nq-empty-icon">💬</span>\
          <p>点击 AI 回复旁的「📋 预览」按钮</p>\
          <p style="font-size:12px;margin-top:4px">内容将逐条添加到此处</p>\
        </div>\
        <div id="nq-messageList" style="display:none"></div>\
      </div>\
      <div class="nq-settings-row" style="padding:6px 14px;border-top:1px solid #e5e7eb;flex-shrink:0">\
        <label>模板：</label>\
        <select id="nq-templateSelect">\
          <option value="academic">学术报告</option>\
          <option value="tech">技术文档</option>\
          <option value="meeting">会议纪要</option>\
          <option value="custom">自定义</option>\
        </select>\
        <span class="nq-tpl-help" id="nq-tplHelp" title="模板预览">?</span>\
        <div class="nq-tpl-popup" id="nq-templatePreview"></div>\
      </div>\
      <div class="nq-panel-footer">\
        <button class="nq-btn nq-btn-primary" id="nq-btnExportWord"><span>📄</span> 导出 Word</button>\
        <button class="nq-btn" id="nq-btnMergeExport"><span>📦</span> 合并导出</button>\
      </div>\
    ';

    document.body.appendChild(ball);
    document.body.appendChild(overlay);
    document.body.appendChild(panel);

    // Ball events — drag to move, short press to toggle
    var dragInfo = null;
    ball.addEventListener('mousedown', function(e) {
      if (e.button !== 0) return;
      dragInfo = { sx: e.clientX, sy: e.clientY, ox: ball.offsetLeft, oy: ball.offsetTop, moved: false };
      document.addEventListener('mousemove', onBallMove);
      document.addEventListener('mouseup', onBallUp);
      e.preventDefault();
    });
    ball.addEventListener('touchstart', function(e) {
      var t = e.touches[0];
      dragInfo = { sx: t.clientX, sy: t.clientY, ox: ball.offsetLeft, oy: ball.offsetTop, moved: false };
      document.addEventListener('touchmove', onBallTouchMove, { passive: false });
      document.addEventListener('touchend', onBallTouchEnd);
    }, { passive: true });
    function onBallMove(e) {
      if (!dragInfo) return;
      var dx = e.clientX - dragInfo.sx, dy = e.clientY - dragInfo.sy;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dragInfo.moved = true;
      ball.classList.add('nq-dragging');
      ball.style.left = ''; ball.style.right = ''; ball.style.bottom = ''; ball.style.top = '';
      ball.style.left = Math.max(0, Math.min(window.innerWidth - 48, dragInfo.ox + dx)) + 'px';
      ball.style.top = Math.max(0, Math.min(window.innerHeight - 48, dragInfo.oy + dy)) + 'px';
    }
    function onBallUp(e) {
      onBallMove(e);
      document.removeEventListener('mousemove', onBallMove);
      document.removeEventListener('mouseup', onBallUp);
      ball.classList.remove('nq-dragging');
      if (dragInfo && !dragInfo.moved) togglePanel();
      dragInfo = null;
    }
    function onBallTouchMove(e) {
      if (!dragInfo) return;
      var t = e.touches[0];
      var dx = t.clientX - dragInfo.sx, dy = t.clientY - dragInfo.sy;
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dragInfo.moved = true;
      ball.classList.add('nq-dragging');
      ball.style.left = ''; ball.style.right = ''; ball.style.bottom = ''; ball.style.top = '';
      ball.style.left = Math.max(0, Math.min(window.innerWidth - 48, dragInfo.ox + dx)) + 'px';
      ball.style.top = Math.max(0, Math.min(window.innerHeight - 48, dragInfo.oy + dy)) + 'px';
      e.preventDefault();
    }
    function onBallTouchEnd() {
      document.removeEventListener('touchmove', onBallTouchMove);
      document.removeEventListener('touchend', onBallTouchEnd);
      ball.classList.remove('nq-dragging');
      if (dragInfo && !dragInfo.moved) togglePanel();
      dragInfo = null;
    }

    overlay.addEventListener('click', togglePanel);
    document.getElementById('nq-btnClose').addEventListener('click', togglePanel);

    // Resize
    initResize();
  }

  var panelOpen = false;
  function togglePanel() {
    panelOpen = !panelOpen;
    var panel = document.getElementById('nq-float-panel');
    var overlay = document.getElementById('nq-overlay');
    if (panelOpen) {
      panel.classList.add('nq-open');
      overlay.classList.add('nq-open');
    } else {
      panel.classList.remove('nq-open');
      overlay.classList.remove('nq-open');
    }
  }

  function openPanel() {
    if (!panelOpen) togglePanel();
  }

  function initResize() {
    var handle = document.getElementById('nq-resize-handle');
    var panel = document.getElementById('nq-float-panel');
    if (!handle || !panel) return;
    var startX, startW;
    handle.addEventListener('mousedown', function(e) {
      startX = e.clientX;
      startW = panel.offsetWidth;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    function onMove(e) {
      var w = Math.max(320, Math.min(800, startW + startX - e.clientX));
      panel.style.width = w + 'px';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  }

  // ============ State ============
  var state = {
    messages: [],
    selected: new Set(),
    collapsed: new Set(),
    theme: 'light'
  };

  var $ = function(s) { return document.querySelector(s); };

  // ============ Markdown 渲染 ============
  var mdit = typeof markdownit !== 'undefined' ? markdownit({ html: true, linkify: true, breaks: true, typographer: false }) : null;

  function esc(text) {
    var d = document.createElement('div'); d.textContent = text; return d.innerHTML;
  }

  function renderMarkdown(md) {
    if (!md) return '';
    if (mdit) {
      try {
        var html = mdit.render(md);
        return renderMathInHtml(html);
      } catch(e) { return basicRender(md); }
    }
    return basicRender(md);
  }

  function basicRender(md) {
    if (!md) return '';
    var lines = md.split('\n');
    var html = [];
    var i = 0;
    while (i < lines.length) {
      var t = lines[i].trim();
      if (!t) { i++; continue; }
      if (t.startsWith('|') && t.endsWith('|')) {
        var next = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (/^\|[\s\-:]+\|/.test(next)) {
          html.push(renderBasicTable(lines, i));
          while (i < lines.length && lines[i].trim().startsWith('|')) i++; continue;
        }
      }
      if (t.startsWith('```')) {
        var code = ''; i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) { code += (code ? '\n' : '') + lines[i]; i++; }
        i++; html.push('<pre><code>' + esc(code) + '</code></pre>'); continue;
      }
      var hm = t.match(/^(#{1,6})\s+(.+)/);
      if (hm) { html.push('<h' + hm[1].length + '>' + renderInline(hm[2]) + '</h' + hm[1].length + '>'); i++; continue; }
      if (/^[-*]{3,}\s*$/.test(t)) { html.push('<hr>'); i++; continue; }
      if (/^[\-\*]\s+/.test(t)) { html.push(renderBasicList(lines, i, false)); while (i < lines.length && /^[\-\*]\s+/.test(lines[i].trim())) i++; continue; }
      if (/^\d+\.\s+/.test(t)) { html.push(renderBasicList(lines, i, true)); while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) i++; continue; }
      if (t.startsWith('>')) { var q = []; while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; } html.push('<blockquote>' + renderInline(q.join('<br>')) + '</blockquote>'); continue; }
      var p = []; while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('|') && !/^[\-\*]\s+/.test(lines[i].trim()) && !/^\d+\.\s+/.test(lines[i].trim()) && !lines[i].trim().startsWith('>') && !/^[-*]{3,}\s*$/.test(lines[i].trim())) { p.push(lines[i]); i++; }
      if (p.length) html.push('<p>' + renderInline(p.join('\n')) + '</p>'); else i++;
    }
    return html.join('\n');
  }

  function renderBasicTable(ls, si) {
    var rows = []; var j = si;
    while (j < ls.length && ls[j].trim().startsWith('|')) {
      var r = ls[j].trim(); j++;
      if (/^[\s\-:|]+$/.test(r) && r.includes('---')) continue;
      rows.push(r.slice(1, -1).split('|').map(function(c){ return c.trim(); }));
    }
    if (!rows.length) return '';
    var h = '<table>';
    rows.forEach(function(cells, ri) {
      var tg = ri === 0 ? 'th' : 'td';
      h += '<tr>' + cells.map(function(c){ return '<' + tg + '>' + renderInline(c) + '</' + tg + '>'; }).join('') + '</tr>';
    });
    return h + '</table>';
  }

  function renderBasicList(ls, si, ordered) {
    var tag = ordered ? 'ol' : 'ul', pat = ordered ? /^\d+\.\s+/ : /^[\-\*]\s+/;
    var h = '<' + tag + '>', j = si;
    while (j < ls.length && pat.test(ls[j].trim())) {
      h += '<li>' + renderInline(ls[j].trim().replace(pat, '')) + '</li>'; j++;
    }
    return h + '</' + tag + '>';
  }

  function renderInline(text) {
    var h = esc(text);
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/\*([^*\n]+?)\*/g, '<em>$1</em>');
    h = h.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return h;
  }

  function renderMathInHtml(html) {
    var hasKatex2 = typeof katex !== 'undefined' && typeof katex.renderToString === 'function';
    html = html.replace(/<p>\$\$([\s\S]+?)\$\$<\/p>/g, function(match, latex) {
      var lt = latex.trim();
      if (!/[\\\^_{}]/.test(lt)) return '<p><code>$$' + lt + '$$</code></p>';
      if (hasKatex2) {
        try { return '<div class="math-block">' + katex.renderToString(lt, { throwOnError: false, strict: false, displayMode: true }) + '</div>'; } catch(e) {}
      }
      return '<div class="math-block">' + esc(lt) + '</div>';
    });
    var result = '';
    var i = 0;
    while (i < html.length) {
      var j = html.indexOf('$', i);
      if (j === -1) { result += html.substring(i); break; }
      var before = html.substring(Math.max(0, j - 200), j);
      if (/<(code|pre)\b[^>]*>/.test(before) && !/<\/(code|pre)>/.test(before)) {
        result += html.substring(i, j + 1); i = j + 1; continue;
      }
      var subBlock = html.substring(j);
      var bm = subBlock.match(/^\$\$([\s\S]+?)\$\$/);
      if (bm) {
        if (j > i) result += html.substring(i, j);
        var bmInner = bm[1].trim();
        if (/[\\\^_{}]/.test(bmInner) && hasKatex2) {
          try { result += '<div class="math-block">' + katex.renderToString(bmInner, { throwOnError: false, strict: false, displayMode: true }) + '</div>'; i = j + bm[0].length; continue; } catch(e) {}
        }
        result += '$$' + bmInner + '$$'; i = j + bm[0].length; continue;
      }
      var im = subBlock.match(/^\$([^$\n]{1,200}?)\$/);
      if (im) {
        if (j > i) result += html.substring(i, j);
        var inner = im[1].trim();
        if (/[\\\^_{}]/.test(inner) && hasKatex2) {
          try { result += '<span class="math-inline">' + katex.renderToString(inner, { throwOnError: false, strict: false, displayMode: false }) + '</span>'; i = j + im[0].length; continue; } catch(e) {}
        }
        result += '$' + inner + '$'; i = j + im[0].length; continue;
      }
      if (j > i) result += html.substring(i, j);
      result += '$'; i = j + 1;
    }
    return result;
  }

  // ============ Render messages ============
  function renderAllMessages() {
    var panelBody = $('#nq-panelBody');
    var messageList = $('#nq-messageList');
    var emptyState = $('#nq-emptyState');
    if (!panelBody) return;
    if (!state.messages.length) {
      if (messageList) messageList.style.display = 'none';
      if (emptyState) emptyState.style.display = '';
      updateBadge();
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    if (messageList) messageList.style.display = '';

    var sorted = state.messages.slice().sort(function(a, b) { return (a.index || 0) - (b.index || 0); });
    if (!state._collapsedInit) {
      state._collapsedInit = true;
      // 首次加载时如果消息超过 3 条，自动折叠全部以节省空间
      if (sorted.length > 3) sorted.forEach(function(m) { state.collapsed.add(m.id); });
    }

    if (messageList) {
      messageList.innerHTML = sorted.map(function(msg, idx) {
        var sel = state.selected.has(msg.id);
        var col = state.collapsed.has(msg.id);
        var prev = msg.content.replace(/\n/g, ' ').substring(0, 60);
        return '<div class="nq-msg-card' + (sel ? ' selected' : '') + (col ? ' collapsed' : '') + '" data-msg-id="' + msg.id + '" draggable="true">\
          <div class="nq-msg-header">\
            <span class="nq-drag-handle" title="拖拽排序">⠿</span>\
            <input type="checkbox" class="nq-msg-checkbox"' + (sel ? ' checked' : '') + ' data-msg-id="' + msg.id + '">\
            <span class="nq-msg-index">#' + (idx + 1) + '</span>\
            <button class="nq-btn nq-btn-sm nq-edit-btn" data-msg-id="' + msg.id + '" title="编辑">✏</button>' +
            (msg.edited && msg.html ? '<button class="nq-btn nq-btn-sm nq-reset-btn" data-msg-id="' + msg.id + '" title="恢复原始">↺</button>' : '') +
            '<button class="nq-btn nq-btn-sm nq-btn-danger nq-del-btn" data-msg-id="' + msg.id + '" title="删除">🗑</button>\
            <span class="nq-msg-collapse">\
              <span class="nq-msg-preview">' + esc(prev) + '</span>\
              <span class="nq-msg-toggle">▼</span>\
            </span>\
          </div>\
          <div class="nq-msg-body" data-msg-id="' + msg.id + '">\
            <div class="nq-msg-render">' + renderMarkdown(msg.content || '') + '</div>\
            <textarea class="nq-editor" data-msg-id="' + msg.id + '">' + esc(msg.content || '') + '</textarea>\
          </div>\
        </div>';
      }).join('');
    }

    bindCardEvents();
    bindDragEvents();
    updateSelectionUI();
  }

  function bindCardEvents() {
    document.querySelectorAll('.nq-msg-checkbox').forEach(function(cb) {
      cb.onchange = function(e) {
        e.stopPropagation();
        var id = cb.dataset.msgId;
        cb.checked ? state.selected.add(id) : state.selected.delete(id);
        var card = cb.closest('.nq-msg-card');
        if (card) card.classList.toggle('selected', cb.checked);
        updateSelectionUI();
      };
    });
    document.querySelectorAll('.nq-msg-collapse').forEach(function(area) {
      area.onclick = function(e) {
        e.stopPropagation();
        var card = area.closest('.nq-msg-card');
        var id = card.dataset.msgId;
        if (state.collapsed.has(id)) { state.collapsed.delete(id); card.classList.remove('collapsed'); }
        else { state.collapsed.add(id); card.classList.add('collapsed'); }
      };
    });
    document.querySelectorAll('.nq-edit-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = btn.dataset.msgId;
        var body = document.querySelector('.nq-msg-body[data-msg-id="' + id + '"]');
        var render = body.querySelector('.nq-msg-render');
        var editor = body.querySelector('.nq-editor');
        if (editor.style.display === 'none' || !editor.style.display) {
          render.style.display = 'none'; editor.style.display = 'block';
          editor.style.height = Math.max(200, render.offsetHeight) + 'px'; editor.focus();
          btn.textContent = '👁';
        } else {
          var nc = editor.value.trim();
          if (nc) {
            var m = state.messages.find(function(x) { return x.id === id; });
            if (m) { m.content = nc; m.edited = true; }
          }
          renderAllMessages();
        }
      };
    });
    document.querySelectorAll('.nq-reset-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var m = state.messages.find(function(x) { return x.id === btn.dataset.msgId; });
        if (m) { m.edited = false; renderAllMessages(); }
      };
    });
    document.querySelectorAll('.nq-del-btn').forEach(function(btn) {
      btn.onclick = function(e) {
        e.stopPropagation();
        var id = btn.dataset.msgId;
        state.messages = state.messages.filter(function(m) { return m.id !== id; });
        state.selected.delete(id); state.collapsed.delete(id);
        renderAllMessages();
        showToast('已删除');
      };
    });
  }

  function bindDragEvents() {
    document.querySelectorAll('.nq-msg-card[draggable]').forEach(function(card) {
      card.addEventListener('dragstart', function(e) { state.dragOrigin = card; card.style.opacity = '0.5'; e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', function(e) { card.style.opacity = '1'; state.dragOrigin = null; });
      card.addEventListener('dragover', function(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      card.addEventListener('drop', function(e) {
        e.preventDefault();
        var target = e.target.closest('.nq-msg-card');
        if (!target || target === state.dragOrigin || !state.dragOrigin) return;
        var parent = target.parentNode;
        var after = target.getBoundingClientRect().top + target.offsetHeight / 2 < e.clientY;
        parent.insertBefore(state.dragOrigin, after ? target.nextSibling : target);
        var ids = Array.from(parent.querySelectorAll('.nq-msg-card')).map(function(c) { return c.dataset.msgId; });
        state.messages = ids.map(function(id) { return state.messages.find(function(m) { return m.id === id; }); }).filter(Boolean);
        renderAllMessages();
      });
    });
  }

  function updateSelectionUI() {
    var t = state.messages.length, s = state.selected.size;
    var mc = $('#nq-msgCount'), sc = $('#nq-selectedCount'), st = $('#nq-statusText');
    if (mc) mc.textContent = t + ' 条';
    if (sc) sc.style.display = s > 0 ? '' : 'none';
    if (sc) sc.textContent = '已选 ' + s;
    if (st) st.textContent = t > 0 ? '已就绪' : '等待捕获...';
    var ew = $('#nq-btnExportWord');
    if (ew) ew.innerHTML = '<span>📄</span> 导出 Word' + (s > 0 ? ' (' + s + '条)' : '');
    var me = $('#nq-btnMergeExport');
    if (me) me.innerHTML = '<span>📦</span> 合并导出' + (s > 1 ? ' (' + s + '条)' : '');
    updateBadge();
  }

  function updateBadge() {
    var badge = document.getElementById('nq-ball-badge');
    if (badge) {
      badge.textContent = state.messages.length;
      badge.style.display = state.messages.length > 0 ? '' : 'none';
    }
  }

  function getSelectedMessages() {
    return state.messages.filter(function(m) { return state.selected.has(m.id); });
  }

  // ============ Export ============
  var FLOAT_TEMPLATES = {
    academic: { name: '学术报告', fontFamily: 'SimSun, 宋体, serif', fontSize: '12pt', titleSize: '16pt', h1Size: '15pt', h2Size: '14pt', h3Size: '13pt', lineHeight: '1.8', color: '000000' },
    tech:     { name: '技术文档', fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif', fontSize: '11pt', titleSize: '18pt', h1Size: '16pt', h2Size: '14pt', h3Size: '12pt', lineHeight: '1.6', color: '#1a1a2e' },
    meeting:  { name: '会议纪要', fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif', fontSize: '11pt', titleSize: '15pt', h1Size: '14pt', h2Size: '13pt', h3Size: '12pt', lineHeight: '1.7', color: '333333' },
    custom:   { name: '自定义',   fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif', fontSize: '11pt', titleSize: '16pt', h1Size: '15pt', h2Size: '14pt', h3Size: '12pt', lineHeight: '1.7', color: '333333' }
  };
  function fPtToHalf(s) { if (!s) return 22; return parseInt(s) * 2; }
  function getDocxOpts(tpl) {
    if (!tpl) return null;
    return {
      font: (tpl.fontFamily || '').split(',')[0].trim(),
      size: fPtToHalf(tpl.fontSize),
      color: tpl.color || '000000',
      headingFont: (tpl.fontFamily || '').split(',')[0].trim(),
      h1Size: fPtToHalf(tpl.h1Size),
      h2Size: fPtToHalf(tpl.h2Size),
      h3Size: fPtToHalf(tpl.h3Size),
      h4Size: fPtToHalf(tpl.fontSize),
      h5Size: fPtToHalf(tpl.fontSize),
      h6Size: fPtToHalf(tpl.fontSize)
    };
  }
  function fmtDate(d) {
    var p = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }

  function exportWord() {
    var selected = getSelectedMessages();
    if (!selected.length) { showToast('请先选择消息', 'error'); return; }
    var title = (selected[0].title || '').replace(/[\\/:*?"<>|#]/g, '').trim() || 'AI';
    try {
      var promises = selected.map(function(m, i) {
        var md = m.content || '';
        if (!md) return Promise.resolve([]);
        var selTpl = ($('#nq-templateSelect') || {}).value || 'academic';
        var docxOpts = getDocxOpts(FLOAT_TEMPLATES[selTpl] || FLOAT_TEMPLATES.academic);
        return (typeof md2docxChildren === 'function' ? md2docxChildren(md, docxOpts) : fallbackDocxChildren(md, docxOpts)).then(function(children) {
          if (i < selected.length - 1) {
            children.push(new docx.Paragraph({
              spacing: { before: 400, after: 400 },
              border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, space: 1, color: 'CCCCCC' } }
            }));
          }
          return children;
        });
      });
      Promise.all(promises).then(function(results) {
        var allChildren = [];
        results.forEach(function(c) { allChildren.push.apply(allChildren, c); });
        if (!allChildren.length) { showToast('无有效内容', 'error'); return; }
        var doc = new docx.Document({ sections: [{ properties: {}, children: allChildren }] });
        docx.Packer.toBlob(doc).then(function(blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = title + '-' + fmtDate(new Date()) + '.docx'; a.click();
          URL.revokeObjectURL(url);
          showToast('Word 导出成功 (' + selected.length + ' 条)', 'success');
        }).catch(function(e) { showToast('导出失败: ' + e.message, 'error'); });
      }).catch(function(e) { showToast('导出失败: ' + e.message, 'error'); });
    } catch (e) { showToast('导出失败: ' + e.message, 'error'); }
  }

  function fallbackDocxChildren(md, opts) {
    if (typeof _md2docxSetOpts === 'function') _md2docxSetOpts(opts);
    return Promise.resolve(md.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: [new docx.TextRun({ text: line || '' })] });
    }));
  }

  function mergeExport() {
    var selected = getSelectedMessages();
    if (selected.length < 2) { showToast('请至少选择 2 条消息', 'error'); return; }
    var mergedContent = selected.map(function(m, i) { return '\n# 第 ' + (i + 1) + ' 部分\n\n' + m.content; }).join('\n\n---\n\n');
    var mergedMsg = {
      id: 'merged_' + Date.now(),
      content: mergedContent,
      title: selected[0].title || '',
      role: 'assistant',
      index: state.messages.length,
      timestamp: Date.now(),
      isComplete: true
    };
    state.messages.push(mergedMsg);
    state.selected.clear();
    state.selected.add(mergedMsg.id);
    renderAllMessages();
    showToast('已合并为一条消息');
  }

  // ============ Theme ============
  var theme = localStorage.getItem('nq-theme') || 'light';
  function applyTheme() {
    var panel = document.getElementById('nq-float-panel');
    if (panel) {
      if (theme === 'dark') panel.classList.add('nq-dark');
      else panel.classList.remove('nq-dark');
    }
  }
  function toggleTheme() {
    theme = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('nq-theme', theme);
    applyTheme();
  }

  // ============ Toast ============
  function showToast(msg, type) {
    var old = document.querySelector('.nq-toast');
    if (old) old.remove();
    var t = document.createElement('div');
    t.className = 'nq-toast nq-toast-' + (type || 'success');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { t.remove(); }, 3000);
  }

  // ============ Bind main buttons ============
  function bindButtons() {
    var ew = $('#nq-btnExportWord'), me = $('#nq-btnMergeExport');
    var sa = $('#nq-btnSelectAll'), da = $('#nq-btnDeselectAll');
    var cl = $('#nq-btnClear'), th = $('#nq-btnTheme');
    if (ew) ew.onclick = exportWord;
    if (me) me.onclick = mergeExport;
    if (sa) sa.onclick = function() { state.messages.forEach(function(m) { state.selected.add(m.id); }); renderAllMessages(); };
    if (da) da.onclick = function() { state.selected.clear(); renderAllMessages(); };
    if (cl) cl.onclick = function() {
      if (!state.messages.length) return;
      if (confirm('确定清空所有消息？')) {
        state.messages = []; state.selected.clear(); state.collapsed.clear();
        state._collapsedInit = false;
        renderAllMessages();
      }
    };
    if (th) th.onclick = toggleTheme;
    bindTplHover();
  }

  // ============ Template preview ============
  function updateTemplatePreview() {
    var sel = $('#nq-templateSelect');
    var tpl = FLOAT_TEMPLATES[sel ? sel.value : 'academic'] || FLOAT_TEMPLATES.academic;
    if (!tpl) return;
    var popup = $('#nq-templatePreview');
    if (!popup) return;
    var row = popup.parentElement;
    var rect = row.getBoundingClientRect();
    popup.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
    popup.style.left = rect.left + 'px';
    popup.style.right = (window.innerWidth - rect.right) + 'px';
    popup.innerHTML = '<div style="font-size:' + tpl.titleSize + ';font-weight:bold;border-bottom:2px solid #333;padding-bottom:3px;margin-bottom:4px">' + tpl.name + ' - 标题</div>' +
      '<div style="font-size:' + tpl.h1Size + ';font-weight:bold;margin:3px 0">一级标题 ' + tpl.h1Size + '</div>' +
      '<div style="font-size:' + tpl.h2Size + ';font-weight:bold;color:#555;margin:3px 0">二级标题 ' + tpl.h2Size + '</div>' +
      '<div style="font-size:' + tpl.h3Size + ';font-weight:bold;color:#777;margin:3px 0">三级标题 ' + tpl.h3Size + '</div>' +
      '<div style="margin-top:6px;color:' + tpl.color + '">正文 ' + tpl.fontSize + ' / 行距 ' + tpl.lineHeight + ' / 字体 ' + tpl.fontFamily.split(',')[0] + '</div>' +
      '<div style="margin-top:2px;font-size:10px;color:#9ca3af">代码块使用 Consolas 等宽字体</div>';
  }
  function bindTplHover() {
    var help = $('#nq-tplHelp'), popup = $('#nq-templatePreview');
    if (!help || !popup) return;
    help.addEventListener('mouseenter', function() { updateTemplatePreview(); popup.style.display = 'block'; });
    help.addEventListener('mouseleave', function() { popup.style.display = 'none'; });
  }

  // ============ Init ============
  function injectKatexCss() {
    if (document.getElementById('nq-katex-css')) return;
    var link = document.createElement('link');
    link.id = 'nq-katex-css';
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('lib/katex.min.css');
    document.head.appendChild(link);
  }
  function init() {
    injectKatexCss();
    injectDOM();
    applyTheme();
    bindButtons();
    updateBadge();
    console.log('[NQ-FloatPanel] ready');
  }

  // ============ Public API (called from content.js) ============
  window.NQFloatPanel = {
    open: openPanel,
    addMessage: function(msg) {
      if (!state.messages.find(function(m) { return m.id === msg.id; })) {
        state.messages.push(msg);
        state.selected.add(msg.id);
        renderAllMessages();
        if (!panelOpen) openPanel();
      }
    },
    updateMessage: function(data) {
      var idx = state.messages.findIndex(function(m) { return m.id === data.id; });
      if (idx >= 0) {
        state.messages[idx].content = data.content;
        state.messages[idx].isComplete = data.isComplete;
        if (data.edited !== undefined) state.messages[idx].edited = data.edited;
        renderAllMessages();
      }
    },
    clearMessages: function() {
      state.messages = []; state.selected.clear(); state.collapsed.clear(); state._collapsedInit = false; renderAllMessages();
    },
    updateOrder: function(messages) {
      state.messages = messages; renderAllMessages();
    },
    getMessages: function() { return state.messages; }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
