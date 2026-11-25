// 관리 › 설정 (학원 이름, 목록 항목, 리포트 배경, 비밀번호, 백업, 로그아웃)
import { api, getSettings, invalidateSettings } from '../api.js';
import { resizeImage } from '../lib/image.js';
import { logout } from '../session.js';
import { designUrl } from '../stage.js';
import { confirmDialog, formValues, html, on, setHTML, toast } from '../ui.js';

const lines = (s) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export default async function (el, ctx) {
  const [settings, design] = await Promise.all([getSettings(true), api.get('/api/design-images')]);
  let bg = settings.report_background;
  const bgChoices = design.files.filter((f) => !/버튼/.test(f)).map((f) => ({ url: `/design/${f}`, src: designUrl(f), name: f }));
  if (bg && !bgChoices.some((b) => b.url === bg)) bgChoices.push({ url: bg, src: bg, name: '올린 이미지' });

  function render() {
    setHTML(el, html`
      <h2>설정</h2>
      <div class="grid2">
        <div class="card col">
          <h3>목록 항목</h3>
          <form class="col lists-form" onsubmit="return false">
            <label class="field"><span>학원 이름 <em class="hint">(리포트에 표시)</em></span><input type="text" name="academy_name" value="${settings.academy_name}"></label>
            <label class="field"><span>실기 종목 <em class="hint">(한 줄에 하나)</em></span><textarea name="exam_subjects" rows="5">${(settings.exam_subjects || []).join('\n')}</textarea></label>
            <label class="field"><span>작품 평가 항목 <em class="hint">(1~10점으로 매길 항목)</em></span><textarea name="eval_items" rows="4">${(settings.eval_items || []).join('\n')}</textarea></label>
            <label class="field"><span>알게 된 경로</span><textarea name="sources" rows="4">${(settings.sources || []).join('\n')}</textarea></label>
            <div class="row"><span class="spacer"></span><button class="btn primary" data-act="save-lists">저장</button></div>
          </form>
        </div>
        <div class="col">
          <div class="card col">
            <h3>학부모 리포트 배경</h3>
            <div class="bg-choices">${bgChoices.map((b) => html`<button class="bg-choice ${b.url === bg ? 'on' : ''}" data-bg="${b.url}"><img src="${b.src}" alt=""><span>${b.name}</span></button>`)}</div>
            <div class="row"><button class="btn sm" data-act="upload-bg">+ 다른 이미지 올리기 (16:9)</button><input type="file" accept="image/*" hidden class="bg-input"></div>
          </div>
          <div class="card col">
            <h3>비밀번호 바꾸기</h3>
            <form class="grid2 pw-form" onsubmit="return false">
              <label class="field"><span>지금 비밀번호</span><input type="password" name="old"></label>
              <label class="field"><span>새 비밀번호</span><input type="password" name="new"></label>
            </form>
            <div class="row"><span class="muted small grow">바꾸면 다른 기기는 다시 로그인해야 합니다.</span><button class="btn" data-act="pw">바꾸기</button></div>
          </div>
          <div class="card col">
            <h3>백업 · 로그아웃</h3>
            <p class="muted small">백업 파일(zip)에는 모든 학생 정보와 사진이 들어 있습니다. USB나 클라우드에 정기적으로 보관해 주세요.</p>
            <div class="row"><a class="btn primary" href="/api/backup" download>백업 내려받기</a><span class="spacer"></span><button class="btn ghost" data-act="logout">이 기기 로그아웃</button></div>
          </div>
        </div>
      </div>`);
  }

  async function saveSettings(data) {
    await api.put('/api/settings', data);
    invalidateSettings();
    Object.assign(settings, await getSettings(true));
  }

  const offs = [
    on(el, 'click', '[data-act=save-lists]', async () => {
      const v = formValues(el.querySelector('.lists-form'));
      await saveSettings({ academy_name: v.academy_name, exam_subjects: lines(v.exam_subjects), eval_items: lines(v.eval_items), sources: lines(v.sources) });
      toast('저장했습니다.');
      render();
    }),
    on(el, 'click', '[data-bg]', async (e, b) => {
      bg = b.dataset.bg;
      await saveSettings({ report_background: bg });
      toast('리포트 배경을 바꿨습니다.');
      render();
    }),
    on(el, 'click', '[data-act=upload-bg]', () => el.querySelector('.bg-input').click()),
    on(el, 'change', '.bg-input', async (e, input) => {
      const f = input.files[0];
      if (!f) return;
      const url = await api.upload('backgrounds', await resizeImage(f, 1920, 0.92));
      bg = url;
      bgChoices.push({ url, src: url, name: '올린 이미지' });
      await saveSettings({ report_background: url });
      toast('리포트 배경을 올렸습니다.');
      render();
    }),
    on(el, 'click', '[data-act=pw]', async () => {
      const v = formValues(el.querySelector('.pw-form'));
      await api.post('/api/auth/password', { old: v.old, new: v.new });
      toast('비밀번호를 바꿨습니다.');
      render();
    }),
    on(el, 'click', '[data-act=logout]', async () => {
      if (!(await confirmDialog('이 기기에서 로그아웃할까요?', { okLabel: '로그아웃' }))) return;
      await logout();
      ctx.go('/');
    }),
  ];
  render();
  return () => offs.forEach((f) => f());
}
