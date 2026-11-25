// 학생 화면: 머리말(이름·반·연락처) + 탭(상담 기록 / 작품 / 성적 / 수강료 / 정보)
import { api, getClasses, getSettings } from '../api.js';
import { html, on, phoneLink, setHTML, statusBadge } from '../ui.js';

const TABS = [
  { key: 'consults', label: '상담 기록', load: () => import('./tabs/consults.js') },
  { key: 'works', label: '작품', load: () => import('./tabs/works.js') },
  { key: 'scores', label: '성적', load: () => import('./tabs/scores.js') },
  { key: 'billing', label: '수강료', load: () => import('./tabs/billing.js') },
  { key: 'info', label: '정보', load: () => import('./tabs/info.js') },
];

export default async function (ctx) {
  const id = Number(ctx.params.id);
  const [student, classes, settings] = await Promise.all([api.get(`/api/students/${id}`), getClasses(), getSettings()]);
  const cls = () => classes.find((c) => c.id === state.student.class_id);
  const state = { student, tab: TABS.some((t) => t.key === ctx.query.tab) ? ctx.query.tab : 'consults' };

  ctx.setParent(ctx.query.from || (student.class_id ? `/class/${student.class_id}/students` : '/admin/students'));

  setHTML(ctx.page, html`
    <div class="student-head"></div>
    <div class="row between">
      <div class="tabs">${TABS.map((t) => html`<button class="tab" data-tab="${t.key}">${t.label}</button>`)}</div>
      <div class="row">
        <button class="btn sm" data-act="consult">+ 새 상담</button>
        <button class="btn sm primary" data-act="report">리포트 만들기</button>
      </div>
    </div>
    <div class="tab-body"></div>`);
  const head = ctx.page.querySelector('.student-head');
  const body = ctx.page.querySelector('.tab-body');

  function renderHead() {
    const s = state.student;
    const c = cls();
    ctx.setTitle(`${c ? c.name + ' · ' : ''}${s.name}`);
    setHTML(head, html`
      <div class="nm">${s.name}</div>
      <div class="meta">
        ${statusBadge(s.status)}
        ${c ? html`<span>${c.name}</span>` : ''}
        ${s.school || s.grade ? html`<span>${[s.school, s.grade].filter(Boolean).join(' ')}</span>` : ''}
        ${s.guardian_phone ? html`<span>보호자 ${s.guardian_name ? `(${s.guardian_name}) ` : ''}${phoneLink(s.guardian_phone)}</span>` : ''}
        ${s.phone ? html`<span>학생 ${phoneLink(s.phone)}</span>` : ''}
        ${s.target_level ? html`<span class="badge pink">${s.target_level}${s.target_schools && s.target_schools[0] ? ` · ${s.target_schools[0].school}` : ''}</span>` : ''}
      </div>`);
  }

  let tabCleanup = null;
  let tabSeq = 0;
  async function showTab(key, extra = {}) {
    const seq = ++tabSeq;
    state.tab = key;
    ctx.page.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === key));
    const qs = new URLSearchParams({ ...(ctx.query.from ? { from: ctx.query.from } : {}), tab: key });
    history.replaceState(null, '', `#/student/${id}?${qs}`);
    if (tabCleanup) { tabCleanup(); tabCleanup = null; }
    body.innerHTML = '';
    ctx.foot.innerHTML = '';
    const mod = await TABS.find((t) => t.key === key).load();
    if (seq !== tabSeq || !ctx.isCurrent()) return;
    tabCleanup = (await mod.default(body, tabCtx, extra)) || null;
  }

  const tabCtx = {
    get student() { return state.student; },
    get cls() { return cls(); },
    classes,
    settings,
    foot: ctx.foot,
    go: ctx.go,
    async reloadStudent() {
      state.student = await api.get(`/api/students/${id}`);
      renderHead();
      return state.student;
    },
    showTab,
  };

  renderHead();
  on(ctx.page, 'click', '.tab', (e, el) => showTab(el.dataset.tab));
  on(ctx.page, 'click', '[data-act=consult]', () => showTab('consults', { openNew: true }));
  on(ctx.page, 'click', '[data-act=report]', () => ctx.go(`/student/${id}/report`));
  await showTab(state.tab);

  return () => { if (tabCleanup) tabCleanup(); };
}
