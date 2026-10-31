// Minimální tolerantní JSON parser (přepis Json.kt): klíče bez uvozovek, apostrofy, čárky na konci.
// Vrací objekty, pole, řetězce, čísla (number), boolean nebo null.

export type JVal = null | boolean | number | string | JVal[] | { [k: string]: JVal };

class P {
  i = 0;
  constructor(readonly s: string) {}
  ws() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++;
  }
  value(): JVal {
    this.ws();
    if (this.i >= this.s.length) throw new Error("Konec JSON");
    const c = this.s[this.i];
    switch (c) {
      case "{": return this.obj();
      case "[": return this.arr();
      case '"': case "'": return this.str(c);
      case "t": this.expect("true"); return true;
      case "f": this.expect("false"); return false;
      case "n": this.expect("null"); return null;
      default: return this.num();
    }
  }
  expect(w: string) {
    if (!this.s.startsWith(w, this.i)) throw new Error(`Čekal jsem ${w} na ${this.i}`);
    this.i += w.length;
  }
  obj(): { [k: string]: JVal } {
    const m: { [k: string]: JVal } = {};
    this.i++;
    this.ws();
    if (this.s[this.i] === "}") { this.i++; return m; }
    for (;;) {
      this.ws();
      const q = this.s[this.i];
      const key = q === '"' || q === "'" ? this.str(q) : this.ident();
      this.ws();
      if (this.s[this.i] !== ":") throw new Error(`Čekal jsem : na ${this.i}`);
      this.i++;
      m[key] = this.value();
      this.ws();
      const c = this.s[this.i];
      if (c === ",") { this.i++; this.ws(); if (this.s[this.i] === "}") { this.i++; return m; } }
      else if (c === "}") { this.i++; return m; }
      else throw new Error(`Čekal jsem , nebo } na ${this.i}`);
    }
  }
  ident(): string {
    const st = this.i;
    while (this.i < this.s.length && /[\p{L}\p{N}_$]/u.test(this.s[this.i])) this.i++;
    return this.s.substring(st, this.i);
  }
  arr(): JVal[] {
    const l: JVal[] = [];
    this.i++;
    this.ws();
    if (this.s[this.i] === "]") { this.i++; return l; }
    for (;;) {
      l.push(this.value());
      this.ws();
      const c = this.s[this.i];
      if (c === ",") { this.i++; this.ws(); if (this.s[this.i] === "]") { this.i++; return l; } }
      else if (c === "]") { this.i++; return l; }
      else throw new Error(`Čekal jsem , nebo ] na ${this.i}`);
    }
  }
  str(q: string): string {
    let sb = "";
    this.i++;
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (c === q) { this.i++; return sb; }
      if (c === "\\") {
        this.i++;
        const e = this.s[this.i];
        switch (e) {
          case "n": sb += "\n"; break;
          case "t": sb += "\t"; break;
          case "r": sb += "\r"; break;
          case "b": sb += "\b"; break;
          case "f": sb += "\f"; break;
          case "u":
            sb += String.fromCharCode(parseInt(this.s.substring(this.i + 1, this.i + 5), 16));
            this.i += 4;
            break;
          default: sb += e;
        }
        this.i++;
      } else {
        sb += c;
        this.i++;
      }
    }
    throw new Error("Neukončený řetězec");
  }
  num(): number {
    const st = this.i;
    while (this.i < this.s.length && /[0-9+\-.eE]/.test(this.s[this.i])) this.i++;
    if (st === this.i) throw new Error(`Neznámý znak '${this.s[this.i]}' na ${this.i}`);
    const v = Number(this.s.substring(st, this.i));
    if (Number.isNaN(v)) throw new Error("Špatné číslo");
    return v;
  }
}

export const Json = {
  parse(text: string): JVal {
    const p = new P(text);
    p.ws();
    return p.value();
  },
  parseOrNull(text: string | null | undefined): JVal | undefined {
    if (text == null) return undefined;
    try { return Json.parse(text); } catch { return undefined; }
  },
};

export function asMap(v: unknown): { [k: string]: JVal } | null {
  return v != null && typeof v === "object" && !Array.isArray(v) ? (v as any) : null;
}
export function asList(v: unknown): JVal[] | null {
  return Array.isArray(v) ? v : null;
}
export function toIntOrNull(s: string | null | undefined): number | null {
  if (s == null) return null;
  if (!/^[+-]?\d+$/.test(s)) return null;
  const v = parseInt(s, 10);
  return v > 2147483647 || v < -2147483648 ? null : v;
}
export function toDoubleOrNull(s: string | null | undefined): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "" || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  return Number(t);
}
export function asInt(v: unknown): number | null {
  if (typeof v === "number") return Math.trunc(v);
  if (typeof v === "string") return toIntOrNull(v.trim());
  return null;
}
export function asDouble(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") return toDoubleOrNull(v.trim().replace(/,/g, "."));
  return null;
}
export function asStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  return String(v);
}
