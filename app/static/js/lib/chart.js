// 점수 추이 선 그래프 (SVG). series: [{ name, color, points: [{ x: 'YYYY-MM-DD', y: 0~10 }] }]
import { esc } from '../ui.js';

export const PALETTE = ['#FF2887', '#2F80ED', '#F2994A', '#27AE60', '#9B51E0', '#EB5757', '#00A3A3', '#8D6E63'];

export function lineChart(series, { width = 1000, height = 320, yMax = 10, pad = [50, 24, 44, 50] } = {}) {
  const [pl, pt, pb, pr] = [pad[0], pad[1], pad[2], pad[3]];
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  if (xs.length === 0) return '';
  const iw = width - pl - pr, ih = height - pt - pb;
  const xPos = (x) => pl + (xs.length === 1 ? iw / 2 : (xs.indexOf(x) / (xs.length - 1)) * iw);
  const yPos = (y) => pt + ih - (y / yMax) * ih;
  let out = `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="chart" role="img">`;
  for (let v = 0; v <= yMax; v += yMax / 5) {
    out += `<line x1="${pl}" x2="${width - pr}" y1="${yPos(v)}" y2="${yPos(v)}" stroke="#EEEAD0" stroke-width="2"/>`;
    out += `<text x="${pl - 12}" y="${yPos(v) + 7}" font-size="20" fill="#8C8B80" text-anchor="end">${v}</text>`;
  }
  const step = Math.max(1, Math.ceil(xs.length / 8));
  xs.forEach((x, i) => {
    if (i % step === 0 || i === xs.length - 1) {
      out += `<text x="${xPos(x)}" y="${height - 12}" font-size="19" fill="#8C8B80" text-anchor="middle">${esc(x.slice(5).replace('-', '.'))}</text>`;
    }
  });
  series.forEach((s) => {
    const pts = s.points.slice().sort((a, b) => (a.x < b.x ? -1 : 1));
    if (pts.length > 1) {
      out += `<polyline fill="none" stroke="${s.color}" stroke-width="${s.bold ? 6 : 3.5}" stroke-linejoin="round" stroke-linecap="round" opacity="${s.bold ? 1 : 0.75}" points="${pts.map((p) => `${xPos(p.x)},${yPos(p.y)}`).join(' ')}"/>`;
    }
    pts.forEach((p) => {
      out += `<circle cx="${xPos(p.x)}" cy="${yPos(p.y)}" r="${s.bold ? 8 : 5}" fill="#fff" stroke="${s.color}" stroke-width="${s.bold ? 4 : 3}"><title>${esc(s.name)} ${esc(p.x)}: ${p.y}</title></circle>`;
    });
  });
  return out + '</svg>';
}

/** 작품 목록 → 평균 + 평가 항목별 시리즈 */
export function artworkSeries(artworks, items) {
  const avgPoints = artworks
    .map((a) => ({ x: a.made_on, y: averageScore(a.scores, items) }))
    .filter((p) => p.y != null);
  const series = [{ name: '평균', color: PALETTE[0], bold: true, points: avgPoints }];
  items.forEach((k, i) => {
    const pts = artworks
      .filter((a) => a.scores && a.scores[k] != null && a.scores[k] !== '')
      .map((a) => ({ x: a.made_on, y: Number(a.scores[k]) }));
    if (pts.length) series.push({ name: k, color: PALETTE[(i + 1) % PALETTE.length], points: pts });
  });
  return series;
}

export function averageScore(scores, items) {
  if (!scores) return null;
  const nums = Object.entries(scores)
    .filter(([k, v]) => (!items || items.includes(k)) && v != null && v !== '')
    .map(([, v]) => Number(v))
    .filter((v) => !Number.isNaN(v));
  return nums.length ? Math.round((nums.reduce((s, v) => s + v, 0) / nums.length) * 10) / 10 : null;
}
