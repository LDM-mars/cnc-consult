"""API 테스트: python3 -m pytest tests/ -q"""
import io
import json
import os
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from urllib.parse import quote
import zipfile
from datetime import date
from http.cookiejar import CookieJar
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["CNC_QUIET"] = "1"

from app import db  # noqa: E402
from app.server import make_server  # noqa: E402

PNG_1PX = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")


class Client:
    def __init__(self, base):
        self.base = base
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))

    def call(self, method, path, data=None, raw=None, ctype=None):
        body, headers = None, {}
        if data is not None:
            body = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        if raw is not None:
            body = raw
            headers["Content-Type"] = ctype
        req = urllib.request.Request(self.base + quote(path, safe="/?&=%:,"), data=body, method=method, headers=headers)
        try:
            with self.opener.open(req) as r:
                content = r.read()
                if r.headers.get("Content-Type", "").startswith("application/json"):
                    return r.status, json.loads(content)
                return r.status, content
        except urllib.error.HTTPError as e:
            content = e.read()
            try:
                return e.code, json.loads(content)
            except ValueError:
                return e.code, content

    def get(self, p):
        return self.call("GET", p)

    def post(self, p, d=None):
        return self.call("POST", p, d if d is not None else {})

    def put(self, p, d):
        return self.call("PUT", p, d)

    def delete(self, p):
        return self.call("DELETE", p)


@pytest.fixture(scope="module")
def server():
    tmp = tempfile.mkdtemp(prefix="cnc-test-")
    db.configure(tmp)
    srv = make_server("127.0.0.1", 0)
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()
    srv.server_close()


@pytest.fixture(scope="module")
def client(server):
    c = Client(server)
    assert c.post("/api/auth/setup", {"password": "1234"})[0] == 200
    return c


def test_requires_login(server):
    anon = Client(server)
    assert anon.get("/api/students")[0] == 401
    assert anon.get("/api/auth/status")[1]["logged_in"] is False
    # 디자인 이미지와 화면 파일은 로그인 없이 열린다
    assert anon.get("/design/1.main.png")[0] == 200
    assert anon.get("/")[0] == 200
    # 경로 탈출 차단
    assert anon.get("/static/../db.py")[0] == 404
    assert anon.get("/design/%2e%2e/app/db.py")[0] == 404


def test_login_flow(server, client):
    other = Client(server)
    assert other.post("/api/auth/login", {"password": "wrong"})[0] == 401
    assert other.post("/api/auth/login", {"password": "1234"})[0] == 200
    assert other.get("/api/students")[0] == 200
    assert other.post("/api/auth/setup", {"password": "9999"})[0] == 400  # 이미 정해짐


def test_classes_seeded(client):
    status, classes = client.get("/api/classes")
    assert status == 200
    assert [c["id"] for c in classes] == ["elem", "mid", "high1", "high2"]
    assert classes[0]["name"] == "초등 창의력반"


def test_new_student_consultation_creates_records(client):
    status, course = client.post("/api/courses", {"class_id": "high1", "name": "주5회 정규", "monthly_fee": 600000})
    assert status == 200
    payload = {
        "student": {"name": "김하늘", "class_id": "high1", "school": "한빛고", "grade": "고1",
                    "guardian_phone": "010-1234-5678", "target_level": "미대 수시",
                    "target_schools": [{"school": "홍익대", "dept": "시각디자인"}],
                    "exam_subjects": ["기초디자인"]},
        "consultation": {"result": "등록", "summary": "기초디자인 희망", "next_contact_date": "2000-01-01",
                         "answers": {"memo": "성실함"}},
        "enroll": {"course_id": course["id"], "start_date": "2000-01-01", "billing_day": 10, "discount": 50000},
        "scores": [{"kind": "내신", "values": {"평균 등급": "2.3"}}],
    }
    status, res = client.post("/api/consultations/new-student", payload)
    assert status == 200, res
    sid = res["student_id"]
    assert res["enrollment_id"]

    _, student = client.get(f"/api/students/{sid}")
    assert student["status"] == "등록"
    assert student["target_schools"][0]["school"] == "홍익대"

    _, consults = client.get(f"/api/students/{sid}/consultations")
    assert consults[0]["kind"] == "신입 상담"
    assert consults[0]["answers"]["memo"] == "성실함"

    _, scores = client.get(f"/api/students/{sid}/scores")
    assert scores[0]["values"]["평균 등급"] == "2.3"

    _, listed = client.get("/api/students?class_id=high1&status=등록")
    assert any(s["id"] == sid for s in listed)

    # 연락 예정 (과거 날짜 → 오늘 할 일에 나와야 함)
    _, dash = client.get("/api/dashboard")
    assert any(c["student_id"] == sid for c in dash["contacts_due"])
    cid = consults[0]["id"]
    client.put(f"/api/consultations/{cid}", {"contact_done": True})
    _, dash = client.get("/api/dashboard")
    assert not any(c["student_id"] == sid for c in dash["contacts_due"])


def test_trial_result_sets_status(client):
    status, res = client.post("/api/consultations/new-student", {
        "student": {"name": "이초록", "class_id": "elem"},
        "consultation": {"result": "체험 예약", "trial_date": date.today().isoformat() + "T16:00"},
    })
    assert status == 200
    _, s = client.get(f"/api/students/{res['student_id']}")
    assert s["status"] == "체험"
    _, dash = client.get("/api/dashboard")
    assert any(t["student_id"] == res["student_id"] for t in dash["trials"])


def test_validation(client):
    assert client.post("/api/consultations/new-student", {"student": {"class_id": "elem"}})[0] == 400
    assert client.post("/api/students", {"name": "x", "class_id": "nope"})[0] == 400
    assert client.post("/api/students", {"name": "x", "status": "이상한값"})[0] == 400
    assert client.get("/api/students/99999")[0] == 404


def test_invoice_generation_and_payment(client):
    month = date.today().strftime("%Y-%m")
    status, res = client.post("/api/invoices/generate", {"month": month})
    assert status == 200 and res["created"] >= 1
    # 두 번 만들어도 중복되지 않는다
    _, res2 = client.post("/api/invoices/generate", {"month": month})
    assert res2["created"] == 0 and res2["skipped"] >= 1

    _, inv = client.get(f"/api/invoices?month={month}&unpaid=1")
    target = next(i for i in inv["invoices"] if i["student_name"] == "김하늘")
    assert target["amount"] == 550000  # 600000 - 할인 50000
    assert target["due_date"] == f"{month}-10"

    _, dash = client.get("/api/dashboard")
    assert any(u["id"] == target["id"] for u in dash["unpaid"])

    status, paid = client.put(f"/api/invoices/{target['id']}",
                              {"paid_amount": 550000, "paid_on": date.today().isoformat(), "method": "카드"})
    assert status == 200 and paid["paid_amount"] == 550000
    _, inv = client.get(f"/api/invoices?month={month}&unpaid=1")
    assert not any(i["id"] == target["id"] for i in inv["invoices"])


def test_manual_invoice_items(client):
    _, students = client.get("/api/students?q=김하늘")
    sid = students[0]["id"]
    status, inv = client.post("/api/invoices", {"student_id": sid, "month": "2026-01",
                                                "items": [{"name": "재료비", "amount": "30000"}]})
    assert status == 200 and inv["amount"] == 30000


def test_upload_artwork_and_report(client):
    _, students = client.get("/api/students?q=김하늘")
    sid = students[0]["id"]
    status, up = client.call("POST", "/api/uploads?kind=artworks", raw=PNG_1PX, ctype="image/png")
    assert status == 200 and up["url"].startswith("/uploads/artworks/")
    assert client.get(up["url"])[0] == 200
    assert client.call("POST", "/api/uploads?kind=artworks", raw=b"hello", ctype="text/plain")[0] == 400
    assert client.call("POST", "/api/uploads?kind=../../x", raw=PNG_1PX, ctype="image/png")[0] == 400

    status, art = client.post(f"/api/students/{sid}/artworks", {
        "image_path": up["url"], "thumb_path": up["url"], "subject": "기초디자인", "made_on": "2026-11-01",
        "scores": {"구도": 7, "색채": 8}})
    assert status == 200 and art["scores"]["색채"] == 8

    _, rep_up = client.call("POST", "/api/uploads?kind=reports", raw=PNG_1PX, ctype="image/png")
    status, rep = client.post(f"/api/students/{sid}/reports", {
        "image_path": rep_up["url"], "artwork_ids": [art["id"]], "comment": "좋아요"})
    assert status == 200 and rep["artwork_ids"] == [art["id"]]

    # 작품을 지우면 파일도 지워진다
    assert client.delete(f"/api/artworks/{art['id']}")[0] == 200
    assert client.get(up["url"])[0] == 404


def test_schedules_and_settings(client):
    status, sc = client.post("/api/schedules", {"title": "홍익대 실기", "date": "2099-01-10"})
    assert status == 200
    _, dash = client.get("/api/dashboard")
    assert any(s["id"] == sc["id"] for s in dash["schedules"])

    status, st = client.put("/api/settings", {"eval_items": ["구도", " ", "색채"]})
    assert st["eval_items"] == ["구도", "색채"]


def test_course_delete_with_enrollment_deactivates(client):
    _, classes = client.get("/api/classes")
    course = classes[2]["courses"][0]
    status, res = client.delete(f"/api/courses/{course['id']}")
    assert status == 200 and res["deactivated"] is True


def test_backup_zip(client):
    status, content = client.get("/api/backup")
    assert status == 200
    zf = zipfile.ZipFile(io.BytesIO(content))
    names = zf.namelist()
    assert "app.db" in names
    assert any(n.startswith("uploads/reports/") for n in names)


def test_password_change(server, client):
    assert client.post("/api/auth/password", {"old": "nope", "new": "5678"})[0] == 400
    assert client.post("/api/auth/password", {"old": "1234", "new": "5678"})[0] == 200
    assert client.get("/api/students")[0] == 200  # 지금 기기는 유지
    other = Client(server)
    assert other.post("/api/auth/login", {"password": "5678"})[0] == 200


def test_delete_student_cascades(client):
    _, students = client.get("/api/students?q=이초록")
    sid = students[0]["id"]
    assert client.delete(f"/api/students/{sid}")[0] == 200
    assert client.get(f"/api/students/{sid}")[0] == 404
    assert client.get(f"/api/students/{sid}/consultations")[1] == []
