// 터치/마우스 서명 패드
export function signaturePad(canvas) {
  const ctx = canvas.getContext('2d');
  let drawing = false;
  let empty = true;
  let last = null;

  function resize() {
    const r = canvas.getBoundingClientRect();
    // 무대가 축소되어 있어도 선명하게: 실제 CSS 크기(무대 기준)로 캔버스 해상도를 맞춘다
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#222';
    return r;
  }
  resize();

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
  }
  canvas.addEventListener('pointerdown', (e) => {
    drawing = true; last = pos(e); canvas.setPointerCapture(e.pointerId);
    ctx.beginPath(); ctx.arc(last.x, last.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
    empty = false; canvas.dispatchEvent(new Event('signed'));
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    const p = pos(e);
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last = p;
  });
  const end = () => { drawing = false; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  return {
    isEmpty: () => empty,
    clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; },
    toBlob: () => new Promise((res) => canvas.toBlob(res, 'image/png')),
  };
}
