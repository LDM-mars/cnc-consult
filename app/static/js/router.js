// 해시 라우터: #/toc, #/class/elem 같은 주소로 화면을 바꾼다.
import * as stage from './stage.js';
import { closeAllModals, closeTopModal, hasModal, toast } from './ui.js';

const routes = [];
let current = null;      // { route, params, cleanup, parent }
let renderSeq = 0;
let adminReturn = '#/toc';

export function addRoute(pattern, loader, { parent = null, inner = true, admin = true } = {}) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ pattern, regex, keys, loader, parent, inner, admin });
}

export function go(path, { replace = false } = {}) {
  const hash = path.startsWith('#') ? path : '#' + path;
  if (location.hash === hash) { render(); return; }
  if (replace) history.replaceState(null, '', hash); else location.hash = hash;
  if (replace) render();
}

export function back() {
  if (hasModal()) { closeTopModal(); return; }
  if (!current) return;
  const p = typeof current.parent === 'function' ? current.parent(current.params) : current.parent;
  if (p) go(p);
}

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { route: r, params, query, path };
    }
  }
  return null;
}

export async function render() {
  const seq = ++renderSeq;
  const found = parseHash();
  if (!found) { go('/', { replace: true }); return; }
  const { route, params, query, path } = found;

  if (!path.startsWith('/admin')) adminReturn = '#' + location.hash.replace(/^#/, '');

  if (current && current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  closeAllModals();

  // 화면마다 새 그릇(view)을 만든다. 이전 화면의 이벤트 처리기가 남아 새 화면에서 동작하지 않도록.
  const pageEl = stage.page(), footEl = stage.foot();
  const view = document.createElement('div');
  view.className = 'view';
  const footView = document.createElement('div');
  footView.className = 'view';
  const ctx = {
    params, query, path,
    page: view,
    foot: footView,
    go,
    back,
    setTitle: stage.setTitle,
    setParent(p) { if (current) current.parent = p; },
    isCurrent: () => seq === renderSeq,
  };
  current = { route, params, cleanup: null, parent: route.parent };

  await stage.transition(async () => {
    if (seq !== renderSeq) return;
    pageEl.replaceChildren(view);
    footEl.replaceChildren(footView);
    pageEl.scrollTop = 0;
    stage.setTitle('');
    stage.clearLayers();
    if (route.inner) await stage.setBackground('3.배경.png');
    stage.setHotspots({
      back: route.parent ? back : null,
      admin: route.admin ? () => go('/admin') : null,
    });
    try {
      const mod = await route.loader();
      if (seq !== renderSeq) return;
      const cleanup = await mod.default(ctx);
      if (seq === renderSeq) current.cleanup = typeof cleanup === 'function' ? cleanup : null;
    } catch (e) {
      console.error(e);
      if (seq === renderSeq) {
        ctx.page.innerHTML = `<div class="empty"><div class="empty-star">✦</div><p>화면을 불러오지 못했습니다.</p><p class="muted"></p></div>`;
        ctx.page.querySelector('.muted').textContent = e.message || String(e);
        toast(e.message || String(e), 'error');
      }
    }
    // 이미지 화면처럼 내용이 없으면 클릭이 아래 레이어로 통과되게
    if (seq === renderSeq) pageEl.classList.toggle('inactive', !view.hasChildNodes());
  });
}

export function adminReturnPath() { return adminReturn.startsWith('#/admin') ? '#/toc' : adminReturn; }

export function startRouter() {
  window.addEventListener('hashchange', render);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (hasModal()) { closeTopModal(); e.preventDefault(); return; }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) { document.activeElement.blur(); return; }
      back();
    }
  });
  render();
}
