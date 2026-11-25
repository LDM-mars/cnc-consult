// 화면 설정: 디자인 이미지 파일 이름과 클릭 영역 좌표.
// 좌표는 모두 1920×1080 디자인 기준 [x, y, 너비, 높이] 입니다.
// 이미지를 같은 이름의 새 파일로 바꾸면 디자인이 바뀌고, 버튼 위치가 달라지면 여기 좌표만 고치면 됩니다.

export const DESIGN = '/design/';

export const IMAGES = {
  main: '1.main.png',          // 시작 화면
  tocBg: '2.목차베경.png',      // 목차 배경
  inner: '3.배경.png',          // 안쪽 화면 공통 배경 (반별 상담, 상담카드, 학생 화면, 관리 메뉴 등)
};

// 목차의 반 버튼. layer = 버튼 이미지(화면 전체 크기 투명 PNG), label = 배경에 그려진 반 이름 글자 영역
export const TOC_BUTTONS = [
  { cls: 'elem',  layer: '2-1버튼.png', label: [222, 950, 260, 60] },
  { cls: 'mid',   layer: '2-2버튼.png', label: [626, 817, 260, 58] },
  { cls: 'high1', layer: '2-3버튼.png', label: [1013, 680, 315, 58] },
  { cls: 'high2', layer: '2-4버튼.png', label: [1409, 542, 324, 58] },
];

// 반별 상담 화면의 버튼
export const CLASS_MENU_BUTTONS = [
  { key: 'newcomer', layer: '3-1버튼.png', hit: 'bbox' },  // 신입생
  { key: 'current',  layer: '3-2버튼.png', hit: 'bbox' },  // 재학생
];

// 디자인 장식을 버튼으로 사용
export const HOTSPOTS = {
  back:  [0, 58, 214, 84],        // 왼쪽 위 ✕ 별 + 회색 줄 → 뒤로
  admin: [1612, 942, 250, 100],   // 오른쪽 아래 ✦✦✦ → 관리 메뉴
};

// 안쪽 화면에서 내용을 넣는 영역 (3.배경의 빈 공간)
export const CONTENT_RECT = [215, 158, 1675, 790];
// 아래쪽 왼쪽 빈 곳 (디자인의 아래 선 왼쪽) — 이전/다음 같은 주요 버튼 자리
export const FOOT_RECT = [215, 952, 470, 100];
// 화면 제목 위치 (로고 오른쪽 빈 곳)
export const TITLE_RECT = [1250, 76, 640, 64];

// 알파 판정 기준 (0~255). 그림자처럼 반투명한 부분은 클릭되지 않게 한다.
export const ALPHA_THRESHOLD = 100;
