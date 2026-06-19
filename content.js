/**
 * NQ-Assistant - Content Script v7
 * 多平台支持：DeepSeek / ChatGPT / Claude / Kimi / 豆包 (Doubao)
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
      message: '[class*="side-by-side-messages"]',
      markdown: '__SELF__',
      think: '[class*="think"], [class*="reasoning"], [class*="thinking"], [class*="deep-thinking"]',
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
      .nq-btn-group { display: inline-flex; gap: 3px; margin-left: 4px; }
      .nq-export-btn { border-color: #c7d2fe; color: #4f46e5; }
      .nq-export-btn:hover { background: #eef2ff; }
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
  var _turndown = null;
  function getTurndown() {
    if (!_turndown && typeof TurndownService !== 'undefined') {
      _turndown = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        emDelimiter: '*',
        br: '  \n'
      });
      // Custom rules for Doubao-specific quirks
      _turndown.addRule('katex-html', {
        filter: function(node) { return node.classList && (node.classList.contains('katex') || node.classList.contains('katex-display')); },
        replacement: function(content) { return content; }
      });
      _turndown.addRule('empty-links', {
        filter: function(node) { return node.nodeName === 'A' && !node.getAttribute('href'); },
        replacement: function(content) { return content; }
      });
      // Footnote links: [^1] rendered as <a href=...>[^1]</a> by Doubao
      _turndown.addRule('footnote-links', {
        filter: function(node) {
          if (node.nodeName !== 'A') return false;
          var txt = (node.textContent || '').trim();
          return /^\[\^/.test(txt);
        },
        replacement: function(content) { return content; }
      });
    }
    return _turndown;
  }

  function htmlToMarkdown(el) {
    var td = getTurndown();
    if (td) {
      try {
        var result = td.turndown(el.outerHTML || el.innerHTML);
        // Post-process: fix nested list indentation
        result = fixNestedListIndent(result);
        // Post-process: remove orphaned language labels (standalone words before code fences)
        var langNames = 'plaintext|text|javascript|js|python|py|java|bash|sh|shell|html|css|json|xml|markdown|md|sql|go|rust|rs|c|cpp|ruby|rb|php|swift|kotlin|ts|yaml';
        var langRe = new RegExp('^(' + langNames + ')\\s*$', 'gm');
        result = result.replace(langRe, '');

        return result;
      } catch(e) {
        log('turndown 失败，回退到 elementToMarkdown:', e);
      }
    }
    return elementToMarkdown(el);
  }

  /** Fix nested list indentation: ensure sub-items have at least 2-space indent */
  function fixNestedListIndent(md) {
    var lines = md.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^(\s*)([-*+]|\d+\.)\s/);
      if (m && m[1].length > 0 && m[1].length < 2) {
        // Pad to at least 2 spaces for nested list items
        lines[i] = ' ' + lines[i];
      }
    }
    return lines.join('\n');
  }

  /** 将 code-block 头部中的语言名移到 <code> 的 class 上，移除"运行"按钮和零散文本 */
  function normalizeCodeBlocks(root) {
    // 收集所有 pre 并处理它们的前驱兄弟节点
    var pres = root.querySelectorAll('pre');
    for (var pi = 0; pi < pres.length; pi++) {
      var pre = pres[pi];
      var codeEl = pre.querySelector('code');
      var lang = '';

      // 方法1：从代码头部容器提取语言
      var codeContainer = pre.closest('[class*="code"]');
      if (codeContainer) {
        codeContainer.querySelectorAll('span, div, button').forEach(function(el) {
          var t = (el.textContent || '').trim().replace(/运行$|运行代码$|^copy$/i, '').trim();
          var knownLangs = /^(javascript|python|java|bash|sh|html|css|json|xml|markdown|md|sql|go|rust|c|cpp|csharp|ruby|php|swift|kotlin|typescript|ts|yaml|shell|text|plaintext)$/i;
          if (knownLangs.test(t)) { lang = t.toLowerCase(); el.remove(); }
          else if (/^运行$|^运行代码$|^copy$/i.test(t)) { el.remove(); }
        });
      }

      // 方法2：从 pre 的直接前驱兄弟提取
      if (!lang) {
        var check = pre.previousElementSibling;
        var tried = 0;
        while (check && tried < 2) {
          var txt = (check.textContent || '').trim();
          var cls2 = getClass(check).toLowerCase();
          if (txt && txt.length < 20 && !/<[^>]+>/.test(txt) && /code|lang|language|header|label/i.test(cls2)) {
            lang = txt.replace(/运行|运行代码|复制|copy|code/gi, '').trim();
            if (lang) check.remove();
          }
          check = check.previousElementSibling;
          tried++;
        }
      }

      if (codeEl && lang) {
        codeEl.className = (codeEl.className || '') + ' language-' + lang;
      }
    }

    // 最后一遍：清理任何残留的独立语言名 div/span（紧邻 pre 之前的）
    // Doubao pattern: <div class="code_header"><span>python</span><button>运行</button></div><pre>...
    root.querySelectorAll('[class*="code"]').forEach(function(cc) {
      cc.querySelectorAll('button, span, div').forEach(function(el) {
        var t = (el.textContent || '').trim();
        if (/^运行$|^运行代码$|^copy$/i.test(t)) { el.remove(); }
      });
    });
  }

  /** 将有 heading 样式的 div 转换为 h1-h6 */
  function normalizeHeadings(root) {
    var headingClassMap = {
      'heading-1': 'h1', 'heading1': 'h1', 'h1': 'h1',
      'heading-2': 'h2', 'heading2': 'h2', 'h2': 'h2',
      'heading-3': 'h3', 'heading3': 'h3', 'h3': 'h3',
      'heading-4': 'h4', 'heading4': 'h4', 'h4': 'h4',
      'heading-5': 'h5', 'heading5': 'h5', 'h5': 'h5',
      'heading-6': 'h6', 'heading6': 'h6', 'h6': 'h6'
    };
    // This is only needed if headings aren't real <h1>-<h6> tags
    // Doubao uses <h1>-<h6>, so this is a no-op for Doubao but helps other platforms
    root.querySelectorAll('div, p, span').forEach(function(el) {
      var cls = getClass(el).toLowerCase();
      for (var key in headingClassMap) {
        if (headingClassMap.hasOwnProperty(key) && cls.indexOf(key) !== -1) {
          var replacement = document.createElement(headingClassMap[key]);
          while (el.firstChild) { replacement.appendChild(el.firstChild); }
          if (el.parentNode) { el.parentNode.replaceChild(replacement, el); }
          break;
        }
      }
    });
  }

  function extractContent(el) {
    const clone = el.cloneNode(true);
    convertKatexToLatex(clone);
    if (PLATFORM.markdown === '__SELF__') {
      dumpDoubaoDOM(clone);
      normalizeCodeBlocks(clone);
      reconstructDivTables(clone);
      normalizeHeadings(clone);
    }
    removeThinking(clone);
    removeUIElements(clone);
    removeCitationLinks(clone);
    const html = clone.innerHTML.trim();
    var md = PLATFORM.markdown === '__SELF__'
      ? cleanContent(htmlToMarkdown(clone))
      : cleanContent(elementToMarkdown(clone));
    return { html, md };
  }

  /** Diagnostic: dump DOM structure near table-looking areas */
  function dumpDoubaoDOM(root) {
    // 1. Check for existing <table> elements
    var tables = root.querySelectorAll('table');
    log('=== 豆包 DOM 诊断 === 找到 ' + tables.length + ' 个 <table> 元素');
    for (var ti = 0; ti < Math.min(tables.length, 5); ti++) {
      var tbl = tables[ti];
      var rows = tbl.querySelectorAll('tr');
      var firstRowText = rows.length > 0 ? (rows[0].textContent || '').trim().substring(0, 60) : '(none)';
      log('  table[' + ti + '] class="' + getClass(tbl).substring(0, 50) + '" rows=' + rows.length + ' firstRow="' + firstRowText + '"');
    }

    // 2. Check for .katex elements
    var katexEls = root.querySelectorAll('.katex');
    log('  找到 ' + katexEls.length + ' 个 .katex 元素');
    for (var ki = 0; ki < Math.min(katexEls.length, 3); ki++) {
      var k = katexEls[ki];
      var ann = k.querySelector('annotation[encoding="application/x-tex"]');
      var dl = k.getAttribute('data-latex');
      var ml = k.querySelector('.katex-mathml annotation');
      var txt = (k.textContent || '').trim().substring(0, 50);
      log('  katex[' + ki + '] hasAnn=' + !!ann + ' hasDataLatex=' + !!dl + ' hasMathML=' + !!ml + ' text="' + txt + '"');
    }

    // 3. Check for mjx-container or MathJax
    var mjx = root.querySelectorAll('.MathJax, .mjx-container, [class*="math"]');
    log('  MathJax/类math元素: ' + mjx.length + ' (sample: ' + (mjx.length > 0 ? getClass(mjx[0]).substring(0, 50) : 'none') + ')');

    // 4. Quick list of all top-level tags with count
    var tagCounts = {};
    root.querySelectorAll('*').forEach(function(e) { tagCounts[e.tagName] = (tagCounts[e.tagName] || 0) + 1; });
    var sorted = Object.keys(tagCounts).filter(function(t) { return tagCounts[t] > 3; }).sort(function(a, b) { return tagCounts[b] - tagCounts[a]; });
    log('  标签统计: ' + sorted.map(function(t) { return t + ':' + tagCounts[t]; }).join(', '));
  }

  /** Reconstruct tables: detect flat-div grids and wrap in <table>.
   *  Strategy: find containers whose direct children are same-tag divs
   *  with similar structure, detect column count via text-length histogram. */
  function reconstructDivTables(root) {
    var candidates = [];
    // Search ALL divs (not just root) — Doubao tables are nested deep
    root.querySelectorAll('div').forEach(function(c) {
      var kids = [];
      for (var ki = 0; ki < c.children.length; ki++) {
        if (c.children[ki].nodeType === Node.ELEMENT_NODE) kids.push(c.children[ki]);
      }
      if (kids.length < 4) return;
      // All same tag
      var firstTag = kids[0].tagName;
      if (!kids.every(function(k) { return k.tagName === firstTag; })) return;
      // Cell-like: short text, few children, no structural elements inside individual cells
      // Cell-like: short text, few children. Relaxed: just prohibit deeply nested structures.
      if (!kids.every(function(k) {
        return !k.querySelector('pre, table, svg');
      })) return;
      // Try column counts 2-6
      var bestCols = 0;
      for (var cols = 2; cols <= Math.min(6, Math.floor(kids.length / 2)); cols++) {
        if (kids.length % cols === 0) { bestCols = cols; break; }
      }
      if (bestCols) {
        var rows = kids.length / bestCols;
        if (rows >= 2) candidates.push({ container: c, cols: bestCols, n: kids.length });
      }
    });

    if (!candidates.length) { log('reconstructDivTables: 未检测到表格'); return; }

    // Deduplicate: if one candidate contains another, keep the inner one
    var keep = [];
    for (var ci = 0; ci < candidates.length; ci++) {
      var isContained = false;
      for (var cj = 0; cj < candidates.length; cj++) {
        if (ci !== cj && candidates[cj].container.contains(candidates[ci].container)) {
          isContained = true; break;
        }
      }
      if (!isContained) keep.push(candidates[ci]);
    }

    for (var cIdx = 0; cIdx < keep.length; cIdx++) {
      var cand = keep[cIdx], cols = cand.cols;
      var rows = cand.n / cols;
      // Snapshot innerHTML before mutations
      var cellHTMLs = [];
      for (var chIdx = 0; chIdx < cand.n; chIdx++) {
        cellHTMLs.push(cand.container.children[chIdx].innerHTML);
      }
      var table = document.createElement('table');
      for (var r = 0; r < rows; r++) {
        var tr = document.createElement('tr');
        for (var c2 = 0; c2 < cols; c2++) {
          var idx = r * cols + c2;
          var cell = document.createElement(r === 0 ? 'th' : 'td');
          cell.innerHTML = cellHTMLs[idx];
          tr.appendChild(cell);
        }
        table.appendChild(tr);
      }
      while (cand.container.firstChild) cand.container.removeChild(cand.container.firstChild);
      cand.container.appendChild(table);
    }
    log('reconstructDivTables: 重构', keep.length, '个表格 (列数:', keep.map(function(c) { return c.cols; }).join(','), ')');
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

  /** 移除所有UI元素（非内容元素） */
  function removeUIElements(root) {
    // 移除按钮、图标、工具栏
    root.querySelectorAll('button, [role="button"], svg, [class*="icon-btn"], [class*="copy-btn"], [class*="download"], [class*="clipboard"], [class*="run-btn"], [class*="execute-btn"]').forEach(function(e) { e.remove(); });
    root.querySelectorAll('[class*="toolbar"], [class*="action-bar"], [class*="code-header"], [class*="code-toolbar"]').forEach(function(e) { e.remove(); });
    // 移除包含"运行"文字的按钮/label元素
    root.querySelectorAll('button, span, div').forEach(function(e) {
      var t = (e.textContent || '').trim();
      if (t === '运行' || t === '复制' || t === 'Copy' || t === 'Run') {
        if (e.closest && e.closest('[class*="code"]')) { e.remove(); }
      }
    });
    // 代码高亮 span（hljs, prism, shiki 等）—— 安全解包
    root.querySelectorAll('span[class*="hljs-"], span[class*="token-"], span[class*="syntax-"]').forEach(function(e) {
      var p = e.parentNode;
      if (p) {
        while (e.firstChild) { p.insertBefore(e.firstChild, e); }
        e.remove();
      }
    });
    // 移除引用链接
    root.querySelectorAll('a[href*="http"]:not([href*="placeholder"]), sup a, a[href*="/citation"], a[href*="/ref"], [class*="citation"], [class*="reference"]').forEach(function(e) {
      if (e.textContent.trim().length < 20) e.remove();
    });
    // 移除数字上标引用
    root.querySelectorAll('sup, [class*="superscript"]').forEach(function(e) {
      if (/^\d+$/.test(e.textContent.trim()) || e.querySelector('a[href]')) e.remove();
    });
    // 移除空元素（无文本、无图片的子元素）
    root.querySelectorAll('div, span, p').forEach(function(e) {
      var txt = (e.textContent || '').trim();
      var img = e.querySelector('img');
      if (!txt && !img && e.children.length === 0) { e.remove(); }
    });
  }

  /**
   * 将 KaTeX 渲染的 HTML 还原为 LaTeX 语法 ($...$ / $$...$$)
   */
  function convertKatexToLatex(root) {
    root.querySelectorAll('.katex, .katex-display').forEach(function(katexEl) {
      var isDisplay = katexEl.closest('.katex-display') !== null ||
                      katexEl.classList.contains('katex-display');
      // 1. Try <annotation encoding="application/x-tex">
      var ann = katexEl.querySelector('annotation[encoding="application/x-tex"]');
      if (ann && ann.textContent.trim()) {
        var latex = ann.textContent.trim();
        katexEl.parentNode.replaceChild(document.createTextNode(isDisplay ? ('$$\n' + latex + '\n$$') : ('$' + latex + '$')), katexEl);
        return;
      }
      // 2. Try data-latex attribute (KaTeX auto-render)
      var dl = katexEl.getAttribute('data-latex');
      if (dl && dl.trim()) {
        katexEl.parentNode.replaceChild(document.createTextNode(isDisplay ? ('$$\n' + dl.trim() + '\n$$') : ('$' + dl.trim() + '$')), katexEl);
        return;
      }
      // 3. Try hidden .katex-mathml <math> → annotation
      var ml = katexEl.querySelector('.katex-mathml annotation[encoding="application/x-tex"]');
      if (ml && ml.textContent.trim()) {
        katexEl.parentNode.replaceChild(document.createTextNode(isDisplay ? ('$$\n' + ml.textContent.trim() + '\n$$') : ('$' + ml.textContent.trim() + '$')), katexEl);
        return;
      }
      // 4. Generic: any annotation
      var ga = katexEl.querySelector('annotation');
      if (ga && ga.textContent.trim()) {
        katexEl.parentNode.replaceChild(document.createTextNode(isDisplay ? ('$$\n' + ga.textContent.trim() + '\n$$') : ('$' + ga.textContent.trim() + '$')), katexEl);
        return;
      }
      // 5. Last resort: remove the rendered math HTML, insert placeholder
      katexEl.parentNode.replaceChild(document.createTextNode(isDisplay ? '$$\n[MATH]\n$$' : '$MATH$'), katexEl);
    });
    root.querySelectorAll('script[type="math/tex"], script[type="math/tex; mode=display"]').forEach(function(script) {
      var latex = script.textContent.trim();
      script.parentNode.replaceChild(document.createTextNode((script.getAttribute('type') === 'math/tex; mode=display' ? '$$\n' + latex + '\n$$' : '$' + latex + '$')), script);
    });
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
      text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, latex) => { changed = true; return '$$\n' + latex.trim() + '\n$$'; });
      text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, latex) => { changed = true; return '$' + latex.trim() + '$'; });
      if (changed) node.textContent = text;
    });
  }

  function removeThinking(el) {
    try {
      if (PLATFORM.think) el.querySelectorAll(PLATFORM.think).forEach(n => n.remove());
      else el.querySelectorAll('[class*="think"], [class*="thinking"], [class*="reasoning"], [class*="deep-thinking"]').forEach(n => n.remove());
    } catch (e) {}
    el.querySelectorAll('details').forEach(d => {
      const s = d.querySelector('summary');
      if (s && /思考|深度思考|reasoning|thinking|thought/i.test(getText(s))) d.remove();
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
        case 'p':
          var pCls = getClass(child).toLowerCase();
          if (pCls.includes('blockquote') || pCls.includes('quote')) {
            var pbqMd = elementToMarkdown(child);
            pbqMd = pbqMd.split('\n').map(function(l) { return '> ' + l; }).join('\n');
            md += '\n' + pbqMd + '\n';
          } else {
            md += '\n' + processInline(child) + '\n';
          }
          break;
        case 'pre': md += processCode(child); break;
        case 'ul': md += processList(child, false); break;
        case 'ol': md += processList(child, true); break;
        case 'blockquote':
          var bqMd = elementToMarkdown(child);
          bqMd = bqMd.split('\n').map(function(l) { return '> ' + l; }).join('\n');
          md += '\n' + bqMd + '\n';
          break;
        case 'table': md += processTable(child); break;
        case 'hr': md += '\n---\n'; break;
        case 'details': md += elementToMarkdown(child) + '\n'; break;
        case 'div': case 'section': case 'article':
          var cls = getClass(child).toLowerCase();
          if (cls.includes('blockquote') || cls.includes('quote')) {
            var bqMd = elementToMarkdown(child);
            bqMd = bqMd.split('\n').map(function(l) { return '> ' + l; }).join('\n');
            md += '\n' + bqMd + '\n';
          } else if (looksLikeDivTable(child)) md += processDivTable(child) + '\n';
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
        case 'img': result += '![image](' + (child.getAttribute('src') || '') + ')'; break;
        case 'del': case 's': result += '~~' + inner + '~~'; break;
        case 'br': result += '\n'; break;
        case 'u': case 'ins': result += '<u>' + inner + '</u>'; break;
        case 'kbd': result += inner; break;
        default: result += inner;
      }
    }
    return result;
  }

  function processCode(preEl) {
    var codeEl = preEl.querySelector('code');
    var lang = '';
    if (codeEl) {
      var cm = codeEl.className && codeEl.className.match(/language-(\w+)/);
      if (cm) lang = cm[1];
    }
     var raw = (codeEl ? codeEl.textContent : preEl.textContent) || '';
    return '\n```' + lang + '\n' + raw.trim() + '\n```\n';
  }

  function processList(listEl, ordered, indent) {
    var ind = indent || '';
    var md = '\n';
    Array.from(listEl.children).filter(function(c) { return c.tagName === 'LI'; }).forEach(function(li, i) {
      var prefix = ordered ? (i + 1) + '. ' : '- ';
      var text = '';
      for (var ci = 0; ci < li.childNodes.length; ci++) {
        var child = li.childNodes[ci];
        if (child.nodeType === Node.TEXT_NODE) { text += child.textContent; continue; }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;
        var ctag = child.tagName.toLowerCase();
        if (ctag === 'ul' || ctag === 'ol') continue;
        text += child.textContent || '';
      }
      md += ind + prefix + text.trim() + '\n';
      for (var ci2 = 0; ci2 < li.children.length; ci2++) {
        var sub = li.children[ci2];
        var stag = sub.tagName.toLowerCase();
        if (stag === 'ul' || stag === 'ol') {
          md += processList(sub, stag === 'ol', ind + '  ');
        }
      }
    });
    return md;
  }

  function processTable(tableEl) {
    var md = '\n';
    var rows = tableEl.querySelectorAll('tr');
    if (rows.length === 0) { rows = tableEl.querySelectorAll('thead tr, tbody tr, tr'); }
    Array.from(rows).forEach(function(row, i) {
      var cells = row.querySelectorAll('th, td');
      if (cells.length === 0) return;
      md += '| ' + Array.from(cells).map(function(c) { return getText(c); }).join(' | ') + ' |\n';
      if (i === 0) md += '| ' + Array.from(cells).map(function() { return '---'; }).join(' | ') + ' |\n';
    });
    return md + '\n';
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
    md = stripEmptyHeadings(md);
    return md.trim();
  }

  function stripMetadata(md) {
    var lines = md.split('\n');
    var cleanLines = [];
    var headerDone = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();
      if (headerDone) { cleanLines.push(line); continue; }
      if (t.length === 0) continue;
      if (/^已思考|^已深度思考|^深度思考|^思考过程|^思考中|^(已)?搜索到\s*\d+\s*个网页|^浏览\s*\d+\s*个页面|^已搜索|^搜索完成|^深度搜索|^正在搜索|^开始搜索|^\d+\s*个搜索结果|^用时\s*\d+\s*秒|^搜索关键词/.test(t)) continue;
      headerDone = true;
      cleanLines.push(line);
    }
    return cleanLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function stripEmptyHeadings(md) {
    return md.replace(/^(\s*#{1,6}\s*[\r\n]+){2,}/gm, '').replace(/^\s*#{1,6}\s*$/gm, '');
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
    md = md.replace(/([^-–—\n])[\-–—]+\s*$/gm, '$1');
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
    if (messageEl.hasAttribute('data-nq-injected')) return;

    // 定位 markdown 内容元素
    var markdownEl;
    if (PLATFORM.markdown === '__SELF__') {
      // 豆包等：消息元素本身就是内容容器
      markdownEl = messageEl;
    } else if (PLATFORM.message === PLATFORM.markdown) {
      markdownEl = messageEl;
    } else {
      var allMd = messageEl.querySelectorAll(PLATFORM.markdown);
      if (allMd.length === 0 && PLATFORM.key === 'doubao') {
        allMd = messageEl.querySelectorAll('[class*="md-box-root"], [class*="prose"], [class*="answer"] > [class*="content"]');
      }
      if (allMd.length === 0 && PLATFORM.key === 'doubao') {
        if ((messageEl.textContent || '').trim().length > 80) {
          markdownEl = messageEl;
        } else {
          return;
        }
      } else if (allMd.length === 0) {
        return;
      } else {
        markdownEl = allMd[allMd.length - 1];
      }
    }

    // 跳过思考过程元素
    if (markdownEl.closest && markdownEl.closest('[class*="think"]')) return;
    if (markdownEl.closest && markdownEl.closest('[class*="reasoning"]')) return;
    if (markdownEl.closest && markdownEl.closest('[class*="thinking"]')) return;
    if (markdownEl.closest && markdownEl.closest('[class*="deep-thinking"]')) return;

    const btnGroup = document.createElement('span');
    btnGroup.className = 'nq-btn-group';

    const previewBtn = document.createElement('button');
    previewBtn.className = 'nq-preview-btn';
    previewBtn.innerHTML = '<span class="nq-icon">📋</span> 预览';
    previewBtn.title = '提取到侧边栏';
    previewBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); captureMessage(messageEl, previewBtn); });
    btnGroup.appendChild(previewBtn);

    const wordBtn = document.createElement('button');
    wordBtn.className = 'nq-preview-btn nq-export-btn';
    wordBtn.innerHTML = '📄';
    wordBtn.title = '导出 Word';
    wordBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); directExport(messageEl, wordBtn); });
    btnGroup.appendChild(wordBtn);

    const pdfBtn = document.createElement('button');
    pdfBtn.className = 'nq-preview-btn';
    pdfBtn.innerHTML = '📑';
    pdfBtn.title = '导出 PDF';
    pdfBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); directExportPDF(messageEl, pdfBtn); });
    btnGroup.appendChild(pdfBtn);

    if (PLATFORM.markdown === '__SELF__') {
      markdownEl.appendChild(btnGroup);
    } else {
      markdownEl.insertAdjacentElement('afterend', btnGroup);
    }
    messageEl.setAttribute('data-nq-injected', '1');
  }

  function captureMessage(messageEl, btn) {
    // 取 markdown 内容
    var markdownEl;
    if (PLATFORM.markdown === '__SELF__') {
      markdownEl = messageEl;
    } else if (PLATFORM.message === PLATFORM.markdown) {
      markdownEl = messageEl;
    } else {
      var allMd = messageEl.querySelectorAll(PLATFORM.markdown);
      if (allMd.length > 0) {
        markdownEl = allMd[allMd.length - 1];
      } else if (PLATFORM.key === 'doubao') {
        var fallbackMd = messageEl.querySelectorAll('[class*="md-box-root"], [class*="prose"], [class*="answer"] > [class*="content"]');
        if (fallbackMd.length > 0) {
          markdownEl = fallbackMd[fallbackMd.length - 1];
        } else if ((messageEl.textContent || '').trim().length > 80) {
          markdownEl = messageEl;
        }
      }
    }
    if (!markdownEl) return;

    const { html, md } = extractContent(markdownEl);
    if (!html || html.length < 10) {
      btn.innerHTML = '<span class="nq-icon">⚠️</span> 空';
      return;
    }

    msgCounter++;
    var question = takeWords(extractUserQuestion(messageEl), 10);
    const msg = {
      id: 'msg_' + Date.now() + '_' + msgCounter,
      html: html,
      content: md,
      title: question,
      role: 'assistant',
      index: msgCounter,
      timestamp: Date.now(),
      isComplete: true
    };

    try {
      if (window.NQFloatPanel) {
        window.NQFloatPanel.addMessage(msg);
      } else {
        chrome.runtime.sendMessage({ action: 'newMessage', data: msg }).catch(function() {});
      }
    } catch(e) {}
    btn.classList.add('done');
    btn.innerHTML = '<span class="nq-icon">✅</span> 已捕获';
    log('捕获 AI 回复 #' + msg.index, md.substring(0, 80) + '...');
  }

  // ============ 模板配置 ============
  const TEMPLATES = {
    academic: { name: '学术报告', fontFamily: 'SimSun, 宋体, serif', fontSize: '12pt', titleSize: '16pt', h1Size: '15pt', h2Size: '14pt', h3Size: '13pt', lineHeight: '1.8', color: '000000' },
    tech:     { name: '技术文档', fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif', fontSize: '11pt', titleSize: '18pt', h1Size: '16pt', h2Size: '14pt', h3Size: '12pt', lineHeight: '1.6', color: '#1a1a2e' },
    meeting:  { name: '会议纪要', fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif', fontSize: '11pt', titleSize: '15pt', h1Size: '14pt', h2Size: '13pt', h3Size: '12pt', lineHeight: '1.7', color: '333333' },
    custom:   { name: '自定义',   fontFamily: 'Microsoft YaHei, 微软雅黑, sans-serif', fontSize: '11pt', titleSize: '16pt', h1Size: '15pt', h2Size: '14pt', h3Size: '12pt', lineHeight: '1.7', color: '333333' }
  };

  function ptToHalfPt(s) { if (!s) return 22; return parseInt(s) * 2; }

  function getDocxOpts(tpl) {
    if (!tpl) return null;
    return {
      font: (tpl.fontFamily || '').split(',')[0].trim(),
      size: ptToHalfPt(tpl.fontSize),
      color: tpl.color || '000000',
      headingFont: (tpl.fontFamily || '').split(',')[0].trim(),
      h1Size: ptToHalfPt(tpl.h1Size),
      h2Size: ptToHalfPt(tpl.h2Size),
      h3Size: ptToHalfPt(tpl.h3Size),
      h4Size: ptToHalfPt(tpl.fontSize),
      h5Size: ptToHalfPt(tpl.fontSize),
      h6Size: ptToHalfPt(tpl.fontSize)
    };
  }

  // ============ 直接导出 ============
  function getMsgMarkdownEl(msgEl) {
    if (PLATFORM.markdown === '__SELF__') return msgEl;
    if (PLATFORM.message === PLATFORM.markdown) return msgEl;
    var all = msgEl.querySelectorAll(PLATFORM.markdown);
    if (all.length) return all[all.length - 1];
    if (PLATFORM.key === 'doubao') {
      var douFallbacks = ['[class*="md-box-root"]', '[class*="prose"]', '[class*="answer"] > [class*="content"]'];
      for (var i = 0; i < douFallbacks.length; i++) {
        var els = msgEl.querySelectorAll(douFallbacks[i]);
        if (els.length) return els[els.length - 1];
      }
      var ownText = (msgEl.textContent || '').trim();
      if (ownText.length > 80) { log('豆包回退：以 messageEl 自身为内容 (', ownText.length, '字符)'); return msgEl; }
    }
    return null;
  }
  function directExport(messageEl, btn) {
    var mdEl = getMsgMarkdownEl(messageEl);
    if (!mdEl) { btn.innerHTML = '❌'; log('directExport: 未找到 Markdown 元素, msgEl tag=', messageEl.tagName, 'class=', getClass(messageEl).substring(0, 60)); return; }
    var clone = mdEl.cloneNode(true);
    // __SELF__ mode: KaTeX first, then normalize, then strip cruft
    convertKatexToLatex(clone);
    if (PLATFORM.markdown === '__SELF__') {
      normalizeCodeBlocks(clone);
      reconstructDivTables(clone);
      normalizeHeadings(clone);
    }
    removeThinking(clone);
    removeUIElements(clone);
    removeCitationLinks(clone);
    var md = PLATFORM.markdown === '__SELF__' ? htmlToMarkdown(clone) : elementToMarkdown(clone);
    md = cleanContent(md);
    if (!md) { btn.innerHTML = '⚠️'; log('directExport: 提取后内容为空, clone text=', (clone.textContent || '').trim().substring(0, 60)); return; }
    var fname = takeWords(extractUserQuestion(messageEl), 10) || 'AI-Export';
    fname = fname.replace(/[\\/:*?"<>|#]/g, '').trim();
    var docxOpts = getDocxOpts(TEMPLATES.academic);
    var childrenPromise = typeof md2docxChildren === 'function' ? md2docxChildren(md, docxOpts) : fallbackDocxChildren(md, docxOpts);
    childrenPromise.then(function(children) {
      var doc = new docx.Document({ sections: [{ properties: {}, children: children }] });
      docx.Packer.toBlob(doc).then(function(blob) {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = fname + '.docx'; a.click();
        URL.revokeObjectURL(url);
        btn.classList.add('done'); btn.innerHTML = '✅';
      }).catch(function(e) { btn.innerHTML = '❌'; log('Word Blob 失败:', e); });
    }).catch(function(e) { btn.innerHTML = '❌'; log('Word 导出失败:', e); });
  }
  function fallbackDocxChildren(md, opts) {
    if (typeof _md2docxSetOpts === 'function') _md2docxSetOpts(opts);
    return Promise.resolve(md.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: [new docx.TextRun({ text: line || '' })] });
    }));
  }
  function directExportPDF(messageEl, btn) {
    var mdEl = getMsgMarkdownEl(messageEl);
    if (!mdEl) { btn.innerHTML = '❌'; log('directExportPDF: 未找到 Markdown 元素'); return; }
    var clone = mdEl.cloneNode(true);
    removeThinking(clone); removeUIElements(clone); removeCitationLinks(clone);
    convertKatexToLatex(clone);
    var html = clone.innerHTML.trim();
    if (!html) { btn.innerHTML = '⚠️'; log('directExportPDF: 提取后内容为空'); return; }
    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
      'body{font-family:"Microsoft YaHei",sans-serif;font-size:12px;line-height:1.6;color:#000;padding:20px}' +
      'img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}th{background:#e8e8e8}' +
      'pre{background:#f5f5f5;padding:8px;overflow-x:auto}code{font-family:Consolas,monospace;background:#f0f0f0;padding:1px 3px}' +
      'blockquote{border-left:3px solid #4f46e5;margin:8px 0;padding:4px 12px;background:#eef2ff}' +
      '@media print{@page{margin:10mm}}</style></head><body>' + html + '</body></html>';
    var blob = new Blob([fullHtml], { type: 'text/html' });
    var url = URL.createObjectURL(blob);
    var iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;border:none;background:#fff';
    var cleanup = function() {
      setTimeout(function() {
        try { document.body.removeChild(iframe); } catch(e) {}
        URL.revokeObjectURL(url);
        btn.classList.add('done'); btn.innerHTML = '✅';
      }, 2000);
    };
    iframe.addEventListener('load', function() {
      var iw = iframe.contentWindow;
      if (iw) {
        iw.focus();
        iw.addEventListener('afterprint', cleanup, { once: true });
        iw.print();
      }
    }, { once: true });
    iframe.src = url;
    document.body.appendChild(iframe);
  }
  function takeWords(text, max) {
    if (!text) return '';
    var parts = text.split(/[\s]+/).filter(function(w) { return w.length > 0; });
    return parts.slice(0, max).join(' ');
  }
  function extractUserQuestion(el) {
    var allMsgs = document.querySelectorAll(PLATFORM.message);
    // 豆包回退：主选择器没命中时，尝试回退选择器或父级子元素
    if (allMsgs.length === 0 && PLATFORM.key === 'doubao') {
      var douFallbackSel = '[class*="message-content"], [class*="chat-msg"], [class*="chat-item"], [class*="bubble"], [class*="reply-item"], [class*="turn"], [class*="conversation"] [class*="item"], [class*="answer-item"], [class*="message"][class*="assistant"], [class*="message"]';
      allMsgs = document.querySelectorAll(douFallbackSel);
      if (allMsgs.length === 0 && el.parentElement) {
        allMsgs = Array.from(el.parentElement.children);
      }
    }
    var idx = -1;
    for (var i = 0; i < allMsgs.length; i++) { if (allMsgs[i] === el) { idx = i; break; } }
    for (var j = idx - 1; j >= 0; j--) {
      if (PLATFORM.markdown === '__SELF__') {
        // __SELF__ 模式：前一个消息元素就是用户问题
        var ut = (allMsgs[j].textContent || '').replace(/[\s\n]+/g, ' ').trim();
        if (ut.length >= 4) return ut;
        continue;
      }
      if (allMsgs[j].querySelector(PLATFORM.markdown)) continue;
      var qt = (allMsgs[j].textContent || '').replace(/[\s\n]+/g, ' ').trim();
      if (qt.length >= 4) return qt;
    }
    return '';
  }

  // ============ 消息扫描 + 按钮注入 ============
  var _doubaoLogged = false;
  function scanAndInject() {
    var msgs = document.querySelectorAll(PLATFORM.message);
    // 豆包：首次扫描时记录 DOM 诊断信息
    if (!_doubaoLogged && PLATFORM.key === 'doubao' && msgs.length > 0) {
      _doubaoLogged = true;
      var sample = [];
      for (var si = 0; si < Math.min(msgs.length, 5); si++) {
        sample.push('  [#' + si + '] tag=' + msgs[si].tagName + ' class="' + (getClass(msgs[si]).substring(0, 80)) + '" text=' + (msgs[si].textContent || '').trim().substring(0, 40));
      }
      log('豆包 DOM 诊断 (共 ' + msgs.length + ' 个候选):\n' + sample.join('\n'));
    }
    // 如果主选择器没有匹配，尝试回退选择器
    if (msgs.length === 0 && PLATFORM.key === 'doubao') {
      // 豆包回退尝试多种可能的选择器
      var fallbacks = [
        '[class*="side-by-side-messages"]',
        '[class*="message-list"] > [class*="mx-auto"]',
        '[class*="message-content"]',
        '[class*="agent"] [class*="content"]:not([class*="think"])',
        '[class*="chat-msg"]',
        '[class*="chat-item"]',
        '[class*="reply-item"]',
        '[class*="turn"]',
        '[class*="conversation"] [class*="item"]',
        '[class*="message"][class*="assistant"]'
      ];
      for (var fi = 0; fi < fallbacks.length; fi++) {
        msgs = document.querySelectorAll(fallbacks[fi]);
        if (msgs.length > 0) { log('豆包回退选择器:', fallbacks[fi], '->', msgs.length, '个'); break; }
      }
    }
    var count = msgs.length;
    log('scanAndInject: 找到', count, '个候选消息');
    msgs.forEach(function(msg) {
      if (msg.hasAttribute('data-nq-injected')) return;
      if (PLATFORM.key === 'doubao') {
        // 过滤用户消息（包含 user 类的元素）
        if (msg.closest && msg.closest('[class*="user"], [class*="human"]')) return;
        if (/user|human/i.test(getClass(msg))) return;
      }
      var hasContent = false;
      if (PLATFORM.markdown === '__SELF__') {
        hasContent = (msg.textContent || '').trim().length > 80;
      } else if (PLATFORM.message === PLATFORM.markdown) {
        hasContent = true;
      } else {
        var mdQ = msg.querySelectorAll(PLATFORM.markdown);
        if (mdQ.length > 0) {
          var bestMd = mdQ[mdQ.length - 1];
          hasContent = (bestMd.textContent || '').trim().length > 20;
        } else if (PLATFORM.key === 'doubao') {
          var ownText = (msg.textContent || '').trim();
          hasContent = ownText.length > 80;
        }
      }
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

  // ============ 启动 ============
  function init() {
    log('v7 初始化');
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
        try {
          if (window.NQFloatPanel) window.NQFloatPanel.clearMessages();
          else chrome.runtime.sendMessage({ action: 'clearAllMessages' }).catch(function() {});
        } catch(e) {}
        setTimeout(() => { scanAndInject(); }, 800);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
