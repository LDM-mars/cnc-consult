// 관리 › 전체 학생 (반·상태 필터, 검색, 미등록 상담자 후속 연락)
import { api, getClasses } from '../api.js';
import { emptyState, fmtDate, html, on, phoneLink, raw, setHTML, STATUS_LIST, statusBadge, today } from '../ui.js';
import { openAddStudent } from './students.js';

export default async function (el, ctx) {
  const classes = await getClasses();
  const cname = (id) => (classes.find((c) => c.id === id) || {}).name || '';
  let classId = ctx.query.class || '';
  let status = ctx.query.status || '';
  let q = '';

  setHTML(el, html`
    <div class="row between"><h2>전체 학생</h2><button class="btn primary" data-act="add">+ 학생 추가</button></div>
    <div class="row wrap">
      <input type="search" class="search" placeholder="이름 · 학교 · 연락처" style="width:380px">
      <select class="f-class" style="width:300px"><option value="">모든 반</option>${classes.map((c) => html`<option value="${c.id}" ${c.id === classId ? raw('selected') : ''}>${c.name}</option>`)}</select>
      <select class="f-status" style="width:240px"><option value="">모든 상태</option>${STATUS_LIST.map((s) => html`<option ${s === status ? raw('selected') : ''}>${s}</option>`)}</select>
      <button class="btn sm ghost" data-act="followup">미등록 · 보류 상담자 보기</button>
    </div>
    <div class="list-body mt"></div>`);
  const body = el.querySelector('.list-body');

  async function load() {
    const p = new URLSearchParams();
    if (classId) p.set('class_id', classId);
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    const list = await api.get(`/api/students?${p}`);
    const t = today();
    setHTML(body, list.length ? html`
      <p class="muted small">${list.length}명</p>
      <table class="list">
        <thead><tr><th>이름</th><th>반</th><th>학교 · 학년</th><th>상태</th><th>보호자 연락처</th><th>최근 상담</th><th>다음 연락</th></tr></thead>
        <tbody>${list.map((s) => html`<tr class="clickable" data-id="${s.id}">
          <td><b>${s.name}</b></td>
          <td class="small">${cname(s.class_id)}</td>
          <td class="small">${[s.school, s.grade].filter(Boolean).join(' · ')}</td>
          <td>${statusBadge(s.status)}</td>
          <td class="small">${phoneLink(s.guardian_phone || s.phone)}</td>
          <td class="small">${fmtDate(s.last_consulted)}</td>
          <td>${s.next_contact ? html`<span class="badge ${s.next_contact <= t ? 'danger' : 'warn'}">${fmtDate(s.next_contact)}</span>` : ''}</td>
        </tr>`)}</tbody>
      </table>` : emptyState('조건에 맞는 학생이 없습니다.'));
  }

  let timer = null;
  const offs = [
    on(el, 'input', '.search', (e, inp) => { clearTimeout(timer); timer = setTimeout(() => { q = inp.value.trim(); load(); }, 250); }),
    on(el, 'change', '.f-class', (e, s) => { classId = s.value; load(); }),
    on(el, 'change', '.f-status', (e, s) => { status = s.value; load(); }),
    on(el, 'click', '[data-act=followup]', () => {
      status = '상담중,체험,보류,미등록';
      el.querySelector('.f-status').value = '';
      load();
    }),
    on(el, 'click', 'tr.clickable', (e, tr) => {
      if (e.target.closest('a')) return;
      ctx.go(`/student/${tr.dataset.id}?from=${encodeURIComponent('/admin/students')}`);
    }),
    on(el, 'click', '[data-act=add]', () => openAddStudent({ classId: classId || classes[0].id, onSaved: load })),
  ];
  await load();
  return () => { clearTimeout(timer); offs.forEach((f) => f()); };
}
