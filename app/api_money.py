"""수강 등록, 청구·수납, 입시 일정, 오늘 할 일."""
import calendar
import re
from datetime import date, timedelta

from . import db
from .api_people import _create_enrollment, _student_or_404
from .router import HTTPError, require, route

MONTH_RE = re.compile(r"^\d{4}-\d{2}$")

ENROLLMENT_SQL = """
SELECT e.*, c.name AS course_name, c.monthly_fee, c.class_id AS course_class_id, cl.name AS class_name
FROM enrollments e
JOIN courses c ON c.id = e.course_id
LEFT JOIN classes cl ON cl.id = c.class_id
"""

INVOICE_SQL = """
SELECT i.*, s.name AS student_name, s.class_id, s.guardian_phone, cl.name AS class_name
FROM invoices i
JOIN students s ON s.id = i.student_id
LEFT JOIN classes cl ON cl.id = s.class_id
"""


def _month_bounds(month):
    y, m = map(int, month.split("-"))
    last = calendar.monthrange(y, m)[1]
    return f"{month}-01", f"{month}-{last:02d}", last


# ---------- 수강 등록 ----------

@route("GET", "/api/students/:id/billing")
def billing_for_student(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    enrollments = db.rows_to_api(req.conn.execute(
        ENROLLMENT_SQL + " WHERE e.student_id = ? ORDER BY e.start_date DESC, e.id DESC", (sid,)).fetchall())
    invoices = db.rows_to_api(req.conn.execute(
        INVOICE_SQL + " WHERE i.student_id = ? ORDER BY i.month DESC, i.id DESC", (sid,)).fetchall())
    return {"enrollments": enrollments, "invoices": invoices}


@route("POST", "/api/students/:id/enrollments")
def enrollments_create(req):
    sid = req.int_param("id")
    _student_or_404(req.conn, sid)
    data = req.json()
    require(data, "course_id")
    eid = _create_enrollment(req.conn, sid, data)
    return db.to_api(req.conn.execute(ENROLLMENT_SQL + " WHERE e.id = ?", (eid,)).fetchone())


@route("PUT", "/api/enrollments/:id")
def enrollments_update(req):
    eid = req.int_param("id")
    data = req.json()
    data.pop("student_id", None)
    if not db.update(req.conn, "enrollments", eid, data):
        raise HTTPError(404, "수강 등록을 찾을 수 없습니다.")
    return db.to_api(req.conn.execute(ENROLLMENT_SQL + " WHERE e.id = ?", (eid,)).fetchone())


@route("DELETE", "/api/enrollments/:id")
def enrollments_delete(req):
    eid = req.int_param("id")
    if not req.conn.execute("DELETE FROM enrollments WHERE id = ?", (eid,)).rowcount:
        raise HTTPError(404, "수강 등록을 찾을 수 없습니다.")
    return {"ok": True}


# ---------- 청구·수납 ----------

@route("GET", "/api/invoices")
def invoices_list(req):
    where, args = [], []
    month = req.query.get("month")
    if month:
        if not MONTH_RE.match(month):
            raise HTTPError(400, "월 형식은 YYYY-MM 입니다.")
        where.append("i.month = ?")
        args.append(month)
    if req.query.get("unpaid") == "1":
        where.append("i.paid_amount < i.amount")
    if req.query.get("class_id"):
        where.append("s.class_id = ?")
        args.append(req.query["class_id"])
    sql = INVOICE_SQL + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY i.month DESC, s.name"
    rows = db.rows_to_api(req.conn.execute(sql, args).fetchall())
    total = sum(r["amount"] for r in rows)
    paid = sum(r["paid_amount"] for r in rows)
    return {"invoices": rows, "total": total, "paid": paid, "unpaid": total - paid}


@route("POST", "/api/invoices/generate")
def invoices_generate(req):
    """그 달에 수강 중인 등록생에게 청구서를 만든다. 이미 있으면 건너뛴다."""
    data = req.json()
    month = data.get("month") or db.today()[:7]
    if not MONTH_RE.match(month):
        raise HTTPError(400, "월 형식은 YYYY-MM 입니다.")
    first, last, last_day = _month_bounds(month)
    rows = req.conn.execute(ENROLLMENT_SQL + """
        JOIN students s ON s.id = e.student_id
        WHERE s.status = '등록' AND e.start_date <= ? AND (e.end_date IS NULL OR e.end_date = '' OR e.end_date >= ?)
    """, (last, first)).fetchall()
    created, skipped = 0, 0
    for r in rows:
        exists = req.conn.execute("SELECT 1 FROM invoices WHERE enrollment_id = ? AND month = ?",
                                  (r["id"], month)).fetchone()
        if exists:
            skipped += 1
            continue
        amount = max(0, int(r["monthly_fee"] or 0) - int(r["discount"] or 0))
        items = [{"name": f"{r['class_name'] or ''} {r['course_name']}".strip(), "amount": int(r["monthly_fee"] or 0)}]
        if r["discount"]:
            items.append({"name": "할인", "amount": -int(r["discount"])})
        day = min(max(int(r["billing_day"] or 1), 1), last_day)
        db.insert(req.conn, "invoices", {
            "student_id": r["student_id"], "enrollment_id": r["id"], "month": month,
            "due_date": f"{month}-{day:02d}", "items": items, "amount": amount, "paid_amount": 0,
        })
        created += 1
    return {"month": month, "created": created, "skipped": skipped}


def _normalize_invoice(data):
    if "items" in data and isinstance(data["items"], list):
        items = []
        for it in data["items"]:
            name = str(it.get("name", "")).strip()
            try:
                amt = int(it.get("amount") or 0)
            except (TypeError, ValueError):
                raise HTTPError(400, "금액은 숫자로 입력해 주세요.")
            if name or amt:
                items.append({"name": name, "amount": amt})
        data["items"] = items
        data["amount"] = sum(i["amount"] for i in items)
    for k in ("amount", "paid_amount"):
        if k in data:
            try:
                data[k] = int(data[k] or 0)
            except (TypeError, ValueError):
                raise HTTPError(400, "금액은 숫자로 입력해 주세요.")
    return data


@route("POST", "/api/invoices")
def invoices_create(req):
    data = _normalize_invoice(req.json())
    require(data, "student_id", "month")
    if not MONTH_RE.match(data["month"]):
        raise HTTPError(400, "월 형식은 YYYY-MM 입니다.")
    _student_or_404(req.conn, int(data["student_id"]))
    data.setdefault("paid_amount", 0)
    iid = db.insert(req.conn, "invoices", data)
    return db.to_api(req.conn.execute(INVOICE_SQL + " WHERE i.id = ?", (iid,)).fetchone())


@route("PUT", "/api/invoices/:id")
def invoices_update(req):
    iid = req.int_param("id")
    data = _normalize_invoice(req.json())
    data.pop("student_id", None)
    if not db.update(req.conn, "invoices", iid, data):
        raise HTTPError(404, "청구서를 찾을 수 없습니다.")
    return db.to_api(req.conn.execute(INVOICE_SQL + " WHERE i.id = ?", (iid,)).fetchone())


@route("DELETE", "/api/invoices/:id")
def invoices_delete(req):
    iid = req.int_param("id")
    if not req.conn.execute("DELETE FROM invoices WHERE id = ?", (iid,)).rowcount:
        raise HTTPError(404, "청구서를 찾을 수 없습니다.")
    return {"ok": True}


# ---------- 입시 일정 ----------

@route("GET", "/api/schedules")
def schedules_list(req):
    where, args = [], []
    if req.query.get("upcoming") == "1":
        where.append("sc.date >= ?")
        args.append(db.today())
    sql = """SELECT sc.*, s.name AS student_name FROM schedules sc
             LEFT JOIN students s ON s.id = sc.student_id"""
    sql += (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY sc.date, sc.id"
    return db.rows_to_api(req.conn.execute(sql, args).fetchall())


@route("POST", "/api/schedules")
def schedules_create(req):
    data = req.json()
    require(data, "title", "date")
    sid = db.insert(req.conn, "schedules", data)
    return db.get(req.conn, "schedules", sid)


@route("PUT", "/api/schedules/:id")
def schedules_update(req):
    sid = req.int_param("id")
    if not db.update(req.conn, "schedules", sid, req.json()):
        raise HTTPError(404, "일정을 찾을 수 없습니다.")
    return db.get(req.conn, "schedules", sid)


@route("DELETE", "/api/schedules/:id")
def schedules_delete(req):
    sid = req.int_param("id")
    if not req.conn.execute("DELETE FROM schedules WHERE id = ?", (sid,)).rowcount:
        raise HTTPError(404, "일정을 찾을 수 없습니다.")
    return {"ok": True}


# ---------- 오늘 할 일 ----------

@route("GET", "/api/dashboard")
def dashboard(req):
    conn = req.conn
    today = db.today()
    week = (date.today() + timedelta(days=7)).isoformat()
    month = today[:7]
    contact_sql = """
        SELECT c.id, c.student_id, c.kind, c.consulted_at, c.next_contact_date, c.next_contact_note,
               s.name AS student_name, s.class_id, s.status, s.phone, s.guardian_phone, cl.name AS class_name
        FROM consultations c JOIN students s ON s.id = c.student_id
        LEFT JOIN classes cl ON cl.id = s.class_id
        WHERE c.contact_done = 0 AND c.next_contact_date IS NOT NULL AND c.next_contact_date != ''
    """
    contacts_due = db.rows_to_api(conn.execute(
        contact_sql + " AND c.next_contact_date <= ? ORDER BY c.next_contact_date", (today,)).fetchall())
    contacts_soon = db.rows_to_api(conn.execute(
        contact_sql + " AND c.next_contact_date > ? AND c.next_contact_date <= ? ORDER BY c.next_contact_date",
        (today, week)).fetchall())
    trials = db.rows_to_api(conn.execute("""
        SELECT c.id, c.student_id, c.trial_date, s.name AS student_name, s.class_id, s.guardian_phone,
               cl.name AS class_name
        FROM consultations c JOIN students s ON s.id = c.student_id
        LEFT JOIN classes cl ON cl.id = s.class_id
        WHERE c.result = '체험 예약' AND s.status = '체험' AND c.trial_date IS NOT NULL
          AND substr(c.trial_date, 1, 10) >= ? AND substr(c.trial_date, 1, 10) <= ?
        ORDER BY c.trial_date
    """, (today, week)).fetchall())
    unpaid = db.rows_to_api(conn.execute(
        INVOICE_SQL + " WHERE i.paid_amount < i.amount AND i.month <= ? ORDER BY i.month, s.name",
        (month,)).fetchall())
    schedules = db.rows_to_api(conn.execute("""
        SELECT sc.*, s.name AS student_name FROM schedules sc LEFT JOIN students s ON s.id = sc.student_id
        WHERE sc.date >= ? ORDER BY sc.date LIMIT 8
    """, (today,)).fetchall())
    recent = db.rows_to_api(conn.execute("""
        SELECT c.id, c.student_id, c.kind, c.consulted_at, c.summary, c.result, s.name AS student_name,
               cl.name AS class_name
        FROM consultations c JOIN students s ON s.id = c.student_id
        LEFT JOIN classes cl ON cl.id = s.class_id
        ORDER BY c.consulted_at DESC, c.id DESC LIMIT 8
    """).fetchall())
    status_counts = {r[0]: r[1] for r in conn.execute("SELECT status, COUNT(*) FROM students GROUP BY status")}
    new_consults = conn.execute(
        "SELECT COUNT(*) FROM consultations WHERE kind = '신입 상담' AND substr(consulted_at,1,7) = ?",
        (month,)).fetchone()[0]
    new_enrolled = conn.execute(
        "SELECT COUNT(*) FROM consultations c JOIN students s ON s.id = c.student_id "
        "WHERE c.kind = '신입 상담' AND substr(c.consulted_at,1,7) = ? AND s.status = '등록'",
        (month,)).fetchone()[0]
    return {
        "today": today,
        "contacts_due": contacts_due,
        "contacts_soon": contacts_soon,
        "trials": trials,
        "unpaid": unpaid,
        "unpaid_total": sum(r["amount"] - r["paid_amount"] for r in unpaid),
        "schedules": schedules,
        "recent": recent,
        "status_counts": status_counts,
        "month_new_consults": new_consults,
        "month_new_enrolled": new_enrolled,
    }
