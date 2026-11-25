// 화면 공통 도우미: 안전한 HTML 템플릿, 모달, 알림, 칩 선택, 날짜·금액 형식

// ---------- HTML ----------
export class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderVal(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(renderVal).join('');
  return esc(v);
}

/** 끼워 넣는 값은 자동으로 이스케이프된다. html`` 결과끼리는 그대로 합쳐진다. */
export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < vals.length) out += renderVal(vals[i]); });
  return new Raw(out);
}

export function setHTML(el, content) { el.innerHTML = String(content); return el; }

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 이벤트 위임: on(root, 'click', '[data-act=save]', (e, el) => ...) */
export function on(root, type, selector, handler) {
  const fn = (e) => {
    const el = e.target.closest(selector);
    if (!el || !root.contains(el)) return;
    try {
      const r = handler(e, el);
      // 비동기 처리 중 오류가 나면 화면에 알려 준다
      if (r && typeof r.catch === 'function') r.catch((err) => { console.error(err); toast(err.message || String(err), 'error'); });
    } catch (err) {
      console.error(err);
      toast(err.message || String(err), 'error');
    }
  };
  root.addEventListener(type, fn);
  return () => root.removeEventListener(type, fn);
}

// ---------- 형식 ----------
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function thisMonth() { return today().slice(0, 7); }
export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export function fmtDate(s) {
  if (!s) return '';
  const [d, t] = String(s).split(/[T ]/);
  const out = d.replace(/-/g, '.');
  return t ? `${out} ${t.slice(0, 5)}` : out;
}
export function fmtMonth(s) { if (!s) return ''; const [y, m] = s.split('-'); return `${y}년 ${Number(m)}월`; }
export function won(n) { return `${Number(n || 0).toLocaleString('ko-KR')}원`; }
export function dday(dateStr) {
  const t = new Date(today() + 'T00:00:00');
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  const diff = Math.round((d - t) / 86400000);
  if (diff === 0) return 'D-DAY';
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}
export function phoneLink(p) { return p ? html`<a class="tel" href="tel:${p.replace(/[^0-9+]/g, '')}">${p}</a>` : ''; }

export const STATUS_LIST = ['상담중', '체험', '등록', '보류', '미등록', '퇴원'];
export function statusBadge(s) { return html`<span class="badge st-${s}">${s}</span>`; }

export const GRADES = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3', 'N수', '성인', '기타'];
export const DEFAULT_GRADE = { elem: '초3', mid: '중1', high1: '고1', high2: '고2' };

// ---------- 칩 (버튼형 선택) ----------
/** chips('source', ['a','b'], ['a'], {multi:true}) */
export function chips(name, options, selected = [], { multi = false } = {}) {
  const sel = new Set(Array.isArray(selected) ? selected : [selected].filter(Boolean));
  return html`<div class="chips" data-chips="${name}" ${multi ? raw('data-multi') : ''}>
    ${options.map((o) => html`<button type="button" class="chip ${sel.has(o) ? 'on' : ''}" data-value="${o}">${o}</button>`)}
  </div>`;
}
export function bindChips(root) {
  return on(root, 'click', '.chip', (e, el) => {
    const group = el.closest('.chips');
    if (!group.hasAttribute('data-multi')) {
      const wasOn = el.classList.contains('on');
      group.querySelectorAll('.chip').forEach((c) => c.classList.remove('on'));
      if (!wasOn || group.hasAttribute('data-required')) el.classList.add('on');
    } else {
      el.classList.toggle('on');
    }
    group.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
export function chipValue(root, name) {
  const group = root.querySelector(`[data-chips="${name}"]`);
  if (!group) return undefined;
  const vals = Array.from(group.querySelectorAll('.chip.on')).map((c) => c.dataset.value);
  return group.hasAttribute('data-multi') ? vals : (vals[0] || '');
}

/** form 안의 name 있는 입력값을 객체로 */
export function formValues(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
    else out[el.name] = el.value.trim();
  });
  return out;
}

// ---------- 모달 / 알림 ----------
let modalStack = [];

export function openModal({ title, body, actions = [], wide = false, onOpen, className = '', dismissible = true }) {
  const root = document.getElementById('modal-root');
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = String(html`
    <div class="modal ${wide ? 'wide' : ''} ${className}" role="dialog">
      ${title ? html`<div class="modal-head"><h2>${title}</h2>${dismissible ? html`<button class="icon-btn" data-close aria-label="닫기">✕</button>` : ''}</div>` : ''}
      <div class="modal-body">${body}</div>
      ${actions.length ? html`<div class="modal-actions">${actions.map((a, i) => html`
        <button class="btn ${a.primary ? 'primary' : ''} ${a.danger ? 'danger' : ''}" data-action="${i}">${a.label}</button>`)}</div>` : ''}
    </div>`);
  root.appendChild(wrap);
  const modal = wrap.querySelector('.modal');
  const ctrl = {
    el: modal,
    dismissible,
    close() {
      wrap.remove();
      modalStack = modalStack.filter((m) => m !== ctrl);
    },
  };
  modalStack.push(ctrl);
  wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) wrap.dataset.downOnBackdrop = '1'; });
  wrap.addEventListener('click', async (e) => {
    if (e.target === wrap && wrap.dataset.downOnBackdrop) { if (dismissible) ctrl.close(); return; }
    delete wrap.dataset.downOnBackdrop;
    if (e.target.closest('[data-close]')) { ctrl.close(); return; }
    const btn = e.target.closest('[data-action]');
    if (btn && btn.closest('.modal-actions')) {
      const a = actions[Number(btn.dataset.action)];
      if (!a.onClick) { ctrl.close(); return; }
      btn.disabled = true;
      try {
        const keep = await a.onClick(ctrl);
        if (keep !== false) ctrl.close();
      } catch (err) {
        toast(err.message || String(err), 'error');
      } finally {
        btn.disabled = false;
      }
    }
  });
  if (onOpen) onOpen(modal, ctrl);
  const first = modal.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select');
  if (first && !('ontouchstart' in window)) setTimeout(() => first.focus(), 30);
  return ctrl;
}

export function closeTopModal() {
  const top = modalStack[modalStack.length - 1];
  if (top && top.dismissible) { top.close(); return true; }
  return false;
}
export function closeAllModals() {
  [...modalStack].reverse().forEach((m) => m.close());
}
export function hasModal() { return modalStack.length > 0; }

export function confirmDialog(message, { okLabel = '확인', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      body: html`<p class="confirm-msg">${message}</p>`,
      actions: [
        { label: '취소', onClick: () => { done = true; resolve(false); } },
        { label: okLabel, primary: !danger, danger, onClick: () => { done = true; resolve(true); } },
      ],
    });
    const origClose = m.close;
    m.close = () => { origClose(); if (!done) resolve(false); };
  });
}

export function toast(message, type = 'ok') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, type === 'error' ? 4000 : 2200);
}

export function emptyState(text, sub = '') {
  return html`<div class="empty"><div class="empty-star">✦</div><p>${text}</p>${sub ? html`<p class="muted">${sub}</p>` : ''}</div>`;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
