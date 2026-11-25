// 2. 목차 (2.목차베경.png + 2-1~2-4버튼.png) — 원형 그림이나 반 이름을 누르면 그 반으로
import * as stage from '../stage.js';
import { IMAGES, TOC_BUTTONS } from '../screens.js';

export default async function (ctx) {
  await stage.setBackground(IMAGES.tocBg);
  await stage.setLayers(TOC_BUTTONS.map((b) => ({
    file: b.layer,
    hit: 'alpha',
    rects: [b.label],
    onClick: () => ctx.go(`/class/${b.cls}`),
  })));
}
