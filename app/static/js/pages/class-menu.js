// 3. 반별 상담 (3.배경.png + 3-1, 3-2버튼.png) — 신입생 / 재학생
import { getClass } from '../api.js';
import * as stage from '../stage.js';
import { CLASS_MENU_BUTTONS } from '../screens.js';

export default async function (ctx) {
  const cls = await getClass(ctx.params.cls);
  if (!cls) { ctx.go('/toc', { replace: true }); return; }

  const targets = {
    newcomer: `/class/${cls.id}/intro`,
    current: `/class/${cls.id}/students`,
  };
  await stage.setLayers(CLASS_MENU_BUTTONS.map((b) => ({
    file: b.layer,
    hit: b.hit,
    onClick: () => ctx.go(targets[b.key]),
  })));

  const banner = document.createElement('div');
  banner.className = 'class-banner';
  banner.innerHTML = '<div class="name"></div><div class="sub">신입생 상담 또는 재학생 관리를 골라 주세요</div>';
  banner.querySelector('.name').textContent = cls.name;
  stage.addOverlay(banner);

  const notes = [
    { text: '반 소개 · 상담카드 작성', left: 215, top: 742, width: 550 },
    { text: `학생 목록 · 상담 기록 · 작품 (${cls.enrolled_count}명)`, left: 1040, top: 768, width: 620 },
  ];
  for (const n of notes) {
    const el = document.createElement('div');
    el.className = 'under-btn';
    Object.assign(el.style, { left: n.left + 'px', top: n.top + 'px', width: n.width + 'px' });
    el.textContent = n.text;
    stage.addOverlay(el);
  }
}
