// 선택 목록(<select>)을 무대 안의 목록 창으로 연다.
// 무대 전체가 transform: scale 로 줄어 있어서 브라우저 기본 목록 창은 기기마다 크기가 제각각이고
// 항목이 많을 때 스크롤이 생기지 않는 경우가 있다. 원래 <select>는 그대로 두고(값 읽기, change 이벤트 그대로)
// 여는 방식만 바꾼다. 목록이 길면 정해진 높이 안에서 스크롤된다.

const STAGE_W = 1920, STAGE_H = 1080;
const MAX_H = 520;   // 목록 창 최대 높이(무대 px). 이보다 길면 스크롤
const GAP = 6;       // 선택칸과 목록 창 사이
const EDGE = 16;     // 화면 가장자리 여백

let stageEl = null;
let cur = null;          // { select, pop, active }
let touch = null;        // { select, x, y } 손가락으로 누르기 시작한 선택칸
let ignoreMouseUntil = 0;
let swallowClick = false;

function selectFrom(target) {
  const el = target && target.closest ? target.closest('select') : null;
  if (!el || el.multiple || el.size > 1 || el.disabled || !stageEl.contains(el)) return null;
  return el;
}

function optionEl(o) {
  const d = document.createElement('div');
  d.className = 'dd-opt';
  d.setAttribute('role', 'option');
  d.dataset.i = o.index;
  const text = o.textContent.trim();
  d.textContent = text || '선택 안 함';
  if (!text) d.classList.add('dd-none');
  if (text.length > 14) d.title = text;
  if (o.disabled || (o.parentElement && o.parentElement.disabled)) d.classList.add('disabled');
  if (o.selected) { d.classList.add('on'); d.setAttribute('aria-selected', 'true'); }
  return d;
}

function openFor(select) {
  close();
  if (!select.options.length) return;
  // pop(테두리·그림자) > list(스크롤) + 위아래 "더 있음" 표시
  const pop = document.createElement('div');
  pop.className = 'dd-pop';
  const list = document.createElement('div');
  list.className = 'dd-list';
  list.setAttribute('role', 'listbox');
  for (const child of select.children) {
    if (child.tagName === 'OPTGROUP') {
      const g = document.createElement('div');
      g.className = 'dd-group';
      g.textContent = child.label;
      list.appendChild(g);
      for (const o of child.children) if (o.tagName === 'OPTION') list.appendChild(optionEl(o));
    } else if (child.tagName === 'OPTION') {
      list.appendChild(optionEl(child));
    }
  }
  const moreTop = document.createElement('div');
  moreTop.className = 'dd-more top';
  moreTop.textContent = '▲';
  const moreBottom = document.createElement('div');
  moreBottom.className = 'dd-more bottom';
  moreBottom.textContent = '▼';
  pop.append(list, moreTop, moreBottom);

  // 선택칸 위치를 무대 좌표로 바꾼다
  const sr = stageEl.getBoundingClientRect();
  const k = sr.width / STAGE_W;
  const r = select.getBoundingClientRect();
  const left = (r.left - sr.left) / k, top = (r.top - sr.top) / k;
  const w = r.width / k, h = r.height / k;

  pop.style.minWidth = `${Math.max(w, 200)}px`;
  pop.style.visibility = 'hidden';
  stageEl.appendChild(pop);

  const BORDER = 4; // 위아래 테두리 합
  const need = list.scrollHeight + BORDER;
  const below = STAGE_H - EDGE - (top + h + GAP);
  const above = top - GAP - EDGE;
  const down = below >= Math.min(need, MAX_H) || below >= above;
  const maxH = Math.max(160, Math.min(MAX_H, down ? below : above));
  const realH = Math.min(need, maxH);
  list.style.maxHeight = `${maxH - BORDER}px`;
  pop.style.top = `${down ? top + h + GAP : top - GAP - realH}px`;
  pop.style.left = `${Math.max(EDGE, Math.min(left, STAGE_W - EDGE - pop.offsetWidth))}px`;
  if (!down) pop.classList.add('up');

  const on = list.querySelector('.dd-opt.on');
  if (on) list.scrollTop = on.offsetTop - (list.clientHeight - on.offsetHeight) / 2;
  const showMore = () => {
    pop.classList.toggle('more-above', list.scrollTop > 2);
    pop.classList.toggle('more-below', list.scrollTop + list.clientHeight < list.scrollHeight - 2);
  };
  list.addEventListener('scroll', showMore, { passive: true });
  showMore();
  pop.style.visibility = '';

  list.addEventListener('click', (e) => {
    const o = e.target.closest('.dd-opt');
    if (o && !o.classList.contains('disabled')) choose(Number(o.dataset.i));
  });
  select.classList.add('dd-open');
  select.setAttribute('aria-expanded', 'true');
  cur = { select, pop, active: on };
}

function close() {
  if (!cur) return;
  cur.pop.remove();
  cur.select.classList.remove('dd-open');
  cur.select.setAttribute('aria-expanded', 'false');
  cur = null;
}

function choose(index) {
  const { select } = cur;
  const changed = select.selectedIndex !== index;
  close();
  select.selectedIndex = index;
  if (changed) {
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function toggle(select) {
  if (cur && cur.select === select) close();
  else openFor(select);
}

/** 키보드로 목록 안에서 이동 */
function moveActive(step) {
  const opts = [...cur.pop.querySelectorAll('.dd-opt:not(.disabled)')];
  if (!opts.length) return;
  let i = opts.indexOf(cur.active) + step;
  i = Math.max(0, Math.min(opts.length - 1, i));
  if (cur.active) cur.active.classList.remove('active');
  cur.active = opts[i];
  cur.active.classList.add('active');
  cur.active.scrollIntoView({ block: 'nearest' });
}

export function initDropdowns(stage) {
  stageEl = stage;

  // 바깥을 누르면 닫는다. 그 누름은 다른 버튼을 누른 것으로 치지 않는다(기본 목록 창과 같게).
  document.addEventListener('pointerdown', (e) => {
    swallowClick = false;
    if (!cur) return;
    if (!cur.select.isConnected) { close(); return; }
    if (cur.pop.contains(e.target) || cur.select.contains(e.target)) return;
    close();
    if (!selectFrom(e.target)) swallowClick = true;
  }, true);
  document.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // 마우스: 기본 목록 창 대신 연다
  document.addEventListener('mousedown', (e) => {
    const sel = selectFrom(e.target);
    if (!sel || e.button !== 0) return;
    e.preventDefault();
    if (performance.now() < ignoreMouseUntil) return;
    sel.focus({ preventScroll: true });
    toggle(sel);
  }, true);

  // 손가락: 짧게 누르고 뗐을 때만 연다 (선택칸 위에서 시작한 화면 스크롤은 그대로 둔다)
  document.addEventListener('touchstart', (e) => {
    const sel = selectFrom(e.target);
    const t = e.touches[0];
    touch = sel && e.touches.length === 1 ? { select: sel, x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!touch) return;
    const t = e.touches[0];
    if (Math.hypot(t.clientX - touch.x, t.clientY - touch.y) > 12) touch = null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', (e) => {
    if (!touch) return;
    const sel = touch.select;
    touch = null;
    if (selectFrom(e.target) !== sel) return;
    e.preventDefault(); // 기기 기본 선택 창이 뜨지 않게
    ignoreMouseUntil = performance.now() + 700;
    toggle(sel);
  }, { capture: true, passive: false });

  // 키보드
  window.addEventListener('keydown', (e) => {
    if (cur) {
      if (!cur.select.isConnected) { close(); return; }
      const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (e.key === 'Escape') { stop(); const s = cur.select; close(); s.focus({ preventScroll: true }); }
      else if (e.key === 'ArrowDown') { stop(); moveActive(1); }
      else if (e.key === 'ArrowUp') { stop(); moveActive(-1); }
      else if (e.key === 'Enter' || e.key === ' ') {
        stop();
        if (cur.active) choose(Number(cur.active.dataset.i)); else close();
      } else if (e.key === 'Tab') close();
      return;
    }
    const sel = selectFrom(e.target);
    if (sel && (e.key === ' ' || e.key === 'Enter' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) {
      e.preventDefault();
      e.stopImmediatePropagation();
      openFor(sel);
    }
  }, true);

  // 화면이 움직이면 닫는다 (목록 창 자체의 스크롤은 제외)
  document.addEventListener('scroll', (e) => { if (cur && !cur.pop.contains(e.target)) close(); }, true);
  window.addEventListener('resize', close);
  window.addEventListener('hashchange', close);
}
