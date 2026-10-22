// Tiny MP3 frame walker: total duration in ms (used to fit borrowed word timings onto generative audio).
const BITRATES: Record<string, number[]> = {
  v1l3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  v2l3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};
const RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

export function mp3DurationMs(buf: Uint8Array): number {
  let i = 0;
  // Skip ID3v2 tag.
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  }
  let samples = 0; let rate = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (buf[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
    const layer = (buf[i + 1] >> 1) & 3; // 1 = layer III
    const bri = (buf[i + 2] >> 4) & 15; const sri = (buf[i + 2] >> 2) & 3; const pad = (buf[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const br = (ver === 3 ? BITRATES.v1l3 : BITRATES.v2l3)[bri] * 1000;
    rate = RATES[ver][sri];
    const spf = ver === 3 ? 1152 : 576;
    const len = Math.floor((spf / 8) * br / rate) + pad;
    if (len < 4) { i++; continue; }
    samples += spf; i += len;
  }
  return rate ? Math.round((samples / rate) * 1000) : 0;
}
