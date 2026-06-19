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

    // Matrix / aligned environments: render raw LaTeX as single MathRun
    if (cmd === 'begin') {
      var env = parseBraceText(tokens, pos);
      // Reconstruct full LaTeX from remaining tokens until matching \end
      var raw = '\\begin{' + env + '}';
      var d = 1;
      while (pos.i < tokens.length && d > 0) {
        var tk = tokens[pos.i];
        if (tk.t === TOK_CMD && tk.v === 'begin') { d++; raw += '\\begin{'; pos.i++; raw += parseBraceText(tokens, pos) + '}'; }
        else if (tk.t === TOK_CMD && tk.v === 'end') { d--; if (d > 0) { raw += '\\end{'; pos.i++; raw += parseBraceText(tokens, pos) + '}'; } else { pos.i++; var endName = parseBraceText(tokens, pos); raw += '\\end{' + endName + '}'; } }
        else if (tk.t === TOK_TEXT) { raw += tk.v; pos.i++; }
        else if (tk.t === TOK_CMD) { raw += '\\' + tk.v; pos.i++; }
        else if (tk.t === TOK_LBRACE) { raw += '{'; pos.i++; }
        else if (tk.t === TOK_RBRACE) { raw += '}'; pos.i++; }
        else if (tk.t === TOK_SUB) { raw += '_'; pos.i++; }
        else if (tk.t === TOK_SUP) { raw += '^'; pos.i++; }
        else if (tk.t === TOK_EOF) break;
        else { pos.i++; }
      }
      return new docx.MathRun(raw);
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
