// 1. 시작 화면 (1.main.png) — 아무 데나 누르면 목차로
import * as stage from '../stage.js';
import { IMAGES } from '../screens.js';

export default async function (ctx) {
  await stage.setBackground(IMAGES.main);
  const hint = document.createElement('div');
  hint.className = 'start-hint';
  hint.textContent = '화면을 눌러 시작하세요';
  stage.addOverlay(hint);
  stage.setAnywhere(() => ctx.go('/toc'));
}
