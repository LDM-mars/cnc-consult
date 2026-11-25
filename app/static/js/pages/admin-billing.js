// 관리 › 수강료 (월별 청구 일괄 생성, 수납, 미납) + 청구/수납 창
import { api, getClasses } from '../api.js';
import {
  bindChips, chipValue, chips, confirmDialog, emptyState, fmtDate, fmtMonth, formValues, html, on, openModal, raw,
  setHTML, thisMonth, today, toast, won,
} from '../ui.js';

const METHODS = ['카드', '계좌이체', '현금', '기타'];

export function openPayModal(inv, onSaved) {
  const remain = inv.amount - inv.paid_amount;
  openModal({
    title: `수납 · ${inv.student_name || ''} ${fmtMonth(inv.month)}`,
    body: html`
      <form class="col" onsubmit="return false">
        <p>청구 금액 <b>${won(inv.amount)}</b>${inv.paid_amount ? html` · 이미 받은 금액 ${won(inv.paid_amount)}` : ''}</p>
        <div class="grid2">
          <label class="field"><span>이번에 받은 금액</span><input type="number" name="amount" value="${remain}" min="0" step="1000"></label>
          <label class="field"><span>받은 날</span><input type="date" name="paid_on" value="${today()}"></label>
        </div>
        <div class="field"><span>결제 방법</span>${raw(String(chips('method', METHODS, inv.method || '카드')).replace('class="chips"', 'class="chips" data-required'))}</div>
        <label class="field"><span>메모</span><input type="text" name="memo" value="${inv.memo || ''}"></label>
      </form>`,
    onOpen: (m) => bindChips(m),
    actions: [
      { label: '취소' },
      {
        label: '수납 처리', primary: true,
        async onClick(m) {
          const v = formValues(m.el);
          await api.put(`/api/invoices/${inv.id}`, {
            paid_amount: inv.paid_amount + Number(v.amount || 0), paid_on: v.paid_on || today(),
            method: chipValue(m.el, 'method'), memo: v.memo,
          });
          toast('수납 처리했습니다.');
          onSaved && onSaved();
        },
      },
    ],
  });
}

/** 청구서 직접 만들기 (재료비 등). student가 없으면 학생 선택 칸을 보여준다 */
export async function openInvoiceModal({ student = null, month = thisMonth(), onSaved }) {
  const students = student ? [] : await api.get('/api/students?status=등록,체험');
  openModal({
    title: '청구 추가',
    body: html`
      <form class="col" onsubmit="return false">
        ${student ? html`<p><b>${student.name}</b> 학생</p>` : html`
          <label class="field"><span>학생</span><select name="student_id"><option value="">선택</option>${students.map((s) => html`<option value="${s.id}">${s.name} (${s.grade || ''} ${s.school || ''})</option>`)}</select></label>`}
        <label class="field" style="width:320px"><span>청구 월</span><input type="month" name="month" value="${month}"></label>
        <div class="field"><span>항목</span>
          <div class="col items">
            ${[0, 1, 2].map((i) => html`<div class="row"><input type="text" data-item-name placeholder="${i === 0 ? '재료비' : '항목'}" value="${i === 0 ? '재료비' : ''}"><input type="number" data-item-amt min="0" step="1000" placeholder="금액" style="width:260px"></div>`)}
          </div>
        </div>
        <label class="field"><span>메모</span><input type="text" name="memo"></label>
      </form>`,
    actions: [
      { label: '취소' },
      {
        label: '청구 저장', primary: true,
        async onClick(m) {
          const v = formValues(m.el);
          const sid = student ? student.id : Number(v.student_id);
          if (!sid) throw new Error('학생을 골라 주세요.');
          const names = m.el.querySelectorAll('[data-item-name]');
          const amts = m.el.querySelectorAll('[data-item-amt]');
          const items = Array.from(names).map((n, i) => ({ name: n.value.trim(), amount: Number(amts[i].value || 0) })).filter((x) => x.amount);
          if (!items.length) throw new Error('금액을 입력해 주세요.');
          await api.post('/api/invoices', { student_id: sid, month: v.month || thisMonth(), items, memo: v.memo });
          toast('청구를 추가했습니다.');
          onSaved && onSaved();
        },
      },
    ],
  });
}

export default async function renderBilling(el, ctx) {
  let month = ctx.query.month || thisMonth();
  let unpaidOnly = false;
  let classId = '';
  const classes = await getClasses();
  let data = { invoices: [] };

  async function load() {
    const p = new URLSearchParams({ month });
    if (unpaidOnly) p.set('unpaid', '1');
    if (classId) p.set('class_id', classId);
    data = await api.get(`/api/invoices?${p}`);
    setHTML(el, html`
      <div class="row between"><h2>수강료 · ${fmtMonth(month)}</h2>
        <div class="row">
          <input type="month" class="month" value="${month}" style="width:280px">
          <button class="btn primary" data-act="generate">이번 달 청구서 만들기</button>
        </div>
      </div>
      <div class="row between mt-s">
        <div class="money-sum">
          <span>청구 <b>${won(data.total)}</b></span>
          <span>받음 <b class="pink">${won(data.paid)}</b></span>
          <span>남음 <b>${won(data.unpaid)}</b></span>
        </div>
        <div class="row">
          <select class="class-filter" style="width:300px"><option value="">모든 반</option>${classes.map((c) => html`<option value="${c.id}" ${c.id === classId ? raw('selected') : ''}>${c.name}</option>`)}</select>
          <label class="check"><input type="checkbox" class="unpaid" ${unpaidOnly ? raw('checked') : ''}> 미납만</label>
          <button class="btn sm" data-act="invoice">+ 청구 추가</button>
        </div>
      </div>
      ${data.invoices.length ? html`
        <table class="list mt">
          <thead><tr><th>학생</th><th>반</th><th>내용</th><th>결제일</th><th class="num">금액</th><th>상태</th><th></th></tr></thead>
          <tbody>${data.invoices.map((i) => {
            const paid = i.paid_amount >= i.amount;
            return html`<tr>
              <td><a href="#/student/${i.student_id}?tab=billing&from=${encodeURIComponent(`/admin/billing?month=${month}`)}"><b>${i.student_name}</b></a></td>
              <td class="small">${i.class_name || ''}</td>
              <td class="small">${(i.items || []).map((it) => `${it.name} ${won(it.amount)}`).join(', ')}</td>
              <td class="small nowrap">${fmtDate(i.due_date)}</td>
              <td class="num"><b>${won(i.amount)}</b></td>
              <td>${paid ? html`<span class="badge ok">완납</span> <span class="muted small">${fmtDate(i.paid_on)} ${i.method}</span>`
                : i.paid_amount ? html`<span class="badge warn">일부 ${won(i.paid_amount)}</span>` : html`<span class="badge danger">미납</span>`}</td>
              <td class="right nowrap">${paid ? '' : html`<button class="btn xs primary" data-pay="${i.id}">수납</button>`}
                <button class="btn xs ghost" data-del="${i.id}">삭제</button></td>
            </tr>`;
          })}</tbody>
        </table>` : emptyState(`${fmtMonth(month)} 청구서가 없습니다.`, '[이번 달 청구서 만들기]를 누르면 수강 중인 등록생의 청구서가 한 번에 만들어집니다.')}`);
  }

  const offs = [
    on(el, 'change', '.month', (e, inp) => { if (inp.value) { month = inp.value; load(); } }),
    on(el, 'change', '.unpaid', (e, inp) => { unpaidOnly = inp.checked; load(); }),
    on(el, 'change', '.class-filter', (e, inp) => { classId = inp.value; load(); }),
    on(el, 'click', '[data-act=generate]', async () => {
      const ok = await confirmDialog(`${fmtMonth(month)} 청구서를 만들까요?\n수강 중인 등록생에게 수강료 청구서가 만들어집니다.\n(이미 만든 청구서는 다시 만들지 않습니다.)`, { okLabel: '만들기' });
      if (!ok) return;
      const r = await api.post('/api/invoices/generate', { month });
      toast(r.created ? `청구서 ${r.created}건을 만들었습니다.` : '새로 만들 청구서가 없습니다.');
      load();
    }),
    on(el, 'click', '[data-act=invoice]', () => openInvoiceModal({ month, onSaved: load })),
    on(el, 'click', '[data-pay]', (e, b) => openPayModal(data.invoices.find((i) => i.id === Number(b.dataset.pay)), load)),
    on(el, 'click', '[data-del]', async (e, b) => {
      if (await confirmDialog('청구 내역을 삭제할까요?', { okLabel: '삭제', danger: true })) {
        await api.del(`/api/invoices/${b.dataset.del}`);
        load();
      }
    }),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
