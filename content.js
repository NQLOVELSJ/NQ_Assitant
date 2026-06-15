/**
 * NQ-Assistant - Content Script v6
 * 多平台支持：DeepSeek / ChatGPT / Claude / Kimi
 */

(function () {
  'use strict';

  const DEBUG = true;
  function log(...args) { if (DEBUG) console.log('[NQ-Assistant]', ...args); }

  // ============ 平台检测与选择器 ============
  const PLATFORMS = {
    deepseek: {
      host: 'chat.deepseek.com',
      message: '.ds-message',
      markdown: '.ds-markdown',
      think: '.ds-think-content, [class*="think"], [class*="thinking"], [class*="reasoning"]',
      name: 'DeepSeek'
    },
    chatgpt: {
      host: 'chatgpt.com',
      message: '[data-message-author-role="assistant"], article[data-testid^="conversation-turn"]',
      markdown: '.markdown, [class*="markdown"], [class*="prose"]',
      think: '[class*="think"], [class*="reasoning"]',
      name: 'ChatGPT'
    },
    claude: {
      host: 'claude.ai',
      message: '[class*="message"][class*="assistant"], [data-test-render-count]',
      markdown: '[class*="content"], [class*="prose"], [class*="text"]',
      think: '[class*="think"], [class*="reasoning"]',
      name: 'Claude'
    },
    kimi: {
      host: 'kimi.moonshot.cn',
      message: '[class*="message"][class*="assistant"], [class*="bot"]',
      markdown: '[class*="content"], [class*="markdown"]',
      think: '[class*="think"], [class*="reasoning"]',
      name: 'Kimi'
    },
    doubao: {
      host: 'doubao.com',
      message: '[class*="md-box-root"]',  // 豆包 markdown 容器直接就是 AI 回复
      markdown: '[class*="md-box-root"]',
      think: '[class*="think"], [class*="reasoning"]',
      name: '豆包'
    }
  };

  function detectPlatform() {
    const host = window.location.hostname;
    for (const [key, cfg] of Object.entries(PLATFORMS)) {
      if (host.includes(cfg.host.replace('https://', ''))) return { key, ...cfg };
    }
    // 回退到通用检测
    return { key: 'unknown', name: 'Unknown', message: '[class*="message"]', markdown: '[class*="markdown"], [class*="content"]', think: '[class*="think"]' };
  }

  const PLATFORM = detectPlatform();
  log('平台:', PLATFORM.name, '| host:', window.location.hostname, '| 选择器:', PLATFORM.message);

  // ============ 注入按钮样式 ============
  function injectStyles() {
    if (document.getElementById('nq-assistant-styles')) return;
    const style = document.createElement('style');
    style.id = 'nq-assistant-styles';
    style.textContent = `
      .nq-preview-btn {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 4px 10px; margin-left: 8px;
        border: 1px solid #e5e7eb; border-radius: 6px;
        background: #f9fafb; color: #6b7280;
        font-size: 12px; cursor: pointer; transition: all 0.15s;
        white-space: nowrap; user-select: none;
      }
      .nq-preview-btn:hover {
        background: #eef2ff; color: #4f46e5; border-color: #c7d2fe;
      }
      .nq-preview-btn.done {
        background: #d1fae5; color: #059669; border-color: #a7f3d0;
      }
      .nq-preview-btn .nq-icon { font-size: 14px; }
    `;
    document.head.appendChild(style);
  }

  // ============ 工具函数 ============
  function getClass(el) {
    if (!el) return '';
    const cn = el.className;
    if (typeof cn === 'string') return cn;
    if (cn && typeof cn.baseVal === 'string') return cn.baseVal;
    return el.getAttribute('class') || '';
  }

  function getText(el) { return (el.textContent || '').trim(); }

  // ============ 提取 Markdown ============
  function extractContent(el) {
    const clone = el.cloneNode(true);
    removeThinking(clone);
    removeUIElements(clone);
    removeCitationLinks(clone);
    const html = clone.innerHTML.trim();                          // 原始 HTML（导出用）
    const md = cleanContent(elementToMarkdown(clone));            // HTML→Markdown（预览/编辑用）
    return { html, md };
  }

  /** 移除引用链接：sup 数字、短链接、citation 类元素 */
  function removeCitationLinks(root) {
    // 数字上标引用 <sup>1</sup> <sup>14-15</sup>
    root.querySelectorAll('sup').forEach(el => {
      const t = el.textContent.trim();
      if (/^[\d,\-–—\s]+$/.test(t) && t.length < 20) el.remove();
    });
    // 短引用链接（[1], [14-15] 跳转链接）
    root.querySelectorAll('a[href]').forEach(a => {
      const t = a.textContent.trim();
      const cls = getClass(a).toLowerCase();
      if (cls.includes('citation') || cls.includes('reference') || cls.includes('footnote')) { a.remove(); return; }
      if (/^[\d,\-–—\s]+$/.test(t) && t.length < 10) a.remove();
    });
    // citation/reference 容器
    try { root.querySelectorAll('[class*="citation"], [class*="reference"], [class*="footnote"], [class*="source-link"]').forEach(e => e.remove()); } catch(e) {}
  }

  /** 移除所有UI元素 */
  function removeUIElements(root) {
    root.querySelectorAll('button, [role="button"], svg, [class*="icon"], [class*="copy"], [class*="download"], [class*="clipboard"]').forEach(e => e.remove());
    root.querySelectorAll('[class*="toolbar"], [class*="action-bar"], [class*="code-header"], [class*="flex"], [class*="bar"]').forEach(e => e.remove());
    // 移除引用链接：包含 href 的 sup/a 标签（如 ^14^15）
    root.querySelectorAll('a[href*="http"], sup a, a[href*="/citation"], a[href*="/ref"], [class*="citation"], [class*="reference"]').forEach(e => {
      if (e.textContent.trim().length < 20) e.remove(); // 只移除短引用链接，保留正文链接
    });
    // 移除数字上标引用按钮
    root.querySelectorAll('sup, [class*="superscript"]').forEach(e => {
      if (/^\d+$/.test(e.textContent.trim()) || e.querySelector('a[href]')) e.remove();
    });
  }

  function removeThinking(el) {
    try {
      if (PLATFORM.think) el.querySelectorAll(PLATFORM.think).forEach(n => n.remove());
      else el.querySelectorAll('[class*="think"], [class*="thinking"], [class*="reasoning"]').forEach(n => n.remove());
    } catch(e) {}
    el.querySelectorAll('details').forEach(d => {
      if (/思考|reasoning|thinking/i.test(getText(d.querySelector('summary')))) d.remove();
    });
  }

  /**
   * 将 KaTeX 渲染的 HTML 还原为 LaTeX 语法 ($...$ / $$...$$)
   */
  function convertKatexToLatex(root) {
    root.querySelectorAll('.katex').forEach(katexEl => {
      // 尝试从 annotation 中提取原始 LaTeX 源码
      const annotation = katexEl.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        const latex = annotation.textContent.trim();
        // 判断是块级公式还是行内公式
        const isDisplay = katexEl.closest('.katex-display') !== null ||
                          katexEl.classList.contains('katex-display');
        const wrapper = isDisplay ? '\n$$\n' + latex + '\n$$\n' : '$' + latex + '$';
        // 替换 KaTeX 元素为文本节点
        const textNode = document.createTextNode(wrapper);
        katexEl.parentNode.replaceChild(textNode, katexEl);
      }
    });
    // 处理 MathJax 渲染（部分平台用 MathJax）
    root.querySelectorAll('script[type="math/tex"], script[type="math/tex; mode=display"]').forEach(script => {
      const latex = script.textContent.trim();
      const isDisplay = script.getAttribute('type') === 'math/tex; mode=display';
      const wrapper = isDisplay ? '\n$$\n' + latex + '\n$$\n' : '$' + latex + '$';
      script.parentNode.replaceChild(document.createTextNode(wrapper), script);
    });
    // 处理原始 LaTeX 定界符 \(...\) 和 \[...\]（未被 KaTeX/MathJax 渲染时以文本形式存在）
    convertLatexDelimiters(root);
  }

  /** 将文本中的 \(...\) → $...$，\[...\] → $$...$$ */
  function convertLatexDelimiters(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    textNodes.forEach(node => {
      let text = node.textContent;
      let changed = false;
      // 块级公式 \[...\] → $$...$$
      text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => { changed = true; return '\n$$\n' + latex.trim() + '\n$$\n'; });
      // 行内公式 \(...\) → $...$
      text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => { changed = true; return '$' + latex.trim() + '$'; });
      if (changed) node.textContent = text;
    });
  }

  function removeThinking(el) {
    try {
      if (PLATFORM.think) el.querySelectorAll(PLATFORM.think).forEach(n => n.remove());
      else el.querySelectorAll('[class*="think"], [class*="thinking"], [class*="reasoning"]').forEach(n => n.remove());
    } catch (e) {}
    el.querySelectorAll('details').forEach(d => {
      const s = d.querySelector('summary');
      if (s && /思考|思考|reasoning|thinking|thought/i.test(getText(s))) d.remove();
    });
  }

  function elementToMarkdown(el) {
    const children = Array.from(el.children);
    if (children.length === 0) return getText(el);
    let md = '';
    for (const child of children) {
      const tag = child.tagName.toLowerCase();
      const text = getText(child);
      if (!text && tag !== 'hr') continue;
      switch (tag) {
        case 'h1': md += '\n# ' + text + '\n'; break;
        case 'h2': md += '\n## ' + text + '\n'; break;
        case 'h3': md += '\n### ' + text + '\n'; break;
        case 'h4': md += '\n#### ' + text + '\n'; break;
        case 'h5': md += '\n##### ' + text + '\n'; break;
        case 'h6': md += '\n###### ' + text + '\n'; break;
        case 'p': md += '\n' + processInline(child) + '\n'; break;
        case 'pre': md += processCode(child); break;
        case 'ul': md += processList(child, false); break;
        case 'ol': md += processList(child, true); break;
        case 'blockquote': md += '\n> ' + text.replace(/\n/g, '\n> ') + '\n'; break;
        case 'table': md += processTable(child); break;
        case 'hr': md += '\n---\n'; break;
        case 'details': break;
        case 'div': case 'section': case 'article':
          if (looksLikeDivTable(child)) md += processDivTable(child) + '\n';
          else md += elementToMarkdown(child) + '\n';
          break;
        default: md += text + '\n';
      }
    }
    return md.replace(/\n{3,}/g, '\n\n').trim();
  }

  function processInline(el) {
    let result = '';
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) { result += child.textContent; continue; }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = child.tagName.toLowerCase();
      const inner = child.textContent || '';
      switch (tag) {
        case 'strong': case 'b': result += '**' + inner + '**'; break;
        case 'em': case 'i': result += '*' + inner + '*'; break;
        case 'code': result += '`' + inner + '`'; break;
        case 'a': result += '[' + inner + '](' + (child.getAttribute('href') || '') + ')'; break;
        case 'del': case 's': result += '~~' + inner + '~~'; break;
        case 'br': result += '\n'; break;
        default: result += inner;
      }
    }
    return result;
  }

  function processCode(preEl) {
    const codeEl = preEl.querySelector('code');
    const lang = (codeEl?.className?.match(/language-(\w+)/) || [])[1] || '';
    return '\n```' + lang + '\n' + (codeEl?.textContent || preEl.textContent || '').trim() + '\n```\n';
  }

  function processList(listEl, ordered) {
    let md = '\n';
    Array.from(listEl.children).filter(c => c.tagName === 'LI').forEach((li, i) => {
      const prefix = ordered ? (i + 1) + '. ' : '- ';
      let text = '';
      for (const child of li.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) text += child.textContent;
        else if (child.nodeType === Node.ELEMENT_NODE && !['ul', 'ol'].includes(child.tagName.toLowerCase()))
          text += child.textContent || '';
      }
      md += prefix + text.trim() + '\n';
      li.querySelectorAll(':scope > ul, :scope > ol').forEach(nl =>
        md += '  ' + processList(nl, nl.tagName.toLowerCase() === 'ol').trim().replace(/\n/g, '\n  ') + '\n');
    });
    return md;
  }

  function processTable(tableEl) {
    let md = '\n';
    tableEl.querySelectorAll('tr').forEach((row, i) => {
      const cells = row.querySelectorAll('th, td');
      md += '| ' + Array.from(cells).map(c => getText(c)).join(' | ') + ' |\n';
      if (i === 0) md += '| ' + Array.from(cells).map(() => '---').join(' | ') + ' |\n';
    });
    return md;
  }

  function looksLikeDivTable(el) {
    const children = Array.from(el.children);
    if (children.length < 3) return false;
    const cls = getClass(el).toLowerCase();
    const childHasTableClass = children.some(c => /table|grid|row|cell/i.test(getClass(c)));
    if (!/table|grid|row|cell/i.test(cls) && !childHasTableClass) return false;
    const cellCounts = children.map(row => Array.from(row.children).filter(c => {
      const tag = c.tagName.toLowerCase();
      return ['div', 'span', 'p', 'td', 'th'].includes(tag) && getText(c).length > 0 && getText(c).length < 200;
    }).length);
    const validRows = cellCounts.filter(c => c >= 2);
    if (validRows.length < 3) return false;
    const mode = getMostCommon(validRows);
    return validRows.filter(c => c === mode).length >= 3;
  }

  function processDivTable(el) {
    const rows = Array.from(el.children).filter(row =>
      Array.from(row.children).filter(c => ['div', 'span', 'p', 'td', 'th'].includes(c.tagName.toLowerCase()) && getText(c).length > 0).length >= 2
    );
    if (rows.length < 2) return getText(el);
    const colCounts = rows.map(r => Array.from(r.children).filter(c =>
      ['div', 'span', 'p', 'td', 'th'].includes(c.tagName.toLowerCase()) && getText(c).length > 0
    ).length);
    const cols = getMostCommon(colCounts.filter(c => c >= 2));
    let md = '\n';
    rows.forEach((row, i) => {
      const cells = Array.from(row.children).filter(c =>
        ['div', 'span', 'p', 'td', 'th'].includes(c.tagName.toLowerCase()) && getText(c).length > 0
      ).slice(0, cols).map(c => getText(c));
      while (cells.length < cols) cells.push('');
      md += '| ' + cells.join(' | ') + ' |\n';
      if (i === 0) md += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
    });
    return md;
  }

  function getMostCommon(arr) {
    const freq = {};
    arr.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
    let best = arr[0], bestCount = 0;
    for (const [v, c] of Object.entries(freq)) { if (c > bestCount) { bestCount = c; best = Number(v); } }
    return best;
  }

  // ============ 文本清理 ============
  function cleanContent(md) {
    md = stripMetadata(md);
    md = stripSearchPreamble(md);
    md = stripCitations(md);
    md = stripFooterMetadata(md);
    md = stripSourceLinks(md);
    return md.trim();
  }

  function stripMetadata(md) {
    const lines = md.split('\n');
    const cleanLines = [];
    let headerDone = false;
    for (const line of lines) {
      const t = line.trim();
      if (headerDone) { cleanLines.push(line); continue; }
      if (t.length === 0) continue;
      if (/^已思考|^已深度思考|^深度思考|^思考过程|^思考中|^(已)?搜索到\s*\d+\s*个网页|^浏览\s*\d+\s*个页面|^已搜索|^搜索完成|^深度搜索|^正在搜索|^开始搜索|^\d+\s*个搜索结果|^用时\s*\d+\s*秒|^搜索关键词/.test(t)) continue;
      headerDone = true;
      cleanLines.push(line);
    }
    return cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function stripSearchPreamble(md) {
    const lines = md.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^(查看全部|展开全部|收起|展开|收起全部|阅读更多|查看更多)$/.test(lines[i].trim())) {
        return lines.slice(i + 1).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      }
    }
    let preambleEnd = 0, shortTitleCount = 0;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      const t = lines[i].trim();
      if (t.length === 0) { preambleEnd = i + 1; continue; }
      if (t.length > 150) break;
      if (/^https?:\/\//.test(t) || /^\[\d+\]/.test(t) || /^\d+\.\s/.test(t) || /^【.*】/.test(t) || /^来源[：:]/.test(t) || /^参考资料/.test(t)) { shortTitleCount++; preambleEnd = i + 1; continue; }
      if (t.length < 60 && shortTitleCount > 0) { shortTitleCount++; preambleEnd = i + 1; continue; }
      if (t.length >= 60) break;
    }
    if (shortTitleCount >= 3 && preambleEnd > 0) return lines.slice(preambleEnd).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  function stripFooterMetadata(md) {
    const lines = md.split('\n');
    while (lines.length > 0) {
      const last = lines[lines.length - 1].trim();
      if (/^\d+\s*个网页|^\d+\s*个来源|^以上信息来自|^以上内容来自|^参考资料*$|^数据来源|^来自\s*\d+\s*个|^共检索到|^搜索来源*$|^参考了\s*\d+/.test(last)) lines.pop();
      else break;
    }
    return lines.join('\n').trim();
  }

  function stripSourceLinks(md) {
    const lines = md.split('\n');
    for (let i = lines.length - 1; i >= Math.max(0, lines.length - 20); i--) {
      const t = lines[i].trim();
      if (t.length === 0) continue;
      if (/^(参考链接|参考来源|参考资料|来源链接|相关链接|原文链接|引用来源|数据来源|参考文献|参考|参考资料|查看更多|查看全部|展开全部|收起)\s*[：:]*$/.test(t) || /^(Links|References|Sources)\s*[：:]*$/i.test(t) || /^\[\d+\]\s*https?:\/\//.test(t))
        return lines.slice(0, i).join('\n').trim();
      if (/^(\d+[\.、)]?\s*|[-*]\s+)?https?:\/\/\S+$/.test(t)) {
        let urlStart = i;
        while (urlStart >= 0 && /^(\d+[\.、)]?\s*|[-*]\s+)?https?:\/\/\S+$/.test((lines[urlStart - 1] || '').trim())) urlStart--;
        const before = (lines[urlStart - 1] || '').trim();
        if (/^(参考|来源|链接|Reference|Source|Link)/i.test(before)) return lines.slice(0, urlStart - 1).join('\n').trim();
        if (i - urlStart + 1 >= 3) return lines.slice(0, urlStart).join('\n').trim();
        if (i === lines.length - 1 && i - urlStart + 1 === 1) return lines.slice(0, -1).join('\n').trim();
        break;
      }
      break;
    }
    return md;
  }

  function stripCitations(md) {
    md = md.replace(/[\-–—]\d{1,3}[\-–—]\d{1,3}/g, '');
    md = md.replace(/([\-–—])\s*(\d{1,3})(?=\s*[\-–—]?\s*[\d,，、]|[，。、；：,.;:!?）】」》\n]|$)/g, (match, dash, num) => {
      const ctx = md.substring(Math.max(0, md.indexOf(match) - 12), md.indexOf(match) + match.length + 12);
      if (/\d{4}\s*$/.test(ctx.substring(0, 12)) && /^\s*\d{4}/.test(ctx.substring(match.length))) return match;
      return '';
    });
    md = md.replace(/([^|\s])[\-–—]{2,}([^|\s])/g, '$1$2');
    md = md.replace(/[\-–—]+([，。、；：,.;:!?）】」》])/g, '$1');
    md = md.replace(/[\-–—]+\s*$/gm, '');
    md = md.replace(/\s*\[-?\d{1,3}([,，\-–—]\d{1,3})*\]/g, '');
    md = md.replace(/\[-?\d{1,3}([,，\-–—]\d{1,3})*\]\([^)]*\)/g, '');
    md = md.replace(/\(https?:\/\/[^)]+\)/g, '');
    md = md.replace(/\(\s*\)/g, '');
    md = md.replace(/[^\S\n]{2,}/g, ' ');
    md = md.replace(/[^\S\n]+$/gm, '');
    md = md.replace(/[^\S\n]+([，。、；：,.;:!?）】」》])/g, '$1');
    md = md.replace(/\n{3,}/g, '\n\n');
    return md.trim();
  }

  // ============ 按钮注入 ============
  let msgCounter = 0;

  function injectPreviewButton(messageEl) {
    // ★ 用 data 属性防重复（比 class querySelector 更可靠，虚拟 DOM 不会复制）
    if (messageEl.hasAttribute('data-nq-injected')) return;

    // 找到 markdown 内容元素
    let markdownEl;
    if (PLATFORM.message === PLATFORM.markdown) {
      markdownEl = messageEl;
    } else {
      const allMd = messageEl.querySelectorAll(PLATFORM.markdown);
      if (allMd.length === 0) return;
      markdownEl = allMd[allMd.length - 1];
    }
    if (markdownEl.closest(PLATFORM.think)) return;

    const btn = document.createElement('button');
    btn.className = 'nq-preview-btn';
    btn.innerHTML = '<span class="nq-icon">📋</span> 预览';
    btn.title = '提取此回复到侧边栏预览';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      captureMessage(messageEl, btn);
    });

    markdownEl.insertAdjacentElement('afterend', btn);
    messageEl.setAttribute('data-nq-injected', '1');
  }

  function captureMessage(messageEl, btn) {
    // 取 markdown 内容（豆包等平台 message == markdown）
    let markdownEl;
    if (PLATFORM.message === PLATFORM.markdown) {
      markdownEl = messageEl;
    } else {
      const allMd = messageEl.querySelectorAll(PLATFORM.markdown);
      markdownEl = allMd[allMd.length - 1];
    }
    if (!markdownEl) return;

    const { html, md } = extractContent(markdownEl);
    if (!html || html.length < 10) {
      btn.innerHTML = '<span class="nq-icon">⚠️</span> 空';
      return;
    }

    msgCounter++;
    const msg = {
      id: 'msg_' + Date.now() + '_' + msgCounter,
      html: html,       // 清洗后的 HTML（预览+导出用）
      content: md,      // 纯文本 Markdown（编辑用）
      role: 'assistant',
      index: msgCounter,
      timestamp: Date.now(),
      isComplete: true
    };

    try { chrome.runtime.sendMessage({ action: 'newMessage', data: msg }).catch(() => {}); } catch(e) { /* context invalidated */ }
    btn.classList.add('done');
    btn.innerHTML = '<span class="nq-icon">✅</span> 已捕获';
    log('捕获 AI 回复 #' + msg.index, md.substring(0, 80) + '...');
  }

  // ============ 消息扫描 + 按钮注入 ============
  function scanAndInject() {
    const count = document.querySelectorAll(PLATFORM.message).length;
    log('scanAndInject: 找到', count, '个候选消息');
    document.querySelectorAll(PLATFORM.message).forEach(msg => {
      if (msg.hasAttribute('data-nq-injected')) return;
      const hasContent = (PLATFORM.message === PLATFORM.markdown) || msg.querySelector(PLATFORM.markdown);
      if (hasContent) injectPreviewButton(msg);
    });
  }

  // ============ 观察新消息 ============
  function startObserving() {
    const chatArea = findChatArea();
    new MutationObserver(() => {
      // 用防抖避免频繁触发
      clearTimeout(window._nqInjectTimer);
      window._nqInjectTimer = setTimeout(scanAndInject, 500);
    }).observe(chatArea || document.body, { childList: true, subtree: true });
    log('Observer 已启动');
  }

  function findChatArea() {
    const dsMsgs = document.querySelectorAll(PLATFORM.message);
    if (dsMsgs.length === 0) return document.body;
    const candidates = new Map();
    dsMsgs.forEach(msg => {
      let p = msg.parentElement;
      while (p && p !== document.body) {
        candidates.set(p, (candidates.get(p) || 0) + 1);
        p = p.parentElement;
      }
    });
    let best = null, bestCount = 0;
    for (const [el, count] of candidates) {
      if (count > bestCount) { bestCount = count; best = el; }
    }
    return best || document.body;
  }

  // ============ 外部消息 ============
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'rescan') {
      scanAndInject();
      sendResponse({ success: true });
    }
  });

  // ============ 启动 ============
  function init() {
    log('v5 初始化');
    injectStyles();
    scanAndInject();
    startObserving();

    // SPA 导航
    let lastUrl = window.location.href;
    new MutationObserver(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        log('SPA 导航');
        msgCounter = 0;
        try { chrome.runtime.sendMessage({ action: 'clearAllMessages' }).catch(() => {}); } catch(e) {}
        setTimeout(() => { scanAndInject(); }, 800);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
