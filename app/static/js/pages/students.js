// 재학생 → 그 반 학생 목록
import { api, getClass, getClasses, getSettings, invalidateClasses } from '../api.js';
import { bindStudentForm, readStudentForm, studentFormHTML } from '../lib/student-form.js';
import { dday, emptyState, fmtDate, html, on, openModal, setHTML, statusBadge, toast, today } from '../ui.js';

const FILTERS = [
  { key: '등록', label: '등록생' },
  { key: '체험,상담중', label: '체험 · 상담중' },
  { key: '보류,미등록,퇴원', label: '보류 · 미등록 · 퇴원' },
  { key: '', label: '전체' },
];

export function openAddStudent({ classId, onSaved }) {
  return Promise.all([getClasses(), getSettings()]).then(([classes, settings]) => openModal({
    title: '학생 추가',
    wide: true,
    body: studentFormHTML({ classes, settings, student: { class_id: classId, status: '등록' }, withEnroll: true }),
    onOpen: (modal) => bindStudentForm(modal, { classes }),
    actions: [
      { label: '취소' },
      {
        label: '저장', primary: true,
        async onClick(m) {
          const data = readStudentForm(m.el);
          const s = await api.post('/api/students', data);
          invalidateClasses();
          toast(`${s.name} 학생을 추가했습니다.`);
          onSaved && onSaved(s);
        },
      },
    ],
  }));
}

export default async function (ctx) {
  const cls = await getClass(ctx.params.cls);
  if (!cls) { ctx.go('/toc', { replace: true }); return; }
  ctx.setTitle(`${cls.name} · 재학생`);

  let filter = ctx.query.f ?? '등록';
  let q = '';

  setHTML(ctx.page, html`
    <div class="list-head">
      <input type="search" placeholder="이름 · 학교 · 연락처 검색" class="search">
      <div class="chips" data-filter>${FILTERS.map((f) => html`<button class="chip ${f.key === filter ? 'on' : ''}" data-f="${f.key}">${f.label}</button>`)}</div>
      <span class="spacer"></span>
      <button class="btn primary" data-act="add">+ 학생 추가</button>
    </div>
    <div class="list-body"></div>`);
  const listEl = ctx.page.querySelector('.list-body');

  async function load() {
    const params = new URLSearchParams({ class_id: cls.id });
    if (filter) params.set('status', filter);
    if (q) params.set('q', q);
    const students = await api.get(`/api/students?${params}`);
    if (!ctx.isCurrent()) return;
    if (!students.length) {
      setHTML(listEl, html`
        ${emptyState(q ? '검색 결과가 없습니다.' : '아직 학생이 없습니다.', q ? '' : '신입생 상담에서 "등록"으로 저장하거나, 오른쪽 위 [+ 학생 추가]로 기존 학생을 넣어 주세요.')}`);
      return;
    }
    const t = today();
    setHTML(listEl, html`<div class="student-grid">${students.map((s) => html`
      <button class="student-card" data-id="${s.id}">
        <div class="nm">${s.name} ${s.status !== '등록' ? statusBadge(s.status) : ''}</div>
        <div class="meta">${[s.school, s.grade].filter(Boolean).join(' · ') || ' '}</div>
        <div class="meta">${s.last_consulted ? `최근 상담 ${fmtDate(s.last_consulted)}` : '상담 기록 없음'}</div>
        <div class="foot">
          ${s.next_contact ? html`<span class="badge ${s.next_contact <= t ? 'danger' : 'warn'}">연락 ${s.next_contact <= t ? (s.next_contact === t ? '오늘' : '지남') : dday(s.next_contact)}</span>` : ''}
          ${s.artwork_count ? html`<span class="badge">작품 ${s.artwork_count}</span>` : ''}
          ${s.target_level ? html`<span class="badge pink">${s.target_level}</span>` : ''}
        </div>
      </button>`)}</div>`);
  }

  on(ctx.page, 'click', '[data-f]', (e, el) => {
    filter = el.dataset.f;
    ctx.page.querySelectorAll('[data-f]').forEach((c) => c.classList.toggle('on', c === el));
    history.replaceState(null, '', `#/class/${cls.id}/students?f=${encodeURIComponent(filter)}`);
    load();
  });
  let timer = null;
  ctx.page.querySelector('.search').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { q = e.target.value.trim(); load(); }, 250);
  });
  on(ctx.page, 'click', '.student-card', (e, el) => {
    ctx.go(`/student/${el.dataset.id}?from=${encodeURIComponent(`/class/${cls.id}/students?f=${filter}`)}`);
  });
  on(ctx.page, 'click', '[data-act=add]', () => openAddStudent({ classId: cls.id, onSaved: load }));

  await load();
  return () => clearTimeout(timer);
}
