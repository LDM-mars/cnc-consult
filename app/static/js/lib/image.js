// 사진 줄이기: 폰 사진(수 MB)을 긴 변 2000px JPEG로 줄여서 올린다
async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* 아래로 */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지를 읽을 수 없습니다.')); };
    img.src = url;
  });
}

export async function resizeImage(file, maxSide = 2000, quality = 0.86) {
  const src = await decode(file);
  const w = src.width, h = src.height;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
}

/** 원본 + 썸네일 두 개를 만든다 */
export async function makeImageAndThumb(file) {
  const [full, thumb] = await Promise.all([resizeImage(file, 2000), resizeImage(file, 480, 0.8)]);
  return { full, thumb };
}
