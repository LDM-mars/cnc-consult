// 학부모 리포트 만들기: 기간·작품·코멘트 고르기 → 미리보기 → PNG 저장 / 인쇄 / 기록 저장
import { api, getClasses, getSettings } from '../api.js';
import { drawReport } from '../lib/report-canvas.js';
import { designUrl } from '../stage.js';
import { addDays, confirmDialog, downloadBlob, esc, fmtDate, html, on, raw, setHTML, today, toast } from '../ui.js';

export default async function (ctx) {
  const id = Number(ctx.params.id);
  const [student, classes, settings, artworks, consults] = await Promise.all([
    api.get(`/api/students/${id}`), getClasses(), getSettings(),
    api.get(`/api/students/${id}/artworks`), api.get(`/api/students/${id}/consultations`),
  ]);
  const cls = classes.find((c) => c.id === student.class_id);
  ctx.setTitle(`${student.name} · 학부모 리포트`);

  let teacher = '';
  try { teacher = localStorage.getItem('cnc-counselor') || ''; } catch (e) { /* 무시 */ }
  const state = {
    from: addDays(today(), -90), to: today(), picked: [], comment: '', teacher, includeChart: true,
  };
  // 기본 선택: 기간 안의 최근 작품 4개
  const inPeriod = () => artworks.filter((a) => a.made_on >= state.from && a.made_on <= state.to);
  state.picked = inPeriod().slice(0, 4).map((a) => a.id);
  const lastRegular = consults.find((c) => c.kind !== '신입 상담' && c.summary);
  if (lastRegular) state.comment = lastRegular.summary;

  setHTML(ctx.page, html`
    <div class="report">
      <div class="report-side">
        <div class="grid2">
          <label class="field"><span>기간 시작</span><input type="date" name="from" value="${state.from}"></label>
          <label class="field"><span>기간 끝</span><input type="date" name="to" value="${state.to}"></label>
        </div>
        <div class="field"><span>작품 고르기 <em class="hint">(최대 4개, 누른 순서대로)</em></span><div class="picks"></div></div>
        <label class="field"><span>선생님 코멘트</span><textarea name="comment" rows="6" placeholder="이번 기간 동안의 성장, 칭찬할 점, 앞으로의 목표">${state.comment}</textarea></label>
        <label class="field"><span>선생님 이름</span><input type="text" name="teacher" value="${state.teacher}"></label>
        <label class="check"><input type="checkbox" name="includeChart" ${state.includeChart ? raw('checked') : ''}> 점수 그래프 넣기</label>
      </div>
      <div class="report-preview">
        <canvas></canvas>
        <div class="row">
          <button class="btn primary" data-act="png">PNG로 저장</button>
          <button class="btn" data-act="print">인쇄 · PDF</button>
          <button class="btn" data-act="keep">리포트 기록에 남기기</button>
          <span class="spacer"></span>
          <span class="muted small">카카오톡으로는 PNG를 저장해서 보내 주세요.</span>
        </div>
        <div class="history"></div>
      </div>
    </div>`);

  const side = ctx.page.querySelector('.report-side');
  const canvas = ctx.page.querySelector('canvas');
  const picksEl = ctx.page.querySelector('.picks');

  function renderPicks() {
    const list = inPeriod();
    setHTML(picksEl, list.length ? html`<div class="pick-grid">${list.map((a) => {
      const order = state.picked.indexOf(a.id);
      return html`<button class="pick ${order >= 0 ? 'on' : ''}" data-pick="${a.id}"><img src="${a.thumb_path || a.image_path}" alt=""><span class="order">${order + 1}</span></button>`;
    })}</div>` : html`<p class="muted small">이 기간에 올린 작품이 없습니다. 학생 화면 › 작품에서 사진을 올려 주세요.</p>`);
  }

  let drawSeq = 0;
  async function redraw() {
    const seq = ++drawSeq;
    const picked = state.picked.map((pid) => artworks.find((a) => a.id === pid)).filter(Boolean);
    const off = document.createElement('canvas');
    await drawReport(off, {
      background: settings.report_background || designUrl('3.배경.png'),
      student, className: cls ? cls.name : '', period: [state.from, state.to],
      artworks: picked, allArtworks: inPeriod(), items: settings.eval_items || [],
      comment: state.comment, teacher: state.teacher, academy: settings.academy_name,
      includeChart: state.includeChart, date: today(),
    });
    if (seq !== drawSeq || !ctx.isCurrent()) return;
    canvas.width = 1920; canvas.height = 1080;
    canvas.getContext('2d').drawImage(off, 0, 0);
  }

  async function loadHistory() {
    const reports = await api.get(`/api/students/${id}/reports`);
    const box = ctx.page.querySelector('.history');
    setHTML(box, reports.length ? html`
      <div class="section-title mt">리포트 기록</div>
      <table class="list"><tbody>${reports.map((r) => html`<tr>
        <td class="nowrap">${fmtDate(r.created_at)}</td>
        <td class="small">${r.period_from ? `${fmtDate(r.period_from)} ~ ${fmtDate(r.period_to)}` : ''}</td>
        <td class="right nowrap"><a class="btn xs" href="${r.image_path}" target="_blank">열기</a>
          <a class="btn xs ghost" href="${r.image_path}" download="${student.name}_리포트_${(r.created_at || '').slice(0, 10)}.png">받기</a>
          <button class="btn xs ghost" data-del-report="${r.id}">삭제</button></td>
      </tr>`)}</tbody></table>` : '');
  }

  const toBlob = () => new Promise((res) => canvas.toBlob(res, 'image/png'));
  const fileName = () => `${student.name}_리포트_${today()}.png`;

  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(redraw, 200); };

  side.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'comment') state.comment = t.value;
    if (t.name === 'teacher') state.teacher = t.value;
    schedule();
  });
  side.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'from' || t.name === 'to') {
      state[t.name] = t.value;
      const ids = new Set(inPeriod().map((a) => a.id));
      state.picked = state.picked.filter((p) => ids.has(p));
      renderPicks();
    }
    if (t.name === 'includeChart') state.includeChart = t.checked;
    schedule();
  });
  on(picksEl, 'click', '[data-pick]', (e, b) => {
    const pid = Number(b.dataset.pick);
    const i = state.picked.indexOf(pid);
    if (i >= 0) state.picked.splice(i, 1);
    else if (state.picked.length >= 4) { toast('작품은 4개까지 고를 수 있습니다.', 'error'); return; }
    else state.picked.push(pid);
    renderPicks();
    schedule();
  });
  on(ctx.page, 'click', '[data-act=png]', async () => {
    await redraw();
    downloadBlob(await toBlob(), fileName());
  });
  on(ctx.page, 'click', '[data-act=print]', async () => {
    await redraw();
    const url = URL.createObjectURL(await toBlob());
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><title>${esc(fileName())}</title><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0}img{width:100%;display:block}</style></head><body><img src="${url}"></body></html>`);
    doc.close();
    frame.contentWindow.addEventListener('afterprint', () => setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 500));
    const img = doc.querySelector('img');
    const go = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
    if (img.complete) go(); else img.onload = go;
  });
  on(ctx.page, 'click', '[data-act=keep]', async (e, b) => {
    b.disabled = true;
    try {
      await redraw();
      const path = await api.upload('reports', await toBlob());
      await api.post(`/api/students/${id}/reports`, {
        image_path: path, period_from: state.from, period_to: state.to, comment: state.comment, artwork_ids: state.picked,
      });
      try { localStorage.setItem('cnc-counselor', state.teacher || ''); } catch (err) { /* 무시 */ }
      toast('리포트 기록에 남겼습니다.');
      loadHistory();
    } finally {
      b.disabled = false;
    }
  });
  on(ctx.page, 'click', '[data-del-report]', async (e, b) => {
    if (await confirmDialog('이 리포트 기록을 삭제할까요?', { okLabel: '삭제', danger: true })) {
      await api.del(`/api/reports/${b.dataset.delReport}`);
      loadHistory();
    }
  });

  renderPicks();
  await Promise.all([redraw(), loadHistory()]);
  if (!artworks.length) {
    toast('올린 작품이 없어서 빈 리포트입니다. 학생 화면 › 작품에서 사진을 올려 주세요.');
  }
  return () => clearTimeout(timer);
}

