// 관리 › 오늘 할 일: 연락할 곳, 체험 예정, 미납, 입시 D-day, 최근 상담
import { api } from '../api.js';
import { dday, fmtDate, fmtMonth, html, on, phoneLink, setHTML, toast, won } from '../ui.js';
import { openPayModal } from './admin-billing.js';

export default async function (el, ctx) {
  let d = null;
  const studentLink = (id, name) => html`<span class="nm" data-student="${id}">${name}</span>`;

  async function load() {
    d = await api.get('/api/dashboard');
    const sc = d.status_counts || {};
    setHTML(el, html`
      <h2>오늘 할 일 <span class="muted small">${fmtDate(d.today)}</span></h2>
      <div class="stat-row">
        <div class="stat"><div class="v">${sc['등록'] || 0}</div><div class="k">등록생</div></div>
        <div class="stat"><div class="v">${(sc['상담중'] || 0) + (sc['체험'] || 0)}</div><div class="k">상담중 · 체험</div></div>
        <div class="stat"><div class="v">${d.month_new_consults}</div><div class="k">이번 달 신입 상담</div></div>
        <div class="stat"><div class="v">${d.month_new_enrolled}</div><div class="k">이번 달 신입 등록</div></div>
      </div>
      <div class="dash-grid">
        <div class="card dash-card">
          <h3>📞 연락할 곳 <span class="badge ${d.contacts_due.length ? 'danger' : 'ok'}">${d.contacts_due.length}건</span></h3>
          ${d.contacts_due.length ? d.contacts_due.map((c) => html`
            <div class="dash-item two">
              <div class="row">${studentLink(c.student_id, c.student_name)}<span class="muted small">${c.class_name || ''}</span><span class="spacer"></span>
                <span class="badge ${c.next_contact_date < d.today ? 'danger' : 'warn'}">${c.next_contact_date < d.today ? `${fmtDate(c.next_contact_date)} 지남` : '오늘'}</span></div>
              <div class="row small"><span class="grow">${c.next_contact_note || c.kind}</span>
                <span>${phoneLink(c.guardian_phone || c.phone)}</span><button class="btn xs" data-done="${c.id}">완료</button></div>
            </div>`) : html`<p class="muted">오늘 연락할 곳이 없습니다.</p>`}
          ${d.contacts_soon.length ? html`<p class="muted small mt-s">다가오는 연락 (7일): ${d.contacts_soon.map((c, i) => html`${i ? ', ' : ''}${c.student_name} ${fmtDate(c.next_contact_date).slice(5)}`)}</p>` : ''}
        </div>
        <div class="card dash-card">
          <h3>🎨 체험 수업 (7일) <span class="badge">${d.trials.length}건</span></h3>
          ${d.trials.length ? d.trials.map((t) => html`
            <div class="dash-item two">
              <div class="row">${studentLink(t.student_id, t.student_name)}<span class="muted small">${t.class_name || ''}</span><span class="spacer"></span><b>${fmtDate(t.trial_date)}</b></div>
              <div class="row small"><span class="grow muted">체험 수업</span><span>${phoneLink(t.guardian_phone)}</span></div>
            </div>`) : html`<p class="muted">예정된 체험 수업이 없습니다.</p>`}
        </div>
        <div class="card dash-card">
          <h3>💳 미납 <span class="badge ${d.unpaid.length ? 'danger' : 'ok'}">${won(d.unpaid_total)}</span></h3>
          ${d.unpaid.length ? d.unpaid.slice(0, 8).map((i) => html`
            <div class="dash-item">
              ${studentLink(i.student_id, i.student_name)}
              <span class="muted small">${fmtMonth(i.month)}</span>
              <span class="grow"></span>
              <b>${won(i.amount - i.paid_amount)}</b>
              <button class="btn xs primary" data-pay="${i.id}">수납</button>
            </div>`) : html`<p class="muted">미납이 없습니다.</p>`}
          ${d.unpaid.length > 8 ? html`<p class="muted small mt-s">외 ${d.unpaid.length - 8}건 → 수강료 메뉴에서 확인</p>` : ''}
        </div>
        <div class="card dash-card">
          <h3>🗓 입시 일정</h3>
          ${d.schedules.length ? d.schedules.map((s) => html`
            <div class="dash-item">
              <span class="badge ${dday(s.date) === 'D-DAY' ? 'danger' : 'pink'}">${dday(s.date)}</span>
              <b>${s.title}</b>
              ${s.student_name ? html`<span class="muted small">${s.student_name}</span>` : ''}
              <span class="grow"></span>
              <span class="small">${fmtDate(s.date)}</span>
            </div>`) : html`<p class="muted">등록된 입시 일정이 없습니다. (입시 일정 메뉴에서 추가)</p>`}
        </div>
        <div class="card dash-card" style="grid-column: span 2">
          <h3>최근 상담</h3>
          ${d.recent.length ? d.recent.map((c) => html`
            <div class="dash-item">
              <span class="small nowrap">${fmtDate(c.consulted_at)}</span>
              ${studentLink(c.student_id, c.student_name)}
              <span class="muted small">${c.class_name || ''}</span>
              <span class="badge">${c.kind}</span>
              ${c.result ? html`<span class="badge pink">${c.result}</span>` : ''}
              <span class="grow small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.summary}</span>
            </div>`) : html`<p class="muted">아직 상담 기록이 없습니다.</p>`}
        </div>
      </div>`);
  }

  const offs = [
    on(el, 'click', '[data-student]', (e, s) => ctx.go(`/student/${s.dataset.student}?from=${encodeURIComponent('/admin/today')}`)),
    on(el, 'click', '[data-done]', async (e, b) => {
      await api.put(`/api/consultations/${b.dataset.done}`, { contact_done: true });
      toast('연락 완료로 표시했습니다.');
      load();
    }),
    on(el, 'click', '[data-pay]', (e, b) => openPayModal(d.unpaid.find((i) => i.id === Number(b.dataset.pay)), load)),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
