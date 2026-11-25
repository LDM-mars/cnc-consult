// 학생 화면 › 작품 (사진, 실기 종목, 평가 점수, 점수 추이 그래프)
import { api } from '../../api.js';
import { artworkSeries, averageScore, lineChart } from '../../lib/chart.js';
import { makeImageAndThumb } from '../../lib/image.js';
import { confirmDialog, emptyState, fmtDate, formValues, html, on, openModal, raw, setHTML, today, toast } from '../../ui.js';

function artworkForm(tctx, a = {}) {
  const items = tctx.settings.eval_items || [];
  const subjects = ['자유', ...(tctx.settings.exam_subjects || [])];
  const scoring = a.id ? !!(a.scores && Object.keys(a.scores).length) : !!(tctx.cls && tctx.cls.show_exam);
  return html`
    <form class="col" onsubmit="return false">
      ${a.id ? '' : html`
        <div class="photo-pick">
          <div class="photo-preview">사진을<br>골라 주세요</div>
          <div class="col">
            <button type="button" class="btn primary big" data-act="pick">📷 사진 찍기 / 고르기</button>
            <p class="muted small">태블릿·폰에서는 카메라로 바로 찍을 수 있어요.</p>
            <input type="file" accept="image/*" hidden>
          </div>
        </div>`}
      <div class="grid3">
        <label class="field"><span>실기 종목</span><select name="subject">${subjects.map((s) => html`<option ${s === (a.subject || '자유') ? raw('selected') : ''}>${s}</option>`)}</select></label>
        <label class="field"><span>그린 날</span><input type="date" name="made_on" value="${a.made_on || today()}"></label>
        <label class="field"><span>제목 (선택)</span><input type="text" name="title" value="${a.title || ''}"></label>
      </div>
      <label class="field"><span>선생님 코멘트</span><textarea name="comment" rows="3" placeholder="잘한 점, 보완할 점">${a.comment || ''}</textarea></label>
      ${items.length ? html`
        <label class="check"><input type="checkbox" name="scoring" ${scoring ? raw('checked') : ''}> 항목별 점수 매기기 (1~10점)</label>
        <div class="score-sliders" ${scoring ? '' : raw('hidden')}>
          ${items.map((k) => {
            const v = a.scores && a.scores[k] != null ? a.scores[k] : 5;
            return html`<div class="score-row"><span>${k}</span><input type="range" min="1" max="10" step="1" data-score="${k}" value="${v}"><span class="val">${v}</span></div>`;
          })}
        </div>` : ''}
    </form>`;
}

function readScores(modal) {
  const box = modal.querySelector('[name=scoring]');
  if (!box || !box.checked) return {};
  return Object.fromEntries(Array.from(modal.querySelectorAll('[data-score]')).map((r) => [r.dataset.score, Number(r.value)]));
}

function bindForm(modal) {
  on(modal, 'input', '[data-score]', (e, r) => { r.parentElement.querySelector('.val').textContent = r.value; });
  const box = modal.querySelector('[name=scoring]');
  if (box) box.addEventListener('change', () => { modal.querySelector('.score-sliders').hidden = !box.checked; });
}

function openAdd(tctx, onSaved) {
  let file = null;
  openModal({
    title: '작품 올리기',
    wide: true,
    body: artworkForm(tctx),
    onOpen(modal) {
      bindForm(modal);
      const input = modal.querySelector('input[type=file]');
      const preview = modal.querySelector('.photo-preview');
      on(modal, 'click', '[data-act=pick]', () => input.click());
      preview.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        file = input.files[0] || null;
        if (!file) return;
        const url = URL.createObjectURL(file);
        preview.innerHTML = '';
        const img = document.createElement('img');
        img.src = url;
        preview.appendChild(img);
      });
    },
    actions: [
      { label: '취소' },
      {
        label: '올리기', primary: true,
        async onClick(m) {
          if (!file) throw new Error('사진을 골라 주세요.');
          const v = formValues(m.el);
          toast('사진을 올리는 중…');
          const { full, thumb } = await makeImageAndThumb(file);
          const [image_path, thumb_path] = await Promise.all([api.upload('artworks', full), api.upload('artworks', thumb)]);
          await api.post(`/api/students/${tctx.student.id}/artworks`, {
            image_path, thumb_path, subject: v.subject, made_on: v.made_on, title: v.title, comment: v.comment,
            scores: readScores(m.el),
          });
          toast('작품을 올렸습니다.');
          onSaved();
        },
      },
    ],
  });
}

function openEdit(tctx, a, onSaved) {
  openModal({
    title: '작품 정보 수정',
    wide: true,
    body: artworkForm(tctx, a),
    onOpen: bindForm,
    actions: [
      { label: '취소' },
      {
        label: '저장', primary: true,
        async onClick(m) {
          const v = formValues(m.el);
          await api.put(`/api/artworks/${a.id}`, { subject: v.subject, made_on: v.made_on, title: v.title, comment: v.comment, scores: readScores(m.el) });
          toast('저장했습니다.');
          onSaved();
        },
      },
    ],
  });
}

function openViewer(tctx, a, onChanged) {
  const avg = averageScore(a.scores, null);
  openModal({
    title: a.title || `${fmtDate(a.made_on)} 작품`,
    wide: true,
    body: html`
      <div class="viewer">
        <img src="${a.image_path}" alt="작품">
        <div class="col">
          <div class="kv">
            <span class="k">그린 날</span><span>${fmtDate(a.made_on)}</span>
            <span class="k">실기 종목</span><span>${a.subject || '-'}</span>
            ${avg != null ? html`<span class="k">평균 점수</span><span class="pink"><b>${avg}</b> / 10</span>` : ''}
          </div>
          ${a.scores && Object.keys(a.scores).length ? html`
            <div class="kv">${Object.entries(a.scores).map(([k, v]) => html`<span class="k">${k}</span><span>${'★'.repeat(Math.round(v / 2))}${'☆'.repeat(5 - Math.round(v / 2))} ${v}</span>`)}</div>` : ''}
          ${a.comment ? html`<div class="card flat"><div class="muted small">선생님 코멘트</div><p style="white-space:pre-line">${a.comment}</p></div>` : ''}
          <div class="row mt">
            <button class="btn sm" data-act="edit">수정</button>
            <button class="btn sm danger" data-act="del">삭제</button>
          </div>
        </div>
      </div>`,
    onOpen(modal, ctrl) {
      on(modal, 'click', '[data-act=edit]', () => { ctrl.close(); openEdit(tctx, a, onChanged); });
      on(modal, 'click', '[data-act=del]', async () => {
        if (await confirmDialog('이 작품을 삭제할까요? 사진도 함께 지워집니다.', { okLabel: '삭제', danger: true })) {
          await api.del(`/api/artworks/${a.id}`);
          ctrl.close();
          toast('삭제했습니다.');
          onChanged();
        }
      });
    },
  });
}

export default async function (el, tctx) {
  const items = tctx.settings.eval_items || [];
  let list = [];

  async function load() {
    list = await api.get(`/api/students/${tctx.student.id}/artworks`);
    const series = artworkSeries(list, items);
    const hasChart = series.some((s) => s.points.length > 0);
    setHTML(el, html`
      ${hasChart ? html`
        <div class="card chart-card">
          <div class="row between"><div class="section-title">점수 추이</div>
            <div class="chart-legend">${series.map((s) => html`<span><i style="background:${s.color}"></i>${s.name}</span>`)}</div></div>
          ${raw(lineChart(series, { width: 1580, height: 300 }))}
        </div>` : ''}
      <div class="art-grid ${hasChart ? 'mt' : ''}">
        <button class="art-item art-add" data-act="add"><span class="plus">+</span>작품 올리기</button>
        ${list.map((a) => {
          const avg = averageScore(a.scores, items);
          return html`<button class="art-item" data-id="${a.id}">
            <img src="${a.thumb_path || a.image_path}" alt="" loading="lazy">
            ${avg != null ? html`<span class="avg">${avg}</span>` : ''}
            <span class="cap">${fmtDate(a.made_on)}${a.subject && a.subject !== '자유' ? ` · ${a.subject}` : ''}</span>
          </button>`;
        })}
      </div>
      ${list.length ? '' : html`<p class="muted mt">작품 사진을 올리면 날짜순으로 쌓이고, 점수를 매기면 위에 성장 그래프가 그려집니다.</p>`}`);
  }

  const off = on(el, 'click', '.art-item', (e, btn) => {
    if (btn.dataset.act === 'add') { openAdd(tctx, load); return; }
    const a = list.find((x) => x.id === Number(btn.dataset.id));
    if (a) openViewer(tctx, a, load);
  });
  await load();
  return off;
}
