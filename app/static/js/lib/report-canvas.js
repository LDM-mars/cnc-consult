// 학부모 리포트 그리기: 리포트 배경 이미지(기본 3.배경.png) 위에 1920×1080으로 그린다.
import { CONTENT_RECT } from '../screens.js';
import { loadImage } from '../stage.js';
import { averageScore, PALETTE } from './chart.js';

const FONT = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Nanum Gothic', sans-serif";
const PINK = '#FF2887', INK = '#333333', GRAY = '#8C8B80';
const font = (weight, size) => `${weight} ${size}px ${FONT}`;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 한글도 자연스럽게 줄바꿈 (공백 기준, 너무 긴 단어는 글자 단위) */
export function wrapText(ctx, text, maxWidth) {
  const out = [];
  for (const para of String(text || '').split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(test).width <= maxWidth) { line = test; continue; }
      if (line.trim()) out.push(line.trimEnd());
      line = word.trimStart();
      while (ctx.measureText(line).width > maxWidth) {
        let i = line.length;
        while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxWidth) i--;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
}

function drawImageContain(ctx, img, x, y, w, h) {
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k, dh = img.height * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function tileLayout(n, x, y, w, h, gap = 22) {
  if (n <= 0) return [];
  if (n === 1) return [[x, y, w, h]];
  if (n === 2) { const tw = (w - gap) / 2; return [[x, y, tw, h], [x + tw + gap, y, tw, h]]; }
  if (n === 3) {
    const lw = (w - gap) * 0.58, rw = w - gap - lw, rh = (h - gap) / 2;
    return [[x, y, lw, h], [x + lw + gap, y, rw, rh], [x + lw + gap, y + rh + gap, rw, rh]];
  }
  const tw = (w - gap) / 2, th = (h - gap) / 2;
  return [[x, y, tw, th], [x + tw + gap, y, tw, th], [x, y + th + gap, tw, th], [x + tw + gap, y + th + gap, tw, th]];
}

function drawChart(ctx, artworks, items, x, y, w, h) {
  const scored = artworks.filter((a) => averageScore(a.scores, items) != null).sort((a, b) => (a.made_on < b.made_on ? -1 : 1));
  if (scored.length === 0) return false;
  const series = [{ name: '평균', color: PALETTE[0], bold: true, pts: scored.map((a) => ({ x: a.made_on, y: averageScore(a.scores, items) })) }];
  items.slice(0, 6).forEach((k, i) => {
    const pts = scored.filter((a) => a.scores && a.scores[k] != null && a.scores[k] !== '').map((a) => ({ x: a.made_on, y: Number(a.scores[k]) }));
    if (pts.length) series.push({ name: k, color: PALETTE[(i + 1) % PALETTE.length], pts });
  });
  const xs = [...new Set(series.flatMap((s) => s.pts.map((p) => p.x)))].sort();
  const pl = 44, pr = 16, pt = 84, pb = 40;
  const iw = w - pl - pr, ih = h - pt - pb;
  const xPos = (v) => x + pl + (xs.length === 1 ? iw / 2 : (xs.indexOf(v) / (xs.length - 1)) * iw);
  const yPos = (v) => y + pt + ih - (v / 10) * ih;

  ctx.fillStyle = INK;
  ctx.font = font(800, 28);
  ctx.fillText('✦ 작품 점수 추이', x, y + 26);
  // 범례 (제목 아래 줄)
  ctx.font = font(600, 19);
  let lx = x;
  for (const s of series) {
    ctx.fillStyle = s.color;
    ctx.fillRect(lx, y + 54, 20, 5);
    lx += 28;
    ctx.fillStyle = GRAY;
    ctx.fillText(s.name, lx, y + 63);
    lx += ctx.measureText(s.name).width + 18;
  }
  ctx.strokeStyle = '#EEEAD0';
  ctx.lineWidth = 2;
  ctx.font = font(500, 18);
  ctx.textAlign = 'right';
  for (let v = 0; v <= 10; v += 2) {
    ctx.beginPath(); ctx.moveTo(x + pl, yPos(v)); ctx.lineTo(x + w - pr, yPos(v)); ctx.stroke();
    ctx.fillStyle = GRAY; ctx.fillText(String(v), x + pl - 10, yPos(v) + 6);
  }
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(xs.length / 6));
  xs.forEach((v, i) => { if (i % step === 0 || i === xs.length - 1) ctx.fillText(v.slice(5).replace('-', '.'), xPos(v), y + h - 8); });
  ctx.textAlign = 'left';
  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.bold ? 6 : 3;
    ctx.globalAlpha = s.bold ? 1 : 0.7;
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(xPos(p.x), yPos(p.y)) : ctx.moveTo(xPos(p.x), yPos(p.y))));
    ctx.stroke();
    for (const p of s.pts) {
      ctx.beginPath(); ctx.arc(xPos(p.x), yPos(p.y), s.bold ? 8 : 5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = s.bold ? 4 : 3; ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  return true;
}

/**
 * opts: { background, student, className, period: [from, to], artworks (선택한 순서), allArtworks (그래프용),
 *         items (평가 항목), comment, teacher, academy, includeChart, date }
 */
export async function drawReport(canvas, opts) {
  canvas.width = 1920;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFEE9';
  ctx.fillRect(0, 0, 1920, 1080);
  try {
    const bg = await loadImage(opts.background);
    ctx.drawImage(bg, 0, 0, 1920, 1080);
  } catch (e) { /* 배경이 없으면 크림색 */ }

  const [cx, cy, cw] = CONTENT_RECT;
  const left = cx, right = cx + cw - 10;

  // 제목
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = PINK;
  ctx.font = font(900, 62);
  const title = `${opts.student.name} 학생 학습 리포트`;
  ctx.fillText(title, left, cy + 62);
  const tw = ctx.measureText(title).width;
  ctx.fillStyle = GRAY;
  ctx.font = font(600, 30);
  const [from, to] = opts.period || [];
  const sub = [opts.className, from || to ? `${(from || '').replace(/-/g, '.')} ~ ${(to || '').replace(/-/g, '.')}` : ''].filter(Boolean).join('  ·  ');
  ctx.fillText(sub, left + tw + 30, cy + 60);

  const top = cy + 110, bottom = 935;
  const hasRight = opts.includeChart || opts.comment;
  const artW = hasRight ? 930 : right - left;

  // 작품
  const tiles = tileLayout(Math.min(opts.artworks.length, 4), left, top, artW, bottom - top);
  const imgs = await Promise.all(opts.artworks.slice(0, 4).map((a) => loadImage(a.image_path).catch(() => null)));
  tiles.forEach(([x, y, w, h], i) => {
    const a = opts.artworks[i];
    ctx.save();
    ctx.shadowColor = 'rgba(80, 70, 20, .18)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#fff';
    roundRect(ctx, x, y, w, h, 22); ctx.fill();
    ctx.restore();
    const capH = 46;
    if (imgs[i]) {
      ctx.save();
      roundRect(ctx, x + 12, y + 12, w - 24, h - 24 - capH, 14); ctx.clip();
      drawImageContain(ctx, imgs[i], x + 12, y + 12, w - 24, h - 24 - capH);
      ctx.restore();
    }
    ctx.fillStyle = INK;
    ctx.font = font(700, 22);
    const avg = averageScore(a.scores, opts.items);
    const cap = [a.made_on ? a.made_on.replace(/-/g, '.') : '', a.subject && a.subject !== '자유' ? a.subject : '', a.title || ''].filter(Boolean).join(' · ');
    ctx.fillText(cap, x + 18, y + h - 22, w - (avg != null ? 140 : 36));
    if (avg != null) {
      ctx.fillStyle = PINK;
      ctx.textAlign = 'right';
      ctx.fillText(`${avg}점`, x + w - 18, y + h - 22);
      ctx.textAlign = 'left';
    }
  });
  if (!tiles.length) {
    ctx.fillStyle = GRAY;
    ctx.font = font(600, 30);
    ctx.fillText('선택한 작품이 없습니다.', left + 20, top + 60);
  }

  // 오른쪽: 그래프 + 코멘트
  if (hasRight) {
    const rx = left + artW + 50, rw = right - rx;
    let ry = top;
    if (opts.includeChart) {
      const drawn = drawChart(ctx, opts.allArtworks || opts.artworks, opts.items || [], rx, ry, rw, 300);
      if (drawn) ry += 330;
    }
    if (opts.comment) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, .85)';
      roundRect(ctx, rx, ry, rw, bottom - ry, 22); ctx.fill();
      ctx.strokeStyle = '#E7E3C6'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
      ctx.fillStyle = PINK;
      ctx.font = font(800, 28);
      ctx.fillText('✦ 선생님 코멘트', rx + 28, ry + 50);
      ctx.fillStyle = INK;
      let size = 30;
      let wrapped;
      // 길면 글자 크기를 줄여서 상자에 맞춘다
      for (; size >= 20; size -= 2) {
        ctx.font = font(500, size);
        wrapped = wrapText(ctx, opts.comment, rw - 56);
        if (ry + 90 + wrapped.length * size * 1.55 <= bottom - 16) break;
      }
      const lh = size * 1.55;
      const maxLines = Math.floor((bottom - ry - 100) / lh);
      wrapped.slice(0, maxLines).forEach((l, i) => ctx.fillText(l, rx + 28, ry + 100 + i * lh));
    }
  }

  // 아래쪽 서명 (디자인의 아래 선 왼쪽 빈 곳, x 215~680)
  const maxW = 680 - left;
  ctx.font = font(800, 26);
  ctx.fillStyle = PINK;
  ctx.fillText(opts.academy || 'Creative & Communication', left, 990, maxW);
  ctx.font = font(600, 22);
  ctx.fillStyle = GRAY;
  ctx.fillText([opts.teacher ? `${opts.teacher} 선생님` : '', (opts.date || '').replace(/-/g, '.')].filter(Boolean).join(' · '), left, 1026, maxW);
  return canvas;
}
