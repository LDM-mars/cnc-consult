"""반, 수강 옵션, 학생, 상담, 작품, 성적, 리포트."""
from . import db
from .api_core import remove_upload
from .router import HTTPError, require, route

STUDENT_STATUSES = ("상담중", "체험", "등록", "보류", "미등록", "퇴원")
RESULT_TO_STATUS = {"상담만": "상담중", "체험 예약": "체험", "등록": "등록"}


def _class_exists(conn, class_id):
    return conn.execute("SELECT 1 FROM classes WHERE id = ?", (class_id,)).fetchone() is not None


def _student_or_404(conn, sid):
    s = db.get(conn, "students", sid)
    if not s:
        raise HTTPError(404, "학생을 찾을 수 없습니다.")
    return s


# ---------- 반 / 수강 옵션 ----------

@route("GET", "/api/classes")
def classes_list(req):
    classes = db.rows_to_api(req.conn.execute("SELECT * FROM classes ORDER BY sort, id").fetchall())
    courses = db.rows_to_api(req.conn.execute("SELECT * FROM courses ORDER BY sort, id").fetchall())
    counts = {r[0]: r[1] for r in req.conn.execute(
        "SELECT class_id, COUNT(*) FROM students WHERE status = '등록' GROUP BY class_id")}
    for c in classes:
        c["courses"] = [x for x in courses if x["class_id"] == c["id"]]
        c["enrolled_count"] = counts.get(c["id"], 0)
    return classes


@route("GET", "/api/classes/:cid")
def classes_get(req):
    for c in classes_list(req):
        if c["id"] == req.params["cid"]:
            return c
    raise HTTPError(404, "반을 찾을 수 없습니다.")


@route("PUT", "/api/classes/:cid")
def classes_put(req):
    cid = req.params["cid"]
    if not _class_exists(req.conn, cid):
        raise HTTPError(404, "반을 찾을 수 없습니다.")
    data = req.json()
    if "name" in data and not str(data["name"]).strip():
        raise HTTPError(400, "반 이름을 입력해 주세요.")
    old = db.to_api(req.conn.execute("SELECT * FROM classes WHERE id = ?", (cid,)).fetchone())
    cols = db.from_api("classes", data)
    if cols:
        sets = ", ".join(f"{k} = ?" for k in cols)
        req.conn.execute(f"UPDATE classes SET {sets} WHERE id = ?", [*cols.values(), cid])
    # 소개 사진 목록에서 빠진 파일은 지운다
    if "intro_images" in data:
        for url in (old.get("intro_images") or []):
            if url not in (data["intro_images"] or []):
                remove_upload(url)
    return classes_get(req)


@route("POST", "/api/courses")
def courses_create(req):
    data = req.json()
    require(data, "class_id", "name")
    if not _class_exists(req.conn, data["class_id"]):
        raise HTTPError(400, "반을 찾을 수 없습니다.")
    cid = db.insert(req.conn, "courses", data)
    return db.get(req.conn, "courses", cid)


@route("PUT", "/api/courses/:id")
def courses_update(req):
    cid = req.int_param("id")
    if not db.update(req.conn, "courses", cid, req.json()):
        raise HTTPError(404, "수강 옵션을 찾을 수 없습니다.")
    return db.get(req.conn, "courses", cid)


@route("DELETE", "/api/courses/:id")
def courses_delete(req):
    cid = req.int_param("id")
    used = req.conn.execute("SELECT 1 FROM enrollments WHERE course_id = ? LIMIT 1", (cid,)).fetchone()
    if used:
        # 수강 기록이 있으면 지우지 않고 숨긴다
        req.conn.execute("UPDATE courses SET active = 0 WHERE id = ?", (cid,))
        return {"ok": True, "deactivated": True}
    req.conn.execute("DELETE FROM courses WHERE id = ?", (cid,))
    return {"ok": True, "deactivated": False}


# ---------- 학생 ----------

STUDENT_LIST_SQL = """
SELECT s.*,
  (SELECT MAX(consulted_at) FROM consultations c WHERE c.student_id = s.id) AS last_consulted,
  (SELECT MIN(next_contact_date) FROM consultations c
     WHERE c.student_id = s.id AND c.contact_done = 0 AND c.next_contact_date IS NOT NULL) AS next_contact,
  (SELECT COUNT(*) FROM artworks a WHERE a.student_id = s.id) AS artwork_count
FROM students s
"""


@route("GET", "/api/students")
def students_list(req):
    where, args = [], []
    if req.query.get("class_id"):
        where.append("s.class_id = ?")
        args.append(req.query["class_id"])
    status = req.query.get("status")
    if status:
        statuses = [x for x in status.split(",") if x]
        where.append(f"s.status IN ({','.join('?' for _ in statuses)})")
        args.extend(statuses)
    q = req.query.get("q", "").strip()
    if q:
        where.append("(s.name LIKE ? OR s.school LIKE ? OR s.phone LIKE ? OR s.guardian_phone LIKE ?)")
        args.extend([f"%{q}%"] * 4)
    sql = STUDENT_LIST_SQL + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY s.name"
    return db.rows_to_api(req.conn.execute(sql, args).fetchall())


@route("GET", "/api/students/:id")
def students_get(req):
    sid = req.int_param("id")
    row = req.conn.execute(STUDENT_LIST_SQL + " WHERE s.id = ?", (sid,)).fetchone()
    if not row:
        raise HTTPError(404, "학생을 찾을 수 없습니다.")
    return db.to_api(row)


def _validate_student(conn, data, partial=False):
    if not partial or "name" in data:
        require(data, "name")
    if data.get("class_id") and not _class_exists(conn, data["class_id"]):
        raise HTTPError(400, "반을 찾을 수 없습니다.")
    if "status" in data and data["status"] not in STUDENT_STATUSES:
        raise HTTPError(400, "상태 값이 잘못되었습니다.")


@route("POST", "/api/students")
def students_create(req):
    data = req.json()
    data.setdefault("status", "등록")
    _validate_student(req.conn, data)
    sid = db.insert(req.conn, "students", data)
    enroll = data.get("enroll")
    if enroll and enroll.get("course_id"):
        _create_enrollment(req.conn, sid, enroll)
    req.params["id"] = sid
    return students_get(req)


@route("PUT", "/api/students/:id")
def students_update(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    data = req.json()
    _validate_student(req.conn, data, partial=True)
    db.update(req.conn, "students", sid, data)
    return students_get(req)


@route("DELETE", "/api/students/:id")
def students_delete(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    files = []
    for r in req.conn.execute("SELECT image_path, thumb_path FROM artworks WHERE student_id = ?", (sid,)):
        files += [r[0], r[1]]
    files += [r[0] for r in req.conn.execute("SELECT signature_path FROM consultations WHERE student_id = ?", (sid,))]
    files += [r[0] for r in req.conn.execute("SELECT image_path FROM reports WHERE student_id = ?", (sid,))]
    req.conn.execute("DELETE FROM students WHERE id = ?", (sid,))
    for f in files:
        remove_upload(f)
    return {"ok": True}


# ---------- 상담 ----------

def _create_enrollment(conn, sid, enroll):
    course = db.get(conn, "courses", int(enroll["course_id"]))
    if not course:
        raise HTTPError(400, "수강 옵션을 찾을 수 없습니다.")
    data = {
        "student_id": sid,
        "course_id": course["id"],
        "start_date": enroll.get("start_date") or db.today(),
        "end_date": enroll.get("end_date") or None,
        "billing_day": int(enroll.get("billing_day") or 1),
        "discount": int(enroll.get("discount") or 0),
    }
    return db.insert(conn, "enrollments", data)


@route("POST", "/api/consultations/new-student")
def consult_new_student(req):
    """신입생 상담카드 저장: 학생 + 상담 기록 (+ 수강 등록, 성적)."""
    data = req.json()
    student = data.get("student") or {}
    consult = data.get("consultation") or {}
    require(student, "name", "class_id")
    result = consult.get("result") or "상담만"
    if result not in RESULT_TO_STATUS:
        raise HTTPError(400, "상담 결과 값이 잘못되었습니다.")
    student["status"] = RESULT_TO_STATUS[result]
    _validate_student(req.conn, student)

    sid = db.insert(req.conn, "students", student)
    consult.update({
        "student_id": sid,
        "class_id": student["class_id"],
        "kind": "신입 상담",
        "result": result,
        "consulted_at": consult.get("consulted_at") or db.today(),
    })
    cid = db.insert(req.conn, "consultations", consult)

    enrollment_id = None
    enroll = data.get("enroll")
    if result == "등록" and enroll and enroll.get("course_id"):
        enrollment_id = _create_enrollment(req.conn, sid, enroll)

    for rec in data.get("scores") or []:
        if rec.get("kind") and rec.get("values"):
            rec = {**rec, "student_id": sid, "taken_on": rec.get("taken_on") or db.today()}
            db.insert(req.conn, "score_records", rec)

    return {"student_id": sid, "consultation_id": cid, "enrollment_id": enrollment_id}


@route("GET", "/api/students/:id/consultations")
def consult_list(req):
    sid = req.int_param("id")
    return db.rows_to_api(req.conn.execute(
        "SELECT * FROM consultations WHERE student_id = ? ORDER BY consulted_at DESC, id DESC", (sid,)).fetchall())


@route("POST", "/api/students/:id/consultations")
def consult_create(req):
    sid = req.int_param("id")
    student = _student_or_404(req.conn, sid)
    data = req.json()
    require(data, "kind")
    data["student_id"] = sid
    data.setdefault("class_id", student["class_id"])
    data["consulted_at"] = data.get("consulted_at") or db.today()
    cid = db.insert(req.conn, "consultations", data)
    return db.get(req.conn, "consultations", cid)


@route("PUT", "/api/consultations/:id")
def consult_update(req):
    cid = req.int_param("id")
    data = req.json()
    data.pop("student_id", None)
    if not db.update(req.conn, "consultations", cid, data):
        raise HTTPError(404, "상담 기록을 찾을 수 없습니다.")
    return db.get(req.conn, "consultations", cid)


@route("DELETE", "/api/consultations/:id")
def consult_delete(req):
    cid = req.int_param("id")
    row = db.get(req.conn, "consultations", cid)
    if not row:
        raise HTTPError(404, "상담 기록을 찾을 수 없습니다.")
    req.conn.execute("DELETE FROM consultations WHERE id = ?", (cid,))
    remove_upload(row.get("signature_path"))
    return {"ok": True}


# ---------- 작품 ----------

@route("GET", "/api/students/:id/artworks")
def artworks_list(req):
    sid = req.int_param("id")
    return db.rows_to_api(req.conn.execute(
        "SELECT * FROM artworks WHERE student_id = ? ORDER BY made_on DESC, id DESC", (sid,)).fetchall())


@route("POST", "/api/students/:id/artworks")
def artworks_create(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    data = req.json()
    require(data, "image_path")
    data["student_id"] = sid
    data["made_on"] = data.get("made_on") or db.today()
    aid = db.insert(req.conn, "artworks", data)
    return db.get(req.conn, "artworks", aid)


@route("PUT", "/api/artworks/:id")
def artworks_update(req):
    aid = req.int_param("id")
    data = req.json()
    for k in ("student_id", "image_path", "thumb_path"):
        data.pop(k, None)
    if not db.update(req.conn, "artworks", aid, data):
        raise HTTPError(404, "작품을 찾을 수 없습니다.")
    return db.get(req.conn, "artworks", aid)


@route("DELETE", "/api/artworks/:id")
def artworks_delete(req):
    aid = req.int_param("id")
    row = db.get(req.conn, "artworks", aid)
    if not row:
        raise HTTPError(404, "작품을 찾을 수 없습니다.")
    req.conn.execute("DELETE FROM artworks WHERE id = ?", (aid,))
    remove_upload(row.get("image_path"))
    remove_upload(row.get("thumb_path"))
    return {"ok": True}


# ---------- 성적 ----------

@route("GET", "/api/students/:id/scores")
def scores_list(req):
    sid = req.int_param("id")
    return db.rows_to_api(req.conn.execute(
        "SELECT * FROM score_records WHERE student_id = ? ORDER BY taken_on DESC, id DESC", (sid,)).fetchall())


@route("POST", "/api/students/:id/scores")
def scores_create(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    data = req.json()
    require(data, "kind")
    data["student_id"] = sid
    data["taken_on"] = data.get("taken_on") or db.today()
    rid = db.insert(req.conn, "score_records", data)
    return db.get(req.conn, "score_records", rid)


@route("DELETE", "/api/scores/:id")
def scores_delete(req):
    rid = req.int_param("id")
    if not req.conn.execute("DELETE FROM score_records WHERE id = ?", (rid,)).rowcount:
        raise HTTPError(404, "성적 기록을 찾을 수 없습니다.")
    return {"ok": True}


# ---------- 리포트 ----------

@route("GET", "/api/students/:id/reports")
def reports_list(req):
    sid = req.int_param("id")
    return db.rows_to_api(req.conn.execute(
        "SELECT * FROM reports WHERE student_id = ? ORDER BY created_at DESC, id DESC", (sid,)).fetchall())


@route("POST", "/api/students/:id/reports")
def reports_create(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    data = req.json()
    require(data, "image_path")
    data["student_id"] = sid
    rid = db.insert(req.conn, "reports", data)
    return db.get(req.conn, "reports", rid)


@route("DELETE", "/api/reports/:id")
def reports_delete(req):
    rid = req.int_param("id")
    row = db.get(req.conn, "reports", rid)
    if not row:
        raise HTTPError(404, "리포트를 찾을 수 없습니다.")
    req.conn.execute("DELETE FROM reports WHERE id = ?", (rid,))
    remove_upload(row.get("image_path"))
    return {"ok": True}
