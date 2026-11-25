// 관리 메뉴 (✦✦✦): 오늘 할 일 / 전체 학생 / 수강료 / 반 관리 / 입시 일정 / 설정
import { api, getClasses } from '../api.js';
import { html, on, setHTML } from '../ui.js';

const TABS = [
  { key: 'today', label: '오늘 할 일', load: () => import('./admin-today.js') },
  { key: 'students', label: '전체 학생', load: () => import('./admin-students.js') },
  { key: 'billing', label: '수강료', load: () => import('./admin-billing.js') },
  { key: 'classes', label: '반 관리', load: () => import('./admin-classes.js') },
  { key: 'schedules', label: '입시 일정', load: () => import('./admin-schedules.js') },
  { key: 'settings', label: '설정', load: () => import('./admin-settings.js') },
];

export default async function (ctx) {
  const key = TABS.some((t) => t.key === ctx.params.tab) ? ctx.params.tab : 'today';
  const tab = TABS.find((t) => t.key === key);
  ctx.setTitle(`관리 · ${tab.label}`);

  setHTML(ctx.page, html`
    <div class="admin">
      <nav class="admin-nav">
        <div class="nav-title">✦ 관리 메뉴</div>
        ${TABS.map((t) => html`<button class="${t.key === key ? 'on' : ''}" data-tab="${t.key}">${t.label}</button>`)}
      </nav>
      <div class="admin-main"></div>
    </div>`);
  on(ctx.page, 'click', '[data-tab]', (e, el) => ctx.go(`/admin/${el.dataset.tab}`, { replace: true }));

  const main = ctx.page.querySelector('.admin-main');
  const mod = await tab.load();
  if (!ctx.isCurrent()) return null;
  return mod.default(main, ctx, { api, getClasses });
}
