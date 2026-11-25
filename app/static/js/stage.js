// 화면 엔진: 1920×1080 무대를 화면 크기에 맞추고, 디자인 이미지 레이어를 겹치고,
// 그림이 있는 부분(알파)만 클릭되게 한다.
import { DESIGN, HOTSPOTS, ALPHA_THRESHOLD, TITLE_RECT, CONTENT_RECT, FOOT_RECT } from './screens.js';

const W = 1920, H = 1080;
const MW = 480, MH = 270; // 알파 마스크 해상도 (1/4)

let stageEl, screenEl, bgImg, layersEl, catcherEl, pageEl, hotEl, titleEl, footEl;
let scale = 1, offX = 0, offY = 0;
let layers = [];          // { img, mask, hit, rects, onClick }
let anywhere = null;      // 화면 아무 데나 눌렀을 때
let hovered = null;
let pressTimer = null;
const hotHandlers = { back: null, admin: null };

const imgCache = new Map();
const maskCache = new Map();

export const designUrl = (file) => DESIGN + encodeURIComponent(file);

export function loadImage(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다: ' + decodeURIComponent(src)));
    img.src = src;
  });
  imgCache.set(src, p);
  p.catch(() => imgCache.delete(src));
  return p;
}

/** 레이어의 알파 마스크와 불투명 영역 경계 상자 */
export function getMask(src) {
  if (maskCache.has(src)) return maskCache.get(src);
  const p = (async () => {
    const img = await loadImage(src);
    const c = document.createElement('canvas');
    c.width = MW; c.height = MH;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, MW, MH);
    const d = ctx.getImageData(0, 0, MW, MH).data;
    const alpha = new Uint8Array(MW * MH);
    // bbox: 클릭 판정용(그림자 일부 포함), core: 거의 불투명한 부분(원형 그림 자체)
    const box = [MW, MH, -1, -1], core = [MW, MH, -1, -1];
    const grow = (b, x, y) => { if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y; };
    for (let i = 0; i < MW * MH; i++) {
      const v = d[i * 4 + 3];
      alpha[i] = v;
      if (v > ALPHA_THRESHOLD) {
        const x = i % MW, y = (i / MW) | 0;
        grow(box, x, y);
        if (v > 200) grow(core, x, y);
      }
    }
    const k = W / MW;
    const toFull = (b) => (b[2] < 0 ? null : [b[0] * k, b[1] * k, (b[2] + 1) * k, (b[3] + 1) * k]);
    return { alpha, bbox: toFull(box), core: toFull(core) || toFull(box) };
  })();
  maskCache.set(src, p);
  p.catch(() => maskCache.delete(src));
  return p;
}

function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  offX = (vw - W * scale) / 2;
  offY = (vh - H * scale) / 2;
  stageEl.style.transform = `translate(${offX}px, ${offY}px) scale(${scale})`;
}

export function toStage(clientX, clientY) {
  return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
}

function inRect(x, y, r) { return x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3]; }

function hitTest(x, y) {
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    if (L.rects && L.rects.some((r) => inRect(x, y, r))) return L;
    const m = L.mask;
    if (!m || !m.bbox) continue;
    if (L.hit === 'bbox') {
      const b = m.bbox;
      if (x >= b[0] && x < b[2] && y >= b[1] && y < b[3]) return L;
    } else {
      const mx = Math.floor((x / W) * MW), my = Math.floor((y / H) * MH);
      if (mx >= 0 && mx < MW && my >= 0 && my < MH && m.alpha[my * MW + mx] > ALPHA_THRESHOLD) return L;
    }
  }
  return null;
}

function setHover(L) {
  if (hovered === L) return;
  if (hovered) hovered.img.classList.remove('hover');
  hovered = L;
  if (L) L.img.classList.add('hover');
  catcherEl.style.cursor = L || anywhere ? 'pointer' : 'default';
}

function onMove(e) {
  if (e.pointerType === 'touch') return;
  const { x, y } = toStage(e.clientX, e.clientY);
  setHover(hitTest(x, y));
}

function onClick(e) {
  const { x, y } = toStage(e.clientX, e.clientY);
  const L = hitTest(x, y);
  if (L) {
    setHover(L);
    clearTimeout(pressTimer);
    // 눌린 효과가 잠깐 보이도록 아주 짧게 기다린다
    pressTimer = setTimeout(() => L.onClick(), e.pointerType === 'mouse' ? 60 : 160);
  } else if (anywhere) {
    anywhere();
  }
}

export function initStage() {
  stageEl = document.getElementById('stage');
  screenEl = document.getElementById('screen');
  bgImg = document.getElementById('bg');
  layersEl = document.getElementById('layers');
  catcherEl = document.getElementById('catcher');
  pageEl = document.getElementById('page');
  hotEl = document.getElementById('hot');
  titleEl = document.getElementById('title');
  footEl = document.getElementById('foot');

  Object.assign(pageEl.style, {
    left: CONTENT_RECT[0] + 'px', top: CONTENT_RECT[1] + 'px',
    width: CONTENT_RECT[2] + 'px', height: CONTENT_RECT[3] + 'px',
  });
  Object.assign(footEl.style, {
    left: FOOT_RECT[0] + 'px', top: FOOT_RECT[1] + 'px', width: FOOT_RECT[2] + 'px', height: FOOT_RECT[3] + 'px',
  });
  Object.assign(titleEl.style, {
    left: TITLE_RECT[0] + 'px', top: TITLE_RECT[1] + 'px', width: TITLE_RECT[2] + 'px', height: TITLE_RECT[3] + 'px',
  });

  for (const key of ['back', 'admin']) {
    const r = HOTSPOTS[key];
    const el = document.createElement('button');
    el.className = `hotspot hotspot-${key}`;
    el.type = 'button';
    el.dataset.key = key;
    el.title = key === 'back' ? '뒤로 (Esc)' : '관리 메뉴';
    el.setAttribute('aria-label', el.title);
    el.innerHTML = `<span class="hotspot-tip">${key === 'back' ? '뒤로' : '관리'}</span>`;
    Object.assign(el.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px' });
    el.addEventListener('click', (e) => { e.stopPropagation(); hotHandlers[key] && hotHandlers[key](); });
    hotEl.appendChild(el);
  }

  catcherEl.addEventListener('pointermove', onMove);
  catcherEl.addEventListener('pointerleave', () => setHover(null));
  catcherEl.addEventListener('click', onClick);
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 200));
  fit();
}

// ---------- 화면 구성 ----------

export async function setBackground(file) {
  const src = designUrl(file);
  await loadImage(src).catch(() => {});
  if (bgImg.getAttribute('src') !== src) bgImg.src = src;
}

/**
 * 이미지 레이어 화면을 만든다.
 * items: [{ file, hit: 'alpha'|'bbox', rects: [[x,y,w,h]], onClick }]
 */
export async function setLayers(items) {
  clearLayers();
  const loaded = await Promise.all(items.map(async (it) => {
    const src = designUrl(it.file);
    const [img, mask] = await Promise.all([loadImage(src), getMask(src)]);
    return { it, src, img, mask };
  }));
  layers = loaded.map(({ it, src, mask }) => {
    const img = document.createElement('img');
    img.className = 'layer';
    img.src = src;
    img.alt = '';
    img.draggable = false;
    if (mask.core) {
      const [x0, y0, x1, y1] = mask.core;
      img.style.transformOrigin = `${(x0 + x1) / 2}px ${(y0 + y1) / 2}px`;
    }
    layersEl.appendChild(img);
    return { img, mask, hit: it.hit || 'alpha', rects: it.rects || [], onClick: it.onClick };
  });
  catcherEl.hidden = false;
}

export function clearLayers() {
  hovered = null;
  layers = [];
  layersEl.innerHTML = '';
  anywhere = null;
  catcherEl.hidden = true;
  catcherEl.style.cursor = 'default';
}

export function setAnywhere(fn) {
  anywhere = fn;
  catcherEl.hidden = !fn && layers.length === 0;
  catcherEl.style.cursor = fn ? 'pointer' : 'default';
}

export function setHotspots({ back = null, admin = null } = {}) {
  hotHandlers.back = back;
  hotHandlers.admin = admin;
  hotEl.querySelector('.hotspot-back').hidden = !back;
  hotEl.querySelector('.hotspot-admin').hidden = !admin;
}

/** 레이어 위에 얹는 장식 요소 (클릭 통과). 화면이 바뀌면 함께 지워진다. setLayers 다음에 부를 것. */
export function addOverlay(el) {
  el.style.pointerEvents = 'none';
  layersEl.appendChild(el);
  return el;
}

export function setTitle(text) { titleEl.textContent = text || ''; }
export function page() { return pageEl; }
export function foot() { return footEl; }

/** 화면 전환 효과 */
export async function transition(renderFn) {
  screenEl.classList.add('fading');
  await new Promise((r) => setTimeout(r, 110));
  try {
    await renderFn();
  } finally {
    requestAnimationFrame(() => screenEl.classList.remove('fading'));
  }
}

/** 버튼 레이어의 원형 그림을 잘라 보여주는 요소 (반 소개의 기본 작품 이미지) */
export async function layerCrop(file, size) {
  const src = designUrl(file);
  const { core } = await getMask(src);
  const el = document.createElement('div');
  el.className = 'layer-crop';
  if (!core) return el;
  const [x0, y0, x1, y1] = core;
  const bw = x1 - x0, bh = y1 - y0;
  const k = size / Math.max(bw, bh);
  Object.assign(el.style, {
    width: `${bw * k}px`, height: `${bh * k}px`,
    backgroundImage: `url("${src}")`,
    backgroundSize: `${W * k}px ${H * k}px`,
    backgroundPosition: `${-x0 * k}px ${-y0 * k}px`,
  });
  return el;
}
