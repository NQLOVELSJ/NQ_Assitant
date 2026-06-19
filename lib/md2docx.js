/**
 * md2docx.js - Markdown to docx via marked.lexer() AST
 * Supports editable OMML math equations via latex2omml.js
 * Depends: docx.bundle.js, marked (global), latex2omml.js
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

function md2docxChildren(markdown, opts) {
  _exportOpts = opts || null;
  if (!markdown) return Promise.resolve([new docx.Paragraph({ children: [tr('')] })]);

  var tokens;
  try {
    tokens = typeof marked !== 'undefined' ? marked.lexer(markdown) : null;
  } catch(e) { tokens = null; }

  if (!tokens || !tokens.length) {
    return Promise.resolve(markdown.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: parseInline(line) });
    }));
  }

  try {
    return Promise.resolve(tokensToDocx(tokens));
  } catch(e) {
    return Promise.resolve(markdown.split('\n').map(function(line) {
      return new docx.Paragraph({ spacing: { after: 120 }, children: parseInline(line) });
    }));
  }
}

function tokensToDocx(tokens) {
  var children = [];
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
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
        children.push(codeBlockParagraph(t.text));
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
        t.items.forEach(function(item, idx) {
          children.push(new docx.Paragraph({
            bullet: { level: 0 },
            spacing: { after: 40 },
            children: tokensToRuns(item.tokens)
          }));
        });
        break;
      case 'table':
        children.push(buildTable(t));
        break;
      case 'space':
        break;
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

function buildTable(t) {
  var allRows = [];
  var aligns = t.align || [];
  var maxCols = Math.max(t.header.length, (t.rows[0] || []).length);

  // Header
  allRows.push(t.header.map(function(cell, ci) {
    return new docx.TableCell({
      width: { size: Math.floor(9000 / maxCols), type: docx.WidthType.DXA },
      shading: { type: docx.ShadingType.SOLID, color: 'E8E8E8', fill: 'E8E8E8' },
      children: [new docx.Paragraph({ children: tokensToRuns(cell.tokens) })]
    });
  }));

  // Body
  t.rows.forEach(function(row) {
    var cells = row.map(function(cell, ci) {
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

/** Convert inline tokens to docx runs */
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

/** Parse text for inline math $...$ and \(...\) → Math OMML */
function pushTextWithMath(runs, text, _fmt) {
  if (!text) return;
  var fmt = _fmt || {};
  var pos = 0;
  var tlen = text.length;
  // Helper: create TextRun respecting template + inline formatting
  function t(text, extra) {
    var o = {};
    for (var k in fmt) { if (fmt.hasOwnProperty(k)) o[k] = fmt[k]; }
    if (extra) { for (var ek in extra) { if (extra.hasOwnProperty(ek)) o[ek] = extra[ek]; } }
    return tr(text, o);
  }

  while (pos < tlen) {
    var remaining = text.substring(pos);

    if (remaining.indexOf('$$') === 0) {
      var closeIdx = remaining.indexOf('$$', 2);
      if (closeIdx > 2) {
        var latex = remaining.substring(2, closeIdx).trim();
        if (latex.length > 0 && /[\\\^_{}]/.test(latex)) {
          try {
            if (typeof latex2docx === 'function') {
              var mc2 = latex2docx(latex);
              if (mc2 && mc2.length > 0) { runs.push(new docx.Math({ children: mc2 })); pos += closeIdx + 2; continue; }
            }
          } catch(e) {}
        }
      }
      runs.push(t(remaining.substring(0, 2)));
      pos += 2;
      continue;
    }

    var imMatch = remaining.match(/\$([^$\n]{1,500}?)\$/);
    if (imMatch) {
      var imIdx = imMatch.index;
      var inner = imMatch[1].trim();
      var hasMath = /[\\\^_{}]/.test(inner);
      if (hasMath) {
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
      if (imIdx === 0) {
        runs.push(t(imMatch[0]));
        pos += imMatch[0].length;
        continue;
      }
    }

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

    var nextDollar = remaining.indexOf('$');
    var nextParen = remaining.indexOf('\\(');
    if (nextDollar === -1 && nextParen === -1) { runs.push(t(remaining)); break; }
    var nextMath = nextDollar === -1 ? nextParen : nextParen === -1 ? nextDollar : Math.min(nextDollar, nextParen);
    if (nextMath > 0) {
      runs.push(t(remaining.substring(0, nextMath)));
    }
    if (nextDollar === nextMath && remaining.charAt(nextMath + 1) === '$') {
      runs.push(t('$'));
      pos += nextMath + 1;
    } else {
      runs.push(t(remaining.charAt(nextMath)));
      pos += nextMath + 1;
    }
  }
}

/** Find block math $$...$$ in tokens (marked doesn't natively parse them).
 *  Walk tokens and replace any paragraph-level $$...$$ with a Math OMML paragraph. */
function parseInline(text) {
  if (!text) return [tr('')];
  var runs = [];
  pushTextWithMath(runs, text, {});
  if (runs.length === 0) runs.push(tr(''));
  return runs;
}

function codeBlockParagraph(code) {
  var lines = code.split('\n');
  var runs = [];
  lines.forEach(function(cl, idx) {
    if (idx > 0) runs.push(tr('', { break: 1 }));
    runs.push(new docx.TextRun({ text: cl, font: 'Consolas', size: 18 }));
  });
  return new docx.Paragraph({ spacing: { before: 100, after: 100 }, shading: { type: docx.ShadingType.SOLID, color: 'F5F5F5', fill: 'F5F5F5' }, children: runs });
}

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
