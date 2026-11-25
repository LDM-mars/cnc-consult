// 학생 화면 › 수강료 (수강 등록, 청구·수납)
import { api } from '../../api.js';
import {
  confirmDialog, emptyState, fmtDate, fmtMonth, formValues, html, on, openModal, setHTML, thisMonth, today, toast, won,
} from '../../ui.js';
import { openInvoiceModal, openPayModal } from '../admin-billing.js';

function openEnroll(tctx, onSaved) {
  const groups = tctx.classes.map((c) => ({ c, courses: (c.courses || []).filter((x) => x.active) })).filter((g) => g.courses.length);
  if (!groups.length) {
    toast('먼저 관리 메뉴 → 반 관리에서 수강 옵션을 추가해 주세요.', 'error');
    return;
  }
  openModal({
    title: '수강 등록',
    body: html`
      <form class="col" onsubmit="return false">
        <label class="field"><span>수강 반</span><select name="course_id">${groups.map((g) => html`
          <optgroup label="${g.c.name}">${g.courses.map((x) => html`<option value="${x.id}">${x.name} (${won(x.monthly_fee)})</option>`)}</optgroup>`)}</select></label>
        <div class="grid3">
          <label class="field"><span>시작일</span><input type="date" name="start_date" value="${today()}"></label>
          <label class="field"><span>매달 결제일</span><input type="number" name="billing_day" value="1" min="1" max="28"></label>
          <label class="field"><span>할인 (월)</span><input type="number" name="discount" min="0" step="1000" placeholder="0"></label>
        </div>
      </form>`,
    onOpen(modal) {
      const sel = modal.querySelector('[name=course_id]');
      const mine = groups.find((g) => g.c.id === tctx.student.class_id);
      if (mine) sel.value = String(mine.courses[0].id);
    },
    actions: [
      { label: '취소' },
      {
        label: '등록', primary: true,
        async onClick(m) {
          const v = formValues(m.el);
          await api.post(`/api/students/${tctx.student.id}/enrollments`, {
            course_id: Number(v.course_id), start_date: v.start_date, billing_day: v.billing_day || 1, discount: v.discount || 0,
          });
          if (tctx.student.status !== '등록') {
            if (await confirmDialog(`학생 상태를 "등록"으로 바꿀까요? (지금: ${tctx.student.status})`, { okLabel: '바꾸기' })) {
              await api.put(`/api/students/${tctx.student.id}`, { status: '등록' });
              await tctx.reloadStudent();
            }
          }
          toast('수강 등록을 저장했습니다.');
          onSaved();
        },
      },
    ],
  });
}

export default async function (el, tctx) {
  const student = tctx.student;
  let data = { enrollments: [], invoices: [] };

  async function load() {
    data = await api.get(`/api/students/${student.id}/billing`);
    const t = today();
    const active = (e) => !e.end_date || e.end_date >= t;
    setHTML(el, html`
      <div class="billing-grid">
        <div class="card">
          <div class="row between"><h3>수강 등록</h3><button class="btn sm primary" data-act="enroll">+ 수강 등록</button></div>
          ${data.enrollments.length ? html`<table class="list">
            <thead><tr><th>반</th><th class="num">월 수강료</th><th>기간</th><th>결제일</th><th></th></tr></thead>
            <tbody>${data.enrollments.map((e) => html`<tr>
              <td><b>${e.course_name}</b><div class="muted small">${e.class_name || ''}</div></td>
              <td class="num">${won(e.monthly_fee - (e.discount || 0))}${e.discount ? html`<div class="muted small">할인 -${won(e.discount)}</div>` : ''}</td>
              <td class="small">${fmtDate(e.start_date)} ~ ${e.end_date ? fmtDate(e.end_date) : ''}${active(e) ? html` <span class="badge ok">수강 중</span>` : html` <span class="badge">종료</span>`}</td>
              <td>매달 ${e.billing_day}일</td>
              <td class="right nowrap">${active(e) ? html`<button class="btn xs" data-end="${e.id}">종료</button>` : ''}
                <button class="btn xs ghost" data-del-enroll="${e.id}">삭제</button></td>
            </tr>`)}</tbody></table>` : emptyState('수강 등록이 없습니다.')}
        </div>
        <div class="card">
          <div class="row between"><h3>청구 · 수납</h3><button class="btn sm" data-act="invoice">+ 청구 추가</button></div>
          ${data.invoices.length ? html`<table class="list">
            <thead><tr><th>월</th><th>내용</th><th class="num">금액</th><th>상태</th><th></th></tr></thead>
            <tbody>${data.invoices.map((i) => {
              const paid = i.paid_amount >= i.amount;
              return html`<tr>
                <td class="nowrap">${fmtMonth(i.month)}</td>
                <td class="small">${(i.items || []).map((it) => it.name).join(', ')}</td>
                <td class="num">${won(i.amount)}</td>
                <td>${paid ? html`<span class="badge ok">완납</span><div class="muted small">${fmtDate(i.paid_on)} ${i.method}</div>`
                  : i.paid_amount ? html`<span class="badge warn">일부 ${won(i.paid_amount)}</span>` : html`<span class="badge danger">미납</span>`}</td>
                <td class="right nowrap">${paid ? '' : html`<button class="btn xs primary" data-pay="${i.id}">수납</button>`}
                  <button class="btn xs ghost" data-del-inv="${i.id}">삭제</button></td>
              </tr>`;
            })}</tbody></table>` : emptyState('청구 내역이 없습니다.', '관리 메뉴 → 수강료에서 매달 청구서를 한 번에 만들 수 있어요.')}
        </div>
      </div>`);
  }

  const offs = [
    on(el, 'click', '[data-act=enroll]', () => openEnroll(tctx, load)),
    on(el, 'click', '[data-act=invoice]', () => openInvoiceModal({ student, month: thisMonth(), onSaved: load })),
    on(el, 'click', '[data-pay]', (e, b) => {
      const inv = data.invoices.find((i) => i.id === Number(b.dataset.pay));
      openPayModal(inv, load);
    }),
    on(el, 'click', '[data-end]', async (e, b) => {
      if (await confirmDialog('오늘 날짜로 수강을 종료할까요?\n다음 달부터 청구서가 만들어지지 않습니다.', { okLabel: '종료' })) {
        await api.put(`/api/enrollments/${b.dataset.end}`, { end_date: today() });
        load();
      }
    }),
    on(el, 'click', '[data-del-enroll]', async (e, b) => {
      if (await confirmDialog('수강 등록을 삭제할까요?', { okLabel: '삭제', danger: true })) {
        await api.del(`/api/enrollments/${b.dataset.delEnroll}`);
        load();
      }
    }),
    on(el, 'click', '[data-del-inv]', async (e, b) => {
      if (await confirmDialog('청구 내역을 삭제할까요?', { okLabel: '삭제', danger: true })) {
        await api.del(`/api/invoices/${b.dataset.delInv}`);
        load();
      }
    }),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
