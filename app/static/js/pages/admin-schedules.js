// 관리 › 입시 일정 (원서 접수, 실기 시험일 등 → 오늘 할 일에 D-day 표시)
import { api } from '../api.js';
import { confirmDialog, dday, emptyState, fmtDate, formValues, html, on, setHTML, today, toast } from '../ui.js';

export default async function (el) {
  let showPast = false;
  const students = await api.get('/api/students?status=등록');

  async function load() {
    const list = await api.get(`/api/schedules${showPast ? '' : '?upcoming=1'}`);
    setHTML(el, html`
      <h2>입시 일정</h2>
      <div class="card">
        <form class="row wrap add-form" onsubmit="return false">
          <input type="text" name="title" placeholder="일정 (예: 홍익대 실기고사)" style="width:520px">
          <input type="date" name="date" value="${today()}" style="width:260px">
          <select name="student_id" style="width:280px"><option value="">학원 전체 일정</option>${students.map((s) => html`<option value="${s.id}">${s.name}</option>`)}</select>
          <input type="text" name="memo" placeholder="메모" style="width:300px">
          <button class="btn primary" data-act="add">추가</button>
        </form>
      </div>
      <div class="row mt"><label class="check"><input type="checkbox" class="past" ${showPast ? 'checked' : ''}> 지난 일정도 보기</label></div>
      ${list.length ? html`<table class="list mt-s">
        <thead><tr><th></th><th>날짜</th><th>일정</th><th>학생</th><th>메모</th><th></th></tr></thead>
        <tbody>${list.map((s) => html`<tr>
          <td><span class="badge ${s.date < today() ? '' : 'pink'}">${dday(s.date)}</span></td>
          <td class="nowrap">${fmtDate(s.date)}</td>
          <td><b>${s.title}</b></td>
          <td class="small">${s.student_name || '전체'}</td>
          <td class="small muted">${s.memo}</td>
          <td class="right"><button class="btn xs ghost" data-del="${s.id}">삭제</button></td>
        </tr>`)}</tbody></table>` : emptyState('등록된 일정이 없습니다.')}`);
  }

  const offs = [
    on(el, 'click', '[data-act=add]', async () => {
      const v = formValues(el.querySelector('.add-form'));
      if (!v.title || !v.date) { toast('일정과 날짜를 입력해 주세요.', 'error'); return; }
      await api.post('/api/schedules', { title: v.title, date: v.date, memo: v.memo, student_id: v.student_id ? Number(v.student_id) : null });
      toast('일정을 추가했습니다.');
      load();
    }),
    on(el, 'change', '.past', (e, c) => { showPast = c.checked; load(); }),
    on(el, 'click', '[data-del]', async (e, b) => {
      if (await confirmDialog('이 일정을 삭제할까요?', { okLabel: '삭제', danger: true })) {
        await api.del(`/api/schedules/${b.dataset.del}`);
        load();
      }
    }),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
