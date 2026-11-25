// 로그인 상태와 로그인/처음 설정 창
import { api } from './api.js';
import { setBackground } from './stage.js';
import { html, openModal, toast } from './ui.js';

let status = null;
let pending = null;

export async function authStatus(force = false) {
  if (!status || force) status = await api.get('/api/auth/status');
  return status;
}

export function markLoggedOut() { if (status) status.logged_in = false; }

/** 로그인되어 있지 않으면 로그인 창을 띄우고, 로그인될 때까지 기다린다. */
export async function requireLogin() {
  const st = await authStatus();
  if (st.logged_in) return;
  if (pending) return pending;
  // 로그인 창 뒤에 디자인 화면이 보이도록
  const bg = document.getElementById('bg');
  if (!bg.getAttribute('src')) await setBackground('1.main.png');
  document.getElementById('screen').classList.remove('fading');
  pending = new Promise((resolve) => {
    const setup = st.setup_needed;
    openModal({
      title: setup ? '처음 사용 설정' : '로그인',
      dismissible: false,
      className: 'login-modal',
      body: html`
        <form class="login-form" autocomplete="off">
          ${setup
            ? html`<p class="muted">학원에서 함께 쓸 비밀번호를 정해 주세요. (4자 이상)<br>학원 Wi-Fi에 접속한 다른 사람이 상담 기록을 보지 못하게 막아 줍니다.</p>`
            : html`<p class="muted">학원 비밀번호를 입력해 주세요.</p>`}
          <label class="field"><span>비밀번호</span><input type="password" name="pw" inputmode="text" autocomplete="current-password"></label>
          ${setup ? html`<label class="field"><span>비밀번호 확인</span><input type="password" name="pw2"></label>` : ''}
          <p class="form-error" hidden></p>
          <button class="btn primary big" type="submit">${setup ? '시작하기' : '로그인'}</button>
        </form>`,
      onOpen(modal, ctrl) {
        const form = modal.querySelector('form');
        const err = modal.querySelector('.form-error');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const pw = form.pw.value;
          err.hidden = true;
          try {
            if (setup) {
              if (pw.length < 4) throw new Error('비밀번호는 4자 이상이어야 합니다.');
              if (pw !== form.pw2.value) throw new Error('비밀번호 확인이 맞지 않습니다.');
              await api.post('/api/auth/setup', { password: pw });
            } else {
              await api.post('/api/auth/login', { password: pw });
            }
            status = { logged_in: true, setup_needed: false };
            ctrl.close();
            toast(setup ? '비밀번호를 정했습니다.' : '로그인했습니다.');
            pending = null;
            resolve();
          } catch (ex) {
            err.textContent = ex.message;
            err.hidden = false;
            form.pw.select();
          }
        });
        setTimeout(() => form.pw.focus(), 50);
      },
    });
  });
  return pending;
}

export async function logout() {
  await api.post('/api/auth/logout');
  status = { logged_in: false, setup_needed: false };
}
