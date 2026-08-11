#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/date.js
var DATE_TIME_RE, TomlDate;
var init_date = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/date.js"() {
    DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
    TomlDate = class _TomlDate extends Date {
      #hasDate = false;
      #hasTime = false;
      #offset = null;
      constructor(date) {
        let hasDate = true;
        let hasTime = true;
        let offset = "Z";
        if (typeof date === "string") {
          let match = date.match(DATE_TIME_RE);
          if (match) {
            if (!match[1]) {
              hasDate = false;
              date = `0000-01-01T${date}`;
            }
            hasTime = !!match[2];
            hasTime && date[10] === " " && (date = date.replace(" ", "T"));
            if (match[2] && +match[2] > 23) {
              date = "";
            } else {
              offset = match[3] || null;
              date = date.toUpperCase();
              if (!offset && hasTime)
                date += "Z";
            }
          } else {
            date = "";
          }
        }
        super(date);
        if (!isNaN(this.getTime())) {
          this.#hasDate = hasDate;
          this.#hasTime = hasTime;
          this.#offset = offset;
        }
      }
      isDateTime() {
        return this.#hasDate && this.#hasTime;
      }
      isLocal() {
        return !this.#hasDate || !this.#hasTime || !this.#offset;
      }
      isDate() {
        return this.#hasDate && !this.#hasTime;
      }
      isTime() {
        return this.#hasTime && !this.#hasDate;
      }
      isValid() {
        return this.#hasDate || this.#hasTime;
      }
      toISOString() {
        let iso = super.toISOString();
        if (this.isDate())
          return iso.slice(0, 10);
        if (this.isTime())
          return iso.slice(11, 23);
        if (this.#offset === null)
          return iso.slice(0, -1);
        if (this.#offset === "Z")
          return iso;
        let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
        offset = this.#offset[0] === "-" ? offset : -offset;
        let offsetDate = new Date(this.getTime() - offset * 6e4);
        return offsetDate.toISOString().slice(0, -1) + this.#offset;
      }
      static wrapAsOffsetDateTime(jsDate, offset = "Z") {
        let date = new _TomlDate(jsDate);
        date.#offset = offset;
        return date;
      }
      static wrapAsLocalDateTime(jsDate) {
        let date = new _TomlDate(jsDate);
        date.#offset = null;
        return date;
      }
      static wrapAsLocalDate(jsDate) {
        let date = new _TomlDate(jsDate);
        date.#hasTime = false;
        date.#offset = null;
        return date;
      }
      static wrapAsLocalTime(jsDate) {
        let date = new _TomlDate(jsDate);
        date.#hasDate = false;
        date.#offset = null;
        return date;
      }
    };
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError;
var init_error = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/error.js"() {
    TomlError = class extends Error {
      line;
      column;
      codeblock;
      constructor(message, options) {
        const [line, column] = getLineColFromPtr(options.toml, options.ptr);
        const codeblock = makeCodeBlock(options.toml, line, column);
        super(`Invalid TOML document: ${message}

${codeblock}`, options);
        this.line = line;
        this.column = column;
        this.codeblock = codeblock;
      }
    };
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/primitive.js
function parseString(str, ptr) {
  let c = str[ptr++];
  let first = c;
  let isLiteral = c === "'";
  let isMultiline = c === str[ptr] && c === str[ptr + 1];
  if (isMultiline) {
    if (str[ptr += 2] === "\n")
      ptr++;
    else if (str[ptr] === "\r" && str[ptr + 1] === "\n")
      ptr += 2;
  }
  let parsed = "";
  let sliceStart = ptr;
  let state = 0;
  for (let i = ptr; i < str.length; i++) {
    c = str[i];
    if (isMultiline && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      state = state && 3;
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: i
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || str[i + 1] === first && str[i + 2] === first)) {
      if (isMultiline) {
        if (str[i + 3] === first)
          i++;
        if (str[i + 3] === first)
          i++;
      }
      return [
        // If we're in a newline escape still, then there's nothing to add.
        // Also try to avoid concat if there's nothing to add to parsed, or nothing has been added to parsed.
        state ? parsed : parsed + str.slice(sliceStart, i),
        i + (isMultiline ? 3 : 1)
      ];
    } else if (!state) {
      if (!isLiteral && c === "\\") {
        parsed += str.slice(sliceStart, sliceStart = i);
        state = 1;
      }
    } else if (state === 1) {
      if (c === "x" || c === "u" || c === "U") {
        let value = 0;
        let len = c === "x" ? 2 : c === "u" ? 4 : 8;
        for (let j = 0; j < len; j++, i++) {
          let hex = str.charCodeAt(i + 1);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: str, ptr: i + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: str, ptr: i });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = i + 1;
        state = 0;
      } else if (c === " " || c === "	") {
        state = 2;
      } else {
        if (c === "b")
          parsed += "\b";
        else if (c === "t")
          parsed += "	";
        else if (c === "n")
          parsed += "\n";
        else if (c === "f")
          parsed += "\f";
        else if (c === "r")
          parsed += "\r";
        else if (c === "e")
          parsed += "\x1B";
        else if (c === '"')
          parsed += '"';
        else if (c === "\\")
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: str, ptr: i });
        sliceStart = i + 1;
        state = 0;
      }
    } else if (c !== " " && c !== "	") {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: str,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === "\\" ? 1 : 0;
      sliceStart = i;
    }
  }
  throw new TomlError("unfinished string", { toml: str, ptr });
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}
var INT_REGEX, FLOAT_REGEX, LEADING_ZERO;
var init_primitive = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/primitive.js"() {
    init_date();
    init_error();
    INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
    FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
    LEADING_ZERO = /^[+-]?0[0-9_]/;
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while (1) {
    while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
      ptr++;
    if (banComments || c !== "#")
      break;
    ptr = skipComment(str, ptr);
  }
  return ptr;
}
function skipUntil(str, ptr, sep2, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
      if (i < 0)
        break;
    } else if (c === sep2) {
      return i + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}
var init_util = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/util.js"() {
    init_error();
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  if (c === '"' || c === "'") {
    let [parsed, endPtr2] = parseString(str, ptr);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] && str[endPtr2] !== "," && str[endPtr2] !== end && str[endPtr2] !== "\n" && str[endPtr2] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr2
        });
      }
      if (str[endPtr2] === ",")
        endPtr2++;
    }
    return [parsed, endPtr2];
  }
  let endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - (str[endPtr - 1] === "," ? 1 : 0));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    if (str[endPtr] === ",")
      endPtr++;
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}
var init_extract = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/extract.js"() {
    init_primitive();
    init_struct();
    init_util();
    init_error();
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/struct.js
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let [part, eos] = parseString(str, ptr);
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(part);
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
var KEY_PART_RE;
var init_struct = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/struct.js"() {
    init_primitive();
    init_extract();
    init_util();
    init_error();
    KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}
var init_parse = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/parse.js"() {
    init_struct();
    init_extract();
    init_util();
    init_error();
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/stringify.js
var init_stringify = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/stringify.js"() {
  }
});

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/index.js
var init_dist = __esm({
  "node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/index.js"() {
    init_parse();
    init_stringify();
    init_date();
    init_error();
  }
});

// packages/wanwu-config/src/load.ts
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function parseOverlay(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }
  const obj = raw;
  const providersRaw = obj.providers;
  const providers = {};
  if (providersRaw && typeof providersRaw === "object") {
    for (const [key, value] of Object.entries(providersRaw)) {
      if (!value || typeof value !== "object") continue;
      const p = value;
      providers[key] = {
        apiKeyEnv: asString(p.api_key_env) ?? asString(p.apiKeyEnv),
        baseUrl: asString(p.base_url) ?? asString(p.baseUrl),
        defaultModel: asString(p.default_model) ?? asString(p.defaultModel)
      };
    }
  }
  return {
    activeProvider: asString(obj.active_provider) ?? asString(obj.activeProvider),
    model: asString(obj.model),
    permissionMode: asString(obj.permission_mode) ?? asString(obj.permissionMode),
    sandbox: asString(obj.sandbox),
    acpBackend: asString(obj.acp_backend) ?? asString(obj.acpBackend),
    defaultMode: asString(obj.default_mode) ?? asString(obj.defaultMode),
    providers: Object.keys(providers).length > 0 ? providers : void 0
  };
}
function loadTomlFile(path) {
  if (!existsSync(path)) {
    return void 0;
  }
  const text = readFileSync(path, "utf8");
  const parsed = parse(text);
  return parseOverlay(parsed);
}
function loadWanwuConfig(cwd = process.cwd()) {
  const sources = ["defaults"];
  let config = mergeConfig(DEFAULT_CONFIG, void 0);
  const userPath = join(homedir(), ".wanwu", "config.toml");
  const userOverlay = loadTomlFile(userPath);
  if (userOverlay) {
    config = mergeConfig(config, userOverlay);
    sources.push(userPath);
  }
  const workspacePath = join(cwd, ".wanwu", "settings.toml");
  const workspaceOverlay = loadTomlFile(workspacePath);
  if (workspaceOverlay) {
    config = mergeConfig(config, workspaceOverlay);
    sources.push(workspacePath);
  }
  return { config, sources };
}
function userConfigPath() {
  return join(homedir(), ".wanwu", "config.toml");
}
var init_load = __esm({
  "packages/wanwu-config/src/load.ts"() {
    "use strict";
    init_dist();
    init_src();
  }
});

// packages/wanwu-config/src/index.ts
function mergeConfig(base, overlay) {
  if (!overlay) {
    return { ...base, providers: { ...base.providers } };
  }
  return {
    activeProvider: overlay.activeProvider ?? base.activeProvider,
    model: overlay.model ?? base.model,
    permissionMode: overlay.permissionMode ?? base.permissionMode,
    sandbox: overlay.sandbox ?? base.sandbox,
    acpBackend: overlay.acpBackend ?? base.acpBackend,
    defaultMode: overlay.defaultMode ?? base.defaultMode,
    providers: {
      ...base.providers,
      ...overlay.providers
    }
  };
}
function listConfiguredProviders(config) {
  return Object.keys(config.providers).sort();
}
var DEFAULT_CONFIG;
var init_src = __esm({
  "packages/wanwu-config/src/index.ts"() {
    "use strict";
    init_load();
    DEFAULT_CONFIG = {
      activeProvider: "openai",
      model: "gpt-5",
      permissionMode: "ask",
      sandbox: "workspace",
      acpBackend: "wanwu-native",
      defaultMode: "agent",
      providers: {
        xai: { apiKeyEnv: "XAI_API_KEY", defaultModel: "grok-4" },
        openai: { apiKeyEnv: "OPENAI_API_KEY", defaultModel: "gpt-5" },
        anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", defaultModel: "claude-sonnet-4" },
        ollama: { baseUrl: "http://127.0.0.1:11434", defaultModel: "llama3.2" },
        custom: { apiKeyEnv: "WANWU_API_KEY", baseUrl: "" }
      }
    };
  }
});

// packages/wanwu-cli/src/workspaceRoot.ts
import { existsSync as existsSync2 } from "node:fs";
import { dirname, join as join2 } from "node:path";
function findWorkspaceRoot(start = process.env.WANWU_WORKDIR || process.cwd()) {
  let dir = start;
  for (; ; ) {
    if (existsSync2(join2(dir, "pnpm-workspace.yaml")) || existsSync2(join2(dir, "WANWU.md")) || existsSync2(join2(dir, ".git"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return start;
    }
    dir = parent;
  }
}
var init_workspaceRoot = __esm({
  "packages/wanwu-cli/src/workspaceRoot.ts"() {
    "use strict";
  }
});

// packages/wanwu-cli/src/memory.ts
import { existsSync as existsSync3, readFileSync as readFileSync2 } from "node:fs";
import { join as join3 } from "node:path";
function discoverMemory(cwd = process.cwd()) {
  const found = [];
  for (const name of CANDIDATES) {
    const path = join3(cwd, name);
    if (!existsSync3(path)) continue;
    const text = readFileSync2(path, "utf8");
    found.push({
      path,
      kind: name,
      preview: text.split("\n").slice(0, 8).join("\n")
    });
  }
  return found;
}
function renderMemoryForPrompt(files) {
  if (files.length === 0) {
    return "";
  }
  return files.map((f) => `# Memory from ${f.kind}

${readFileSync2(f.path, "utf8").trim()}`).join("\n\n---\n\n");
}
var CANDIDATES;
var init_memory = __esm({
  "packages/wanwu-cli/src/memory.ts"() {
    "use strict";
    CANDIDATES = ["WANWU.md", "AGENTS.md", "CLAUDE.md"];
  }
});

// packages/wanwu-cli/src/native/jsonRpcStdio.ts
function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}
`);
}
function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
function sessionUpdate(sessionId, update) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update }
  });
}
var init_jsonRpcStdio = __esm({
  "packages/wanwu-cli/src/native/jsonRpcStdio.ts"() {
    "use strict";
  }
});

// packages/wanwu-cli/src/permission.ts
function assessBash(command, mode = "ask") {
  const cmd = command.trim();
  for (const p of DENY_PATTERNS) {
    if (p.re.test(cmd)) {
      return { allow: false, risk: "high", reason: p.reason, requiresPrompt: false };
    }
  }
  for (const p of HIGH_PATTERNS) {
    if (p.re.test(cmd)) {
      if (mode === "accept-all") {
        return { allow: true, risk: "high", reason: p.reason, requiresPrompt: false };
      }
      return { allow: false, risk: "high", reason: p.reason, requiresPrompt: true };
    }
  }
  for (const p of MEDIUM_PATTERNS) {
    if (p.re.test(cmd)) {
      if (mode === "accept-all" || mode === "accept-edits") {
        return { allow: true, risk: "medium", reason: p.reason, requiresPrompt: false };
      }
      return { allow: false, risk: "medium", reason: p.reason, requiresPrompt: true };
    }
  }
  return { allow: true, risk: "low", reason: "default allow", requiresPrompt: false };
}
var DENY_PATTERNS, HIGH_PATTERNS, MEDIUM_PATTERNS;
var init_permission = __esm({
  "packages/wanwu-cli/src/permission.ts"() {
    "use strict";
    DENY_PATTERNS = [
      { re: /rm\s+-rf\s+\/(?!\s|$)/i, reason: "destructive rm -rf on filesystem root-like path" },
      { re: /rm\s+-rf\s+~\/\.ssh/i, reason: "refuses to delete ~/.ssh" },
      { re: /cat\s+~\/\.ssh\//i, reason: "refuses to read private SSH keys" },
      { re: /cat\s+\/etc\/shadow/i, reason: "refuses to read /etc/shadow" },
      { re: /curl\s+[^\n]*\|\s*(ba)?sh/i, reason: "pipe-to-shell download blocked" },
      { re: /wget\s+[^\n]*\|\s*(ba)?sh/i, reason: "pipe-to-shell download blocked" },
      { re: /git\s+push\s+[^\n]*--force/i, reason: "force push requires explicit high-trust mode" },
      { re: /dd\s+if=/i, reason: "raw disk dd blocked" }
    ];
    HIGH_PATTERNS = [
      { re: /rm\s+-rf\b/i, reason: "recursive delete" },
      { re: /sudo\b/i, reason: "privilege escalation" },
      { re: /chmod\s+-R\s+777\b/i, reason: "world-writable chmod" },
      { re: /kubectl\s+delete\b/i, reason: "cluster delete" }
    ];
    MEDIUM_PATTERNS = [
      { re: /\b(npm|pnpm|yarn)\s+publish\b/i, reason: "package publish" },
      { re: /\bgit\s+push\b/i, reason: "remote push" },
      { re: /\bcurl\b|\bwget\b/i, reason: "network egress" }
    ];
  }
});

// packages/wanwu-cli/src/native/workspacePaths.ts
import { existsSync as existsSync4, realpathSync, statSync } from "node:fs";
import { isAbsolute, join as join4, normalize, relative, resolve, sep } from "node:path";
function assertInsideWorkspace(workspaceRoot, userPath) {
  const root = resolve(workspaceRoot);
  const candidate = isAbsolute(userPath) ? resolve(userPath) : resolve(root, userPath);
  const normalized = normalize(candidate);
  const rel = relative(root, normalized);
  if (rel.startsWith("..") || rel === ".." || isAbsolute(rel)) {
    throw new PathSandboxError(`path escapes workspace: ${userPath}`);
  }
  if (normalized.includes(`${sep}.ssh${sep}`) || normalized.endsWith(`${sep}.ssh`)) {
    throw new PathSandboxError(`refuses .ssh path: ${userPath}`);
  }
  return normalized;
}
function isDirectory(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
var PathSandboxError;
var init_workspacePaths = __esm({
  "packages/wanwu-cli/src/native/workspacePaths.ts"() {
    "use strict";
    PathSandboxError = class extends Error {
      constructor(message) {
        super(message);
        this.name = "PathSandboxError";
      }
    };
  }
});

// packages/wanwu-cli/src/native/tools.ts
import { spawnSync } from "node:child_process";
import {
  existsSync as existsSync5,
  mkdirSync,
  readFileSync as readFileSync3,
  readdirSync,
  statSync as statSync2,
  writeFileSync
} from "node:fs";
import { dirname as dirname2, join as join5, relative as relative2 } from "node:path";
function walkFiles(root, dir, out, max = 500) {
  if (out.length >= max) return;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git" || name === "dist" || name === "out") continue;
    const full = join5(dir, name);
    let st;
    try {
      st = statSync2(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(root, full, out, max);
    } else if (st.isFile()) {
      out.push(relative2(root, full) || name);
      if (out.length >= max) return;
    }
  }
}
function matchGlob(relPath, pattern) {
  const path = relPath.replace(/\\/g, "/");
  const pat = pattern.replace(/\\/g, "/");
  let reSrc = "";
  for (let i = 0; i < pat.length; ) {
    if (pat[i] === "*" && pat[i + 1] === "*") {
      reSrc += ".*";
      i += 2;
      if (pat[i] === "/") {
        i += 1;
      }
      continue;
    }
    if (pat[i] === "*") {
      reSrc += "[^/]*";
      i += 1;
      continue;
    }
    if (pat[i] === "?") {
      reSrc += "[^/]";
      i += 1;
      continue;
    }
    const ch = pat[i];
    if (/[.+^${}()|[\]\\]/.test(ch)) reSrc += `\\${ch}`;
    else reSrc += ch;
    i += 1;
  }
  return new RegExp(`^${reSrc}$`).test(path);
}
function toolRead(workspaceRoot, pathArg) {
  try {
    const abs = assertInsideWorkspace(workspaceRoot, pathArg);
    if (!existsSync5(abs) || isDirectory(abs)) {
      return { ok: false, title: "Read", text: `not a file: ${pathArg}` };
    }
    const text = readFileSync3(abs, "utf8");
    const clipped = text.length > 8e4 ? `${text.slice(0, 8e4)}
\u2026(truncated)` : text;
    return { ok: true, title: "Read", text: clipped };
  } catch (err) {
    return {
      ok: false,
      title: "Read",
      text: err instanceof PathSandboxError ? err.message : String(err)
    };
  }
}
function toolGlob(workspaceRoot, pattern) {
  const files = [];
  walkFiles(workspaceRoot, workspaceRoot, files);
  const pat = pattern.trim() || "**/*";
  const hits = files.filter((f) => matchGlob(f.replace(/\\/g, "/"), pat.replace(/\\/g, "/")));
  return {
    ok: true,
    title: "Glob",
    text: hits.length ? hits.slice(0, 200).join("\n") : "(no matches)"
  };
}
function toolGrep(workspaceRoot, pattern, globPat = "**/*") {
  let re;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return { ok: false, title: "Grep", text: `invalid regexp: ${pattern}` };
  }
  const files = [];
  walkFiles(workspaceRoot, workspaceRoot, files);
  const filtered = files.filter(
    (f) => matchGlob(f.replace(/\\/g, "/"), globPat.replace(/\\/g, "/"))
  );
  const lines = [];
  for (const rel of filtered.slice(0, 200)) {
    try {
      const abs = assertInsideWorkspace(workspaceRoot, rel);
      const content = readFileSync3(abs, "utf8");
      content.split(/\r?\n/).forEach((line, i) => {
        if (re.test(line) && lines.length < 80) {
          lines.push(`${rel}:${i + 1}:${line.slice(0, 200)}`);
        }
      });
    } catch {
    }
    if (lines.length >= 80) break;
  }
  return {
    ok: true,
    title: "Grep",
    text: lines.length ? lines.join("\n") : "(no matches)"
  };
}
function toolEdit(workspaceRoot, pathArg, after, opts) {
  try {
    const abs = assertInsideWorkspace(workspaceRoot, pathArg);
    const before = existsSync5(abs) && !isDirectory(abs) ? readFileSync3(abs, "utf8") : "";
    if (opts.apply) {
      mkdirSync(dirname2(abs), { recursive: true });
      writeFileSync(abs, after, "utf8");
    }
    return {
      ok: true,
      title: "Edit",
      text: opts.apply ? `wrote ${pathArg}` : `proposed edit for ${pathArg}`,
      diff: { path: pathArg, before, after }
    };
  } catch (err) {
    return {
      ok: false,
      title: "Edit",
      text: err instanceof PathSandboxError ? err.message : String(err)
    };
  }
}
function toolBash(workspaceRoot, command, permissionMode) {
  const verdict = assessBash(command, permissionMode);
  if (!verdict.allow) {
    return {
      ok: false,
      title: "Bash",
      text: `Blocked by permission: ${verdict.reason}${verdict.requiresPrompt ? " (requires confirmation)" : ""}`
    };
  }
  const result = spawnSync(command, {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: true,
    timeout: 6e4,
    env: process.env
  });
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const code = result.status ?? 1;
  return {
    ok: code === 0,
    title: "Bash",
    text: out || `(exit ${code})`
  };
}
var init_tools = __esm({
  "packages/wanwu-cli/src/native/tools.ts"() {
    "use strict";
    init_permission();
    init_workspacePaths();
  }
});

// packages/wanwu-cli/src/native/agentLoop.ts
import { existsSync as existsSync6, readFileSync as readFileSync4 } from "node:fs";
import { join as join6 } from "node:path";
function detectMode(prompt, fallback) {
  if (/\[MODE=plan\]/i.test(prompt)) return "plan";
  if (/\[MODE=agent\]/i.test(prompt)) return "agent";
  if (/\[MODE=ask\]/i.test(prompt)) return "ask";
  if (/\[MODE=verify\]/i.test(prompt)) return "verify";
  return fallback;
}
function memoryPreamble(workspaceRoot) {
  const files = discoverMemory(workspaceRoot);
  if (!files.length) return "";
  const chunks = [];
  for (const f of files.slice(0, 3)) {
    try {
      const body = readFileSync4(f.path, "utf8").slice(0, 1500);
      chunks.push(`# Memory: ${f.kind}
${body}`);
    } catch {
    }
  }
  return chunks.join("\n\n");
}
function emitTool(sessionId, toolCallId, title, status, content) {
  sessionUpdate(sessionId, {
    sessionUpdate: "tool_call",
    toolCallId,
    title,
    status,
    content
  });
}
function runDeterministicTurn(ctx, prompt) {
  const mode = detectMode(prompt, ctx.mode);
  const mem = memoryPreamble(ctx.workspaceRoot);
  const sid = ctx.sessionId;
  let toolSeq = 0;
  const nextId = () => `native-tool-${++toolSeq}`;
  if (mode === "plan") {
    sessionUpdate(sid, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: (mem ? `(loaded ${discoverMemory(ctx.workspaceRoot).length} memory file(s))

` : "") + `Plan only (no file edits):
1. Explore relevant files with Read/Glob/Grep
2. Draft a minimal patch plan
3. After approval, switch to Agent mode and Verify
Prompt: ${prompt.replace(/\[MODE=\w+\]/gi, "").trim().slice(0, 300)}`
      }
    });
    return "plan";
  }
  const readmeCandidates = ["README.md", "readme.md", "Readme.md"];
  const readme = readmeCandidates.find((p) => existsSync6(join6(ctx.workspaceRoot, p)));
  if (readme) {
    const r = toolRead(ctx.workspaceRoot, readme);
    emitTool(sid, nextId(), "Read", r.ok ? "completed" : "failed", {
      type: "text",
      text: `${readme}
${r.text.slice(0, 2e3)}`
    });
  } else {
    const g = toolGlob(ctx.workspaceRoot, "*.md");
    emitTool(sid, nextId(), "Glob", "completed", { type: "text", text: g.text });
  }
  const grepMatch = prompt.match(/(?:find|grep|search)\s+[「"']?([\w.-]+)[」"']?/i);
  if (grepMatch?.[1]) {
    const g = toolGrep(ctx.workspaceRoot, grepMatch[1]);
    emitTool(sid, nextId(), "Grep", g.ok ? "completed" : "failed", {
      type: "text",
      text: g.text.slice(0, 3e3)
    });
  }
  const bashMatch = prompt.match(/`([^`]+)`/) || prompt.match(/(?:run|执行)\s+(.+)$/i) || (/SIMULATE_DANGEROUS|rm\s+-rf|cat\s+~\/\.ssh/i.test(prompt) ? [null, /cat\s+~\/\.ssh/.test(prompt) ? "cat ~/.ssh/id_rsa" : "rm -rf ./dist"] : null);
  if (bashMatch?.[1]) {
    const cmd = String(bashMatch[1]).trim();
    const b = toolBash(ctx.workspaceRoot, cmd, ctx.permissionMode);
    emitTool(sid, nextId(), "Bash", b.ok ? "completed" : "failed", {
      type: "text",
      text: `$ ${cmd}
${b.text}`
    });
    if (!b.ok && /Blocked by permission/i.test(b.text)) {
      sessionUpdate(sid, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: `Blocked by permission policy: ${b.text}` }
      });
      return "denied";
    }
  }
  const wantEdit = mode === "agent" && (/\[SIMULATE_EDIT\]/i.test(prompt) || /sum|failing-test-demo/i.test(prompt));
  if (wantEdit) {
    const path = "examples/failing-test-demo/src/sum.js";
    const after = "export function sum(a, b) {\n  return a + b;\n}\n";
    const apply = ctx.permissionMode === "accept-edits" || ctx.permissionMode === "accept-all";
    const e = toolEdit(ctx.workspaceRoot, path, after, { apply });
    if (e.diff) {
      emitTool(sid, nextId(), "Edit", apply ? "completed" : "pending", {
        type: "diff",
        path: e.diff.path,
        before: e.diff.before,
        after: e.diff.after
      });
    }
    sessionUpdate(sid, {
      sessionUpdate: "agent_message_chunk",
      content: {
        type: "text",
        text: apply ? `Applied edit to ${path}.` : `Proposed edit for ${path} (not applied in ask mode; accept-edits to write).`
      }
    });
    return "edit";
  }
  let summary = "Wanwu native agent finished a tool-assisted turn.";
  if (readme && /标题|title|README/i.test(prompt)) {
    const body = toolRead(ctx.workspaceRoot, readme).text;
    const heading = body.split(/\r?\n/).find((l) => /^#\s+/.test(l));
    if (heading) {
      summary = `README \u6807\u9898\uFF1A${heading.replace(/^#\s+/, "").trim()}`;
    }
  }
  sessionUpdate(sid, {
    sessionUpdate: "agent_message_chunk",
    content: {
      type: "text",
      text: (mem ? "(memory loaded)\n" : "") + summary
    }
  });
  return "ok";
}
var init_agentLoop = __esm({
  "packages/wanwu-cli/src/native/agentLoop.ts"() {
    "use strict";
    init_memory();
    init_jsonRpcStdio();
    init_tools();
  }
});

// packages/wanwu-providers/src/types.ts
var ProviderError;
var init_types = __esm({
  "packages/wanwu-providers/src/types.ts"() {
    "use strict";
    ProviderError = class extends Error {
      code;
      provider;
      hint;
      status;
      constructor(opts) {
        super(opts.message);
        this.name = "ProviderError";
        this.code = opts.code;
        this.hint = opts.hint;
        this.provider = opts.provider;
        this.status = opts.status;
      }
    };
  }
});

// packages/wanwu-providers/src/resolve.ts
function normalizeOpenAiBase(baseUrl) {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (!trimmed) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}
function resolveProvider(config, opts) {
  const env = opts?.env ?? process.env;
  const id = opts?.providerId ?? config.activeProvider;
  const pc = config.providers[id] ?? {};
  const model = env.WANWU_MODEL?.trim() || (opts?.providerId && opts.providerId !== config.activeProvider ? pc.defaultModel : void 0) || config.model || pc.defaultModel || "unknown";
  const envBase = env.WANWU_PROVIDER_BASE_URL?.trim() || (id === "openai" ? env.OPENAI_BASE_URL?.trim() : void 0) || (id === "custom" ? env.WANWU_CUSTOM_BASE_URL?.trim() : void 0) || (id === "ollama" ? env.OLLAMA_BASE_URL?.trim() : void 0);
  let baseUrl = (envBase || pc.baseUrl || DEFAULT_BASE[id] || "").trim();
  if (id === "custom" && !baseUrl) {
    throw new ProviderError({
      code: "config",
      provider: id,
      message: "custom provider requires providers.custom.base_url",
      hint: 'Set base_url under [providers.custom], e.g. "https://api.deepseek.com"'
    });
  }
  if (id !== "anthropic") {
    baseUrl = normalizeOpenAiBase(baseUrl);
  } else {
    baseUrl = baseUrl.replace(/\/$/, "");
  }
  const apiKeyEnv = pc.apiKeyEnv;
  const apiKey = apiKeyEnv ? env[apiKeyEnv] : void 0;
  if (id !== "ollama" && !apiKey) {
    throw new ProviderError({
      code: "config",
      provider: id,
      message: `${apiKeyEnv ?? "API key"} is not set`,
      hint: apiKeyEnv ? `Export ${apiKeyEnv}=... (BYOK) or use WANWU_FORCE_DETERMINISTIC=1` : "Configure api_key_env for this provider"
    });
  }
  return {
    id,
    model,
    apiKey,
    baseUrl,
    kind: id === "anthropic" ? "anthropic" : "openai-compat"
  };
}
function hasProviderCredentials(config, opts) {
  try {
    resolveProvider(config, opts);
    return true;
  } catch {
    return false;
  }
}
var DEFAULT_BASE;
var init_resolve = __esm({
  "packages/wanwu-providers/src/resolve.ts"() {
    "use strict";
    init_types();
    DEFAULT_BASE = {
      openai: "https://api.openai.com/v1",
      xai: "https://api.x.ai/v1",
      anthropic: "https://api.anthropic.com",
      ollama: "http://127.0.0.1:11434/v1",
      custom: ""
    };
  }
});

// packages/wanwu-providers/src/errors.ts
function mapHttpError(provider, status, bodyText) {
  const snippet = bodyText.replace(/\s+/g, " ").slice(0, 240);
  if (status === 401 || status === 403) {
    return new ProviderError({
      code: "auth",
      provider,
      status,
      message: `${provider} auth failed (${status}): ${snippet}`,
      hint: `Check API key env for ${provider} (BYOK). For OpenAI-compatible proxies set providers.${provider}.base_url.`
    });
  }
  if (status === 429) {
    return new ProviderError({
      code: "rate_limit",
      provider,
      status,
      message: `${provider} rate limited (429): ${snippet}`,
      hint: "Wait and retry, or lower concurrency / switch model."
    });
  }
  if (status >= 400 && status < 500) {
    return new ProviderError({
      code: "bad_request",
      provider,
      status,
      message: `${provider} bad request (${status}): ${snippet}`,
      hint: "Verify model name and request payload against provider docs."
    });
  }
  return new ProviderError({
    code: "unknown",
    provider,
    status,
    message: `${provider} HTTP ${status}: ${snippet}`,
    hint: "Retry later; if persistent, inspect provider status page."
  });
}
function mapNetworkError(provider, err) {
  const message = err instanceof Error ? err.message : String(err);
  const code = /ECONNREFUSED|ENOTFOUND|fetch failed|network/i.test(message) ? "unreachable" : "network";
  const hint = provider === "ollama" ? "Start Ollama locally (`ollama serve`) or fix providers.ollama.base_url." : "Check network / base_url / proxy settings.";
  return new ProviderError({
    code,
    provider,
    message: `${provider} network error: ${message}`,
    hint
  });
}
var init_errors = __esm({
  "packages/wanwu-providers/src/errors.ts"() {
    "use strict";
    init_types();
  }
});

// packages/wanwu-providers/src/anthropic.ts
async function completeAnthropic(resolved, request, fetchImpl = fetch) {
  const model = request.model ?? resolved.model;
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/v1/messages`;
  const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const messages = request.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": resolved.apiKey ?? "",
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model,
        max_tokens: request.maxTokens ?? 1024,
        temperature: request.temperature ?? 0.2,
        system: system || void 0,
        messages
      })
    });
  } catch (err) {
    throw mapNetworkError(resolved.id, err);
  }
  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }
  const text = (data.content ?? []).filter((c) => c.type === "text" || typeof c.text === "string").map((c) => c.text ?? "").join("");
  if (!text.trim()) {
    throw mapHttpError(resolved.id, res.status, bodyText || "empty assistant content");
  }
  return { text: text.trim(), provider: resolved.id, model, raw: data };
}
var init_anthropic = __esm({
  "packages/wanwu-providers/src/anthropic.ts"() {
    "use strict";
    init_errors();
  }
});

// packages/wanwu-providers/src/openaiCompat.ts
function toApiMessages(messages) {
  return messages.map((m) => {
    if (m.role === "tool") {
      return {
        role: "tool",
        tool_call_id: m.toolCallId,
        content: m.content
      };
    }
    if (m.role === "assistant" && m.toolCalls?.length) {
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls.map((t) => ({
          id: t.id,
          type: "function",
          function: { name: t.name, arguments: t.arguments }
        }))
      };
    }
    return { role: m.role, content: m.content };
  });
}
async function completeOpenAiCompat(resolved, request, fetchImpl = fetch) {
  const model = request.model ?? resolved.model;
  const url = `${resolved.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    "content-type": "application/json"
  };
  if (resolved.apiKey) {
    headers.authorization = `Bearer ${resolved.apiKey}`;
  }
  const body = {
    model,
    messages: toApiMessages(request.messages),
    temperature: request.temperature ?? 0.2,
    max_tokens: request.maxTokens ?? 2048
  };
  if (request.tools?.length) {
    body.tools = request.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
    body.tool_choice = request.toolChoice ?? "auto";
  }
  let res;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw mapNetworkError(resolved.id, err);
  }
  const bodyText = await res.text();
  if (!res.ok) {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }
  let data;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw mapHttpError(resolved.id, res.status, bodyText);
  }
  const message = data.choices?.[0]?.message;
  const content = message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => c.text ?? "").join("") : "";
  const toolCalls = (message?.tool_calls ?? []).map((tc, i) => ({
    id: tc.id ?? `call_${i}`,
    name: tc.function?.name ?? "",
    arguments: tc.function?.arguments ?? "{}"
  })).filter((t) => t.name);
  if (!text.trim() && toolCalls.length === 0) {
    throw mapHttpError(resolved.id, res.status, bodyText || "empty assistant content");
  }
  return {
    text: text.trim(),
    provider: resolved.id,
    model,
    toolCalls: toolCalls.length ? toolCalls : void 0,
    raw: data
  };
}
var init_openaiCompat = __esm({
  "packages/wanwu-providers/src/openaiCompat.ts"() {
    "use strict";
    init_errors();
  }
});

// packages/wanwu-providers/src/complete.ts
async function completeChat(opts) {
  const resolved = resolveProvider(opts.config, {
    providerId: opts.providerId,
    env: opts.env
  });
  const fetchImpl = opts.fetchImpl ?? fetch;
  const request = {
    ...opts.request,
    model: opts.request.model ?? resolved.model
  };
  if (resolved.kind === "anthropic") {
    return completeAnthropic(resolved, request, fetchImpl);
  }
  return completeOpenAiCompat(resolved, request, fetchImpl);
}
var init_complete = __esm({
  "packages/wanwu-providers/src/complete.ts"() {
    "use strict";
    init_anthropic();
    init_openaiCompat();
    init_resolve();
  }
});

// packages/wanwu-providers/src/index.ts
var init_src2 = __esm({
  "packages/wanwu-providers/src/index.ts"() {
    "use strict";
    init_types();
    init_resolve();
    init_complete();
    init_errors();
  }
});

// packages/wanwu-cli/src/native/toolDispatch.ts
function dispatchTool(ctx, mode, name, argsJson) {
  let args = {};
  try {
    args = JSON.parse(argsJson || "{}");
  } catch {
    return { ok: false, title: name, text: `invalid JSON arguments: ${argsJson}` };
  }
  const writeBlocked = mode === "plan" || mode === "ask" || mode === "verify";
  switch (name) {
    case "Read":
      return toolRead(ctx.workspaceRoot, String(args.path ?? ""));
    case "Glob":
      return toolGlob(ctx.workspaceRoot, String(args.pattern ?? "**/*"));
    case "Grep":
      return toolGrep(
        ctx.workspaceRoot,
        String(args.pattern ?? ""),
        args.glob ? String(args.glob) : "**/*"
      );
    case "Edit":
      if (writeBlocked) {
        return {
          ok: false,
          title: "Edit",
          text: `Edit blocked in mode=${mode}`
        };
      }
      return toolEdit(ctx.workspaceRoot, String(args.path ?? ""), String(args.content ?? ""), {
        apply: true
      });
    case "Bash":
      if (writeBlocked && !/^(\s)*(ls|pwd|cat|head|tail|rg|grep|find|echo|node -v|pnpm -v)/i.test(String(args.command ?? ""))) {
      }
      return toolBash(ctx.workspaceRoot, String(args.command ?? ""), ctx.permissionMode);
    default:
      return { ok: false, title: name, text: `unknown tool: ${name}` };
  }
}
var init_toolDispatch = __esm({
  "packages/wanwu-cli/src/native/toolDispatch.ts"() {
    "use strict";
    init_tools();
  }
});

// packages/wanwu-cli/src/native/toolSpecs.ts
var WANWU_TOOL_SPECS;
var init_toolSpecs = __esm({
  "packages/wanwu-cli/src/native/toolSpecs.ts"() {
    "use strict";
    WANWU_TOOL_SPECS = [
      {
        name: "Read",
        description: "Read a UTF-8 text file inside the workspace.",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "Relative path from workspace root" }
          },
          required: ["path"]
        }
      },
      {
        name: "Glob",
        description: "List files matching a glob pattern under the workspace.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Glob pattern, e.g. **/*.md" }
          },
          required: ["pattern"]
        }
      },
      {
        name: "Grep",
        description: "Search file contents for a regex/string pattern.",
        parameters: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            glob: { type: "string", description: "Optional file glob filter" }
          },
          required: ["pattern"]
        }
      },
      {
        name: "Edit",
        description: "Create or overwrite a file with new contents (Agent mode only).",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" }
          },
          required: ["path", "content"]
        }
      },
      {
        name: "Bash",
        description: "Run a shell command in the workspace (subject to deny-first permissions).",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string" }
          },
          required: ["command"]
        }
      }
    ];
  }
});

// packages/wanwu-cli/src/native/llmAgentLoop.ts
import { readFileSync as readFileSync5 } from "node:fs";
function providerOverride() {
  const raw = process.env.WANWU_PROVIDER?.trim();
  if (!raw) return void 0;
  if (["xai", "openai", "anthropic", "ollama", "custom"].includes(raw)) {
    return raw;
  }
  return void 0;
}
function shouldUseLlm(config) {
  if (process.env.WANWU_FORCE_DETERMINISTIC === "1") return false;
  return hasProviderCredentials(config, { providerId: providerOverride() });
}
function detectMode2(prompt, fallback) {
  if (/\[MODE=plan\]/i.test(prompt)) return "plan";
  if (/\[MODE=agent\]/i.test(prompt)) return "agent";
  if (/\[MODE=ask\]/i.test(prompt)) return "ask";
  if (/\[MODE=verify\]/i.test(prompt)) return "verify";
  return fallback;
}
function buildSystem(ctx, mode) {
  const memory = discoverMemory(ctx.workspaceRoot).slice(0, 2).map((f) => {
    try {
      return readFileSync5(f.path, "utf8").slice(0, 1200);
    } catch {
      return "";
    }
  }).filter(Boolean).join("\n---\n");
  return [
    "You are Wanwu, an AI coding agent. Use tools when you need workspace facts.",
    "Prefer Read/Glob/Grep before answering about files. Be concise.",
    `Workspace: ${ctx.workspaceRoot}`,
    `Mode: ${mode}`,
    mode === "plan" || mode === "ask" ? "Do NOT use Edit. Avoid destructive Bash." : "You may Edit/Bash when needed (permissions still apply).",
    memory ? `Project memory:
${memory}` : ""
  ].filter(Boolean).join("\n\n");
}
async function runLlmAgentLoop(ctx, config, prompt, opts) {
  const mode = detectMode2(prompt, ctx.mode);
  const maxTurns = opts?.maxTurns ?? (Number(process.env.WANWU_AGENT_MAX_TURNS ?? "6") || 6);
  const providerId = providerOverride();
  const toolsUsed = [];
  const messages = [
    { role: "system", content: buildSystem(ctx, mode) },
    { role: "user", content: prompt }
  ];
  let last;
  let turns = 0;
  for (let i = 0; i < maxTurns; i += 1) {
    turns = i + 1;
    try {
      last = await completeChat({
        config,
        providerId,
        fetchImpl: opts?.fetchImpl,
        env: {
          ...process.env,
          // fixture / injected fetch paths still need resolveProvider credentials
          OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "sk-fixture",
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "sk-fixture",
          XAI_API_KEY: process.env.XAI_API_KEY ?? "sk-fixture"
        },
        request: {
          messages,
          temperature: 0.2,
          maxTokens: 2048,
          tools: WANWU_TOOL_SPECS,
          toolChoice: "auto"
        }
      });
    } catch (err) {
      if (err instanceof ProviderError) {
        const text = `Provider error (${err.provider}/${err.code}): ${err.message}
Hint: ${err.hint}`;
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text }
        });
        throw err;
      }
      throw err;
    }
    if (last.toolCalls?.length) {
      messages.push({
        role: "assistant",
        content: last.text || "",
        toolCalls: last.toolCalls
      });
      for (const call of last.toolCalls) {
        toolsUsed.push(call.name);
        const toolCallId = `native-tool-${toolsUsed.length}`;
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "tool_call",
          toolCallId,
          title: call.name,
          status: "pending",
          content: { type: "text", text: call.arguments.slice(0, 500) }
        });
        const result = dispatchTool(ctx, mode, call.name, call.arguments);
        sessionUpdate(ctx.sessionId, {
          sessionUpdate: "tool_call",
          toolCallId,
          title: call.name,
          status: result.ok ? "completed" : "failed",
          content: {
            type: result.diff ? "diff" : "text",
            text: result.text.slice(0, 8e3),
            path: result.diff?.path,
            before: result.diff?.before,
            after: result.diff?.after
          }
        });
        messages.push({
          role: "tool",
          toolCallId: call.id,
          name: call.name,
          content: result.text.slice(0, 12e3)
        });
      }
      continue;
    }
    if (last.text) {
      sessionUpdate(ctx.sessionId, {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: last.text }
      });
    }
    break;
  }
  return {
    text: last?.text ?? "",
    provider: last?.provider ?? config.activeProvider,
    model: last?.model ?? config.model,
    turns,
    toolsUsed
  };
}
var init_llmAgentLoop = __esm({
  "packages/wanwu-cli/src/native/llmAgentLoop.ts"() {
    "use strict";
    init_src2();
    init_memory();
    init_jsonRpcStdio();
    init_toolDispatch();
    init_toolSpecs();
  }
});

// packages/wanwu-cli/src/native/acpServer.ts
var acpServer_exports = {};
__export(acpServer_exports, {
  startNativeAcpStdioServer: () => startNativeAcpStdioServer
});
import * as readline from "node:readline";
function startNativeAcpStdioServer() {
  const workspaceRoot = process.env.WANWU_WORKSPACE_ROOT?.trim() || findWorkspaceRoot();
  const { config } = loadWanwuConfig(workspaceRoot);
  const sessions = /* @__PURE__ */ new Map();
  let sessionCounter = 0;
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    void handleLine(line);
  });
  async function handleLine(line) {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (typeof msg.method !== "string" || msg.id === void 0) {
      return;
    }
    const id = msg.id;
    const method = msg.method;
    if (method === "initialize") {
      sendResult(id, {
        protocolVersion: "0.1.0-wanwu-native",
        agentCapabilities: { loadSession: false },
        agentInfo: { name: "wanwu-native", version: "1.0.0-beta" }
      });
      return;
    }
    if (method === "session/new" || method === "newSession") {
      const sessionId = `wanwu-native-${++sessionCounter}`;
      sessions.set(sessionId, { id: sessionId });
      sendResult(id, { sessionId });
      return;
    }
    if (method === "session/cancel") {
      sendResult(id, {});
      return;
    }
    if (method === "session/prompt" || method === "prompt") {
      const params = msg.params ?? {};
      const sessionId = params.sessionId ?? [...sessions.keys()][0];
      if (!sessionId || !sessions.has(sessionId)) {
        sendError(id, -32e3, "unknown session");
        return;
      }
      const text = params.prompt ?? params.text ?? "";
      const ctx = {
        workspaceRoot,
        sessionId,
        permissionMode: config.permissionMode,
        mode: config.defaultMode
      };
      try {
        if (shouldUseLlm(config)) {
          await runLlmAgentLoop(ctx, config, text);
        } else {
          runDeterministicTurn(ctx, text);
        }
        sendResult(id, { stopReason: "end_turn" });
      } catch (err) {
        sendError(id, -32001, err instanceof Error ? err.message : String(err));
      }
      return;
    }
    sendError(id, -32601, `Method not found: ${method}`);
  }
  process.stderr.write(
    `[wanwu-native] ready workspace=${workspaceRoot} llm=${shouldUseLlm(config) ? "on" : "deterministic"}
`
  );
}
var isMain;
var init_acpServer = __esm({
  "packages/wanwu-cli/src/native/acpServer.ts"() {
    "use strict";
    init_src();
    init_workspaceRoot();
    init_agentLoop();
    init_llmAgentLoop();
    init_jsonRpcStdio();
    isMain = typeof process.argv[1] === "string" && (process.argv[1].includes("acpServer") || process.env.WANWU_INTERNAL_ACP === "1");
    if (isMain || process.argv.includes("--wanwu-internal-acp")) {
      startNativeAcpStdioServer();
    }
  }
});

// packages/wanwu-cli/src/acpBridge.ts
init_src();
init_workspaceRoot();
import { spawn } from "node:child_process";
import { existsSync as existsSync7 } from "node:fs";
import { dirname as dirname3, join as join7 } from "node:path";
import { fileURLToPath } from "node:url";
function isPackagedBinary() {
  return Boolean(process.pkg);
}
function moduleDir() {
  try {
    const metaUrl = import.meta.url;
    if (typeof metaUrl === "string" && metaUrl.length > 0) {
      return dirname3(fileURLToPath(metaUrl));
    }
  } catch {
  }
  return process.cwd();
}
var here = moduleDir();
function nativeServerEntry() {
  const ts = join7(here, "native", "acpServer.ts");
  const js = join7(here, "native", "acpServer.js");
  if (existsSync7(ts)) return ts;
  return js;
}
function findMonorepoRoot() {
  let dir = here;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync7(join7(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname3(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync7(join7(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname3(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
function resolveAcpLaunch(cwd = findWorkspaceRoot()) {
  const override = process.env.WANWU_ACP_COMMAND?.trim();
  if (override) {
    const parts = override.split(/\s+/);
    return { command: parts[0], args: parts.slice(1), backend: "env:WANWU_ACP_COMMAND" };
  }
  const { config } = loadWanwuConfig(cwd);
  if (config.acpBackend === "grok") {
    const grokArgs = (process.env.WANWU_GROK_ACP_ARGS ?? "acp").trim().split(/\s+/);
    return { command: "grok", args: grokArgs, backend: "grok-bridge" };
  }
  if (isPackagedBinary()) {
    return {
      command: process.execPath,
      args: ["--wanwu-internal-acp"],
      backend: "wanwu-native",
      spawnCwd: cwd
    };
  }
  const entry = nativeServerEntry();
  const monorepo = findMonorepoRoot();
  if (entry.endsWith(".ts") && existsSync7(entry)) {
    return {
      command: "pnpm",
      args: ["exec", "tsx", entry],
      backend: "wanwu-native",
      spawnCwd: monorepo
    };
  }
  if (existsSync7(entry)) {
    return {
      command: process.execPath,
      args: [entry],
      backend: "wanwu-native",
      spawnCwd: monorepo
    };
  }
  return {
    command: process.execPath,
    args: [...process.argv.slice(1).filter((a) => !a.startsWith("--wanwu-internal")), "--wanwu-internal-acp"],
    backend: "wanwu-native",
    spawnCwd: cwd
  };
}
async function runAcpProxy(cwd) {
  const workspace = cwd ?? process.env.WANWU_WORKSPACE_ROOT?.trim() ?? findWorkspaceRoot();
  if (isPackagedBinary() || process.argv.includes("--wanwu-internal-acp")) {
    const { startNativeAcpStdioServer: startNativeAcpStdioServer2 } = await Promise.resolve().then(() => (init_acpServer(), acpServer_exports));
    startNativeAcpStdioServer2();
    await new Promise(() => {
    });
    return 0;
  }
  const plan = resolveAcpLaunch(workspace);
  console.error(`[wanwu acp] backend=${plan.backend} \u2192 ${plan.command} ${plan.args.join(" ")}`);
  return await new Promise((resolve2) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.spawnCwd ?? workspace,
      env: {
        ...process.env,
        WANWU_ACP_BACKEND: plan.backend,
        WANWU_WORKSPACE_ROOT: workspace
      },
      stdio: ["inherit", "inherit", "inherit"]
    });
    child.on("error", (err) => {
      console.error(`[wanwu acp] failed to start: ${err.message}`);
      console.error(
        "Hint: set acp_backend=wanwu-native (default), install grok for grok bridge, or set WANWU_ACP_COMMAND"
      );
      resolve2(1);
    });
    child.on("exit", (code, signal) => {
      if (signal) {
        console.error(`[wanwu acp] killed by signal ${signal}`);
        resolve2(1);
        return;
      }
      resolve2(code ?? 1);
    });
  });
}

// packages/wanwu-cli/src/cloudCmd.ts
import { spawnSync as spawnSync6 } from "node:child_process";
import { readFileSync as readFileSync9, existsSync as existsSync13, readdirSync as readdirSync3, rmSync } from "node:fs";
import { join as join13 } from "node:path";

// packages/wanwu-cloud/src/store.ts
import { existsSync as existsSync8, mkdirSync as mkdirSync2, readFileSync as readFileSync6, readdirSync as readdirSync2, writeFileSync as writeFileSync2 } from "node:fs";
import { join as join8 } from "node:path";
function tasksRoot(repoRoot) {
  return join8(repoRoot, ".wanwu", "cloud-tasks");
}
function ensureTasksRoot(repoRoot) {
  const root = tasksRoot(repoRoot);
  mkdirSync2(root, { recursive: true });
  return root;
}
function saveTask(repoRoot, task) {
  const dir = join8(ensureTasksRoot(repoRoot), task.id);
  mkdirSync2(dir, { recursive: true });
  writeFileSync2(join8(dir, "task.json"), JSON.stringify(task, null, 2), "utf8");
}
function loadTask(repoRoot, id) {
  const file = join8(tasksRoot(repoRoot), id, "task.json");
  if (!existsSync8(file)) return void 0;
  return JSON.parse(readFileSync6(file, "utf8"));
}
function listTasks(repoRoot) {
  const root = tasksRoot(repoRoot);
  if (!existsSync8(root)) return [];
  return readdirSync2(root).map((id) => loadTask(repoRoot, id)).filter((t) => Boolean(t)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
function updateTaskStatus(repoRoot, id, status, patch = {}) {
  const current = loadTask(repoRoot, id);
  if (!current) {
    throw new Error(`unknown cloud task: ${id}`);
  }
  const next = {
    ...current,
    ...patch,
    status,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveTask(repoRoot, next);
  return next;
}

// packages/wanwu-cloud/src/runner.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { appendFileSync, existsSync as existsSync9, mkdirSync as mkdirSync3, writeFileSync as writeFileSync3 } from "node:fs";
import { join as join9 } from "node:path";
function run(cmd, args, cwd, logFile, env = process.env) {
  appendFileSync(logFile, `
$ (cwd=${cwd}) ${cmd} ${args.join(" ")}
`, "utf8");
  const result = spawnSync2(cmd, args, { cwd, encoding: "utf8", env });
  if (result.stdout) appendFileSync(logFile, result.stdout, "utf8");
  if (result.stderr) appendFileSync(logFile, result.stderr, "utf8");
  return result.status ?? 1;
}
function worktreePath(repoRoot, taskId) {
  return join9(repoRoot, ".wanwu", "worktrees", taskId);
}
function runCloudTaskLocally(opts) {
  const { repoRoot, taskId } = opts;
  const task = loadTask(repoRoot, taskId);
  if (!task) {
    throw new Error(`unknown task ${taskId}`);
  }
  const taskDir = join9(ensureTasksRoot(repoRoot), taskId);
  const logPath = join9(taskDir, "runner.log");
  writeFileSync3(logPath, `wanwu cloud runner start ${(/* @__PURE__ */ new Date()).toISOString()}
`, "utf8");
  updateTaskStatus(repoRoot, taskId, "running", { logPath });
  const branch = `wanwu/cloud-${taskId}`;
  const wt = worktreePath(repoRoot, taskId);
  mkdirSync3(join9(repoRoot, ".wanwu", "worktrees"), { recursive: true });
  if (!existsSync9(wt)) {
    const addCode = run(
      "git",
      ["worktree", "add", "-b", branch, wt, "HEAD"],
      repoRoot,
      logPath
    );
    if (addCode !== 0) {
      return updateTaskStatus(repoRoot, taskId, "failed", {
        exitCode: addCode,
        logPath,
        worktree: wt,
        branch
      });
    }
  }
  const markerRel = join9(".wanwu", "cloud-markers", `${taskId}.txt`);
  const markerAbs = join9(wt, markerRel);
  mkdirSync3(join9(wt, ".wanwu", "cloud-markers"), { recursive: true });
  writeFileSync3(markerAbs, `task=${taskId}
prompt=${task.prompt}
`, "utf8");
  const bundled = join9(repoRoot, "dist-bin", "wanwu.mjs");
  const cliEntry = join9(repoRoot, "packages/wanwu-cli/src/index.ts");
  let planCode;
  if (existsSync9(bundled)) {
    planCode = run(process.execPath, [bundled, "plan", "-p", task.prompt], wt, logPath);
  } else if (existsSync9(cliEntry)) {
    planCode = run(
      "pnpm",
      ["exec", "tsx", cliEntry, "plan", "-p", task.prompt],
      wt,
      logPath,
      { ...process.env, WANWU_WORKDIR: wt }
    );
  } else {
    const plansDir = join9(wt, ".wanwu", "plans");
    mkdirSync3(plansDir, { recursive: true });
    const planFile = join9(plansDir, `${taskId}.plan.md`);
    writeFileSync3(
      planFile,
      `# Wanwu Plan

- task: ${taskId}

## Task

${task.prompt}
`,
      "utf8"
    );
    planCode = 0;
    appendFileSync(logPath, `
[fallback plan written] ${planFile}
`, "utf8");
  }
  const reviewNote = join9(wt, ".wanwu", "cloud-review.md");
  mkdirSync3(join9(wt, ".wanwu"), { recursive: true });
  writeFileSync3(
    reviewNote,
    `# Cloud task review (do not merge automatically)

- task: ${taskId}
- prompt: ${task.prompt}
- planExit: ${planCode}
- marker: ${markerRel}
`,
    "utf8"
  );
  run("git", ["add", ".wanwu"], wt, logPath);
  run(
    "git",
    [
      "-c",
      "user.email=wanwu@example.com",
      "-c",
      "user.name=Wanwu Cloud",
      "commit",
      "-m",
      `wanwu cloud task ${taskId}: review artifact (no merge)`
    ],
    wt,
    logPath
  );
  const diffPath = join9(taskDir, "review.diff");
  const diff = spawnSync2("git", ["diff", "HEAD~1..HEAD"], { cwd: wt, encoding: "utf8" });
  writeFileSync3(diffPath, diff.stdout ?? "", "utf8");
  appendFileSync(logPath, `
[review.diff written \u2014 review-first, not merged to main]
`, "utf8");
  const ok = planCode === 0 && (diff.stdout ?? "").length > 0;
  const next = updateTaskStatus(repoRoot, taskId, ok ? "succeeded" : "failed", {
    worktree: wt,
    branch,
    logPath,
    diffPath,
    exitCode: planCode
  });
  saveTask(repoRoot, next);
  return next;
}

// packages/wanwu-cloud/src/dockerRunner.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { existsSync as existsSync10, mkdirSync as mkdirSync4, readFileSync as readFileSync7, writeFileSync as writeFileSync4 } from "node:fs";
import { join as join10 } from "node:path";
var DEFAULT_IMAGE = "node:20.18.0-bookworm-slim";
function dockerCmd() {
  const direct = spawnSync3("docker", ["info"], { encoding: "utf8" });
  if ((direct.status ?? 1) === 0) {
    return ["docker"];
  }
  const elevated = spawnSync3("sudo", ["docker", "info"], { encoding: "utf8" });
  if ((elevated.status ?? 1) === 0) {
    return ["sudo", "docker"];
  }
  return ["docker"];
}
function dockerAvailable() {
  const prefix = dockerCmd();
  const bin = prefix[0];
  const args = bin === "sudo" ? ["docker", "info"] : ["info"];
  return (spawnSync3(bin, args, { encoding: "utf8" }).status ?? 1) === 0;
}
function runDocker(args, opts) {
  const prefix = dockerCmd();
  const bin = prefix[0];
  const fullArgs = bin === "sudo" ? ["docker", ...args] : args;
  return spawnSync3(bin, fullArgs, {
    cwd: opts.cwd,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : void 0
  });
}
function buildDockerRunArgs(opts) {
  const entry = join10(opts.repoRoot, "apps/wanwu-cloud-runner/scripts/entrypoint.sh");
  return [
    "run",
    "--rm",
    "-v",
    `${opts.repoRoot}:/workspace`,
    "-v",
    `${entry}:/entrypoint.sh:ro`,
    "-w",
    "/workspace",
    "-e",
    `WANWU_CLOUD_TASK_ID=${opts.taskId}`,
    "-e",
    `WANWU_CLOUD_PROMPT=${opts.prompt}`,
    opts.image ?? DEFAULT_IMAGE,
    "bash",
    "/entrypoint.sh"
  ];
}
function buildDockerRunnerImage(repoRoot) {
  const dockerfile = join10(repoRoot, "apps/wanwu-cloud-runner/Dockerfile");
  if (!existsSync10(dockerfile)) {
    throw new Error(`missing Dockerfile: ${dockerfile}`);
  }
  const result = runDocker(
    ["build", "-f", dockerfile, "-t", "wanwu-cloud-runner:local", repoRoot],
    { cwd: repoRoot, inherit: true }
  );
  return result.status ?? 1;
}
function isNestedOverlayFailure(stderr, status) {
  if (status === 125) return true;
  return /overlay|invalid argument|containerd-mount/i.test(stderr);
}
function runCloudTaskInDocker(opts) {
  const { repoRoot, taskId, rebuild } = opts;
  if (!dockerAvailable()) {
    throw new Error("Docker is not available. Install Docker or use `wanwu cloud submit --run`.");
  }
  const task = loadTask(repoRoot, taskId);
  if (!task) {
    throw new Error(`unknown task ${taskId}`);
  }
  const taskDir = join10(ensureTasksRoot(repoRoot), taskId);
  mkdirSync4(taskDir, { recursive: true });
  const logPath = join10(taskDir, "docker-runner.log");
  writeFileSync4(logPath, `wanwu cloud docker runner ${(/* @__PURE__ */ new Date()).toISOString()}
`, "utf8");
  updateTaskStatus(repoRoot, taskId, "running", { logPath });
  let image = DEFAULT_IMAGE;
  if (rebuild) {
    const code = buildDockerRunnerImage(repoRoot);
    if (code === 0) image = "wanwu-cloud-runner:local";
  } else {
    const inspect = runDocker(["image", "inspect", "wanwu-cloud-runner:local"], { cwd: repoRoot });
    if ((inspect.status ?? 1) === 0) image = "wanwu-cloud-runner:local";
  }
  const args = buildDockerRunArgs({
    repoRoot,
    taskId,
    prompt: task.prompt,
    image
  });
  writeFileSync4(
    logPath,
    `${readFileSync7(logPath, "utf8")}docker argv: docker ${args.join(" ")}
`,
    "utf8"
  );
  const result = runDocker(args, { cwd: repoRoot });
  const stderr = result.stderr ?? "";
  writeFileSync4(
    logPath,
    `${readFileSync7(logPath, "utf8")}
image=${image}
--- docker stdout ---
${result.stdout ?? ""}
--- docker stderr ---
${stderr}
exit=${result.status}
`,
    "utf8"
  );
  if ((result.status ?? 1) === 0) {
    const refreshed = loadTask(repoRoot, taskId);
    const next = {
      ...refreshed ?? task,
      status: refreshed?.status === "succeeded" ? "succeeded" : "failed",
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      logPath,
      exitCode: result.status ?? 0
    };
    saveTask(repoRoot, next);
    return next;
  }
  if (isNestedOverlayFailure(stderr, result.status)) {
    const requireDocker = process.env.WANWU_DOCKER_REQUIRE === "1";
    if (requireDocker) {
      writeFileSync4(
        logPath,
        `${readFileSync7(logPath, "utf8")}
[require] WANWU_DOCKER_REQUIRE=1 \u2014 refusing nested-overlay fallback
`,
        "utf8"
      );
      return updateTaskStatus(repoRoot, taskId, "failed", {
        exitCode: result.status ?? 1,
        logPath
      });
    }
    writeFileSync4(
      logPath,
      `${readFileSync7(logPath, "utf8")}
[fallback] docker run failed on nested overlay; using local worktree runner
`,
      "utf8"
    );
    const local = runCloudTaskLocally({ repoRoot, taskId });
    const merged = {
      ...local,
      logPath,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const combined = `${readFileSync7(logPath, "utf8")}
--- local fallback log ---
${local.logPath && existsSync10(local.logPath) ? readFileSync7(local.logPath, "utf8") : ""}
`;
    writeFileSync4(logPath, combined, "utf8");
    saveTask(repoRoot, merged);
    return merged;
  }
  return updateTaskStatus(repoRoot, taskId, "failed", {
    exitCode: result.status ?? 1,
    logPath
  });
}

// packages/wanwu-cloud/src/parallel.ts
import { spawnSync as spawnSync4 } from "node:child_process";
import { existsSync as existsSync11, mkdirSync as mkdirSync5, writeFileSync as writeFileSync5, readFileSync as readFileSync8 } from "node:fs";
import { dirname as dirname4, join as join11 } from "node:path";
function runParallelMarkers(repoRoot, specs) {
  const agents = [];
  const base = join11(repoRoot, ".wanwu", "worktrees");
  mkdirSync5(base, { recursive: true });
  for (const spec of specs) {
    const branch = `wanwu/parallel-${spec.name}`;
    const worktree = join11(base, spec.name);
    if (existsSync11(worktree)) {
      spawnSync4("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot });
      spawnSync4("git", ["branch", "-D", branch], { cwd: repoRoot });
    }
    const add = spawnSync4("git", ["worktree", "add", "-b", branch, worktree, "HEAD"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    if ((add.status ?? 1) !== 0) {
      throw new Error(`worktree add failed for ${spec.name}: ${add.stderr}`);
    }
    const markerAbs = join11(worktree, spec.markerRelativePath);
    mkdirSync5(dirname4(markerAbs), { recursive: true });
    writeFileSync5(markerAbs, spec.markerContents, "utf8");
    agents.push({
      name: spec.name,
      worktree,
      branch,
      marker: spec.markerRelativePath
    });
  }
  const collidedOnMain = specs.some((s) => existsSync11(join11(repoRoot, s.markerRelativePath)));
  for (const a of agents) {
    const text = readFileSync8(join11(a.worktree, a.marker), "utf8");
    const spec = specs.find((s) => s.name === a.name);
    if (text !== spec.markerContents) {
      throw new Error(`marker mismatch in ${a.name}`);
    }
  }
  return { agents, collidedOnMain };
}
function cleanupParallel(repoRoot, names) {
  for (const name of names) {
    const worktree = join11(repoRoot, ".wanwu", "worktrees", name);
    const branch = `wanwu/parallel-${name}`;
    spawnSync4("git", ["worktree", "remove", "--force", worktree], { cwd: repoRoot });
    spawnSync4("git", ["branch", "-D", branch], { cwd: repoRoot });
  }
}

// packages/wanwu-cloud/src/client.ts
import { randomBytes } from "node:crypto";
var FileCloudClient = class {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
  }
  async submit(prompt) {
    const id = `task_${Date.now().toString(36)}_${randomBytes(2).toString("hex")}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const task = {
      id,
      prompt,
      status: "queued",
      createdAt: now,
      updatedAt: now
    };
    saveTask(this.repoRoot, task);
    return task;
  }
  async get(id) {
    return loadTask(this.repoRoot, id);
  }
  async list() {
    return listTasks(this.repoRoot);
  }
  /** Queue then immediately run on a local worktree runner (headless). */
  async submitAndRun(prompt) {
    const task = await this.submit(prompt);
    return runCloudTaskLocally({ repoRoot: this.repoRoot, taskId: task.id });
  }
};

// packages/wanwu-cloud/src/openPr.ts
import { spawnSync as spawnSync5 } from "node:child_process";
import { existsSync as existsSync12, writeFileSync as writeFileSync6 } from "node:fs";
import { join as join12 } from "node:path";
function detectBaseBranch(repoRoot, runner) {
  const fromEnv = process.env.WANWU_CLOUD_BASE_BRANCH?.trim();
  if (fromEnv) return fromEnv;
  const sym = runner("git", ["rev-parse", "--abbrev-ref", "origin/HEAD"], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  const out = (sym.stdout ?? "").trim();
  if (out.includes("/")) return out.split("/").pop() || "main";
  return "main";
}
function openTaskPullRequest(opts) {
  const runner = opts.runner ?? spawnSync5;
  const dryRun = opts.dryRun === true || process.env.WANWU_CLOUD_PR_DRY_RUN === "1" || process.env.WANWU_CLOUD_OPEN_PR === "0";
  const task = loadTask(opts.repoRoot, opts.taskId);
  if (!task?.branch || !task.worktree) {
    return { ok: false, dryRun, message: "task missing branch/worktree \u2014 run the task first" };
  }
  const base = opts.baseBranch ?? detectBaseBranch(opts.repoRoot, runner);
  const title = `wanwu cloud: ${task.id}`;
  const body = [
    `## Cloud task (review-first)`,
    "",
    `- **task**: \`${task.id}\``,
    `- **prompt**: ${task.prompt}`,
    `- **branch**: \`${task.branch}\``,
    "",
    "This PR was opened by `wanwu cloud` in **draft** mode.",
    "**Do not auto-merge.** Review `review.diff` / commits before approving.",
    "",
    task.diffPath && existsSync12(task.diffPath) ? `Local review diff: \`.wanwu/cloud-tasks/${task.id}/review.diff\`` : ""
  ].filter(Boolean).join("\n");
  const draftPath = join12(opts.repoRoot, ".wanwu", "cloud-tasks", task.id, "pr-draft.md");
  writeFileSync6(
    draftPath,
    `# PR draft

base: ${base}
head: ${task.branch}
title: ${title}

${body}

## Commands

\`\`\`bash
git push -u origin ${task.branch}
gh pr create --draft --base ${base} --head ${task.branch} --title ${JSON.stringify(title)} --body-file .wanwu/cloud-tasks/${task.id}/pr-draft.md
\`\`\`
`,
    "utf8"
  );
  if (dryRun) {
    const next2 = { ...task, prDraftPath: draftPath, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    saveTask(opts.repoRoot, next2);
    return {
      ok: true,
      dryRun: true,
      draftPath,
      message: `dry-run: wrote ${draftPath} (no push / no gh)`
    };
  }
  const push = runner("git", ["push", "-u", "origin", task.branch], {
    cwd: task.worktree,
    encoding: "utf8"
  });
  if ((push.status ?? 1) !== 0) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      message: `git push failed: ${push.stderr || push.stdout || "unknown"}`
    };
  }
  const pr = runner(
    "gh",
    [
      "pr",
      "create",
      "--draft",
      "--base",
      base,
      "--head",
      task.branch,
      "--title",
      title,
      "--body",
      body
    ],
    { cwd: opts.repoRoot, encoding: "utf8" }
  );
  const combined = `${pr.stdout ?? ""}
${pr.stderr ?? ""}`;
  const urlMatch = combined.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
  if ((pr.status ?? 1) !== 0 || !urlMatch) {
    return {
      ok: false,
      dryRun: false,
      draftPath,
      message: `gh pr create failed (draft saved): ${combined.slice(0, 500)}`
    };
  }
  const prUrl = urlMatch[0];
  const next = {
    ...task,
    prUrl,
    prDraftPath: draftPath,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  saveTask(opts.repoRoot, next);
  return {
    ok: true,
    dryRun: false,
    prUrl,
    draftPath,
    message: `draft PR opened: ${prUrl}`
  };
}

// packages/wanwu-cloud/src/orchestrator.ts
async function mapPool(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}
async function orchestrateCloudTasks(opts) {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const client = new FileCloudClient(opts.repoRoot);
  const submitted = [];
  for (const prompt of opts.prompts) {
    const t = await client.submit(prompt);
    submitted.push(t);
    await new Promise((r) => setTimeout(r, 5));
  }
  const tasks = await mapPool(submitted, concurrency, async (task) => {
    return runCloudTaskLocally({ repoRoot: opts.repoRoot, taskId: task.id });
  });
  let prResults;
  if (opts.openPr) {
    prResults = [];
    for (const task of tasks) {
      if (task.status !== "succeeded") {
        prResults.push({
          ok: false,
          dryRun: Boolean(opts.prDryRun),
          message: `skip PR \u2014 task ${task.id} status=${task.status}`
        });
        continue;
      }
      prResults.push(
        openTaskPullRequest({
          repoRoot: opts.repoRoot,
          taskId: task.id,
          dryRun: opts.prDryRun
        })
      );
    }
  }
  return {
    startedAt,
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    concurrency,
    tasks,
    prResults
  };
}

// packages/wanwu-cli/src/cloudCmd.ts
init_workspaceRoot();
function readPrompts(rest) {
  const prompts = [];
  let concurrency = 2;
  let openPr = false;
  let prDryRun = process.env.WANWU_CLOUD_PR_DRY_RUN === "1";
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "-p" || a === "--prompt") {
      prompts.push(rest[++i] ?? "");
    } else if (a === "--concurrency") {
      concurrency = Number(rest[++i] ?? "2") || 2;
    } else if (a?.startsWith("--concurrency=")) {
      concurrency = Number(a.slice("--concurrency=".length)) || 2;
    } else if (a === "--pr") {
      openPr = true;
    } else if (a === "--pr-dry-run") {
      openPr = true;
      prDryRun = true;
    }
  }
  return { prompts: prompts.filter(Boolean), concurrency, openPr, prDryRun };
}
async function runCloudCommand(args) {
  const cwd = findWorkspaceRoot();
  const client = new FileCloudClient(cwd);
  const [sub, ...rest] = args;
  switch (sub) {
    case "submit": {
      let prompt = "";
      let runNow = false;
      let useDocker = false;
      let rebuild = false;
      for (let i = 0; i < rest.length; i += 1) {
        const a = rest[i];
        if (a === "-p" || a === "--prompt") {
          prompt = rest[++i] ?? "";
        } else if (a === "--run") {
          runNow = true;
        } else if (a === "--docker") {
          useDocker = true;
          runNow = true;
        } else if (a === "--rebuild") {
          rebuild = true;
        } else if (!prompt && a && !a.startsWith("-")) {
          prompt = a;
        }
      }
      if (!prompt) {
        console.error("wanwu cloud submit requires -p/--prompt");
        return 2;
      }
      if (useDocker) {
        const task2 = await client.submit(prompt);
        const done = runCloudTaskInDocker({ repoRoot: cwd, taskId: task2.id, rebuild });
        console.log(JSON.stringify(done, null, 2));
        return done.status === "succeeded" ? 0 : 1;
      }
      if (runNow) {
        const done = await client.submitAndRun(prompt);
        console.log(JSON.stringify(done, null, 2));
        return done.status === "succeeded" ? 0 : 1;
      }
      const task = await client.submit(prompt);
      console.log(JSON.stringify(task, null, 2));
      return 0;
    }
    case "orchestrate": {
      const { prompts, concurrency, openPr, prDryRun } = readPrompts(rest);
      if (prompts.length < 1) {
        console.error("wanwu cloud orchestrate requires at least one -p/--prompt");
        return 2;
      }
      const result = await orchestrateCloudTasks({
        repoRoot: cwd,
        prompts,
        concurrency,
        openPr: openPr || process.env.WANWU_CLOUD_OPEN_PR === "1",
        prDryRun
      });
      console.log(JSON.stringify(result, null, 2));
      const failed = result.tasks.filter((t) => t.status !== "succeeded").length;
      return failed === 0 ? 0 : 1;
    }
    case "open-pr": {
      const id = rest[0];
      if (!id) {
        console.error("wanwu cloud open-pr <taskId> [--dry-run]");
        return 2;
      }
      const dryRun = rest.includes("--dry-run") || process.env.WANWU_CLOUD_PR_DRY_RUN === "1";
      const result = openTaskPullRequest({ repoRoot: cwd, taskId: id, dryRun });
      console.log(JSON.stringify(result, null, 2));
      return result.ok ? 0 : 1;
    }
    case "run": {
      const id = rest[0];
      if (!id) {
        console.error("wanwu cloud run <taskId> [--docker]");
        return 2;
      }
      const useDocker = rest.includes("--docker");
      const rebuild = rest.includes("--rebuild");
      const done = useDocker ? runCloudTaskInDocker({ repoRoot: cwd, taskId: id, rebuild }) : runCloudTaskLocally({ repoRoot: cwd, taskId: id });
      console.log(JSON.stringify(done, null, 2));
      return done.status === "succeeded" ? 0 : 1;
    }
    case "docker-build": {
      if (!dockerAvailable()) {
        console.error("Docker is not available");
        return 1;
      }
      return buildDockerRunnerImage(cwd);
    }
    case "status": {
      const id = rest[0];
      if (!id) {
        console.error("wanwu cloud status <taskId>");
        return 2;
      }
      const task = loadTask(cwd, id);
      if (!task) {
        console.error(`task not found: ${id}`);
        return 1;
      }
      console.log(JSON.stringify(task, null, 2));
      return 0;
    }
    case "list": {
      console.log(JSON.stringify(await client.list(), null, 2));
      return 0;
    }
    case "logs": {
      const id = rest[0];
      const task = id ? loadTask(cwd, id) : void 0;
      if (!task?.logPath || !existsSync13(task.logPath)) {
        console.error("log not found");
        return 1;
      }
      process.stdout.write(readFileSync9(task.logPath, "utf8"));
      return 0;
    }
    case "diff": {
      const id = rest[0];
      const task = id ? loadTask(cwd, id) : void 0;
      if (!task?.diffPath || !existsSync13(task.diffPath)) {
        console.error("review diff not found");
        return 1;
      }
      process.stdout.write(readFileSync9(task.diffPath, "utf8"));
      return 0;
    }
    case "cleanup": {
      for (const task of listTasks(cwd)) {
        if (task.worktree && existsSync13(task.worktree)) {
          spawnSync6("git", ["worktree", "remove", "--force", task.worktree], { cwd });
        }
        if (task.branch) {
          spawnSync6("git", ["branch", "-D", task.branch], { cwd });
        }
      }
      const wtRoot = join13(cwd, ".wanwu", "worktrees");
      if (existsSync13(wtRoot)) {
        for (const name of readdirSync3(wtRoot)) {
          spawnSync6("git", ["worktree", "remove", "--force", join13(wtRoot, name)], { cwd });
        }
      }
      const tasksRootPath = join13(cwd, ".wanwu", "cloud-tasks");
      if (existsSync13(tasksRootPath) && rest.includes("--purge")) {
        rmSync(tasksRootPath, { recursive: true, force: true });
      }
      console.log("cloud worktrees cleaned (add --purge to delete task records)");
      return 0;
    }
    default:
      console.log(`wanwu cloud \u2014 headless runner (review-first, no auto-merge)

Usage:
  wanwu cloud submit -p "..." [--run] [--docker] [--rebuild]
  wanwu cloud orchestrate -p "A" -p "B" [--concurrency 2] [--pr|--pr-dry-run]
  wanwu cloud open-pr <taskId> [--dry-run]
  wanwu cloud run <taskId> [--docker]
  wanwu cloud docker-build
  wanwu cloud status <taskId>
  wanwu cloud list
  wanwu cloud logs <taskId>
  wanwu cloud diff <taskId>
  wanwu cloud cleanup [--purge]

Notes:
  - Tasks run in isolated git worktrees; never merges to base branch.
  - --pr opens a GitHub draft PR (requires gh auth + push access).
  - WANWU_CLOUD_PR_DRY_RUN=1 forces pr-draft.md only.
`);
      return sub ? 2 : 0;
  }
}

// packages/wanwu-cli/src/doctor.ts
init_src();
init_src2();
init_memory();
init_workspaceRoot();
import { spawnSync as spawnSync7 } from "node:child_process";
function commandExists(cmd) {
  const probe = process.platform === "win32" ? "where" : "which";
  const result = spawnSync7(probe, [cmd], { encoding: "utf8" });
  return result.status === 0;
}
function providerStatus(config, id) {
  const pc = config.providers[id];
  if (!pc) {
    return { level: "warn", code: `provider.${id}`, message: `${id}: not in config` };
  }
  if (id === "ollama") {
    const base = process.env.OLLAMA_BASE_URL || pc.baseUrl || "http://127.0.0.1:11434";
    return {
      level: "ok",
      code: `provider.${id}`,
      message: `${id}: no API key required \xB7 base=${base} (ensure ollama serve)`
    };
  }
  const envName = pc.apiKeyEnv ?? "?";
  const set = Boolean(process.env[envName]);
  const baseHint = id === "openai" && process.env.OPENAI_BASE_URL ? ` \xB7 OPENAI_BASE_URL=${process.env.OPENAI_BASE_URL}` : pc.baseUrl ? ` \xB7 base_url=${pc.baseUrl}` : "";
  if (set) {
    return {
      level: "ok",
      code: `provider.${id}`,
      message: `${id}: ${envName} set${baseHint}`
    };
  }
  return {
    level: "warn",
    code: `provider.${id}`,
    message: `${id}: ${envName} missing \u2014 export ${envName}=... or edit ${userConfigPath()}${baseHint}`
  };
}
function runDoctor(cwd = findWorkspaceRoot()) {
  const findings = [];
  const { config, sources } = loadWanwuConfig(cwd);
  findings.push({
    level: "ok",
    code: "workspace.root",
    message: `workspace root: ${cwd}`
  });
  findings.push({
    level: "ok",
    code: "config.sources",
    message: `config sources: ${sources.join(" \u2192 ")}`
  });
  findings.push({
    level: "ok",
    code: "config.active",
    message: `activeProvider=${config.activeProvider} model=${process.env.WANWU_MODEL ?? config.model} acpBackend=${config.acpBackend}`
  });
  findings.push({
    level: "ok",
    code: "config.providers",
    message: `providers (parity): ${listConfiguredProviders(config).join(", ")}`
  });
  for (const id of listConfiguredProviders(config)) {
    findings.push(providerStatus(config, id));
  }
  const override = process.env.WANWU_PROVIDER?.trim();
  const activeId = override || config.activeProvider;
  if (hasProviderCredentials(config, { providerId: override })) {
    try {
      const resolved = resolveProvider(config, { providerId: override });
      findings.push({
        level: "ok",
        code: "provider.active.ready",
        message: `LLM ready: ${resolved.id} model=${resolved.model} base=${resolved.baseUrl}`
      });
    } catch {
    }
  } else {
    findings.push({
      level: "warn",
      code: "provider.active.ready",
      message: `LLM not ready for ${activeId} \u2014 wanwu exec will use deterministic native loop. Fix: export key / OPENAI_BASE_URL for proxies (e.g. DeepSeek) / WANWU_FORCE_DETERMINISTIC=1 to silence`
    });
  }
  if (config.acpBackend === "wanwu-native") {
    findings.push({
      level: "ok",
      code: "acp.native",
      message: "acp_backend=wanwu-native (no grok binary required)"
    });
  } else if (config.acpBackend === "grok") {
    if (commandExists("grok")) {
      findings.push({
        level: "ok",
        code: "acp.grok",
        message: "grok binary found on PATH (ACP bridge available)"
      });
    } else {
      findings.push({
        level: "warn",
        code: "acp.grok",
        message: "grok not found on PATH. Install Grok Build (https://x.ai/cli), set WANWU_ACP_COMMAND, or switch acp_backend=wanwu-native"
      });
    }
  }
  const memory = discoverMemory(cwd);
  if (memory.length === 0) {
    findings.push({
      level: "warn",
      code: "memory.none",
      message: "No WANWU.md / AGENTS.md / CLAUDE.md in workspace"
    });
  } else {
    findings.push({
      level: "ok",
      code: "memory.found",
      message: `memory files: ${memory.map((m) => m.kind).join(", ")}`
    });
  }
  findings.push({
    level: "ok",
    code: "safety",
    message: `permissionMode=${config.permissionMode} sandbox=${config.sandbox}`
  });
  return findings;
}
function printDoctor(findings) {
  let errors = 0;
  for (const f of findings) {
    const tag = f.level.toUpperCase().padEnd(5);
    console.log(`[${tag}] ${f.code}: ${f.message}`);
    if (f.level === "error") errors += 1;
  }
  return errors > 0 ? 1 : 0;
}

// packages/wanwu-cli/src/exec.ts
init_src();
init_src2();
init_memory();
import { spawnSync as spawnSync8 } from "node:child_process";
init_agentLoop();
init_llmAgentLoop();
init_workspaceRoot();
async function runExec(options) {
  const cwd = options.cwd ?? findWorkspaceRoot();
  const { config } = loadWanwuConfig(cwd);
  const memory = discoverMemory(cwd);
  const memoryBlock = renderMemoryForPrompt(memory);
  const composed = [
    memoryBlock ? `${memoryBlock}

` : "",
    `User request:
${options.prompt}`,
    `
[wanwu mode hints] permissionMode=${config.permissionMode} sandbox=${config.sandbox}`,
    `
[provider] ${config.activeProvider} / ${config.model}`
  ].join("");
  const plan = resolveAcpLaunch(cwd);
  if (plan.backend === "grok-bridge") {
    const headlessArgs = (process.env.WANWU_GROK_EXEC_ARGS ?? `exec --prompt`).trim().split(/\s+/);
    const result = spawnSync8(plan.command, [...headlessArgs, composed], {
      cwd,
      encoding: "utf8",
      env: process.env
    });
    if (result.error) {
      printDryRun(composed, config.activeProvider, config.model, result.error.message);
      return 0;
    }
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    return result.status ?? 1;
  }
  if (plan.backend === "wanwu-native" || plan.backend.startsWith("env:")) {
    const sessionId = "exec-session";
    const chunks = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk) => {
      const s = typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
      for (const line of s.split("\n")) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.method === "session/update") {
            const text = msg.params?.update?.content?.text;
            const title = msg.params?.update?.title;
            if (title) chunks.push(`[tool:${title}]`);
            if (text) chunks.push(text);
            return true;
          }
        } catch {
        }
      }
      return true;
    });
    const ctx = {
      workspaceRoot: cwd,
      sessionId,
      permissionMode: config.permissionMode,
      mode: config.defaultMode
    };
    let llm = false;
    let provider = process.env.WANWU_PROVIDER?.trim() || config.activeProvider;
    let model = process.env.WANWU_MODEL?.trim() || config.model;
    let turns = 0;
    let toolsUsed = [];
    try {
      if (shouldUseLlm(config)) {
        llm = true;
        const out = await runLlmAgentLoop(ctx, config, options.prompt);
        provider = out.provider;
        model = out.model;
        turns = out.turns;
        toolsUsed = out.toolsUsed;
      } else {
        runDeterministicTurn(ctx, options.prompt);
      }
    } catch (err) {
      process.stdout.write = origWrite;
      if (err instanceof ProviderError) {
        console.log(
          JSON.stringify(
            {
              status: "error",
              llm: true,
              provider: err.provider,
              code: err.code,
              message: err.message,
              hint: err.hint
            },
            null,
            2
          )
        );
        return 1;
      }
      throw err;
    } finally {
      process.stdout.write = origWrite;
    }
    console.log(
      JSON.stringify(
        {
          status: "ok",
          backend: plan.backend,
          llm,
          provider,
          model,
          turns,
          toolsUsed,
          output: chunks.join("\n").slice(0, 8e3)
        },
        null,
        2
      )
    );
    return 0;
  }
  printDryRun(composed, config.activeProvider, config.model);
  return 0;
}
function printDryRun(composed, provider, model, reason) {
  console.log(
    JSON.stringify(
      {
        status: "dry-run",
        provider,
        model,
        reason,
        message: "No native headless backend executed. Set acp_backend=wanwu-native or install grok.",
        promptPreview: composed.slice(0, 2e3)
      },
      null,
      2
    )
  );
}

// packages/wanwu-cli/src/hooks.ts
init_dist();
import { existsSync as existsSync14, readFileSync as readFileSync10, readdirSync as readdirSync4 } from "node:fs";
import { join as join14 } from "node:path";
import { spawnSync as spawnSync9 } from "node:child_process";
function loadHooks(cwd) {
  const file = join14(cwd, ".wanwu", "hooks.toml");
  if (!existsSync14(file)) {
    const dir = join14(cwd, ".wanwu", "hooks");
    if (!existsSync14(dir)) return [];
    return readdirSync4(dir).filter((n) => n.endsWith(".sh")).map((n) => ({
      event: "PostToolUse",
      command: join14(dir, n)
    }));
  }
  const parsed = parse(readFileSync10(file, "utf8"));
  const hooks = Array.isArray(parsed.hooks) ? parsed.hooks : [];
  return hooks.map((h) => h).filter((h) => typeof h.event === "string" && typeof h.command === "string").map((h) => ({ event: h.event, command: String(h.command) }));
}
function runHooks(cwd, event) {
  const hooks = loadHooks(cwd).filter((h) => h.event === event);
  const outputs = [];
  for (const h of hooks) {
    const result = spawnSync9("bash", ["-lc", h.command], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, WANWU_HOOK_EVENT: event }
    });
    const text = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
    if (text) outputs.push(text);
    if ((result.status ?? 1) !== 0) {
      return { ok: false, outputs };
    }
  }
  return { ok: true, outputs };
}

// packages/wanwu-cli/src/inspect.ts
init_src();

// packages/wanwu-cli/src/discover.ts
import { existsSync as existsSync15, readdirSync as readdirSync5 } from "node:fs";
import { join as join15 } from "node:path";
function discoverSkills(cwd) {
  const dir = join15(cwd, ".wanwu", "skills");
  if (!existsSync15(dir)) return [];
  return readdirSync5(dir).filter((n) => n.endsWith(".md") || n.endsWith(".toml"));
}
function discoverMcpConfig(cwd) {
  const candidates = [
    join15(cwd, ".wanwu", "mcp.toml"),
    join15(cwd, ".wanwu", "mcp.json"),
    join15(cwd, ".mcp.json")
  ];
  return candidates.filter((p) => existsSync15(p));
}

// packages/wanwu-cli/src/inspect.ts
init_memory();
init_workspaceRoot();
function runInspect(cwd = findWorkspaceRoot()) {
  const { config, sources } = loadWanwuConfig(cwd);
  const memory = discoverMemory(cwd);
  const skills = discoverSkills(cwd);
  const hooks = loadHooks(cwd);
  const mcp = discoverMcpConfig(cwd);
  const report = {
    sources,
    config,
    memory: memory.map((m) => ({ kind: m.kind, path: m.path })),
    skills,
    hooks,
    mcp,
    skillsDir: `${cwd}/.wanwu/skills`,
    hooksDir: `${cwd}/.wanwu/hooks`
  };
  console.log(JSON.stringify(report, null, 2));
}

// packages/wanwu-cli/src/memoryWriteback.ts
init_workspaceRoot();
import { appendFileSync as appendFileSync2, existsSync as existsSync16, readFileSync as readFileSync11, writeFileSync as writeFileSync7 } from "node:fs";
import { join as join16 } from "node:path";
function writebackMemory(opts) {
  const cwd = opts.cwd ?? findWorkspaceRoot();
  const path = join16(cwd, "WANWU.md");
  const stamp = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const entry = `
- (${stamp}) ${opts.note.trim()}
`;
  if (!opts.yes) {
    console.log(`Dry-run writeback to ${path}:`);
    console.log(entry);
    console.log("Re-run with --yes to apply.");
    return path;
  }
  if (!existsSync16(path)) {
    writeFileSync7(path, `# WANWU.md

## Learned
${entry}`, "utf8");
    return path;
  }
  const current = readFileSync11(path, "utf8");
  if (!/^## Learned/m.test(current)) {
    appendFileSync2(path, `
## Learned
${entry}`, "utf8");
  } else {
    const updated = current.replace(/^(## Learned\n)/m, `$1${entry}`);
    writeFileSync7(path, updated, "utf8");
  }
  console.log(`Updated ${path}`);
  return path;
}

// packages/wanwu-cli/src/parallelCmd.ts
init_workspaceRoot();
function runParallelCommand(args) {
  const cwd = findWorkspaceRoot();
  const [sub] = args;
  if (sub === "demo" || sub === void 0) {
    const result = runParallelMarkers(cwd, [
      {
        name: "agent-a",
        markerRelativePath: ".wanwu/markers/agent-a.txt",
        markerContents: `A-${Date.now()}`
      },
      {
        name: "agent-b",
        markerRelativePath: ".wanwu/markers/agent-b.txt",
        markerContents: `B-${Date.now()}`
      }
    ]);
    console.log(JSON.stringify(result, null, 2));
    if (result.collidedOnMain) {
      console.error("FAIL: markers leaked into main checkout");
      cleanupParallel(cwd, result.agents.map((a) => a.name));
      return 1;
    }
    console.log("OK: two worktree agents isolated; main untouched");
    if (args.includes("--cleanup")) {
      cleanupParallel(
        cwd,
        result.agents.map((a) => a.name)
      );
      console.log("cleaned up worktrees");
    }
    return 0;
  }
  if (sub === "cleanup") {
    cleanupParallel(cwd, ["agent-a", "agent-b"]);
    console.log("cleaned parallel agent-a/agent-b worktrees");
    return 0;
  }
  console.error("wanwu parallel [demo|cleanup] [--cleanup]");
  return 2;
}

// packages/wanwu-cli/src/plan.ts
import { mkdirSync as mkdirSync6, writeFileSync as writeFileSync8 } from "node:fs";
import { join as join17 } from "node:path";

// packages/wanwu-workflow/src/index.ts
var TRANSITIONS = {
  idle: { start_explore: "explore", draft_plan: "plan_draft", start_act: "acting" },
  explore: { draft_plan: "plan_draft", start_act: "acting", reset: "idle" },
  plan_draft: { approve_plan: "plan_approved", reject_plan: "plan_draft", reset: "idle" },
  plan_approved: { start_act: "acting", reject_plan: "plan_draft", reset: "idle" },
  acting: { start_verify: "verifying", reset: "idle" },
  verifying: { verify_pass: "done", verify_fail: "acting", reset: "idle" },
  done: { reset: "idle", start_explore: "explore" },
  failed: { reset: "idle" }
};
var WorkflowMachine = class {
  state;
  constructor(initial = "idle") {
    this.state = initial;
  }
  can(event) {
    return Boolean(TRANSITIONS[this.state][event]);
  }
  send(event) {
    const next = TRANSITIONS[this.state][event];
    if (!next) {
      throw new Error(`Invalid transition: ${this.state} + ${event}`);
    }
    this.state = next;
    return this.state;
  }
};

// packages/wanwu-cli/src/plan.ts
init_memory();
init_workspaceRoot();
function runPlan(task, cwd = findWorkspaceRoot()) {
  const wf = new WorkflowMachine();
  wf.send("start_explore");
  wf.send("draft_plan");
  const memory = discoverMemory(cwd);
  const stamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const dir = join17(cwd, ".wanwu", "plans");
  mkdirSync6(dir, { recursive: true });
  const outPath = join17(dir, `${stamp}.plan.md`);
  const body = `# Wanwu Plan

- created: ${(/* @__PURE__ */ new Date()).toISOString()}
- workflow_state: ${wf.state}
- memory: ${memory.map((m) => m.kind).join(", ") || "(none)"}

## Task

${task}

## Proposed Steps

1. Explore relevant files and failing tests/diagnostics
2. Implement the smallest correct change
3. Run Verify (test/lint/typecheck)
4. Summarize diff and commit message (do not push)

## Risks

- Avoid unrelated refactors
- Respect permissionMode / sandbox

## Approval

Reply with \`wanwu\` Agent mode after reviewing this plan, or edit this file first.
`;
  writeFileSync8(outPath, body, "utf8");
  console.log(outPath);
  return outPath;
}

// packages/wanwu-cli/src/index.ts
init_permission();

// packages/wanwu-cli/src/verify.ts
import { spawnSync as spawnSync10 } from "node:child_process";
init_workspaceRoot();
function runVerify(cwd = findWorkspaceRoot()) {
  const wf = new WorkflowMachine("acting");
  wf.send("start_verify");
  console.log(`[wanwu verify] workflow \u2192 ${wf.state} (isolated checker)`);
  const steps = [
    ["pnpm", ["typecheck"]],
    ["pnpm", ["test"]],
    ["pnpm", ["lint"]]
  ];
  for (const [cmd, args] of steps) {
    console.log(`[wanwu verify] $ ${cmd} ${args.join(" ")}`);
    const result = spawnSync10(cmd, args, { cwd, encoding: "utf8", env: process.env });
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    if ((result.status ?? 1) !== 0) {
      wf.send("verify_fail");
      console.error(`[wanwu verify] FAILED at ${cmd}; workflow \u2192 ${wf.state}`);
      return result.status ?? 1;
    }
  }
  wf.send("verify_pass");
  console.log(`[wanwu verify] PASSED; workflow \u2192 ${wf.state}`);
  return 0;
}

// packages/wanwu-cli/src/index.ts
init_workspaceRoot();
function usage() {
  console.log(`wanwu \u2014 Wanwu-Code CLI

Usage:
  wanwu doctor              Check config, providers, grok ACP bridge, memory
  wanwu inspect             Print merged config + memory/skills/hooks/mcp (JSON)
  wanwu acp                 Start ACP server (bridges to Grok Build by default)
  wanwu exec -p|--prompt    Headless one-shot prompt
  wanwu plan -p|--prompt    Write a Plan artifact under .wanwu/plans/
  wanwu verify              Run isolated typecheck/test/lint gate
  wanwu memory-writeback -p|--prompt <note> [--yes]
  wanwu check-perm -p|--prompt <bash>   Deny-first permission probe
  wanwu hooks <event>       Run hooks (PreToolUse|PostToolUse|Stop)
  wanwu cloud ...           Headless cloud runner (local/docker, review-first)
  wanwu parallel ...        Parallel worktree isolation demo
  wanwu help                Show this help

Env:
  WANWU_ACP_COMMAND         Override ACP backend command line
  WANWU_GROK_ACP_ARGS       Args for grok ACP (default: "acp")
  WANWU_GROK_EXEC_ARGS      Args prefix for grok exec (default: "exec --prompt")
  WANWU_PROVIDER            Override active provider (openai|anthropic|xai|ollama|custom)
  WANWU_MODEL               Override model id
  OPENAI_BASE_URL           OpenAI-compatible API base (e.g. https://api.deepseek.com)
  WANWU_FORCE_DETERMINISTIC=1  Disable LLM; use native heuristic loop
`);
  process.exit(0);
}
function readPrompt(rest) {
  let prompt = "";
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "-p" || a === "--prompt") {
      prompt = rest[i + 1] ?? "";
      i += 1;
    } else if (a?.startsWith("--prompt=")) {
      prompt = a.slice("--prompt=".length);
    } else if (!prompt && a && !a.startsWith("--")) {
      prompt = a;
    }
  }
  return prompt;
}
function hasFlag(rest, name) {
  return rest.includes(name);
}
async function main(argv) {
  while (argv[0] === "--") {
    argv = argv.slice(1);
  }
  if (argv.includes("--wanwu-internal-acp") || process.env.WANWU_INTERNAL_ACP === "1") {
    const { startNativeAcpStdioServer: startNativeAcpStdioServer2 } = await Promise.resolve().then(() => (init_acpServer(), acpServer_exports));
    startNativeAcpStdioServer2();
    await new Promise(() => {
    });
    return 0;
  }
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case void 0:
    case "help":
    case "-h":
    case "--help":
      usage();
      break;
    case "doctor":
      return printDoctor(runDoctor());
    case "inspect":
      runInspect();
      return 0;
    case "acp":
      return await runAcpProxy();
    case "exec": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu exec requires -p/--prompt");
        return 2;
      }
      return await runExec({ prompt });
    }
    case "plan": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu plan requires -p/--prompt");
        return 2;
      }
      runPlan(prompt);
      return 0;
    }
    case "verify":
      return runVerify();
    case "memory-writeback": {
      const note = readPrompt(rest);
      if (!note) {
        console.error("wanwu memory-writeback requires -p/--prompt <note>");
        return 2;
      }
      writebackMemory({ note, yes: hasFlag(rest, "--yes") });
      return 0;
    }
    case "check-perm": {
      const prompt = readPrompt(rest);
      if (!prompt) {
        console.error("wanwu check-perm requires -p/--prompt <bash>");
        return 2;
      }
      const verdict = assessBash(prompt, "ask");
      console.log(JSON.stringify(verdict, null, 2));
      return verdict.allow ? 0 : 1;
    }
    case "hooks": {
      const event = rest[0] ?? "PostToolUse";
      const result = runHooks(findWorkspaceRoot(), event);
      for (const line of result.outputs) console.log(line);
      return result.ok ? 0 : 1;
    }
    case "cloud":
      return await runCloudCommand(rest);
    case "parallel":
      return runParallelCommand(rest);
    default:
      console.error(`Unknown command: ${cmd}`);
      usage();
  }
}
main(process.argv.slice(2)).then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
/*! Bundled license information:

smol-toml/dist/date.js:
smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/util.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
