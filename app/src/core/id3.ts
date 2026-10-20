// 음악 파일 내장 커버(ID3v2 APIC / v2.2 PIC) 추출. 플랫폼 무관 순수 파서.

export interface EmbeddedCover {
  mime: string;
  data: Uint8Array;
}

const synchsafe = (b: Uint8Array, o: number) =>
  ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u24 = (b: Uint8Array, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];

function skipText(b: Uint8Array, o: number, end: number, encoding: number) {
  const wide = encoding === 1 || encoding === 2;
  if (wide) {
    while (o + 1 < end && !(b[o] === 0 && b[o + 1] === 0)) o += 2;
    return o + 2;
  }
  while (o < end && b[o] !== 0) o++;
  return o + 1;
}

function sniffMime(data: Uint8Array, fallback: string) {
  if (data[0] === 0x89 && data[1] === 0x50) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8) return 'image/jpeg';
  return fallback || 'image/jpeg';
}

export function parseId3Cover(buf: ArrayBuffer | Uint8Array): EmbeddedCover | null {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (b.length < 10 || b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null; // "ID3"
  const major = b[3];
  const flags = b[5];
  const tagEnd = Math.min(b.length, 10 + synchsafe(b, 6));
  let o = 10;
  if (flags & 0x40) {
    // 확장 헤더 건너뛰기
    o += major === 4 ? synchsafe(b, o) : u32(b, o) + 4;
  }

  while (o + (major === 2 ? 6 : 10) <= tagEnd) {
    let id: string;
    let size: number;
    let header: number;
    if (major === 2) {
      id = String.fromCharCode(b[o], b[o + 1], b[o + 2]);
      size = u24(b, o + 3);
      header = 6;
    } else {
      id = String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
      size = major === 4 ? synchsafe(b, o + 4) : u32(b, o + 4);
      header = 10;
    }
    if (!/^[A-Z0-9]{3,4}$/.test(id) || size <= 0) break;
    const start = o + header;
    const end = Math.min(tagEnd, start + size);

    if (id === 'APIC' || id === 'PIC') {
      const enc = b[start];
      let p = start + 1;
      let mime = '';
      if (id === 'APIC') {
        const mEnd = skipText(b, p, end, 0);
        mime = String.fromCharCode(...b.subarray(p, mEnd - 1));
        p = mEnd;
      } else {
        const fmt = String.fromCharCode(b[p], b[p + 1], b[p + 2]).toLowerCase();
        mime = fmt === 'png' ? 'image/png' : 'image/jpeg';
        p += 3;
      }
      p += 1; // picture type
      p = skipText(b, p, end, enc); // description
      const data = b.slice(p, end);
      if (data.length > 16) return { mime: sniffMime(data, mime), data };
    }
    o = end;
  }
  return null;
}
