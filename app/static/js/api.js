// 서버 API 호출

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

async function request(method, path, data, { rawBody, contentType } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (rawBody !== undefined) {
    opts.body = rawBody;
    opts.headers['Content-Type'] = contentType;
  } else if (data !== undefined) {
    opts.body = JSON.stringify(data);
    opts.headers['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(path, opts);
  } catch (e) {
    throw new Error('서버에 연결할 수 없습니다. 학원 PC에서 프로그램이 켜져 있는지 확인해 주세요.');
  }
  const isJson = (res.headers.get('Content-Type') || '').includes('application/json');
  const body = isJson ? await res.json() : await res.blob();
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    onUnauthorized();
    throw new Error(body.error || '로그인이 필요합니다.');
  }
  if (!res.ok) throw new Error((isJson && body.error) || `요청 실패 (${res.status})`);
  return body;
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, d = {}) => request('POST', p, d),
  put: (p, d) => request('PUT', p, d),
  del: (p) => request('DELETE', p),
  /** 이미지 Blob 업로드 → '/uploads/...' 경로 */
  async upload(kind, blob) {
    const r = await request('POST', `/api/uploads?kind=${encodeURIComponent(kind)}`, undefined,
      { rawBody: blob, contentType: blob.type || 'image/jpeg' });
    return r.url;
  },
};

// 자주 쓰는 데이터 캐시 (반 목록, 설정)
let classesCache = null;
let settingsCache = null;

export async function getClasses(force = false) {
  if (!classesCache || force) classesCache = await api.get('/api/classes');
  return classesCache;
}
export async function getClass(id) {
  const list = await getClasses();
  return list.find((c) => c.id === id);
}
export function invalidateClasses() { classesCache = null; }

export async function getSettings(force = false) {
  if (!settingsCache || force) settingsCache = await api.get('/api/settings');
  return settingsCache;
}
export function invalidateSettings() { settingsCache = null; }
