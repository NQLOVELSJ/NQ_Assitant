/**
 * latex2omml.js - LaTeX math to docx OMML (Office Math) converter
 * Generates editable Word equations via the docx Math API
 * Depends: global docx (docx.bundle.js)
 */
'use strict';

var GREEK = {
  alpha:'α',beta:'β',gamma:'γ',delta:'δ',epsilon:'ϵ',varepsilon:'ε',
  zeta:'ζ',eta:'η',theta:'θ',vartheta:'ϑ',iota:'ι',kappa:'κ',
  lambda:'λ',mu:'μ',nu:'ν',xi:'ξ',pi:'π',varpi:'ϖ',rho:'ρ',
  varrho:'ϱ',sigma:'σ',varsigma:'ς',tau:'τ',upsilon:'υ',phi:'ϕ',
  varphi:'φ',chi:'χ',psi:'ψ',omega:'ω',
  Gamma:'Γ',Delta:'Δ',Theta:'Θ',Lambda:'Λ',Xi:'Ξ',Pi:'Π',
  Sigma:'Σ',Upsilon:'Υ',Phi:'Φ',Psi:'Ψ',Omega:'Ω'
};

var SYMBOLS = {
  infty:'∞',pm:'±',mp:'∓',times:'×',div:'÷',cdot:'⋅',bullet:'∙',
  leq:'≤',geq:'≥',neq:'≠',approx:'≈',equiv:'≡',propto:'∝',
  sim:'∼',simeq:'≃',cong:'≅',
  subset:'⊂',supset:'⊃',subseteq:'⊆',supseteq:'⊇',
  in:'∈',notin:'∉',ni:'∋',forall:'∀',exists:'∃',
  emptyset:'∅',varnothing:'∅',
  partial:'∂',nabla:'∇',
  land:'∧',lor:'∨',lnot:'¬',neg:'¬',
  to:'→',rightarrow:'→',Rightarrow:'⇒',longrightarrow:'⟶',
  leftarrow:'←',Leftarrow:'⇐',
  leftrightarrow:'↔',Leftrightarrow:'⇔',
  mapsto:'↦',mapsto:'↦',
  langle:'⟨',rangle:'⟩',
  lceil:'⌈',rceil:'⌉',lfloor:'⌊',rfloor:'⌋',
  Vert:'‖','|':'|',
  dots:'…',cdots:'⋯',ldots:'…',vdots:'⋮',ddots:'⋱',
  prime:'′',ell:'ℓ',hbar:'ℏ',Im:'ℑ',Re:'ℜ',
  aleph:'ℵ',wp:'℘',
  circ:'∘',bigcirc:'○',star:'⋆',ast:'∗',
  cap:'∩',cup:'∪',setminus:'∖',
  perp:'⊥',models:'⊨',mid:'∣',
  triangle:'△',triangledown:'▽',
  square:'□',diamond:'◇',
  dagger:'†',ddagger:'‡',
  sum:'∑',prod:'∏',coprod:'∐',int:'∫',iint:'∬',iiint:'∭',oint:'∮',
  oplus:'⊕',ominus:'⊖',otimes:'⊗',oslash:'⊘',odot:'⊙',
  bigoplus:'⊕',bigotimes:'⊗',bigodot:'⊙',biguplus:'⊎',bigsqcup:'⊔',
  bigvee:'⋁',bigwedge:'⋀',bigcap:'⋂',bigcup:'⋃'
};

var FUNCTIONS = {
  sin:1, cos:1, tan:1, cot:1, sec:1, csc:1,
  arcsin:1, arccos:1, arctan:1,
  sinh:1, cosh:1, tanh:1, coth:1,
  log:1, lg:1, ln:1,
  exp:1, det:1, gcd:1, deg:1,
  hom:1, ker:1, Pr:1, arg:1, dim:1,
  lim:1, limsup:1, liminf:1, max:1, min:1, sup:1, inf:1
};

var NARY_OPS = { sum:1, prod:1, coprod:1, int:1, iint:1, iiint:1, oint:1, oplus:1, ominus:1, otimes:1, oslash:1, odot:1, bigoplus:1, bigotimes:1, bigodot:1, biguplus:1, bigsqcup:1, bigvee:1, bigwedge:1, bigcap:1, bigcup:1 };

var ACCENTS = { hat:'^', check:'̌', acute:'́', grave:'̀', breve:'˘', bar:'̄', vec:'⃗', tilde:'̃', dot:'̇', ddot:'̈', dddot:'⃛', ddddot:'⃜' };

// Token types
var TOK_LBRACE = 1, TOK_RBRACE = 2, TOK_SUB = 3, TOK_SUP = 4, TOK_CMD = 5, TOK_TEXT = 6, TOK_EOF = 7;

// Helper: attribute with namespace prefix (e.g. { 'm:val': '2' })
function B(name, attrs, children) {
  return new docx.BuilderElement({ name: name, attributes: attrs, children: children || [] });
}

function tokenize(latex) {
  var tokens = [];
  var i = 0;
  while (i < latex.length) {
    var ch = latex[i];
    if (ch === '{') { tokens.push({ t: TOK_LBRACE }); i++; }
    else if (ch === '}') { tokens.push({ t: TOK_RBRACE }); i++; }
    else if (ch === '_') { tokens.push({ t: TOK_SUB }); i++; }
    else if (ch === '^') { tokens.push({ t: TOK_SUP }); i++; }
    else if (ch === '\\') {
      i++;
      var cmd = '';
      while (i < latex.length && /[a-zA-Z]/.test(latex[i])) { cmd += latex[i]; i++; }
      if (cmd) { tokens.push({ t: TOK_CMD, v: cmd }); }
      else { tokens.push({ t: TOK_TEXT, v: '\\' }); }
    }
    else if (/\s/.test(ch)) { i++; }
    else {
      var txt = '';
      while (i < latex.length && !/[\\{}_^\s]/.test(latex[i])) { txt += latex[i]; i++; }
      if (txt) tokens.push({ t: TOK_TEXT, v: txt });
    }
  }
  tokens.push({ t: TOK_EOF });
  return tokens;
}

function latex2docx(latex) {
  if (!latex) return [new docx.MathRun('')];
  var tokens = tokenize(latex);
  var pos = { i: 0 };
  return parseExpression(tokens, pos);
}

function parseExpression(tokens, pos) {
  var result = [];
  while (pos.i < tokens.length && tokens[pos.i].t !== TOK_EOF && tokens[pos.i].t !== TOK_RBRACE) {
    var term = parseTerm(tokens, pos);
    if (term) result.push.apply(result, Array.isArray(term) ? term : [term]);
  }
  return result;
}

function parseTerm(tokens, pos) {
  var tok = tokens[pos.i];
  if (!tok || tok.t === TOK_EOF || tok.t === TOK_RBRACE) return null;

  if (tok.t === TOK_LBRACE) {
    pos.i++;
    var inner = parseExpression(tokens, pos);
    if (tokens[pos.i] && tokens[pos.i].t === TOK_RBRACE) pos.i++;
    return inner;
  }

  if (tok.t === TOK_TEXT) {
    pos.i++;
    return new docx.MathRun(tok.v);
  }

  if (tok.t === TOK_CMD) {
    var cmd = tok.v;
    pos.i++;

    // \frac{num}{den}
    if (cmd === 'frac') {
      var num = parseBraceArg(tokens, pos);
      var den = parseBraceArg(tokens, pos);
      return new docx.MathFraction({ numerator: num, denominator: den });
    }

    // \sqrt[n]{content}
    if (cmd === 'sqrt') {
      var deg = null;
      if (tokens[pos.i] && tokens[pos.i].t === TOK_LBRACE && tokens[pos.i + 1] && tokens[pos.i + 1].t === TOK_LBRACE) {
        pos.i++;
        deg = parseExpression(tokens, pos);
        if (tokens[pos.i] && tokens[pos.i].t === TOK_RBRACE) pos.i++;
      }
      // if next is [n] syntax
      var content = parseBraceArg(tokens, pos);
      return new docx.MathRadical({ children: content, degree: deg || [] });
    }

    // N-ary operators: \sum, \prod, \int, etc.
    if (NARY_OPS[cmd]) {
      var subScr = null, supScr = null;
      // Parse optional _ and ^ limits
      if (tokens[pos.i] && tokens[pos.i].t === TOK_SUB) {
        pos.i++;
        subScr = parseBraceOrToken(tokens, pos);
      }
      if (tokens[pos.i] && tokens[pos.i].t === TOK_SUP) {
        pos.i++;
        supScr = parseBraceOrToken(tokens, pos);
      }
      var naryChildren = parseExpression(tokens, pos);
      if (cmd === 'int' || cmd === 'iint' || cmd === 'iiint' || cmd === 'oint') {
        return new docx.MathIntegral({
          children: [new docx.MathRun(SYMBOLS[cmd] || '∫')].concat(naryChildren),
          subScript: subScr || [],
          superScript: supScr || []
        });
      }
      return new docx.MathSum({
        children: [new docx.MathRun(SYMBOLS[cmd] || '∑')].concat(naryChildren),
        subScript: subScr || [],
        superScript: supScr || []
      });
    }

    // \lim, \limsup, \liminf, \max, \min, \sup, \inf
    if (cmd === 'lim' || cmd === 'limsup' || cmd === 'liminf' || cmd === 'max' || cmd === 'min' || cmd === 'sup' || cmd === 'inf') {
      var limitBody = [new docx.MathRun(cmd)];
      var limitLow = null;
      if (tokens[pos.i] && tokens[pos.i].t === TOK_SUB) {
        pos.i++;
        limitLow = parseBraceOrToken(tokens, pos);
      }
      if (tokens[pos.i] && tokens[pos.i].t === TOK_SUP) {
        var limitHigh = null;
        pos.i++;
        limitHigh = parseBraceOrToken(tokens, pos);
        if (limitHigh && limitHigh.length) {
          if (limitLow) {
            return new docx.MathLimitLower({ children: [new docx.MathRun(cmd)], limit: limitLow });
          }
          return new docx.MathLimitUpper({ children: [new docx.MathRun(cmd)], limit: limitHigh });
        }
      }
      if (limitLow && limitLow.length) {
        return new docx.MathLimitLower({ children: [new docx.MathRun(cmd)], limit: limitLow });
      }
      return new docx.MathFunction({ name: [new docx.MathRun(cmd)], children: parseExpression(tokens, pos) });
    }

    // \text{...}
    if (cmd === 'text') {
      return new docx.MathRun(parseBraceText(tokens, pos));
    }

    // Script-style functions: \sin, \cos, etc.
    if (FUNCTIONS[cmd]) {
      return new docx.MathFunction({ name: [new docx.MathRun(cmd)], children: parseExpression(tokens, pos) });
    }

    // Brackets
    if (cmd === 'left') {
      // Skip \left delimiter
      if (tokens[pos.i] && tokens[pos.i].t === TOK_TEXT) pos.i++; // skip delimiter
      var bContent = parseExpression(tokens, pos);
      // Skip \right delimiter
      if (tokens[pos.i] && tokens[pos.i].t === TOK_CMD && tokens[pos.i].v === 'right') {
        pos.i++;
        if (tokens[pos.i] && tokens[pos.i].t === TOK_TEXT) pos.i++;
      }
      return [new docx.MathRoundBrackets({ children: bContent })];
    }

    // \left( ... \right)
    // Already handled above generically

    // \overline, \underline
    if (cmd === 'overline') {
      var ovContent = parseBraceArg(tokens, pos);
      return [new docx.MathRun('̅')].concat(ovContent);
    }
    if (cmd === 'underline') {
      var ulContent = parseBraceArg(tokens, pos);
      return [new docx.MathRun('̲')].concat(ulContent);
    }

    // Accents
    if (ACCENTS[cmd]) {
      var accChar = ACCENTS[cmd];
      var accContent = parseBraceOrToken(tokens, pos);
      if (accContent && accContent.length > 0) {
        return [new docx.MathRun(accChar)].concat(accContent);
      }
      return new docx.MathRun('\\' + cmd);
    }

    // Greek letters
    if (GREEK[cmd]) {
      return new docx.MathRun(GREEK[cmd]);
    }

    // Symbols
    if (SYMBOLS[cmd]) {
      return new docx.MathRun(SYMBOLS[cmd]);
    }

    // Matrix environments: parse cells and build OMML m:m element
    if (cmd === 'begin') {
      var env = parseBraceText(tokens, pos);
      var isMat = /^(p|b|B|v|V)?matrix$/.test(env);
      if (isMat) {

        // Parse rows until \end{env}
        var rows = [];
        var curRow = [];
        while (pos.i < tokens.length) {
          var tk = tokens[pos.i];
          if (!tk || tk.t === TOK_EOF) break;
          if (tk.t === TOK_CMD && tk.v === 'end') {
            pos.i++;
            var eName = parseBraceText(tokens, pos);
            if (eName === env) { if (curRow.length > 0) rows.push(curRow); break; }
            continue;
          }
          // \\ linebreak: tokenizer produces two consecutive TOK_TEXT(v='\\') for \\
          if (tk.t === TOK_TEXT && tk.v === '\\') {
            pos.i++;
            // Consume consecutive backslash text tokens (\\\\ → two \\ pairs)
            while (pos.i < tokens.length && tokens[pos.i].t === TOK_TEXT && tokens[pos.i].v === '\\') { pos.i++; }
            rows.push(curRow); curRow = []; continue;
          }
          // & (column separator): tokenizer produces TOK_TEXT(v='&')
          if (tk.t === TOK_TEXT && tk.v === '&') { pos.i++; curRow.push([]); continue; }
          // Parse one cell
          var cellChildren = [];
          while (pos.i < tokens.length) {
            var ct = tokens[pos.i];
            if (!ct || ct.t === TOK_EOF) break;
            if (ct.t === TOK_CMD && ct.v === 'end') break;
            if (ct.t === TOK_TEXT && (ct.v === '&' || ct.v === '\\')) break;
            var term = parseTerm(tokens, pos);
            if (term) cellChildren.push.apply(cellChildren, Array.isArray(term) ? term : [term]);
            else break;
          }
          curRow.push(cellChildren);
        }

        // Build OMML matrix via BuilderElement
        var nCols = 0;
        for (var ri = 0; ri < rows.length; ri++) { if (rows[ri].length > nCols) nCols = rows[ri].length; }

        var mcEl = B('m:mc', null, [
          B('m:mcPr', null, [
            B('m:count', { 'm:val': String(nCols) }),
            B('m:mcJc', { 'm:val': 'center' })
          ])
        ]);
        var mcsEl = B('m:mcs', null, [mcEl]);
        var mprEl = B('m:mPr', null, [mcsEl]);

        var mrChildren = [];
        for (var ri2 = 0; ri2 < rows.length; ri2++) {
          var meChildren = [];
          for (var ci = 0; ci < nCols; ci++) {
            var cellContent = (ci < rows[ri2].length && rows[ri2][ci].length > 0)
              ? rows[ri2][ci]
              : [new docx.MathRun('')];
            meChildren.push(B('m:e', null, cellContent));
          }
          mrChildren.push(B('m:mr', null, meChildren));
        }
        var mEl = B('m:m', null, [mprEl].concat(mrChildren));

        // Wrap in bracket delimiter using docx library classes
        if (env === 'pmatrix') {
          return [new docx.MathRoundBrackets({ children: [mEl] })];
        } else if (env === 'bmatrix') {
          return [new docx.MathSquareBrackets({ children: [mEl] })];
        } else if (env === 'Bmatrix') {
          return [new docx.MathCurlyBrackets({ children: [mEl] })];
        } else if (env === 'matrix') {
          return [mEl]; // no brackets
        } else {
          // vmatrix / Vmatrix: pipe delimiters via BuilderElement
          var ch = (env === 'Vmatrix') ? '\u2016' : '|';
          var dPrChildren = [
            B('m:begChr', { character: { key: 'm:val', value: ch } }),
            B('m:endChr', { character: { key: 'm:val', value: ch } })
          ];
          var dEl = B('m:d', null, [
            B('m:dPr', null, dPrChildren),
            B('m:e', null, [mEl])
          ]);
          return [dEl];
        }
      }

      // Unknown env: skip to matching \end
      var depth = 1;
      while (pos.i < tokens.length && depth > 0) {
        var t2 = tokens[pos.i];
        if (t2.t === TOK_CMD && t2.v === 'begin') { depth++; pos.i++; parseBraceText(tokens, pos); }
        else if (t2.t === TOK_CMD && t2.v === 'end') { depth--; if (depth > 0) { pos.i++; parseBraceText(tokens, pos); } else { pos.i++; parseBraceText(tokens, pos); } }
        else { pos.i++; }
      }
      return new docx.MathRun('[' + env + ']');
    }
    if (cmd === 'end') {
      parseBraceText(tokens, pos);
      return new docx.MathRun('');
    }

    // Unknown commands — render as LaTeX verbatim in MathRun
    return new docx.MathRun('\\' + cmd);
  }

  // Subscript _
  if (tok.t === TOK_SUB) {
    pos.i++;
    return new docx.MathRun('_');
  }

  // Superscript ^
  if (tok.t === TOK_SUP) {
    pos.i++;
    return new docx.MathRun('^');
  }

  pos.i++;
  return null;
}

function parseBraceArg(tokens, pos) {
  if (tokens[pos.i] && tokens[pos.i].t === TOK_LBRACE) {
    pos.i++;
    var result = parseExpression(tokens, pos);
    if (tokens[pos.i] && tokens[pos.i].t === TOK_RBRACE) pos.i++;
    return result;
  }
  var term = parseTerm(tokens, pos);
  return term ? (Array.isArray(term) ? term : [term]) : [new docx.MathRun('')];
}

function parseBraceOrToken(tokens, pos) {
  return parseBraceArg(tokens, pos);
}

function parseBraceText(tokens, pos) {
  if (tokens[pos.i] && tokens[pos.i].t === TOK_LBRACE) {
    pos.i++;
    var text = '';
    while (pos.i < tokens.length && tokens[pos.i].t !== TOK_RBRACE && tokens[pos.i].t !== TOK_EOF) {
      text += tokens[pos.i].v || '';
      pos.i++;
    }
    if (tokens[pos.i] && tokens[pos.i].t === TOK_RBRACE) pos.i++;
    return text;
  }
  return '';
}

if (typeof window !== 'undefined') {
  window.latex2docx = latex2docx;
}
if (typeof globalThis !== 'undefined') {
  globalThis.latex2docx = latex2docx;
}
