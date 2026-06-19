/**
 * md2docx.js - Markdown to docx via marked.lexer() AST
 * Supports editable OMML math equations via latex2omml.js
 * Supports syntax-highlighted code blocks via highlight.js
 * Depends: docx.bundle.js, marked (global), latex2omml.js, hljs (global)
 */
'use strict';

var _exportOpts = null;

function setExportOpts(opts) { _exportOpts = opts || null; }

function tr(text, overrides) {
  var p = { text: text != null ? text : '' };
  if (_exportOpts) {
    if (!overrides || overrides.font === undefined) p.font = _exportOpts.font;
    if (!overrides || overrides.size === undefined) p.size = _exportOpts.size;
    if (!overrides || overrides.color === undefined) p.color = _exportOpts.color;
  }
  if (overrides) {
    for (var k in overrides) { if (overrides.hasOwnProperty(k)) p[k] = overrides[k]; }
  }
  return new docx.TextRun(p);
}

// ============ Math sentinel: protect $$...$$ from marked.lexer() ============
var _mathSentinelId = 0;
var _mathLaTeX = {};

function preProcessMath(md) {
  _mathSentinelId = 0;
  _mathLaTeX = {};
  return md.replace(/\$\$([\s\S]*?)\$\$/g, function(m, inner) {
    var id = _mathSentinelId++;
    _mathLaTeX[id] = inner.trim();
    return '\n<!--MATH_' + id + '-->\n';
  });
}

function isMathSentinel(text) {
  return /^<!--MATH_\d+-->$/.test((text || '').trim());
}

function getMathSentinelId(text) {
  var m = (text || '').trim().match(/^<!--MATH_(\d+)-->$/);
  return m ? parseInt(m[1], 10) : -1;
}

function renderMathParagraph(latex) {
  if (!latex || !latex.length) return null;
  try {
    if (typeof latex2docx === 'function') {
      var children = latex2docx(latex);
      if (children && children.length > 0) {
        return new docx.Paragraph({
          spacing: { before: 100, after: 100 },
          alignment: docx.AlignmentType.CENTER,
          children: [new docx.Math({ children: children })]
        });
      }
    }
  } catch(e) {}
  return new docx.Paragraph({
    spacing: { before: 80, after: 80 },
    alignment: docx.AlignmentType.CENTER,
    children: [new docx.TextRun({ text: latex, font: 'Cambria Math', size: 22, italics: true })]
  });
}

// ============ Main entry ============
function md2docxChildren(markdown, opts) {
  _exportOpts = opts || null;
  if (!markdown) return Promise.resolve([new docx.Paragraph({ children: [tr('')] })]);

  var md = preProcessMath(markdown);

  var tokens;
  try {
    tokens = typeof marked !== 'undefined' ? marked.lexer(md) : null;
  } catch(e) { tokens = null; }

  if (!tokens || !tokens.length) {
    return Promise.resolve(md.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: parseInline(line) });
    }));
  }

  try {
    return Promise.resolve(tokensToDocx(tokens));
  } catch(e) {
    return Promise.resolve(md.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: parseInline(line) });
    }));
  }
}

function tokensToDocx(tokens) {
  var children = [];
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    var paraText = extractTokenText(t);

    if (paraText && isMathSentinel(paraText)) {
      var mid = getMathSentinelId(paraText);
      var latex = _mathLaTeX[mid];
      if (latex) {
        var mathPara = renderMathParagraph(latex);
        if (mathPara) { children.push(mathPara); continue; }
      }
      children.push(new docx.Paragraph({ spacing: { after: 120 }, children: [tr(paraText || '')] }));
      continue;
    }

    switch (t.type) {
      case 'heading':
        var saveOptsH = _exportOpts;
        if (_exportOpts) {
          _exportOpts = {
            font: _exportOpts.headingFont || _exportOpts.font,
            size: _exportOpts['h' + Math.min(t.depth, 6) + 'Size'] || _exportOpts.size,
            color: _exportOpts.color
          };
        }
        var hRuns = tokensToRuns(t.tokens);
        _exportOpts = saveOptsH;
        children.push(new docx.Paragraph({ heading: docx.HeadingLevel['HEADING_' + Math.min(t.depth, 6)], children: hRuns }));
        break;
      case 'paragraph':
        children.push(new docx.Paragraph({ spacing: { after: 120 }, children: tokensToRuns(t.tokens) }));
        break;
      case 'code':
        children.push(codeBlockParagraph(t.text, t.lang));
        break;
      case 'blockquote':
        var qt = tokensToDocx(t.tokens);
        qt.forEach(function(q) {
          q.indent = { left: 720 };
          var s = q.spacing || {};
          s.before = (s.before || 0) + 80;
          s.after = (s.after || 0) + 80;
          q.spacing = s;
        });
        children.push.apply(children, qt);
        break;
      case 'hr':
        children.push(new docx.Paragraph({ spacing: { before: 200, after: 200 }, border: { bottom: { style: docx.BorderStyle.SINGLE, size: 6, space: 1, color: '999999' } } }));
        break;
      case 'list':
        buildListItems(children, t, 0);
        break;
      case 'table':
        children.push(buildTable(t));
        break;
      case 'space':
      case 'html':
        break;
      default:
        if (t.tokens) {
          children.push(new docx.Paragraph({ spacing: { after: 120 }, children: tokensToRuns(t.tokens) }));
        } else if (t.text) {
          children.push(new docx.Paragraph({ spacing: { after: 120 }, children: parseInline(t.text) }));
        }
    }
  }
  return children;
}

function extractTokenText(t) {
  if (!t) return null;
  if (t.text) return t.text;
  if (t.tokens) {
    var s = '';
    for (var i = 0; i < t.tokens.length; i++) {
      if (t.tokens[i].text) s += t.tokens[i].text;
    }
    return s;
  }
  return null;
}

function buildListItems(children, listToken, level) {
  listToken.items.forEach(function(item) {
    var inlineTokens = [];
    var subLists = [];
    if (item.tokens) {
      for (var ti = 0; ti < item.tokens.length; ti++) {
        var st = item.tokens[ti];
        if (st.type === 'list') { subLists.push(st); }
        else if (st.type === 'text' || st.type === 'paragraph' || st.type === 'space') {}
        else { inlineTokens.push(st); }
      }
    }
    var runs;
    if (inlineTokens.length > 0) {
      runs = tokensToRuns(inlineTokens);
    } else if (item.text) {
      runs = parseInline(item.text);
    } else {
      runs = [tr('')];
    }
    children.push(new docx.Paragraph({
      bullet: { level: Math.min(level, 2) },
      spacing: { after: 40 },
      children: runs
    }));
    subLists.forEach(function(sub) { buildListItems(children, sub, level + 1); });
  });
}

function buildTable(t) {
  var allRows = [];
  var maxCols = Math.max(t.header.length, (t.rows[0] || []).length);

  allRows.push(t.header.map(function(cell) {
    return new docx.TableCell({
      width: { size: Math.floor(9000 / maxCols), type: docx.WidthType.DXA },
      shading: { type: docx.ShadingType.SOLID, color: 'E8E8E8', fill: 'E8E8E8' },
      children: [new docx.Paragraph({ children: tokensToRuns(cell.tokens) })]
    });
  }));

  t.rows.forEach(function(row) {
    var cells = row.map(function(cell) {
      return new docx.TableCell({
        width: { size: Math.floor(9000 / maxCols), type: docx.WidthType.DXA },
        children: [new docx.Paragraph({ children: tokensToRuns(cell.tokens) })]
      });
    });
    while (cells.length < maxCols) cells.push(new docx.TableCell({
      width: { size: Math.floor(9000 / maxCols), type: docx.WidthType.DXA },
      children: [new docx.Paragraph({ children: [new docx.TextRun({ text: '' })] })]
    }));
    allRows.push(cells);
  });

  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: {
      top: { style: docx.BorderStyle.SINGLE, size: 1, color: '999999' },
      bottom: { style: docx.BorderStyle.SINGLE, size: 1, color: '999999' },
      left: { style: docx.BorderStyle.SINGLE, size: 1, color: '999999' },
      right: { style: docx.BorderStyle.SINGLE, size: 1, color: '999999' },
      insideHorizontal: { style: docx.BorderStyle.SINGLE, size: 1, color: '999999' },
      insideVertical: { style: docx.BorderStyle.SINGLE, size: 1, color: '999999' }
    },
    rows: allRows.map(function(row) { return new docx.TableRow({ children: row }); })
  });
}

// ============ Inline token → TextRun conversion ============
function tokensToRuns(tokens, _fmt) {
  if (!tokens || !tokens.length) return [tr('')];
  var runs = [];
  var fmt = _fmt || {};
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    switch (t.type) {
      case 'text':
        pushTextWithMath(runs, t.text || '', fmt);
        break;
      case 'strong':
        var sf = { bold: true };
        for (var bk in fmt) { if (fmt.hasOwnProperty(bk)) sf[bk] = fmt[bk]; }
        if (t.tokens) runs.push.apply(runs, tokensToRuns(t.tokens, sf));
        else pushTextWithMath(runs, t.text || '', sf);
        break;
      case 'em':
        var ef = { italics: true };
        for (var ek in fmt) { if (fmt.hasOwnProperty(ek)) ef[ek] = fmt[ek]; }
        if (t.tokens) runs.push.apply(runs, tokensToRuns(t.tokens, ef));
        else pushTextWithMath(runs, t.text || '', ef);
        break;
      case 'del':
        var df = { strike: true };
        for (var dk in fmt) { if (fmt.hasOwnProperty(dk)) df[dk] = fmt[dk]; }
        if (t.tokens) runs.push.apply(runs, tokensToRuns(t.tokens, df));
        else pushTextWithMath(runs, t.text || '', df);
        break;
      case 'codespan':
        runs.push(new docx.TextRun({ text: t.text, font: 'Consolas', size: 18 }));
        break;
      case 'link':
        var linkText = t.tokens ? inlineText(t.tokens) : t.text || '';
        var linkRun = { text: linkText, style: 'Hyperlink', color: '0563C1', underline: { type: docx.UnderlineType.SINGLE } };
        if (fmt.bold) linkRun.bold = true;
        if (fmt.italics) linkRun.italics = true;
        runs.push(new docx.ExternalHyperlink({
          children: [new docx.TextRun(linkRun)],
          link: t.href || ''
        }));
        break;
      case 'image':
        runs.push(tr('[image]', { italics: true, color: '999999' }));
        break;
      case 'br':
        runs.push(tr('', { break: 1 }));
        break;
      case 'escape':
        runs.push(tr(t.text));
        break;
      case 'html':
        break;
      default:
        if (t.text) pushTextWithMath(runs, t.text, fmt);
        else if (t.tokens) runs.push.apply(runs, tokensToRuns(t.tokens, fmt));
    }
  }
  if (runs.length === 0) runs.push(tr(''));
  return runs;
}

function inlineText(tokens) {
  var s = '';
  tokens.forEach(function(t) { if (t.text) s += t.text; });
  return s;
}

// ============ Inline math detection & OMML conversion ============
function pushTextWithMath(runs, text, _fmt) {
  if (!text) return;
  var fmt = _fmt || {};
  var pos = 0;
  var tlen = text.length;
  function t(text, extra) {
    var o = {};
    for (var k in fmt) { if (fmt.hasOwnProperty(k)) o[k] = fmt[k]; }
    if (extra) { for (var ek in extra) { if (extra.hasOwnProperty(ek)) o[ek] = extra[ek]; } }
    return tr(text, o);
  }

  while (pos < tlen) {
    var remaining = text.substring(pos);

    // Inline math $...$
    var imMatch = remaining.match(/\$([^$\n]{1,500}?)\$/);
    if (imMatch) {
      var imIdx = imMatch.index;
      var inner = imMatch[1].trim();
      if (/[\\\^_{}]/.test(inner)) {
        if (imIdx > 0) runs.push(t(remaining.substring(0, imIdx)));
        try {
          if (typeof latex2docx === 'function') {
            var mathChildren = latex2docx(inner);
            if (mathChildren && mathChildren.length > 0) {
              runs.push(new docx.Math({ children: mathChildren }));
              pos += imIdx + imMatch[0].length;
              continue;
            }
          }
        } catch(e) {}
      }
      if (imIdx === 0) { runs.push(t(imMatch[0])); pos += imMatch[0].length; continue; }
    }

    // Skip any leftover $$ markers (shouldn't exist after sentinel processing)
    if (remaining.indexOf('$$') === 0) {
      runs.push(t('$$'));
      pos += 2;
      continue;
    }

    // \(...\) → inline math
    var bmMatch = remaining.match(/\\\(([\s\S]+?)\\\)/);
    if (bmMatch && bmMatch.index === 0) {
      var bm = bmMatch[1].trim();
      try {
        if (typeof latex2docx === 'function') {
          var mc = latex2docx(bm);
          if (mc && mc.length > 0) { runs.push(new docx.Math({ children: mc })); pos += bmMatch[0].length; continue; }
        }
      } catch(e) {}
    }

    runs.push(t(remaining));
    break;
  }
}

function parseInline(text) {
  if (!text) return [tr('')];
  var runs = [];
  pushTextWithMath(runs, text, {});
  if (runs.length === 0) runs.push(tr(''));
  return runs;
}

// ============ Syntax-highlighted code block ============
var HLJS_COLORS = {
  'hljs-keyword':   '0000FF',
  'hljs-built_in':  '0000FF',
  'hljs-type':      '0000FF',
  'hljs-literal':   '0000FF',
  'hljs-number':    '098658',
  'hljs-regexp':    '098658',
  'hljs-string':    'A31515',
  'hljs-subst':     'A31515',
  'hljs-symbol':    'A31515',
  'hljs-class':     '0000FF',
  'hljs-function':  '795E26',
  'hljs-title':     '795E26',
  'hljs-params':    '001080',
  'hljs-comment':   '008000',
  'hljs-doctag':    '008000',
  'hljs-meta':      '008000',
  'hljs-meta-keyword': '008000',
  'hljs-section':   '800000',
  'hljs-tag':       '800000',
  'hljs-name':      '800000',
  'hljs-attr':      'FF0000',
  'hljs-attribute': 'FF0000',
  'hljs-variable':  '001080',
  'hljs-selector-class': '0000FF',
  'hljs-selector-id': '0000FF',
  'hljs-selector-tag': '800000',
  'hljs-selector-attr': 'FF0000',
  'hljs-template-variable': '001080',
  'hljs-deletion':  'A31515',
  'hljs-addition':  '098658',
  'hljs-emphasis':  '',
  'hljs-strong':    '',
  'hljs-quote':     '008000'
};

function colorFromClass(className) {
  if (!className) return null;
  var parts = className.split(/\s+/);
  for (var i = 0; i < parts.length; i++) {
    var c = HLJS_COLORS[parts[i]];
    if (c) return c;
  }
  return null;
}

function parseHighlightedSpans(html) {
  var tokens = [];
  var regex = /<span\s+class="([^"]*)"\s*>([\s\S]*?)<\/span>/g;
  var lastIdx = 0;
  var match;
  while ((match = regex.exec(html)) !== null) {
    if (match.index > lastIdx) {
      var pt = html.substring(lastIdx, match.index)
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
      if (pt) tokens.push({ text: pt, color: null });
    }
    var color = colorFromClass(match[1]);
    var inner = match[2]
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    tokens.push({ text: inner, color: color });
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < html.length) {
    var tail = html.substring(lastIdx)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
    if (tail) tokens.push({ text: tail, color: null });
  }
  return tokens;
}

function codeBlockParagraph(code, lang) {
  var highlighted = false;
  var htmlResult = null;
  try {
    if (typeof hljs !== 'undefined') {
      if (lang && hljs.getLanguage(lang)) {
        var result = hljs.highlight(code, { language: lang, ignoreIllegals: true });
        htmlResult = result.value;
        highlighted = true;
      } else {
        var autoResult = hljs.highlightAuto(code);
        if (autoResult.relevance > 3) {
          htmlResult = autoResult.value;
          highlighted = true;
        }
      }
    }
  } catch(e) {}

  if (highlighted && htmlResult) {
    var tokens = parseHighlightedSpans(htmlResult);
    if (tokens.length > 0) {
      var runs = [];
      var lines = [];
      var currentLine = [];
      tokens.forEach(function(tok) {
        var parts = tok.text.split('\n');
        for (var pi = 0; pi < parts.length; pi++) {
          if (pi > 0) { lines.push(currentLine); currentLine = []; }
          if (parts[pi]) currentLine.push({ text: parts[pi], color: tok.color });
        }
      });
      if (currentLine.length > 0) lines.push(currentLine);

      lines.forEach(function(lineTokens, li) {
        if (li > 0) runs.push(tr('', { break: 1 }));
        if (lineTokens.length === 0) return;
        lineTokens.forEach(function(lt) {
          var o = { text: lt.text, font: 'Consolas', size: 18 };
          if (lt.color) o.color = lt.color;
          runs.push(new docx.TextRun(o));
        });
      });
      return new docx.Paragraph({
        spacing: { before: 100, after: 100 },
        shading: { type: docx.ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' },
        children: runs
      });
    }
  }

  var lines = code.split('\n');
  var runs = [];
  lines.forEach(function(cl, idx) {
    if (idx > 0) runs.push(tr('', { break: 1 }));
    runs.push(new docx.TextRun({ text: cl, font: 'Consolas', size: 18 }));
  });
  return new docx.Paragraph({
    spacing: { before: 100, after: 100 },
    shading: { type: docx.ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' },
    children: runs
  });
}

// ============ Exports ============
if (typeof window !== 'undefined') {
  window.md2docxChildren = md2docxChildren;
  window._md2docxSetOpts = setExportOpts;
  window._md2docxFallback = function(md, opts) {
    setExportOpts(opts);
    if (!md) return Promise.resolve([new docx.Paragraph({ children: [tr('')] })]);
    return Promise.resolve(md.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: parseInline(line) });
    }));
  };
}
if (typeof globalThis !== 'undefined') {
  globalThis.md2docxChildren = md2docxChildren;
}
