/**
 * NQ-Assistant - Side Panel v3
 * 功能：编辑、模板导出、TOC、拖拽排序、持久化
 */

(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const messageList = $('#messageList');
  const previewArea = $('#previewArea');
  const emptyState = $('#emptyState');
  const statusText = $('#statusText');
  const msgCount = $('#msgCount');
  const selectedCount = $('#selectedCount');
  const statusBar = $('#statusBar');

  // ============ 模板配置 ============
  const TEMPLATES = {
    academic: {
      name: '学术报告',
      fontFamily: 'SimSun, 宋体, serif',
      fontSize: '12pt', titleSize: '16pt',
      h1Size: '15pt', h2Size: '14pt', h3Size: '13pt',
      lineHeight: '1.8', pageMargin: '0',
      color: '#000'
    },
    tech: {
      name: '技术文档',
      fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif',
      fontSize: '11pt', titleSize: '18pt',
      h1Size: '16pt', h2Size: '14pt', h3Size: '12pt',
      lineHeight: '1.6', pageMargin: '0',
      color: '#1a1a2e'
    },
    meeting: {
      name: '会议纪要',
      fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif',
      fontSize: '11pt', titleSize: '15pt',
      h1Size: '14pt', h2Size: '13pt', h3Size: '12pt',
      lineHeight: '1.7', pageMargin: '0',
      color: '#333'
    },
    custom: {
      name: '自定义',
      fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif',
      fontSize: '11pt', titleSize: '16pt',
      h1Size: '15pt', h2Size: '14pt', h3Size: '12pt',
      lineHeight: '1.7', pageMargin: '0',
      color: '#333'
    }
  };

  const state = {
    messages: [],
    selected: new Set(),
    collapsed: new Set(),
    theme: 'light',
    currentTemplate: 'academic',
    dragOrigin: null
  };

  // ============ Markdown 渲染 (markdown-it) ============
  let mdit = null;

  (function initMarkdownIt() {
    if (typeof markdownit !== 'undefined') {
      mdit = markdownit({ html: true, linkify: true, breaks: true, typographer: false });
      console.log('[NQ] markdown-it ready');
    } else {
      console.warn('[NQ] markdown-it MISSING');
    }
  })();

  function renderMessage(msg) { return renderMarkdown(msg.content || ''); }

  function renderMarkdown(md) {
    if (!md) return '';
    // ★ 诊断：打印前 300 字符看 Markdown 源码是否正确
    if (!window._nqDiag) { window._nqDiag = true; console.log('[NQ] MD sample:', md.substring(0, 300)); }
    if (mdit) {
      try {
        // $$...$$ 只渲染含数学特征（\\ ^ _ {）的为公式，否则当作代码示例
        let p = md.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) =>
          /[\\\^_{}]/.test(m) ? '<div class="math-block">' + esc(m.trim()) + '</div>' : '<code>$$' + esc(m) + '$$</code>'
        );
        p = p.replace(/\$([^$\n]{1,200}?)\$/g, (_, m) =>
          /[\\\^_{}]/.test(m) ? '<span class="math-inline">' + esc(m.trim()) + '</span>' : '<code>$' + esc(m) + '$</code>'
        );
        var result = mdit.render(p);
        if (!window._nqDiag2) { window._nqDiag2 = true; console.log('[NQ] HTML sample:', result.substring(0, 300)); }
        return result;
      } catch(e) { console.error('[NQ] mdit:', e); }
    }
    return basicRender(md);
  }

  function basicRender(md) {
    if (!md) return '';
    const lines = md.split('\n');
    const html = [];
    let i = 0;
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) { i++; continue; }
      if (t.startsWith('```')) {
        let code = ''; i++;
        while (i < lines.length && !lines[i].trim().startsWith('```')) { code += (code ? '\n' : '') + lines[i]; i++; }
        i++; html.push('<pre><code>' + esc(code) + '</code></pre>'); continue;
      }
      if (t.startsWith('|') && t.endsWith('|')) {
        const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (/^\|[\s\-:]+\|/.test(next)) {
          html.push(renderTable(lines, i));
          while (i < lines.length && lines[i].trim().startsWith('|')) i++; continue;
        }
      }
      const hm = t.match(/^(#{1,6})\s+(.+)/);
      if (hm) { html.push('<h' + hm[1].length + '>' + renderInline(hm[2]) + '</h' + hm[1].length + '>'); i++; continue; }
      if (/^[-*]{3,}\s*$/.test(t)) { html.push('<hr>'); i++; continue; }
      if (/^[\-\*]\s+/.test(t)) { html.push(renderList(lines, i, false)); while (i < lines.length && /^[\-\*]\s+/.test(lines[i].trim())) i++; continue; }
      if (/^\d+\.\s+/.test(t)) { html.push(renderList(lines, i, true)); while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) i++; continue; }
      if (t.startsWith('>')) { const q = []; while (i < lines.length && lines[i].trim().startsWith('>')) { q.push(lines[i].trim().replace(/^>\s?/, '')); i++; } html.push('<blockquote>' + renderInline(q.join('<br>')) + '</blockquote>'); continue; }
      const p = []; while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('#') && !lines[i].trim().startsWith('```') && !lines[i].trim().startsWith('|') && !/^[\-\*]\s+/.test(lines[i].trim()) && !/^\d+\.\s+/.test(lines[i].trim()) && !lines[i].trim().startsWith('>') && !/^[-*]{3,}\s*$/.test(lines[i].trim())) { p.push(lines[i]); i++; }
      if (p.length) html.push('<p>' + renderInline(p.join('\n')) + '</p>'); else i++;
    }
    return html.join('\n');
  }

  function renderTable(ls, si) {
    const rows = []; let j = si;
    while (j < ls.length && ls[j].trim().startsWith('|')) {
      const r = ls[j].trim(); j++;
      if (/^[\s\-:|]+$/.test(r) && r.includes('---')) continue;
      rows.push(r.slice(1, -1).split('|').map(c => c.trim()));
    }
    if (!rows.length) return '';
    let h = '<table>';
    rows.forEach((cells, ri) => {
      const tg = ri === 0 ? 'th' : 'td';
      h += '<tr>' + cells.map(c => '<' + tg + '>' + renderInline(c) + '</' + tg + '>').join('') + '</tr>';
    });
    return h + '</table>';
  }

  function renderList(ls, si, ordered) {
    const tag = ordered ? 'ol' : 'ul', pat = ordered ? /^\d+\.\s+/ : /^[\-\*]\s+/;
    let h = '<' + tag + '>', j = si;
    while (j < ls.length && pat.test(ls[j].trim())) {
      h += '<li>' + renderInline(ls[j].trim().replace(pat, '')) + '</li>'; j++;
    }
    return h + '</' + tag + '>';
  }

  function renderInline(text) {
    let h = esc(text);
    // LaTeX 块级公式: $$ 必须在行首/行尾（前面或后面紧跟换行）
    h = h.replace(/(^|\n)\$\$([\s\S]+?)\$\$/g, '$1<div class="math-block">$2</div>');
    h = h.replace(/\$\$(.+?)\$\$(?=\n|$)/g, '<div class="math-block">$1</div>');
    // 移除非公式的 $$ 残留（如解释性文字中的 $$...$$）
    h = h.replace(/\$\$(\s*\S.{0,60}?)\$\$/g, (m, inner) => {
      // 只有包含数学特征（\ ^ _ {）才渲染为公式，否则当做普通文本
      if (/[\\\^_{}]/.test(inner)) return '<div class="math-block">' + inner + '</div>';
      return '<code>$$' + inner + '$$</code>';
    });
    // LaTeX 行内公式 $...$（不跨行）
    h = h.replace(/\$([^$\n]{1,100}?)\$/g, '<span class="math-inline">$1</span>');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, '<em>$1</em>');
    h = h.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    h = h.replace(/~~(.+?)~~/g, '<del>$1</del>');
    return h;
  }

  function esc(text) {
    const d = document.createElement('div'); d.textContent = text; return d.innerHTML;
  }

  // ============ TOC 生成 ============
  function generateTOC(messages) {
    const headings = [];
    messages.forEach((msg, mi) => {
      const lines = msg.content.split('\n');
      lines.forEach(line => {
        const m = line.trim().match(/^(#{1,3})\s+(.+)/);
        if (m) headings.push({ level: m[1].length, text: m[2].trim(), msgIndex: mi });
      });
    });
    if (headings.length < 2) return '';
    let toc = '<div class="toc"><h2>目录</h2><ul>';
    headings.forEach(h => {
      toc += '<li class="toc-l' + h.level + '"><a href="#h-' + h.msgIndex + '-' + h.level + '">' + esc(h.text) + '</a></li>';
    });
    return toc + '</ul></div><hr>';
  }

  // ============ 消息渲染 ============
  function renderAllMessages() {
    if (!state.messages.length) {
      messageList.style.display = 'none'; emptyState.style.display = ''; return;
    }
    emptyState.style.display = 'none'; messageList.style.display = '';

    const sorted = [...state.messages].sort((a, b) => (a.index || 0) - (b.index || 0));
    if (sorted.length > 3) sorted.forEach(m => state.collapsed.add(m.id));

    messageList.innerHTML = sorted.map((msg, idx) => {
      const sel = state.selected.has(msg.id), col = state.collapsed.has(msg.id);
      const prev = msg.content.replace(/\n/g, ' ').substring(0, 60);
      const rendered = renderMessage(msg);
      return `<div class="msg-card ${sel ? 'selected' : ''} ${col ? 'collapsed' : ''}" data-msg-id="${msg.id}" draggable="true">
        <div class="msg-card-header">
          <span class="drag-handle" title="拖拽排序">⠿</span>
          <input type="checkbox" class="msg-checkbox" ${sel ? 'checked' : ''} data-msg-id="${msg.id}">
          <span class="msg-index">#${idx + 1}</span>
          <button class="btn btn-sm msg-edit-btn" data-msg-id="${msg.id}" title="编辑">✏️</button>${msg.edited && msg.html ? '<button class="btn btn-sm msg-reset-btn" data-msg-id="'+msg.id+'" title="恢复原始">↺</button>' : ''}<button class="btn btn-sm msg-del-btn" data-msg-id="${msg.id}" title="删除">🗑️</button>
          <span class="msg-collapse-area">
            <span class="msg-preview">${esc(prev)}</span>
            <span class="msg-toggle">▼</span>
          </span>
        </div>
        <div class="msg-card-body" data-msg-id="${msg.id}">
          <div class="msg-render">${rendered}</div>
          <textarea class="msg-editor" data-msg-id="${msg.id}" style="display:none">${esc(msg.content)}</textarea>
        </div>
      </div>`;
    }).join('');

    bindCardEvents();
    bindDragEvents();
    updateSelectionUI();
  }

  function updateSingleMessage(msg) {
    const card = messageList.querySelector(`[data-msg-id="${msg.id}"]`);
    const sel = state.selected.has(msg.id), col = state.collapsed.has(msg.id);
    const prev = msg.content.replace(/\n/g, ' ').substring(0, 60);
    const rendered = renderMessage(msg);
    const html = `<div class="msg-card ${sel ? 'selected' : ''} ${col ? 'collapsed' : ''}" data-msg-id="${msg.id}" draggable="true">
      <div class="msg-card-header">
        <span class="drag-handle" title="拖拽排序">⠿</span>
        <input type="checkbox" class="msg-checkbox" ${sel ? 'checked' : ''} data-msg-id="${msg.id}">
        <span class="msg-index">#${state.messages.indexOf(msg) + 1}</span>
        <button class="btn btn-sm msg-edit-btn" data-msg-id="${msg.id}" title="编辑">✏️</button>${msg.edited && msg.html ? '<button class="btn btn-sm msg-reset-btn" data-msg-id="'+msg.id+'" title="恢复原始">↺</button>' : ''}<button class="btn btn-sm msg-del-btn" data-msg-id="${msg.id}" title="删除">🗑️</button>
        <span class="msg-collapse-area">
          <span class="msg-preview">${esc(prev)}</span>
          <span class="msg-toggle">▼</span>
        </span>
      </div>
      <div class="msg-card-body" data-msg-id="${msg.id}">
        <div class="msg-render">${rendered}</div>
        <textarea class="msg-editor" data-msg-id="${msg.id}" style="display:none">${esc(msg.content)}</textarea>
      </div>
    </div>`;
    if (card) card.outerHTML = html;
    else { messageList.insertAdjacentHTML('beforeend', html); emptyState.style.display = 'none'; messageList.style.display = ''; }
    bindCardEvents(); bindDragEvents(); updateSelectionUI();
  }

  function bindCardEvents() {
    messageList.querySelectorAll('.msg-checkbox').forEach(cb => cb.addEventListener('change', e => {
      e.stopPropagation();
      const id = cb.dataset.msgId;
      cb.checked ? state.selected.add(id) : state.selected.delete(id);
      cb.closest('.msg-card')?.classList.toggle('selected', cb.checked);
      updateSelectionUI();
    }));
    messageList.querySelectorAll('.msg-collapse-area').forEach(area => area.addEventListener('click', e => {
      e.stopPropagation();
      const card = area.closest('.msg-card'), id = card.dataset.msgId;
      state.collapsed.has(id) ? (state.collapsed.delete(id), card.classList.remove('collapsed')) : (state.collapsed.add(id), card.classList.add('collapsed'));
    }));
    messageList.querySelectorAll('.msg-edit-btn').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.msgId;
      const body = messageList.querySelector(`.msg-card-body[data-msg-id="${id}"]`);
      const render = body.querySelector('.msg-render'), editor = body.querySelector('.msg-editor');
      if (editor.style.display === 'none') {
        render.style.display = 'none'; editor.style.display = '';
        editor.style.height = Math.max(200, render.offsetHeight) + 'px'; editor.focus();
        btn.textContent = '👁️';
      } else {
        const nc = editor.value.trim();
        if (nc) { const m = state.messages.find(x => x.id === id); if (m) { m.content = nc; m.edited = true; chrome.runtime.sendMessage({ action: 'updateMessage', data: { id, content: nc, isComplete: true, edited: true } }).catch(() => {}); } }
        renderAllMessages();
      }
    }));
    // 重置按钮：恢复原始 HTML
    messageList.querySelectorAll('.msg-reset-btn').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const m = state.messages.find(x => x.id === btn.dataset.msgId);
      if (m) { m.edited = false; chrome.runtime.sendMessage({ action: 'updateMessage', data: { id: m.id, content: m.content, edited: false } }).catch(() => {}); renderAllMessages(); }
    }));
    // 删除按钮：删除单条消息
    messageList.querySelectorAll('.msg-del-btn').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.msgId;
      state.messages = state.messages.filter(m => m.id !== id);
      state.selected.delete(id); state.collapsed.delete(id);
      chrome.runtime.sendMessage({ action: 'updateOrder', data: { orderedIds: state.messages.map(m => m.id) } }).catch(() => {});
      renderAllMessages();
      showToast('已删除');
    }));
  }

  function bindDragEvents() {
    messageList.querySelectorAll('.msg-card[draggable]').forEach(card => {
      card.addEventListener('dragstart', e => { state.dragOrigin = card; card.style.opacity = '0.5'; e.dataTransfer.effectAllowed = 'move'; });
      card.addEventListener('dragend', e => { card.style.opacity = '1'; state.dragOrigin = null; });
      card.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      card.addEventListener('drop', e => {
        e.preventDefault();
        const target = e.target.closest('.msg-card');
        if (!target || target === state.dragOrigin || !state.dragOrigin) return;
        const parent = target.parentNode;
        const after = target.getBoundingClientRect().top + target.offsetHeight / 2 < e.clientY;
        parent.insertBefore(state.dragOrigin, after ? target.nextSibling : target);
        // 更新 state.messages 顺序
        const ids = [...parent.querySelectorAll('.msg-card')].map(c => c.dataset.msgId);
        const reordered = ids.map(id => state.messages.find(m => m.id === id)).filter(Boolean);
        state.messages = reordered;
        chrome.runtime.sendMessage({ action: 'updateOrder', data: { orderedIds: ids } }).catch(() => {});
        renderAllMessages();
      });
    });
  }

  function updateSelectionUI() {
    const t = state.messages.length, s = state.selected.size;
    msgCount.textContent = t + ' 条';
    selectedCount.style.display = s > 0 ? '' : 'none';
    selectedCount.textContent = '已选 ' + s;
    statusText.textContent = t > 0 ? '已就绪' : '等待捕获...';
    $('#btnExportWord').innerHTML = `<span>📄</span> 导出 Word${s > 0 ? ' (' + s + '条)' : ''}`;
    const mergeBtn = $('#btnMergeExport');
    if (mergeBtn) mergeBtn.innerHTML = `<span>📦</span> 合并导出${s > 1 ? ' (' + s + '条)' : ''}`;
  }

  function getSelectedMessages() {
    return state.messages.filter(m => state.selected.has(m.id));
  }

  // ============ 导出 ============
  function getExportCSS(tpl) {
    return `
body{font-family:${tpl.fontFamily};font-size:${tpl.fontSize};line-height:${tpl.lineHeight};color:${tpl.color};max-width:100%}
h1{font-size:${tpl.titleSize};border-bottom:2px solid #333;padding-bottom:6pt}
h2{font-size:${tpl.h1Size};border-bottom:1px solid #999;padding-bottom:4pt}
h3{font-size:${tpl.h2Size}}h4{font-size:${tpl.h3Size}}
table{border-collapse:collapse;width:100%;margin:1em 0}
th,td{border:1px solid #999;padding:6pt 10pt;text-align:left}th{background:#f0f0f0}
pre{background:#f5f5f5;border:1px solid #ddd;padding:10pt;font-size:.9em;overflow-x:auto}
code{font-family:Consolas,monospace;background:#f5f5f5;padding:1pt 4pt}
blockquote{border-left:3px solid #4f46e5;margin:1em 0;padding:4pt 12pt;background:#eef2ff;color:#555}
img{max-width:100%}.page-break{page-break-before:always}
`;
  }

  function getExportHTML(msgs, tpl, includeTOC) {
    const tocHtml = includeTOC ? generateTOC(msgs) : '';
    const bodyHtml = msgs.map((m, i) => {
      const rendered = m.html || renderMarkdown(m.content);
      const sep = i < msgs.length - 1 ? '<div class="page-break"></div>' : '';
      return rendered + sep;
    }).join('\n');
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>NQ-Assistant Export</title>
<style>${getExportCSS(tpl)}</style></head><body>${tocHtml}${bodyHtml}</body></html>`;
  }

  function exportWord() {
    const selected = getSelectedMessages();
    if (!selected.length) { showToast('请先选择消息', 'error'); return; }
    const tpl = TEMPLATES[state.currentTemplate] || TEMPLATES.academic;
    const includeTOC = $('#chkTOC')?.checked || false;
    try {
      const html = getExportHTML(selected, tpl, includeTOC);
      const blob = new Blob(['﻿' + html], { type: 'application/msword' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `NQ-Assistant-${fmtDate(new Date())}.doc`; a.click();
      URL.revokeObjectURL(url);
      showToast(`Word 导出成功 (${selected.length} 条)`, 'success');
    } catch (e) { showToast('导出失败: ' + e.message, 'error'); }
  }

  function mergeExport() {
    const selected = getSelectedMessages();
    if (selected.length < 2) { showToast('请至少选择 2 条消息', 'error'); return; }
    // 合并 HTML（用于预览+导出）和 Markdown（用于编辑）
    const mergedHTML = selected.map((m, i) =>
      '<div class="merged-section">' + (m.html || renderMarkdown(m.content)) + '</div>'
    ).join('<hr style="border:1px dashed #ccc;margin:20px 0">');
    const mergedContent = selected.map((m, i) => `\n# 第 ${i + 1} 部分\n\n${m.content}`).join('\n\n---\n\n');
    const mergedMsg = {
      id: 'merged_' + Date.now(),
      html: mergedHTML,
      content: mergedContent,
      role: 'assistant',
      index: state.messages.length,
      timestamp: Date.now(),
      isComplete: true
    };
    state.messages.push(mergedMsg);
    state.selected.clear();
    state.selected.add(mergedMsg.id);
    chrome.runtime.sendMessage({ action: 'newMessage', data: mergedMsg }).catch(() => {});
    renderAllMessages();
    showToast('已合并为一条消息（含刷新按钮）', 'success');
  }

  function updateTemplatePreview() {
    const tpl = TEMPLATES[state.currentTemplate];
    if (!tpl) return;
    const prev = $('#templatePreview');
    if (!prev) return;
    prev.style.cssText = `font-family:${tpl.fontFamily};font-size:${tpl.fontSize};line-height:${tpl.lineHeight};color:${tpl.color};padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-primary);box-shadow:0 4px 12px rgba(0,0,0,0.15);position:absolute;bottom:100%;left:0;right:0;margin-bottom:4px;z-index:100`;
    prev.innerHTML = `<div style="font-size:${tpl.titleSize};font-weight:bold;border-bottom:2px solid #333;padding-bottom:3px;margin-bottom:4px">${tpl.name} - 标题</div>
<div style="font-size:${tpl.h1Size};font-weight:bold">一级标题 ${tpl.h1Size}</div>
<div style="font-size:${tpl.h2Size};font-weight:bold;color:#555">二级标题 ${tpl.h2Size}</div>
<div style="margin-top:4px">正文 ${tpl.fontSize} / 行距${tpl.lineHeight}</div>`;
  }

  function bindTplHover() {
    const help = $('#tplHelp'), popup = $('#templatePreview');
    if (!help || !popup) return;
    help.addEventListener('mouseenter', () => { updateTemplatePreview(); popup.style.display = ''; });
    help.addEventListener('mouseleave', () => { popup.style.display = 'none'; });
  }

  function fmtDate(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  // ============ 通信 ============
  function connectToBackground() {
    chrome.runtime.sendMessage({ action: 'getAllMessages' }).then(r => {
      if (r?.messages?.length) {
        for (const m of r.messages) {
          if (!state.messages.find(x => x.id === m.id)) {
            state.messages.push(m);
            state.selected.add(m.id);
          }
        }
        renderAllMessages();
      }
    }).catch(() => {});
  }

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    switch (req.action) {
      case 'newMessage':
        if (req.data?.id && !state.messages.find(m => m.id === req.data.id)) {
          state.messages.push(req.data); state.selected.add(req.data.id); renderAllMessages();
        }
        sendResponse({ received: true }); break;
      case 'updateMessage':
        if (req.data) {
          const idx = state.messages.findIndex(m => m.id === req.data.id);
          if (idx >= 0) {
            state.messages[idx].content = req.data.content;
            state.messages[idx].isComplete = req.data.isComplete;
            if (req.data.edited !== undefined) state.messages[idx].edited = req.data.edited;
            updateSingleMessage(state.messages[idx]);
          }
        }
        sendResponse({ received: true }); break;
      case 'messagesCleared':
        state.messages = []; state.selected.clear(); state.collapsed.clear(); renderAllMessages();
        sendResponse({ received: true }); break;
      case 'orderUpdated':
        if (req.data?.messages) { state.messages = req.data.messages; }
        sendResponse({ received: true }); break;
    }
  });

  // ============ 主题 ============
  function initTheme() { setTheme(localStorage.getItem('nq-theme') || 'light'); }
  function toggleTheme() { setTheme(state.theme === 'light' ? 'dark' : 'light'); }
  function setTheme(t) {
    state.theme = t; document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('nq-theme', t);
    const hl = $('#hljs-theme'); if (hl) hl.href = `../lib/highlight-${t === 'dark' ? 'dark' : 'light'}.min.css`;
  }

  // ============ Toast ============
  function showToast(msg, type) {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div'); t.className = 'toast ' + (type || 'success');
    t.textContent = msg; ($('#toastContainer') || document.body).appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // ============ 事件绑定 ============
  function bindEvents() {
    $('#btnExportWord').addEventListener('click', exportWord);
    $('#btnMergeExport').addEventListener('click', mergeExport);
    $('#btnTheme').addEventListener('click', toggleTheme);
    $('#btnSelectAll').addEventListener('click', () => { state.messages.forEach(m => state.selected.add(m.id)); renderAllMessages(); });
    $('#btnDeselectAll').addEventListener('click', () => { state.selected.clear(); renderAllMessages(); });
    $('#btnClear').addEventListener('click', () => {
      if (!state.messages.length) return;
      if (confirm('确定清空所有消息？')) chrome.runtime.sendMessage({ action: 'clearAllMessages' }).catch(() => {});
    });
    $('#templateSelect').addEventListener('change', e => { state.currentTemplate = e.target.value; });
    bindTplHover();
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') { e.preventDefault(); exportWord(); }
    });
  }

  function init() {
    initTheme(); bindEvents(); connectToBackground();
    if (typeof marked !== 'undefined') console.log('[NQ] marked OK v'+(marked.version||'?'));
    else console.warn('[NQ] marked MISSING! using fallback');
    if (typeof markdownit !== 'undefined') console.log('[NQ] markdown-it also available');
    console.log('[NQ-Assistant] ready');
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init) : init();
})();
