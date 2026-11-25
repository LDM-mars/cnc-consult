// 학생 화면 › 정보 (기본 정보 · 입시 정보 수정, 학생 삭제)
import { api, invalidateClasses } from '../../api.js';
import { bindStudentForm, readStudentForm, studentFormHTML } from '../../lib/student-form.js';
import { confirmDialog, fmtDate, html, on, setHTML, toast } from '../../ui.js';

export default async function (el, tctx) {
  const s = tctx.student;
  const av = s.available || {};
  setHTML(el, html`
    ${studentFormHTML({ classes: tctx.classes, settings: tctx.settings, student: s })}
    ${(av.days && av.days.length) || av.times ? html`<p class="muted mt">가능한 요일·시간 (상담 때 입력): ${(av.days || []).join(' ')} ${av.times || ''}</p>` : ''}
    <p class="muted small mt-s">등록일 ${fmtDate(s.created_at)} · 마지막 수정 ${fmtDate(s.updated_at)}</p>
    <div class="row mt"><span class="spacer"></span><button class="btn danger sm" data-act="delete">학생 삭제</button></div>`);
  setHTML(tctx.foot, html`<button class="btn primary big" data-act="save">정보 저장</button>`);
  bindStudentForm(el, { classes: tctx.classes });

  const offs = [
    on(tctx.foot, 'click', '[data-act=save]', async (e, b) => {
      b.disabled = true;
      try {
        const data = readStudentForm(el);
        await api.put(`/api/students/${s.id}`, data);
        invalidateClasses();
        await tctx.reloadStudent();
        toast('저장했습니다.');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        b.disabled = false;
      }
    }),
    on(el, 'click', '[data-act=delete]', async () => {
      const ok = await confirmDialog(`${s.name} 학생을 삭제할까요?\n상담 기록, 작품 사진, 성적, 수강료 기록이 모두 지워지며 되돌릴 수 없습니다.\n(그만둔 학생은 삭제 대신 상태를 "퇴원"으로 바꾸는 것을 권합니다.)`, { okLabel: '삭제', danger: true });
      if (!ok) return;
      await api.del(`/api/students/${s.id}`);
      invalidateClasses();
      toast('삭제했습니다.');
      tctx.go(s.class_id ? `/class/${s.class_id}/students` : '/admin/students');
    }),
  ];
  return () => offs.forEach((f) => f());
}
