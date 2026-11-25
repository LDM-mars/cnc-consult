// 관리 › 반 관리 (소개 문구, 커리큘럼, 수업 시간, 작품 예시 사진, 수강 옵션·요금)
import { api, getClasses, invalidateClasses } from '../api.js';
import { resizeImage } from '../lib/image.js';
import { confirmDialog, formValues, html, on, raw, setHTML, toast, won } from '../ui.js';

export default async function (el, ctx) {
  let classes = await getClasses(true);
  let current = ctx.query.c && classes.some((c) => c.id === ctx.query.c) ? ctx.query.c : classes[0].id;

  function render() {
    const c = classes.find((x) => x.id === current);
    setHTML(el, html`
      <h2>반 관리</h2>
      <div class="class-tabs">${classes.map((x) => html`<button class="chip ${x.id === current ? 'on' : ''}" data-c="${x.id}">${x.name}</button>`)}</div>
      <div class="grid2">
        <div class="card col">
          <h3>반 소개 <span class="muted small">(신입생 상담 첫 화면)</span></h3>
          <form class="col class-form" onsubmit="return false">
            <label class="field"><span>반 이름</span><input type="text" name="name" value="${c.name}"></label>
            <label class="field"><span>한 줄 소개</span><textarea name="intro" rows="2">${c.intro}</textarea></label>
            <label class="field"><span>커리큘럼 <em class="hint">(한 줄에 하나씩)</em></span><textarea name="curriculum" rows="5">${c.curriculum}</textarea></label>
            <label class="field"><span>수업 요일 · 시간</span><input type="text" name="schedule_text" value="${c.schedule_text}" placeholder="예: 월·수·금 17:00~20:00"></label>
            <label class="check"><input type="checkbox" name="show_exam" ${c.show_exam ? raw('checked') : ''}> 상담카드에 입시 정보(목표 학교, 실기 종목, 성적) 칸 보이기</label>
            <div class="row"><span class="spacer"></span><button class="btn primary" data-act="save">저장</button></div>
          </form>
        </div>
        <div class="col">
          <div class="card col">
            <div class="row between"><h3>작품 예시 사진</h3><button class="btn sm" data-act="add-img">+ 사진 추가</button></div>
            <input type="file" accept="image/*" multiple hidden class="img-input">
            ${(c.intro_images || []).length ? html`<div class="intro-thumbs">${c.intro_images.map((u, i) => html`
              <div class="intro-thumb"><img src="${u}" alt=""><button class="del" data-del-img="${i}" aria-label="삭제">✕</button></div>`)}</div>`
              : html`<p class="muted small">사진이 없으면 목차 화면의 원형 그림을 보여줍니다.</p>`}
          </div>
          <div class="card col">
            <div class="row between"><h3>수강 옵션 · 월 수강료</h3><button class="btn sm" data-act="add-course">+ 옵션 추가</button></div>
            ${(c.courses || []).length ? html`<table class="list course-table">
              <thead><tr><th>이름</th><th>월 수강료</th><th>사용</th><th></th></tr></thead>
              <tbody>${c.courses.map((x) => html`<tr data-course="${x.id}">
                <td><input type="text" data-f="name" value="${x.name}"></td>
                <td><input type="number" data-f="monthly_fee" value="${x.monthly_fee}" step="10000" min="0" style="width:200px"></td>
                <td><input type="checkbox" data-f="active" ${x.active ? raw('checked') : ''} style="width:30px;height:30px;accent-color:var(--pink)"></td>
                <td class="right nowrap"><button class="btn xs" data-save-course>저장</button> <button class="btn xs ghost" data-del-course>삭제</button></td>
              </tr>`)}</tbody></table>`
              : html`<p class="muted small">예: "주3회 / 450,000원", "주5회 정규 / 600,000원" 처럼 추가하면 상담카드에서 수강료가 자동 계산됩니다.</p>`}
          </div>
        </div>
      </div>`);
  }

  async function refresh() {
    invalidateClasses();
    classes = await getClasses(true);
    render();
  }

  const cur = () => classes.find((x) => x.id === current);
  const offs = [
    on(el, 'click', '[data-c]', (e, b) => {
      current = b.dataset.c;
      history.replaceState(null, '', `#/admin/classes?c=${current}`);
      render();
    }),
    on(el, 'click', '[data-act=save]', async () => {
      const v = formValues(el.querySelector('.class-form'));
      if (!v.name) { toast('반 이름을 입력해 주세요.', 'error'); return; }
      await api.put(`/api/classes/${current}`, { ...v, show_exam: v.show_exam ? 1 : 0 });
      toast('저장했습니다.');
      refresh();
    }),
    on(el, 'click', '[data-act=add-img]', () => el.querySelector('.img-input').click()),
    on(el, 'change', '.img-input', async (e, input) => {
      const files = Array.from(input.files || []);
      if (!files.length) return;
      toast('사진을 올리는 중…');
      const urls = [];
      for (const f of files) urls.push(await api.upload('class-intro', await resizeImage(f, 1600)));
      await api.put(`/api/classes/${current}`, { intro_images: [...(cur().intro_images || []), ...urls] });
      toast(`사진 ${urls.length}장을 추가했습니다.`);
      refresh();
    }),
    on(el, 'click', '[data-del-img]', async (e, b) => {
      if (!(await confirmDialog('이 사진을 삭제할까요?', { okLabel: '삭제', danger: true }))) return;
      const imgs = (cur().intro_images || []).filter((_, i) => i !== Number(b.dataset.delImg));
      await api.put(`/api/classes/${current}`, { intro_images: imgs });
      refresh();
    }),
    on(el, 'click', '[data-act=add-course]', async () => {
      await api.post('/api/courses', { class_id: current, name: '새 옵션', monthly_fee: 0 });
      refresh();
    }),
    on(el, 'click', '[data-save-course]', async (e, b) => {
      const tr = b.closest('tr');
      const data = {
        name: tr.querySelector('[data-f=name]').value.trim() || '이름 없음',
        monthly_fee: Number(tr.querySelector('[data-f=monthly_fee]').value || 0),
        active: tr.querySelector('[data-f=active]').checked ? 1 : 0,
      };
      await api.put(`/api/courses/${tr.dataset.course}`, data);
      toast(`${data.name} ${won(data.monthly_fee)} 저장했습니다.`);
      refresh();
    }),
    on(el, 'click', '[data-del-course]', async (e, b) => {
      if (!(await confirmDialog('이 수강 옵션을 삭제할까요?\n(이미 등록한 학생이 있으면 삭제 대신 "사용 안 함"으로 바뀝니다.)', { okLabel: '삭제', danger: true }))) return;
      const r = await api.del(`/api/courses/${b.closest('tr').dataset.course}`);
      toast(r.deactivated ? '등록 기록이 있어 "사용 안 함"으로 바꿨습니다.' : '삭제했습니다.');
      refresh();
    }),
  ];
  render();
  return () => offs.forEach((f) => f());
}
