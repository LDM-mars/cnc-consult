// 신입생 상담카드: ① 학생 정보 ② 입시 정보(중등·고등) ③ 상담 결과·수강료 ④ 동의·서명
import { api, getClass, getSettings, invalidateClasses } from '../api.js';
import { signaturePad } from '../lib/signature.js';
import {
  addDays, bindChips, chipValue, chips, confirmDialog, DEFAULT_GRADE, formValues, GRADES, html, on, raw,
  setHTML, today, toast, won,
} from '../ui.js';

const DAYS = ['월', '화', '수', '목', '금', '토', '일'];
const TARGETS = ['예중', '예고', '미대 수시', '미대 정시', '미정'];
const MOCK_SUBJECTS = ['국어', '수학', '영어', '탐구'];
const RESULTS = ['상담만', '체험 예약', '등록'];

const draftKey = (cls) => `cnc-draft-${cls}`;
function loadDraft(cls) { try { return JSON.parse(localStorage.getItem(draftKey(cls)) || 'null'); } catch (e) { return null; } }
function saveDraft(cls, data) { try { localStorage.setItem(draftKey(cls), JSON.stringify(data)); } catch (e) { /* 무시 */ } }
function clearDraft(cls) { try { localStorage.removeItem(draftKey(cls)); } catch (e) { /* 무시 */ } }

function field(label, input, { req = false, span = '', hint = '' } = {}) {
  return html`<label class="field ${span}"><span>${label}${req ? raw('<b class="req">*</b>') : ''}</span>${input}${hint ? html`<em class="hint">${hint}</em>` : ''}</label>`;
}

function blankState(cls) {
  let counselor = '';
  try { counselor = localStorage.getItem('cnc-counselor') || ''; } catch (e) { /* 무시 */ }
  return {
    step: 0,
    info: { name: '', school: '', grade: DEFAULT_GRADE[cls.id] || '', phone: '', guardian_name: '', guardian_phone: '', art_history: '', source: '', days: [], times: '' },
    exam: { target_level: '', schools: [{ school: '', dept: '' }, { school: '', dept: '' }, { school: '', dept: '' }], subjects: [], naesin: '', mock: {} },
    result: {
      memo: '', counselor, consulted_at: today(), courses: [], manual_fee: null, material: null, discount: null,
      result: '상담만', trial_date: '', enroll_course: '', start_date: today(), billing_day: 1,
      next_contact_date: '', next_contact_note: '', consent: false,
    },
  };
}

export default async function (ctx) {
  const [cls, settings] = await Promise.all([getClass(ctx.params.cls), getSettings()]);
  if (!cls) { ctx.go('/toc', { replace: true }); return; }
  ctx.setTitle(`${cls.name} · 신입생 상담`);

  const steps = [{ key: 'info', label: '학생 정보' }];
  if (cls.show_exam) steps.push({ key: 'exam', label: '입시 정보' });
  steps.push({ key: 'result', label: '상담 결과' });
  steps.push({ key: 'sign', label: '동의 · 서명' });

  const courses = (cls.courses || []).filter((c) => c.active);
  let state = blankState(cls);
  let sig = null;
  let sigBlob = null; // 단계를 오갈 때 서명 유지
  let saved = false;

  const draft = loadDraft(cls.id);
  if (draft && draft.info && (draft.info.name || draft.info.guardian_phone)) {
    const ok = await confirmDialog(`작성 중이던 상담카드가 있습니다.\n(${draft.info.name || '이름 없음'}) 이어서 쓸까요?`, { okLabel: '이어서 쓰기' });
    if (!ctx.isCurrent()) return;
    if (ok) state = { ...blankState(cls), ...draft, step: Math.min(draft.step || 0, steps.length - 1) };
    else clearDraft(cls.id);
  }

  setHTML(ctx.page, html`
    <div class="wizard">
      <div class="steps">${steps.map((s, i) => html`${i ? raw('<span class="step-line"></span>') : ''}<button class="step" data-step="${i}"><span class="no">${i + 1}</span>${s.label}</button>`)}
        <span class="spacer"></span><span class="muted small draft-note"></span></div>
      <div class="wizard-body"></div>
    </div>`);
  // 이전/다음 버튼은 디자인 아래쪽 왼쪽 빈 곳에
  setHTML(ctx.foot, html`
    <button class="btn" data-act="prev">← 이전</button>
    <button class="btn primary big" data-act="next">다음 →</button>`);
  const body = ctx.page.querySelector('.wizard-body');
  bindChips(body);

  // ---------- 단계별 화면 ----------
  function renderInfo() {
    const s = state.info;
    return html`
      <div class="grid3">
        ${field('학생 이름', html`<input type="text" name="name" value="${s.name}" placeholder="홍길동">`, { req: true })}
        ${field('학교', html`<input type="text" name="school" value="${s.school}" placeholder="○○중학교">`)}
        ${field('학년', html`<select name="grade">${GRADES.map((g) => html`<option ${g === s.grade ? raw('selected') : ''}>${g}</option>`)}</select>`)}
        ${field('학생 연락처', html`<input type="tel" name="phone" value="${s.phone}" placeholder="010-0000-0000">`)}
        ${field('보호자 이름', html`<input type="text" name="guardian_name" value="${s.guardian_name}" placeholder="어머니 / 아버지 성함">`)}
        ${field('보호자 연락처', html`<input type="tel" name="guardian_phone" value="${s.guardian_phone}" placeholder="010-0000-0000">`)}
        ${field('미술 경험', html`<input type="text" name="art_history" value="${s.art_history}" placeholder="다닌 학원, 기간, 해 본 재료나 종목 등">`, { span: 'span2' })}
        ${field('가능한 시간', html`<input type="text" name="times" value="${s.times}" placeholder="예: 평일 5시 이후">`)}
        <div class="field span3"><span>알게 된 경로</span>${chips('source', settings.sources || [], s.source)}</div>
        <div class="field span3"><span>가능한 요일</span>${chips('days', DAYS, s.days, { multi: true })}</div>
      </div>`;
  }

  function renderExam() {
    const s = state.exam;
    const targets = cls.id === 'mid' ? ['예고', '미대 수시', '미대 정시', '미정'] : TARGETS.filter((t) => !t.startsWith('예'));
    return html`
      <div class="grid2">
        <div class="field span2"><span>목표</span>${chips('target_level', targets, s.target_level)}</div>
        <div class="field span2"><span>지망 학교 · 학과</span>
          <div class="col">${s.schools.map((sc, i) => html`
            <div class="school-row"><span class="no">${i + 1}지망</span>
              <input type="text" name="school_${i}" value="${sc.school}" placeholder="학교">
              <input type="text" name="dept_${i}" value="${sc.dept}" placeholder="학과 / 전공"></div>`)}
          </div>
        </div>
        <div class="field span2"><span>실기 종목</span>${chips('subjects', settings.exam_subjects || [], s.subjects, { multi: true })}</div>
        ${field('내신 평균 등급', html`<input type="text" name="naesin" value="${s.naesin}" placeholder="예: 2.5">`)}
        <div class="field"><span>모의고사 등급</span>
          <div class="grid4">${MOCK_SUBJECTS.map((m) => html`<input type="text" name="mock_${m}" value="${(s.mock || {})[m] || ''}" placeholder="${m}">`)}</div>
        </div>
      </div>`;
  }

  function feeTotal() {
    const r = state.result;
    const fromCourses = courses.filter((c) => r.courses.includes(c.id)).reduce((sum, c) => sum + Number(c.monthly_fee || 0), 0);
    const base = courses.length ? fromCourses : Number(r.manual_fee || 0);
    return Math.max(0, base + Number(r.material || 0) - Number(r.discount || 0));
  }

  function renderResult() {
    const r = state.result;
    return html`
      <div class="grid2">
        <div class="col">
          ${field('상담 내용', html`<textarea name="memo" rows="6" placeholder="학생 성향, 학부모 요청 사항, 안내한 내용 등">${r.memo}</textarea>`)}
          <div class="grid2">
            ${field('상담한 선생님', html`<input type="text" name="counselor" value="${r.counselor}" placeholder="이름">`)}
            ${field('상담일', html`<input type="date" name="consulted_at" value="${r.consulted_at}">`)}
          </div>
          <div class="field"><span>다시 연락할 날</span>
            <div class="row">
              <input type="date" name="next_contact_date" value="${r.next_contact_date}" style="width:300px">
              <button type="button" class="btn sm ghost" data-quick="1">내일</button>
              <button type="button" class="btn sm ghost" data-quick="3">3일 뒤</button>
              <button type="button" class="btn sm ghost" data-quick="7">1주 뒤</button>
            </div>
            <input type="text" name="next_contact_note" value="${r.next_contact_note}" placeholder="연락할 내용 (예: 체험 후기 묻기)" class="mt-s">
          </div>
        </div>
        <div class="col">
          <div class="fee-box">
            <div class="section-title">수강료 안내</div>
            ${courses.length
              ? html`<div class="col" style="gap:10px">${courses.map((c) => html`
                  <label class="course-opt ${r.courses.includes(c.id) ? 'on' : ''}"><input type="checkbox" data-course="${c.id}" ${r.courses.includes(c.id) ? raw('checked') : ''}>
                  <span class="grow">${c.name}</span><b>${won(c.monthly_fee)}</b></label>`)}</div>`
              : html`<p class="muted small">관리 메뉴 → 반 관리에서 수강 옵션(예: 주3회 / 월 ○○원)을 추가하면 여기서 바로 계산됩니다.</p>
                     ${field('월 수강료 (직접 입력)', html`<input type="number" name="manual_fee" value="${r.manual_fee ?? ''}" min="0" step="10000" placeholder="0">`)}`}
            <div class="grid2">
              ${field('재료비', html`<input type="number" name="material" value="${r.material ?? ''}" min="0" step="1000" placeholder="0">`)}
              ${field('할인', html`<input type="number" name="discount" value="${r.discount ?? ''}" min="0" step="1000" placeholder="0">`)}
            </div>
            <div class="row between"><span class="muted">월 합계</span><span class="fee-total">${won(feeTotal())}</span></div>
          </div>
          <div class="field"><span>상담 결과</span>${raw(String(chips('result', RESULTS, r.result)).replace('class="chips"', 'class="chips" data-required'))}</div>
          <div class="result-extra"></div>
        </div>
      </div>`;
  }

  function renderSign() {
    const r = state.result, inf = state.info;
    const chosen = courses.filter((c) => r.courses.includes(c.id));
    return html`
      <div class="sign-step">
        <div class="card flat sign-summary">
          <div class="kv">
            <span class="k">학생</span><span><b>${inf.name}</b> ${[inf.school, inf.grade].filter(Boolean).join(' ')}</span>
            <span class="k">반</span><span>${cls.name}</span>
            <span class="k">보호자</span><span>${inf.guardian_name} ${inf.guardian_phone}</span>
            <span class="k">상담 결과</span><span>${r.result}${r.result === '체험 예약' && r.trial_date ? ` · ${r.trial_date.replace('T', ' ')}` : ''}</span>
            ${feeTotal() ? html`<span class="k">안내 수강료</span><span>${chosen.map((c) => c.name).join(', ')} 월 <b class="pink">${won(feeTotal())}</b></span>` : ''}
          </div>
        </div>
        <label class="check consent"><input type="checkbox" name="consent" ${r.consent ? raw('checked') : ''}>
          <span>상담과 수업 안내를 위해 위 개인정보(이름, 연락처, 학교 등)를 수집·이용하는 데 동의합니다.</span></label>
        <div class="field"><span>보호자 서명</span>
          <div class="sig-wrap"><canvas class="sig-pad big"></canvas>
            <button type="button" class="btn xs ghost sig-clear" data-act="sig-clear">지우기</button>
            <span class="sig-hint">여기에 손가락이나 마우스로 서명해 주세요</span></div>
        </div>
      </div>`;
  }

  function renderResultExtra() {
    const box = body.querySelector('.result-extra');
    if (!box) return;
    const r = state.result;
    if (r.result === '체험 예약') {
      setHTML(box, field('체험 수업 일시', html`<input type="datetime-local" name="trial_date" value="${r.trial_date}">`));
    } else if (r.result === '등록') {
      setHTML(box, html`<div class="grid3">
        ${courses.length ? field('수강 반', html`<select name="enroll_course"><option value="">선택</option>${courses.map((c) => html`<option value="${c.id}" ${String(c.id) === String(r.enroll_course) ? raw('selected') : ''}>${c.name}</option>`)}</select>`) : ''}
        ${field('시작일', html`<input type="date" name="start_date" value="${r.start_date}">`)}
        ${field('매달 결제일', html`<input type="number" name="billing_day" value="${r.billing_day}" min="1" max="28">`)}
      </div>`);
    } else {
      box.innerHTML = '';
    }
  }

  // ---------- 상태 읽기 / 단계 이동 ----------
  function collect() {
    const key = steps[state.step].key;
    const v = formValues(body);
    if (key === 'info') {
      Object.assign(state.info, {
        name: v.name, school: v.school, grade: v.grade, phone: v.phone, guardian_name: v.guardian_name,
        guardian_phone: v.guardian_phone, art_history: v.art_history, times: v.times,
        source: chipValue(body, 'source'), days: chipValue(body, 'days'),
      });
    } else if (key === 'exam') {
      Object.assign(state.exam, {
        target_level: chipValue(body, 'target_level'),
        schools: [0, 1, 2].map((i) => ({ school: v[`school_${i}`] || '', dept: v[`dept_${i}`] || '' })),
        subjects: chipValue(body, 'subjects'),
        naesin: v.naesin,
        mock: Object.fromEntries(MOCK_SUBJECTS.map((m) => [m, v[`mock_${m}`] || ''])),
      });
    } else if (key === 'result') {
      const r = state.result;
      Object.assign(r, {
        memo: v.memo, counselor: v.counselor, consulted_at: v.consulted_at || today(),
        material: v.material, discount: v.discount, manual_fee: 'manual_fee' in v ? v.manual_fee : r.manual_fee,
        result: chipValue(body, 'result') || '상담만',
        next_contact_date: v.next_contact_date, next_contact_note: v.next_contact_note,
      });
      if ('trial_date' in v) r.trial_date = v.trial_date;
      if ('enroll_course' in v) r.enroll_course = v.enroll_course;
      if ('start_date' in v) r.start_date = v.start_date;
      if ('billing_day' in v) r.billing_day = v.billing_day || 1;
      r.courses = Array.from(body.querySelectorAll('[data-course]')).filter((c) => c.checked).map((c) => Number(c.dataset.course));
    } else if (key === 'sign') {
      state.result.consent = !!v.consent;
    }
    saveDraft(cls.id, state);
  }

  async function renderStep() {
    const key = steps[state.step].key;
    if (sig && !sig.isEmpty()) sigBlob = await sig.toBlob();
    sig = null;
    setHTML(body, { info: renderInfo, exam: renderExam, result: renderResult, sign: renderSign }[key]());
    body.scrollTop = 0;
    ctx.page.querySelectorAll('.step').forEach((el, i) => {
      el.classList.toggle('on', i === state.step);
      el.classList.toggle('done', i < state.step);
    });
    ctx.foot.querySelector('[data-act=prev]').style.visibility = state.step === 0 ? 'hidden' : 'visible';
    const next = ctx.foot.querySelector('[data-act=next]');
    next.textContent = state.step === steps.length - 1 ? '저장하기' : '다음 →';
    if (key === 'result') renderResultExtra();
    if (key === 'sign') {
      const canvas = body.querySelector('.sig-pad');
      sig = signaturePad(canvas);
      if (sigBlob) {
        const img = new Image();
        img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0);
        img.src = URL.createObjectURL(sigBlob);
      }
      canvas.addEventListener('signed', () => { body.querySelector('.sig-hint').hidden = true; });
      if (sigBlob) body.querySelector('.sig-hint').hidden = true;
    } else if (key === 'info') {
      const nameInput = body.querySelector('[name=name]');
      if (!state.info.name && !('ontouchstart' in window)) setTimeout(() => nameInput.focus(), 50);
    }
  }

  function validate() {
    const key = steps[state.step].key;
    if (key === 'info' && !state.info.name) {
      toast('학생 이름을 입력해 주세요.', 'error');
      body.querySelector('[name=name]').focus();
      return false;
    }
    if (key === 'result' && state.result.result === '등록' && courses.length && !state.result.enroll_course) {
      toast('등록할 수강 반을 골라 주세요.', 'error');
      return false;
    }
    return true;
  }

  async function goStep(i) {
    collect();
    if (i > state.step && !validate()) return;
    state.step = Math.max(0, Math.min(steps.length - 1, i));
    await renderStep();
  }

  // ---------- 저장 ----------
  async function save(btn) {
    collect();
    // 이름은 첫 단계에서 확인
    if (!state.info.name) { state.step = 0; await renderStep(); validate(); return; }
    if (!validate()) return;
    if (!state.info.phone && !state.info.guardian_phone) {
      const ok = await confirmDialog('연락처가 비어 있습니다. 그래도 저장할까요?', { okLabel: '저장' });
      if (!ok) return;
    }
    if (!state.result.consent) {
      const ok = await confirmDialog('개인정보 수집·이용 동의에 체크하지 않았습니다. 그래도 저장할까요?', { okLabel: '저장' });
      if (!ok) return;
    }
    btn.disabled = true;
    try {
      const r = state.result, inf = state.info, ex = state.exam;
      let signature_path = null;
      if (sig && !sig.isEmpty()) signature_path = await api.upload('signatures', await sig.toBlob());
      else if (sigBlob) signature_path = await api.upload('signatures', sigBlob);

      const chosen = courses.filter((c) => r.courses.includes(c.id));
      const schools = ex.schools.filter((s) => s.school || s.dept);
      const scores = [];
      if (cls.show_exam && ex.naesin) scores.push({ kind: '내신', values: { '평균 등급': ex.naesin } });
      const mock = Object.fromEntries(Object.entries(ex.mock || {}).filter(([, v]) => v));
      if (cls.show_exam && Object.keys(mock).length) scores.push({ kind: '모의고사', values: mock });

      const payload = {
        student: {
          name: inf.name, class_id: cls.id, school: inf.school, grade: inf.grade, phone: inf.phone,
          guardian_name: inf.guardian_name, guardian_phone: inf.guardian_phone, source: inf.source,
          art_history: inf.art_history, available: { days: inf.days, times: inf.times },
          ...(cls.show_exam ? { target_level: ex.target_level, target_schools: schools, exam_subjects: ex.subjects } : {}),
        },
        consultation: {
          consulted_at: r.consulted_at, counselor: r.counselor, summary: r.memo, result: r.result,
          trial_date: r.result === '체험 예약' ? (r.trial_date || null) : null,
          next_contact_date: r.next_contact_date || null, next_contact_note: r.next_contact_note,
          signature_path,
          answers: {
            fee: {
              courses: chosen.map((c) => ({ id: c.id, name: c.name, fee: c.monthly_fee })),
              manual_fee: courses.length ? null : r.manual_fee, material: r.material, discount: r.discount, total: feeTotal(),
            },
            consent: r.consent,
          },
        },
        enroll: r.result === '등록' && r.enroll_course
          ? { course_id: Number(r.enroll_course), start_date: r.start_date, billing_day: Number(r.billing_day || 1), discount: Number(r.discount || 0) }
          : null,
        scores,
      };
      const res = await api.post('/api/consultations/new-student', payload);
      try { localStorage.setItem('cnc-counselor', r.counselor || ''); } catch (e) { /* 무시 */ }
      clearDraft(cls.id);
      invalidateClasses();
      saved = true;
      showDone(res.student_id);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      btn.disabled = false;
    }
  }

  function showDone(studentId) {
    const r = state.result;
    ctx.foot.innerHTML = '';
    setHTML(ctx.page, html`
      <div class="done-box">
        <div class="big-star">✦</div>
        <h2><span class="pink">${state.info.name}</span> 학생 상담을 저장했습니다</h2>
        <p class="muted">${cls.name} · 결과: ${r.result}${r.result === '체험 예약' && r.trial_date ? ` (${r.trial_date.replace('T', ' ')})` : ''}${r.next_contact_date ? ` · 다시 연락: ${r.next_contact_date}` : ''}</p>
        <div class="row">
          <button class="btn primary big" data-done="student">학생 화면 보기</button>
          <button class="btn big" data-done="again">새 상담카드</button>
          <button class="btn ghost big" data-done="toc">목차로</button>
        </div>
      </div>`);
    on(ctx.page, 'click', '[data-done]', (e, el) => {
      const a = el.dataset.done;
      if (a === 'student') ctx.go(`/student/${studentId}?from=${encodeURIComponent(`/class/${cls.id}/students`)}`);
      else if (a === 'again') ctx.go(`/class/${cls.id}/new?t=${Date.now()}`);
      else ctx.go('/toc');
    });
  }

  // ---------- 이벤트 ----------
  const offs = [];
  offs.push(on(ctx.foot, 'click', '[data-act=next]', async (e, el) => {
    if (state.step === steps.length - 1) await save(el);
    else await goStep(state.step + 1);
  }));
  offs.push(on(ctx.foot, 'click', '[data-act=prev]', () => goStep(state.step - 1)));
  offs.push(on(ctx.page, 'click', '.step', (e, el) => goStep(Number(el.dataset.step))));
  offs.push(on(body, 'click', '[data-quick]', (e, el) => {
    body.querySelector('[name=next_contact_date]').value = addDays(today(), Number(el.dataset.quick));
  }));
  offs.push(on(body, 'click', '[data-act=sig-clear]', () => {
    if (sig) sig.clear();
    sigBlob = null;
    body.querySelector('.sig-hint').hidden = false;
  }));
  // 결과 / 수강료가 바뀌면 다시 계산
  body.addEventListener('change', (e) => {
    if (steps[state.step].key !== 'result') return;
    if (e.target.closest('[data-chips=result]')) { collect(); renderResultExtra(); return; }
    if (e.target.matches('[data-course]')) e.target.closest('.course-opt').classList.toggle('on', e.target.checked);
    if (e.target.matches('[data-course], [name=material], [name=discount], [name=manual_fee]')) {
      collect();
      body.querySelector('.fee-total').textContent = won(feeTotal());
    }
  });
  body.addEventListener('input', (e) => {
    if (e.target.matches('[name=material], [name=discount], [name=manual_fee]')) {
      collect();
      body.querySelector('.fee-total').textContent = won(feeTotal());
    }
  });
  // 입력할 때마다 임시 저장
  let draftTimer = null;
  body.addEventListener('input', () => {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      if (saved) return;
      collect();
      ctx.page.querySelector('.draft-note').textContent = '임시 저장됨';
    }, 800);
  });

  await renderStep();

  return () => {
    clearTimeout(draftTimer);
    offs.forEach((f) => f());
    if (!saved && body.isConnected) { try { collect(); } catch (e) { /* 무시 */ } }
  };
}

