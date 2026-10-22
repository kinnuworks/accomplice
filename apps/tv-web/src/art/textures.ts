// Small generated textures (no image downloads): film grain and paper fibre, tiled with CSS.
function noiseTile(size: number, alpha: number, tint: [number, number, number], fibres = 0): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    img.data[i] = tint[0]; img.data[i + 1] = tint[1]; img.data[i + 2] = tint[2];
    img.data[i + 3] = v * alpha * 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = `rgba(${tint.join(',')},${alpha * 0.9})`;
  for (let i = 0; i < fibres; i++) {
    ctx.lineWidth = Math.random() * 0.8 + 0.2;
    ctx.beginPath();
    const x = Math.random() * size, y = Math.random() * size;
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.random() * 20 - 10, y + Math.random() * 20 - 10, x + Math.random() * 30 - 15, y + Math.random() * 30 - 15);
    ctx.stroke();
  }
  return c.toDataURL('image/png');
}

export function installTextures(): void {
  const root = document.documentElement.style;
  try {
    root.setProperty('--grain', `url(${noiseTile(160, 0.07, [255, 240, 220])})`);
    root.setProperty('--paper-tex', `url(${noiseTile(200, 0.09, [110, 80, 40], 40)})`);
  } catch { /* textures are decoration only */ }
}
