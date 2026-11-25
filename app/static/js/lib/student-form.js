// 학생 정보 입력 폼 (학생 추가 · 정보 수정에서 함께 사용)
import { bindChips, chipValue, chips, esc, formValues, GRADES, html, raw, STATUS_LIST, today } from '../ui.js';

const TARGETS = ['예중', '예고', '미대 수시', '미대 정시', '미정'];

function field(label, input, { req = false, span = '' } = {}) {
  return html`<label class="field ${span}"><span>${label}${req ? raw('<b class="req">*</b>') : ''}</span>${input}</label>`;
}

/**
 * opts: { classes, settings, student (기존 값), withEnroll (새 학생일 때 수강 등록 칸) }
 */
export function studentFormHTML({ classes, settings, student = {}, withEnroll = false }) {
  const s = student;
  const schools = (s.target_schools && s.target_schools.length ? s.target_schools : []).concat([{}, {}, {}]).slice(0, 3);
  const cls = classes.find((c) => c.id === s.class_id) || classes[0];
  const showExam = cls ? !!cls.show_exam : true;
  return html`
    <form class="student-form col" autocomplete="off" onsubmit="return false">
      <div class="grid3">
        ${field('이름', html`<input type="text" name="name" value="${s.name || ''}">`, { req: true })}
        ${field('반', html`<select name="class_id">${classes.map((c) => html`<option value="${c.id}" ${c.id === s.class_id ? raw('selected') : ''}>${c.name}</option>`)}</select>`)}
        ${field('상태', html`<select name="status">${STATUS_LIST.map((st) => html`<option ${st === (s.status || '등록') ? raw('selected') : ''}>${st}</option>`)}</select>`)}
        ${field('학교', html`<input type="text" name="school" value="${s.school || ''}">`)}
        ${field('학년', html`<select name="grade"><option value=""></option>${GRADES.map((g) => html`<option ${g === s.grade ? raw('selected') : ''}>${g}</option>`)}</select>`)}
        ${field('학생 연락처', html`<input type="tel" name="phone" value="${s.phone || ''}">`)}
        ${field('보호자 이름', html`<input type="text" name="guardian_name" value="${s.guardian_name || ''}">`)}
        ${field('보호자 연락처', html`<input type="tel" name="guardian_phone" value="${s.guardian_phone || ''}">`)}
        ${field('알게 된 경로', html`<select name="source"><option value=""></option>${(settings.sources || []).map((o) => html`<option ${o === s.source ? raw('selected') : ''}>${o}</option>`)}</select>`)}
        ${field('미술 경험', html`<textarea name="art_history" rows="2">${s.art_history || ''}</textarea>`, { span: 'span3' })}
        ${field('메모', html`<textarea name="memo" rows="2">${s.memo || ''}</textarea>`, { span: 'span3' })}
      </div>
      <div class="exam-part col" ${showExam ? '' : raw('hidden')}>
        <div class="section-title">입시 정보</div>
        <div class="field"><span>목표</span>${chips('target_level', TARGETS, s.target_level || '')}</div>
        <div class="field"><span>지망 학교 · 학과</span>
          <div class="col">${schools.map((sc, i) => html`
            <div class="school-row"><span class="no">${i + 1}지망</span>
              <input type="text" name="school_${i}" value="${sc.school || ''}" placeholder="학교">
              <input type="text" name="dept_${i}" value="${sc.dept || ''}" placeholder="학과 / 전공"></div>`)}</div>
        </div>
        <div class="field"><span>실기 종목</span>${chips('exam_subjects', settings.exam_subjects || [], s.exam_subjects || [], { multi: true })}</div>
      </div>
      ${withEnroll ? html`
        <div class="enroll-part col">
          <div class="section-title">수강 등록 <span class="muted small">(선택)</span></div>
          <div class="grid4">
            ${field('수강 반', html`<select name="enroll_course"><option value="">등록 안 함</option></select>`)}
            ${field('시작일', html`<input type="date" name="enroll_start" value="${today()}">`)}
            ${field('매달 결제일', html`<input type="number" name="enroll_day" value="1" min="1" max="28">`)}
            ${field('할인', html`<input type="number" name="enroll_discount" value="" min="0" step="1000" placeholder="0">`)}
          </div>
        </div>` : ''}
    </form>`;
}

export function bindStudentForm(root, { classes }) {
  bindChips(root);
  const form = root.querySelector('.student-form');
  const sync = () => {
    const cls = classes.find((c) => c.id === form.class_id.value);
    form.querySelector('.exam-part').hidden = !(cls && cls.show_exam);
    const sel = form.querySelector('[name=enroll_course]');
    if (sel && cls) {
      const keep = sel.value;
      sel.innerHTML = '<option value="">등록 안 함</option>' + (cls.courses || []).filter((c) => c.active)
        .map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${Number(c.monthly_fee).toLocaleString('ko-KR')}원)</option>`).join('');
      if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
    }
  };
  form.class_id.addEventListener('change', sync);
  sync();
}

/** 폼 값 → API 데이터 */
export function readStudentForm(root) {
  const form = root.querySelector('.student-form');
  const v = formValues(form);
  if (!v.name) throw new Error('이름을 입력해 주세요.');
  const data = {
    name: v.name, class_id: v.class_id, status: v.status, school: v.school, grade: v.grade, phone: v.phone,
    guardian_name: v.guardian_name, guardian_phone: v.guardian_phone, source: v.source,
    art_history: v.art_history, memo: v.memo,
  };
  if (!form.querySelector('.exam-part').hidden) {
    data.target_level = chipValue(form, 'target_level');
    data.target_schools = [0, 1, 2].map((i) => ({ school: v[`school_${i}`], dept: v[`dept_${i}`] })).filter((x) => x.school || x.dept);
    data.exam_subjects = chipValue(form, 'exam_subjects');
  }
  if ('enroll_course' in v && v.enroll_course) {
    data.enroll = { course_id: Number(v.enroll_course), start_date: v.enroll_start, billing_day: Number(v.enroll_day || 1), discount: Number(v.enroll_discount || 0) };
  }
  return data;
}
