// 학생 화면 › 성적 (내신 / 모의고사 / 수능 / 실기 모의평가)
import { api } from '../../api.js';
import { bindChips, chipValue, chips, confirmDialog, emptyState, fmtDate, html, on, openModal, raw, setHTML, today, toast } from '../../ui.js';

const PRESETS = {
  '내신': ['평균 등급', '국어', '수학', '영어', '미술'],
  '모의고사': ['국어', '수학', '영어', '탐구1', '탐구2'],
  '수능': ['국어', '수학', '영어', '탐구1', '탐구2'],
  '실기 모의평가': ['점수', '등수'],
};

function valueInputs(kind) {
  return html`<div class="grid3">${(PRESETS[kind] || []).map((k) => html`
    <label class="field"><span>${k}</span><input type="text" data-val="${k}" placeholder="${kind === '실기 모의평가' ? '' : '등급'}"></label>`)}</div>`;
}

function openAdd(student, onSaved) {
  openModal({
    title: '성적 추가',
    wide: true,
    body: html`
      <form class="col" onsubmit="return false">
        <div class="field"><span>종류</span>${raw(String(chips('kind', Object.keys(PRESETS), '내신')).replace('class="chips"', 'class="chips" data-required'))}</div>
        <label class="field" style="width:340px"><span>날짜</span><input type="date" name="taken_on" value="${today()}"></label>
        <div class="vals">${valueInputs('내신')}</div>
        <label class="field"><span>메모</span><input type="text" name="memo" placeholder="예: 1학기 기말, 6월 모평"></label>
      </form>`,
    onOpen(modal) {
      bindChips(modal);
      modal.querySelector('[data-chips=kind]').addEventListener('change', () => {
        setHTML(modal.querySelector('.vals'), valueInputs(chipValue(modal, 'kind')));
      });
    },
    actions: [
      { label: '취소' },
      {
        label: '저장', primary: true,
        async onClick(m) {
          const values = Object.fromEntries(Array.from(m.el.querySelectorAll('[data-val]'))
            .map((i) => [i.dataset.val, i.value.trim()]).filter(([, v]) => v));
          if (!Object.keys(values).length) throw new Error('값을 하나 이상 입력해 주세요.');
          await api.post(`/api/students/${student.id}/scores`, {
            kind: chipValue(m.el, 'kind'), taken_on: m.el.querySelector('[name=taken_on]').value || today(),
            values, memo: m.el.querySelector('[name=memo]').value.trim(),
          });
          toast('성적을 저장했습니다.');
          onSaved();
        },
      },
    ],
  });
}

export default async function (el, tctx) {
  const student = tctx.student;
  async function load() {
    const list = await api.get(`/api/students/${student.id}/scores`);
    setHTML(el, html`
      <div class="row between"><div class="section-title">성적 기록</div><button class="btn sm primary" data-act="add">+ 성적 추가</button></div>
      ${list.length ? html`
        <table class="list mt-s">
          <thead><tr><th>날짜</th><th>종류</th><th>내용</th><th>메모</th><th></th></tr></thead>
          <tbody>${list.map((r) => html`<tr>
            <td class="nowrap">${fmtDate(r.taken_on)}</td>
            <td><span class="badge">${r.kind}</span></td>
            <td>${Object.entries(r.values || {}).map(([k, v], i) => html`${i ? ' · ' : ''}${k} <b>${v}</b>`)}</td>
            <td class="muted">${r.memo}</td>
            <td class="right"><button class="btn xs ghost" data-del="${r.id}">삭제</button></td>
          </tr>`)}</tbody>
        </table>` : emptyState('성적 기록이 없습니다.', '내신, 모의고사, 실기 모의평가 결과를 남겨 두면 입시 상담 때 바로 볼 수 있어요.')}`);
  }
  const offs = [
    on(el, 'click', '[data-act=add]', () => openAdd(student, load)),
    on(el, 'click', '[data-del]', async (e, b) => {
      if (await confirmDialog('이 성적 기록을 삭제할까요?', { okLabel: '삭제', danger: true })) {
        await api.del(`/api/scores/${b.dataset.del}`);
        load();
      }
    }),
  ];
  await load();
  return () => offs.forEach((f) => f());
}
