/**
 * Repairs mojibake: UTF-8 text that was decoded as Latin-1/Windows-1252 somewhere along the way,
 * so "×" shows up as "Ã—" and "—" as "â€”". It happens to email subjects when UTF-8 bytes go into a
 * header without RFC 2047 encoding — and a reply built from the already-garbled subject garbles it
 * again ("ÃƒÂ—"), which is why this undoes up to three rounds.
 *
 * Conservative on purpose: a string is only changed when every character maps back to a single byte
 * and those bytes form valid UTF-8, so genuine accented text ("São Paulo", "crème brûlée") and
 * anything already correct is returned untouched.
 */

// Windows-1252 characters in the 0x80–0x9F range, which is where "€", "—", "”" etc. land.
const CP1252_BYTES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// A UTF-8 lead byte (as a Latin-1 char) followed by a continuation byte (Latin-1 or its CP1252 form).
const SUSPECT =
  /[Â-ô][-¿ŒœŠšŸŽžƒˆ˜–—‘-„†-•…‰‹›€™]/;

export function repairMojibake(text: string): string {
  if (!text) return text;
  let current = text;
  for (let pass = 0; pass < 3 && SUSPECT.test(current); pass++) {
    const bytes: number[] = [];
    for (const ch of current) {
      const code = ch.codePointAt(0)!;
      if (code <= 0xff) bytes.push(code);
      else if (CP1252_BYTES[code] !== undefined) bytes.push(CP1252_BYTES[code]);
      else return current; // a character that was never a single byte — not mojibake we can undo
    }
    try {
      current = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    } catch {
      return current; // not valid UTF-8, so the text wasn't mis-decoded UTF-8 after all
    }
  }
  return current;
}
