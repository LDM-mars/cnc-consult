// 학생 화면 › 상담 기록
import { api } from '../../api.js';
import {
  addDays, bindChips, chipValue, chips, confirmDialog, emptyState, fmtDate, formValues, html, on, openModal, raw,
  setHTML, today, toast, won,
} from '../../ui.js';

const KINDS = ['정기 상담', '학부모 상담', '입시 상담', '기타'];

function consultForm(c = {}) {
  const isNew = !c.id;
  const kindLocked = c.kind === '신입 상담';
  let counselor = c.counselor;
  if (counselor == null) { try { counselor = localStorage.getItem('cnc-counselor') || ''; } catch (e) { counselor = ''; } }
  return html`
    <form class="col" onsubmit="return false">
      ${kindLocked ? html`<p class="muted">신입 상담 기록입니다.</p>` : html`<div class="field"><span>상담 종류</span>${raw(String(chips('kind', KINDS, c.kind || '정기 상담')).replace('class="chips"', 'class="chips" data-required'))}</div>`}
      <div class="grid2">
        <label class="field"><span>상담일</span><input type="date" name="consulted_at" value="${c.consulted_at || today()}"></label>
        <label class="field"><span>상담한 선생님</span><input type="text" name="counselor" value="${counselor || ''}"></label>
      </div>
      <label class="field"><span>상담 내용</span><textarea name="summary" rows="6" placeholder="이야기한 내용, 학생 상태, 다음 목표 등">${c.summary || ''}</textarea></label>
      <div class="field"><span>다시 연락할 날</span>
        <div class="row">
          <input type="date" name="next_contact_date" value="${c.next_contact_date || ''}" style="width:300px">
          <button type="button" class="btn sm ghost" data-quick="7">1주 뒤</button>
          <button type="button" class="btn sm ghost" data-quick="14">2주 뒤</button>
          <button type="button" class="btn sm ghost" data-quick="30">한 달 뒤</button>
        </div>
        <input type="text" name="next_contact_note" value="${c.next_contact_note || ''}" placeholder="연락할 내용" class="mt-s">
      </div>
      ${isNew ? '' : html`<label class="check"><input type="checkbox" name="contact_done" ${c.contact_done ? raw('checked') : ''}> 연락 완료</label>`}
    </form>`;
}

export function openConsultModal(student, c, onSaved) {
  return openModal({
    title: c && c.id ? '상담 기록 수정' : `${student.name} · 새 상담`,
    wide: true,
    body: consultForm(c || {}),
    onOpen(modal) {
      bindChips(modal);
      on(modal, 'click', '[data-quick]', (e, el) => {
        modal.querySelector('[name=next_contact_date]').value = addDays(today(), Number(el.dataset.quick));
      });
    },
    actions: [
      { label: '취소' },
      {
        label: '저장', primary: true,
        async onClick(m) {
          const v = formValues(m.el);
          const data = {
            consulted_at: v.consulted_at || today(), counselor: v.counselor, summary: v.summary,
            next_contact_date: v.next_contact_date || null, next_contact_note: v.next_contact_note,
          };
          const kind = chipValue(m.el, 'kind');
          if (kind) data.kind = kind;
          if ('contact_done' in v) data.contact_done = v.contact_done;
          if (c && c.id) await api.put(`/api/consultations/${c.id}`, data);
          else await api.post(`/api/students/${student.id}/consultations`, data);
          try { localStorage.setItem('cnc-counselor', v.counselor || ''); } catch (e) { /* 무시 */ }
          toast('상담 기록을 저장했습니다.');
          onSaved && onSaved();
        },
      },
    ],
  });
}

function extraRows(c) {
  const a = c.answers || {};
  const rows = [];
  if (c.result) rows.push(['상담 결과', c.result]);
  if (c.trial_date) rows.push(['체험 수업', fmtDate(c.trial_date)]);
  const fee = a.fee;
  if (fee && (fee.total || (fee.courses && fee.courses.length))) {
    const parts = (fee.courses || []).map((x) => `${x.name} ${won(x.fee)}`);
    if (fee.manual_fee) parts.push(`수강료 ${won(fee.manual_fee)}`);
    if (fee.material) parts.push(`재료비 ${won(fee.material)}`);
    if (fee.discount) parts.push(`할인 -${won(fee.discount)}`);
    rows.push(['안내한 수강료', `${parts.join(' · ')} → 월 ${won(fee.total)}`]);
  }
  if (a.consent != null) rows.push(['개인정보 동의', a.consent ? '동의함' : '체크 안 함']);
  return rows;
}

export default async function (el, tctx, extra = {}) {
  const student = tctx.student;
  async function load() {
    const list = await api.get(`/api/students/${student.id}/consultations`);
    const t = today();
    setHTML(el, list.length ? html`<div class="timeline">${list.map((c) => html`
      <div class="tl-item" data-id="${c.id}">
        <div class="tl-head">
          <span class="tl-date">${fmtDate(c.consulted_at)}</span>
          <span class="badge ${c.kind === '신입 상담' ? 'pink' : ''}">${c.kind}</span>
          ${c.counselor ? html`<span class="muted small">${c.counselor} 선생님</span>` : ''}
          <span class="spacer"></span>
          ${c.next_contact_date ? html`
            <span class="contact-flag">
              <span class="badge ${c.contact_done ? 'ok' : (c.next_contact_date <= t ? 'danger' : 'warn')}">
                ${c.contact_done ? '연락 완료' : `연락 ${fmtDate(c.next_contact_date)}`}</span>
              ${c.contact_done ? '' : html`<button class="btn xs" data-act="done">완료</button>`}
            </span>` : ''}
          <button class="btn xs ghost" data-act="edit">수정</button>
          <button class="btn xs ghost" data-act="del">삭제</button>
        </div>
        ${c.summary ? html`<div class="tl-summary">${c.summary}</div>` : ''}
        ${c.next_contact_note && !c.contact_done ? html`<div class="muted small mt-s">📞 ${c.next_contact_note}</div>` : ''}
        ${extraRows(c).length || c.signature_path ? html`
          <div class="tl-extra">
            ${extraRows(c).map(([k, v]) => html`<span class="k">${k}</span><span>${v}</span>`)}
            ${c.signature_path ? html`<span class="k">보호자 서명</span><span><img class="sig-img" src="${c.signature_path}" alt="서명"></span>` : ''}
          </div>` : ''}
      </div>`)}</div>` : emptyState('상담 기록이 없습니다.', '오른쪽 위 [+ 새 상담]으로 기록을 남겨 보세요.'));
    el._list = list;
  }

  const offs = [
    on(el, 'click', '[data-act]', async (e, btn) => {
      const id = Number(btn.closest('.tl-item').dataset.id);
      const c = (el._list || []).find((x) => x.id === id);
      const act = btn.dataset.act;
      if (act === 'done') {
        await api.put(`/api/consultations/${id}`, { contact_done: true });
        toast('연락 완료로 표시했습니다.');
        load();
      } else if (act === 'edit') {
        openConsultModal(student, c, load);
      } else if (act === 'del') {
        if (await confirmDialog(`${fmtDate(c.consulted_at)} ${c.kind} 기록을 삭제할까요?`, { okLabel: '삭제', danger: true })) {
          await api.del(`/api/consultations/${id}`);
          toast('삭제했습니다.');
          load();
        }
      }
    }),
  ];

  await load();
  if (extra.openNew) openConsultModal(student, null, load);
  return () => offs.forEach((f) => f());
}
