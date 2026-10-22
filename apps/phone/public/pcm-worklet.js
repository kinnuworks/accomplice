// Turns the mic signal into 16 kHz, 16-bit, mono, little-endian PCM.
// Runs on the audio thread. Posts one 100 ms chunk at a time plus a level (0..1)
// so the talk button can glow with your voice.
class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000; // input samples per output sample
    this.pos = 0;
    this.acc = 0;
    this.accN = 0;
    this.out = new Int16Array(1600);
    this.n = 0;
    this.sumSq = 0;
  }

  push(v) {
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    this.sumSq += v * v;
    this.out[this.n++] = v < 0 ? v * 0x8000 : v * 0x7fff;
    if (this.n === this.out.length) {
      const level = Math.min(1, Math.sqrt(this.sumSq / this.n) * 4);
      const buf = this.out.buffer;
      this.port.postMessage({ pcm: buf, level }, [buf]);
      this.out = new Int16Array(1600);
      this.n = 0;
      this.sumSq = 0;
    }
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch = input[0];
    // Average the input samples that fall into each output sample. A simple box
    // filter is enough to keep speech clean when going from 44.1/48 kHz to 16 kHz.
    for (let i = 0; i < ch.length; i++) {
      let s = ch[i];
      if (input.length > 1) s = (s + input[1][i]) / 2;
      this.acc += s;
      this.accN++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        this.push(this.acc / this.accN);
        this.acc = 0;
        this.accN = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm-worklet', PcmWorklet);
