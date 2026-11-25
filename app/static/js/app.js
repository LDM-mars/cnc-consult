// 시작점: 무대 준비, 화면 주소 등록, 라우터 시작
import { setUnauthorizedHandler } from './api.js';
import { addRoute, adminReturnPath, go, render, startRouter } from './router.js';
import { markLoggedOut, requireLogin } from './session.js';
import { initStage } from './stage.js';
import { initDropdowns } from './lib/dropdown.js';

initStage();
initDropdowns(document.getElementById('stage'));

// 로그인이 필요한 화면은 먼저 로그인 창을 거친다
const guarded = (loader) => async () => { await requireLogin(); return loader(); };

addRoute('/', () => import('./pages/main.js'), { inner: false, admin: false });
addRoute('/toc', guarded(() => import('./pages/toc.js')), { inner: false, parent: '/' });
addRoute('/class/:cls', guarded(() => import('./pages/class-menu.js')), { parent: '/toc' });
addRoute('/class/:cls/intro', guarded(() => import('./pages/class-intro.js')), { parent: (p) => `/class/${p.cls}` });
addRoute('/class/:cls/new', guarded(() => import('./pages/consult-new.js')), { parent: (p) => `/class/${p.cls}/intro` });
addRoute('/class/:cls/students', guarded(() => import('./pages/students.js')), { parent: (p) => `/class/${p.cls}` });
addRoute('/student/:id', guarded(() => import('./pages/student.js')), { parent: '/toc' });
addRoute('/student/:id/report', guarded(() => import('./pages/report.js')), { parent: (p) => `/student/${p.id}` });
addRoute('/admin', guarded(() => import('./pages/admin.js')), { parent: () => adminReturnPath(), admin: false });
addRoute('/admin/:tab', guarded(() => import('./pages/admin.js')), { parent: () => adminReturnPath(), admin: false });

setUnauthorizedHandler(() => {
  // 다른 기기에서 비밀번호를 바꾸는 등으로 로그인이 풀렸을 때
  markLoggedOut();
  render();
});

startRouter();

// 개발 확인용: 콘솔에서 이동
window.cncGo = go;
