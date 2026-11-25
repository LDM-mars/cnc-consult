"""SQLite 스키마, 초기값, 공통 헬퍼."""
import json
import os
import sqlite3
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DESIGN_DIR = BASE_DIR / "design"
STATIC_DIR = Path(__file__).resolve().parent / "static"

DATA_DIR = Path(os.environ.get("CNC_DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "app.db"
UPLOAD_DIR = DATA_DIR / "uploads"
UPLOAD_KINDS = ("artworks", "signatures", "reports", "class-intro", "backgrounds")


def configure(data_dir):
    """데이터 폴더 위치를 바꾼다 (테스트용)."""
    global DATA_DIR, DB_PATH, UPLOAD_DIR
    DATA_DIR = Path(data_dir)
    DB_PATH = DATA_DIR / "app.db"
    UPLOAD_DIR = DATA_DIR / "uploads"


def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def today():
    return datetime.now().strftime("%Y-%m-%d")


SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen TEXT
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0,
  intro TEXT DEFAULT '',
  curriculum TEXT DEFAULT '',
  schedule_text TEXT DEFAULT '',
  show_exam INTEGER DEFAULT 0,
  intro_images_json TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  name TEXT NOT NULL,
  monthly_fee INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id TEXT REFERENCES classes(id),
  name TEXT NOT NULL,
  school TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  guardian_name TEXT DEFAULT '',
  guardian_phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT '상담중',
  source TEXT DEFAULT '',
  art_history TEXT DEFAULT '',
  available_json TEXT,
  target_level TEXT DEFAULT '',
  target_schools_json TEXT,
  exam_subjects_json TEXT,
  memo TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id TEXT,
  kind TEXT NOT NULL,
  consulted_at TEXT NOT NULL,
  counselor TEXT DEFAULT '',
  answers_json TEXT,
  summary TEXT DEFAULT '',
  result TEXT DEFAULT '',
  trial_date TEXT,
  next_contact_date TEXT,
  next_contact_note TEXT DEFAULT '',
  contact_done INTEGER NOT NULL DEFAULT 0,
  signature_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS artworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL,
  thumb_path TEXT,
  title TEXT DEFAULT '',
  subject TEXT DEFAULT '',
  made_on TEXT NOT NULL,
  comment TEXT DEFAULT '',
  scores_json TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS score_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  taken_on TEXT NOT NULL,
  values_json TEXT,
  memo TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  period_from TEXT,
  period_to TEXT,
  comment TEXT DEFAULT '',
  artwork_ids_json TEXT,
  image_path TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  billing_day INTEGER DEFAULT 1,
  discount INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  enrollment_id INTEGER REFERENCES enrollments(id) ON DELETE SET NULL,
  month TEXT NOT NULL,
  due_date TEXT,
  items_json TEXT,
  amount INTEGER NOT NULL DEFAULT 0,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  paid_on TEXT,
  method TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id, status);
CREATE INDEX IF NOT EXISTS idx_consult_student ON consultations(student_id, consulted_at);
CREATE INDEX IF NOT EXISTS idx_consult_contact ON consultations(contact_done, next_contact_date);
CREATE INDEX IF NOT EXISTS idx_artworks_student ON artworks(student_id, made_on);
CREATE INDEX IF NOT EXISTS idx_invoices_month ON invoices(month);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON invoices(student_id);
"""

# 디자인(2.목차)에 있는 4개 반. 소개 문구는 예시이며 관리 메뉴 > 반 관리에서 바꾼다.
DEFAULT_CLASSES = [
    {
        "id": "elem", "name": "초등 창의력반", "sort": 1, "show_exam": 0,
        "intro": "자유로운 표현과 다양한 재료 경험으로 창의력과 관찰력을 키웁니다.",
        "curriculum": "관찰 드로잉 · 기초 소묘\n수채화 · 아크릴 등 다양한 재료 체험\n주제 발상과 상상화\n입체 · 공예 만들기",
    },
    {
        "id": "mid", "name": "중등 차별화반", "sort": 2, "show_exam": 1,
        "intro": "탄탄한 기초 실력과 자기만의 표현력을 함께 기르는 중등 과정입니다.",
        "curriculum": "소묘 · 정밀묘사 기초\n색채 이론과 수채화\n발상과 표현 훈련\n예고 입시 대비 실기 (희망자)",
    },
    {
        "id": "high1", "name": "고등1 입시준비반", "sort": 3, "show_exam": 1,
        "intro": "미대 입시의 기본기를 다지고, 목표 대학에 맞는 실기 종목을 준비합니다.",
        "curriculum": "기초디자인 · 사고의 전환 기초\n소묘 · 정물수채화 기본기\n실기 종목 탐색과 진로 상담\n월별 실기 평가와 피드백",
    },
    {
        "id": "high2", "name": "고등2 입시심화반", "sort": 4, "show_exam": 1,
        "intro": "목표 대학 맞춤 실기 완성과 실전 대비에 집중하는 심화 과정입니다.",
        "curriculum": "대학별 출제 경향 분석\n실전 시간 내 완성 훈련\n정기 모의 실기 평가\n수시 · 정시 지원 전략 상담",
    },
]

DEFAULT_SETTINGS = {
    "academy_name": "Creative & Communication",
    "exam_subjects": ["기초디자인", "사고의 전환", "발상과 표현", "소묘", "정물수채화", "인물수채화", "조소", "만화·애니"],
    "eval_items": ["구도", "형태", "명암", "색채", "발상", "완성도"],
    "sources": ["지인 소개", "블로그·인스타", "네이버 검색", "전단지·현수막", "지나가다", "기타"],
    "report_background": "/design/3.배경.png",
}

# 테이블별로 API에서 쓰기 허용하는 컬럼. *_json 컬럼은 API에서 접미사 없이 주고받는다.
TABLE_COLS = {
    "classes": ["name", "sort", "intro", "curriculum", "schedule_text", "show_exam", "intro_images_json"],
    "courses": ["class_id", "name", "monthly_fee", "active", "sort"],
    "students": ["class_id", "name", "school", "grade", "phone", "guardian_name", "guardian_phone", "status",
                 "source", "art_history", "available_json", "target_level", "target_schools_json",
                 "exam_subjects_json", "memo"],
    "consultations": ["student_id", "class_id", "kind", "consulted_at", "counselor", "answers_json", "summary",
                      "result", "trial_date", "next_contact_date", "next_contact_note", "contact_done",
                      "signature_path"],
    "artworks": ["student_id", "image_path", "thumb_path", "title", "subject", "made_on", "comment", "scores_json"],
    "score_records": ["student_id", "kind", "taken_on", "values_json", "memo"],
    "reports": ["student_id", "period_from", "period_to", "comment", "artwork_ids_json", "image_path"],
    "enrollments": ["student_id", "course_id", "start_date", "end_date", "billing_day", "discount"],
    "invoices": ["student_id", "enrollment_id", "month", "due_date", "items_json", "amount", "paid_amount",
                 "paid_on", "method", "memo"],
    "schedules": ["title", "date", "memo", "student_id"],
}
HAS_CREATED = {"students", "consultations", "artworks", "score_records", "reports", "enrollments", "invoices",
               "schedules"}
HAS_UPDATED = {"students"}


def connect():
    conn = sqlite3.connect(str(DB_PATH), timeout=15)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for kind in UPLOAD_KINDS:
        (UPLOAD_DIR / kind).mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM classes").fetchone()[0] == 0:
            for c in DEFAULT_CLASSES:
                conn.execute(
                    "INSERT INTO classes (id, name, sort, intro, curriculum, show_exam) VALUES (?,?,?,?,?,?)",
                    (c["id"], c["name"], c["sort"], c["intro"], c["curriculum"], c["show_exam"]),
                )
        for key, value in DEFAULT_SETTINGS.items():
            conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
                         (key, json.dumps(value, ensure_ascii=False)))
        conn.commit()
    finally:
        conn.close()


# ---------- 변환 헬퍼 ----------

def to_api(row):
    """DB 행 → API dict. *_json 컬럼은 파싱해서 접미사 없는 키로."""
    if row is None:
        return None
    d = dict(row)
    for k in list(d.keys()):
        if k.endswith("_json"):
            v = d.pop(k)
            try:
                d[k[:-5]] = json.loads(v) if v else None
            except ValueError:
                d[k[:-5]] = None
    return d


def rows_to_api(rows):
    return [to_api(r) for r in rows]


def from_api(table, data):
    out = {}
    for col in TABLE_COLS[table]:
        if col.endswith("_json"):
            key = col[:-5]
            if key in data:
                out[col] = None if data[key] is None else json.dumps(data[key], ensure_ascii=False)
        elif col in data:
            v = data[col]
            if isinstance(v, bool):
                v = int(v)
            out[col] = v
    return out


def insert(conn, table, data):
    cols = from_api(table, data)
    if table in HAS_CREATED:
        cols["created_at"] = now()
    if table in HAS_UPDATED:
        cols["updated_at"] = now()
    keys = list(cols.keys())
    sql = f"INSERT INTO {table} ({', '.join(keys)}) VALUES ({', '.join('?' for _ in keys)})"
    cur = conn.execute(sql, [cols[k] for k in keys])
    return cur.lastrowid


def update(conn, table, row_id, data):
    cols = from_api(table, data)
    if table in HAS_UPDATED:
        cols["updated_at"] = now()
    if not cols:
        return 0
    sets = ", ".join(f"{k} = ?" for k in cols)
    cur = conn.execute(f"UPDATE {table} SET {sets} WHERE id = ?", [*cols.values(), row_id])
    return cur.rowcount


def get(conn, table, row_id):
    return to_api(conn.execute(f"SELECT * FROM {table} WHERE id = ?", (row_id,)).fetchone())


def get_setting(conn, key, default=None):
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row is None or row[0] is None:
        return default
    try:
        return json.loads(row[0])
    except ValueError:
        return row[0]


def set_setting(conn, key, value):
    conn.execute("INSERT INTO settings (key, value) VALUES (?, ?) "
                 "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                 (key, json.dumps(value, ensure_ascii=False)))
