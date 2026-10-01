#!/usr/bin/env node
// Genuine legacy-encoded test bytes (EUC-JP / Shift_JIS).
//
// WHY THIS EXISTS
//   The live importer read a ~1.18 MB goo-net listing and reported Japanese
//   names full of replacement characters ("\uFFFD\u0225\u897F\uFFFD…"), because
//   Response.text() decodes UTF-8 BY SPECIFICATION and goo-net serves EUC-JP.
//   A fixture that holds Japanese text in a UTF-8 JavaScript file cannot
//   reproduce that: the bytes are already UTF-8. These helpers hand the tests
//   REAL legacy bytes, so the decode path is exercised the way the wire
//   exercises it.
//
// HOW
//   Node's TextDecoder can DECODE euc-jp / shift_jis but nothing can encode
//   them, so the reverse map is built by decoding every valid double-byte
//   sequence once and keeping the sequences that decode cleanly to a single
//   character. A round-trip assertion in the tests proves the encoder is real.
//   With the WHATWG Encoding label set, these are the exact byte values a
//   Japanese server would send.

const encoderCache = new Map();

export function legacyEncoder(encoding = 'euc-jp') {
  const key = String(encoding).toLowerCase();
  if (encoderCache.has(key)) return encoderCache.get(key);
  const decoder = new TextDecoder(key);
  const map = new Map();
  const leadStart = key === 'shift_jis' ? 0x81 : 0xA1;
  const leadEnd = key === 'shift_jis' ? 0xFE : 0xFE;
  const tailStart = key === 'shift_jis' ? 0x40 : 0xA1;
  const tailEnd = key === 'shift_jis' ? 0xFC : 0xFE;
  for (let hi = leadStart; hi <= leadEnd; hi++) {
    for (let lo = tailStart; lo <= tailEnd; lo++) {
      const s = decoder.decode(Uint8Array.from([hi, lo]));
      if (s.length === 1 && s.charCodeAt(0) !== 0xFFFD && !map.has(s)) map.set(s, [hi, lo]);
    }
  }
  const encode = str => {
    const out = [];
    for (const ch of String(str)) {
      const code = ch.codePointAt(0);
      if (code < 0x80) { out.push(code); continue; }
      const pair = map.get(ch);
      if (!pair) throw new Error(`no ${key} mapping for ${JSON.stringify(ch)}`);
      out.push(pair[0], pair[1]);
    }
    return Uint8Array.from(out);
  };
  encode.mappingSize = map.size;
  encoderCache.set(key, encode);
  return encode;
}

// A Response-shaped fetch result built from real bytes. `text()` deliberately
// behaves like the fetch spec — UTF-8 only, ignoring the header charset — so a
// test that reads it sees exactly the corruption production saw.
export function byteResponse(bytes, { status = 200, contentType = 'text/html; charset=euc-jp', setCookie = null, finalUrl = null } = {}) {
  const body = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return {
    ok: status < 400,
    status,
    url: finalUrl || undefined,
    headers: {
      get: k => {
        const name = String(k).toLowerCase();
        if (name === 'content-type') return contentType;
        if (name === 'set-cookie') return setCookie;
        if (name === 'content-length') return String(body.length);
        return null;
      }
    },
    arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
    text: async () => new TextDecoder('utf-8').decode(body)
  };
}
