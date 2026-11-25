// 신입생 → 반 소개 (커리큘럼, 수업 시간, 수강료, 작품 예시) → 상담 시작
import { getClass } from '../api.js';
import { layerCrop } from '../stage.js';
import { TOC_BUTTONS } from '../screens.js';
import { html, on, setHTML, won } from '../ui.js';

export default async function (ctx) {
  const cls = await getClass(ctx.params.cls);
  if (!cls) { ctx.go('/toc', { replace: true }); return; }
  ctx.setTitle(`${cls.name} · 신입생`);

  const lines = (cls.curriculum || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const courses = (cls.courses || []).filter((c) => c.active);
  const images = cls.intro_images || [];

  setHTML(ctx.page, html`
    <div class="intro">
      <div class="intro-text">
        <h1 class="intro-name">${cls.name}</h1>
        ${cls.intro ? html`<p class="intro-lead">${cls.intro}</p>` : ''}
        ${lines.length ? html`<ul class="curriculum">${lines.map((l) => html`<li>${l}</li>`)}</ul>` : ''}
        <div class="intro-meta">
          ${cls.schedule_text ? html`<div><span class="k">수업 시간</span>${cls.schedule_text}</div>` : ''}
          ${courses.length ? html`<div><span class="k">수강료</span>${courses.map((c, i) => html`${i ? ' · ' : ''}${c.name} <b>${won(c.monthly_fee)}</b>`)}</div>` : ''}
        </div>
        ${!cls.intro && !lines.length ? html`<p class="muted">관리 메뉴(오른쪽 아래 ✦✦✦) → 반 관리에서 소개 문구와 커리큘럼을 입력해 주세요.</p>` : ''}
        <div class="intro-actions">
          <button class="btn primary big" data-act="start">상담 시작하기 →</button>
        </div>
      </div>
      <div class="gallery">
        <div class="gallery-main ${images.length ? '' : 'round'}"></div>
        ${images.length > 1 ? html`
          <button class="gallery-arrow prev" data-act="prev" aria-label="이전">‹</button>
          <button class="gallery-arrow next" data-act="next" aria-label="다음">›</button>
          <div class="gallery-nav">${images.map((_, i) => html`<button class="gallery-dot ${i === 0 ? 'on' : ''}" data-act="dot" data-i="${i}"></button>`)}</div>` : ''}
        ${images.length ? html`<p class="muted small">작품 예시</p>` : ''}
      </div>
    </div>`);

  const main = ctx.page.querySelector('.gallery-main');
  let idx = 0;
  const show = (i) => {
    idx = (i + images.length) % images.length;
    main.innerHTML = '';
    const img = document.createElement('img');
    img.src = images[idx];
    img.alt = '작품 예시';
    main.appendChild(img);
    ctx.page.querySelectorAll('.gallery-dot').forEach((d, k) => d.classList.toggle('on', k === idx));
  };
  if (images.length) {
    show(0);
  } else {
    const btn = TOC_BUTTONS.find((b) => b.cls === cls.id);
    if (btn) main.appendChild(await layerCrop(btn.layer, 560));
  }

  // 사진 넘기기 (버튼, 점, 손가락 밀기)
  let timer = images.length > 1 ? setInterval(() => show(idx + 1), 5000) : null;
  const resetTimer = () => { if (timer) { clearInterval(timer); timer = setInterval(() => show(idx + 1), 5000); } };
  let startX = null;
  main.addEventListener('pointerdown', (e) => { startX = e.clientX; });
  main.addEventListener('pointerup', (e) => {
    if (startX == null || images.length < 2) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 30) { show(idx + (dx < 0 ? 1 : -1)); resetTimer(); }
    startX = null;
  });

  on(ctx.page, 'click', '[data-act]', (e, el) => {
    const act = el.dataset.act;
    if (act === 'start') ctx.go(`/class/${cls.id}/new`);
    else if (act === 'prev') { show(idx - 1); resetTimer(); }
    else if (act === 'next') { show(idx + 1); resetTimer(); }
    else if (act === 'dot') { show(Number(el.dataset.i)); resetTimer(); }
  });

  return () => { if (timer) clearInterval(timer); };
}
