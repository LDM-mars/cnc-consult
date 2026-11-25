"""로그인, 설정, 업로드, 백업."""
import os
import sqlite3
import tempfile
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

from . import auth, db
from .router import HTTPError, Response, require, route

MAX_UPLOAD = 25 * 1024 * 1024
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


# ---------- 로그인 ----------

@route("GET", "/api/auth/status", auth=False)
def auth_status(req):
    logged_in = auth.session_valid(req.conn, req.cookies.get(auth.COOKIE_NAME))
    return {"setup_needed": not auth.password_is_set(req.conn), "logged_in": logged_in}


@route("POST", "/api/auth/setup", auth=False)
def auth_setup(req):
    if auth.password_is_set(req.conn):
        raise HTTPError(400, "비밀번호가 이미 정해져 있습니다.")
    data = req.json()
    pw = str(data.get("password", ""))
    if len(pw) < 4:
        raise HTTPError(400, "비밀번호는 4자 이상이어야 합니다.")
    db.set_setting(req.conn, "password_hash", auth.hash_password(pw))
    token = auth.create_session(req.conn)
    req.set_cookies.append(auth.session_cookie(token))
    return {"ok": True}


@route("POST", "/api/auth/login", auth=False)
def auth_login(req):
    wait = auth.check_rate_limit(req.client_ip)
    if wait:
        raise HTTPError(429, f"여러 번 틀렸습니다. {wait}초 뒤에 다시 시도해 주세요.")
    data = req.json()
    stored = db.get_setting(req.conn, "password_hash")
    if not stored:
        raise HTTPError(400, "먼저 비밀번호를 정해 주세요.")
    if not auth.verify_password(str(data.get("password", "")), stored):
        auth.record_failure(req.client_ip)
        raise HTTPError(401, "비밀번호가 맞지 않습니다.")
    auth.clear_failures(req.client_ip)
    token = auth.create_session(req.conn)
    req.set_cookies.append(auth.session_cookie(token))
    return {"ok": True}


@route("POST", "/api/auth/logout", auth=False)
def auth_logout(req):
    auth.delete_session(req.conn, req.cookies.get(auth.COOKIE_NAME, ""))
    req.set_cookies.append(auth.session_cookie("", clear=True))
    return {"ok": True}


@route("POST", "/api/auth/password")
def auth_change_password(req):
    data = req.json()
    if not auth.verify_password(str(data.get("old", "")), db.get_setting(req.conn, "password_hash")):
        raise HTTPError(400, "지금 비밀번호가 맞지 않습니다.")
    new = str(data.get("new", ""))
    if len(new) < 4:
        raise HTTPError(400, "새 비밀번호는 4자 이상이어야 합니다.")
    db.set_setting(req.conn, "password_hash", auth.hash_password(new))
    # 다른 기기의 로그인은 모두 끊고, 지금 기기만 유지
    current = req.cookies.get(auth.COOKIE_NAME, "")
    req.conn.execute("DELETE FROM sessions WHERE token != ?", (current,))
    return {"ok": True}


# ---------- 설정 ----------

PUBLIC_SETTINGS = ("academy_name", "exam_subjects", "eval_items", "sources", "report_background")


@route("GET", "/api/settings")
def settings_get(req):
    return {k: db.get_setting(req.conn, k, db.DEFAULT_SETTINGS.get(k)) for k in PUBLIC_SETTINGS}


@route("PUT", "/api/settings")
def settings_put(req):
    data = req.json()
    for k in PUBLIC_SETTINGS:
        if k in data:
            v = data[k]
            if k in ("exam_subjects", "eval_items", "sources"):
                if not isinstance(v, list):
                    raise HTTPError(400, f"{k} 형식이 잘못되었습니다.")
                v = [str(x).strip() for x in v if str(x).strip()]
            db.set_setting(req.conn, k, v)
    return settings_get(req)


@route("GET", "/api/design-images")
def design_images(req):
    files = sorted(p.name for p in db.DESIGN_DIR.glob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp"))
    return {"files": files}


# ---------- 업로드 ----------

@route("POST", "/api/uploads")
def upload(req):
    kind = req.query.get("kind", "")
    if kind not in db.UPLOAD_KINDS:
        raise HTTPError(400, "알 수 없는 업로드 종류입니다.")
    ctype = req.headers.get("Content-Type", "").split(";")[0].strip().lower()
    ext = IMAGE_TYPES.get(ctype)
    if not ext:
        raise HTTPError(400, "이미지 파일(JPG, PNG, WEBP)만 올릴 수 있습니다.")
    if not req.body:
        raise HTTPError(400, "파일이 비어 있습니다.")
    if len(req.body) > MAX_UPLOAD:
        raise HTTPError(413, "파일이 너무 큽니다.")
    name = f"{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:12]}{ext}"
    target = db.UPLOAD_DIR / kind / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(req.body)
    return {"url": f"/uploads/{kind}/{name}"}


def remove_upload(url):
    """/uploads/... 경로의 파일을 지운다. 다른 곳의 파일은 건드리지 않는다."""
    if not url or not str(url).startswith("/uploads/"):
        return
    path = (db.UPLOAD_DIR / str(url)[len("/uploads/"):]).resolve()
    try:
        path.relative_to(db.UPLOAD_DIR.resolve())
    except ValueError:
        return
    try:
        path.unlink()
    except FileNotFoundError:
        pass


# ---------- 백업 ----------

@route("GET", "/api/backup")
def backup(req):
    fd, zip_path = tempfile.mkstemp(suffix=".zip")
    os.close(fd)
    fd2, db_copy = tempfile.mkstemp(suffix=".db")
    os.close(fd2)
    try:
        dest = sqlite3.connect(db_copy)
        req.conn.backup(dest)
        dest.close()
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(db_copy, "app.db")
            for p in sorted(Path(db.UPLOAD_DIR).rglob("*")):
                if p.is_file():
                    zf.write(p, "uploads/" + str(p.relative_to(db.UPLOAD_DIR)).replace(os.sep, "/"))
    finally:
        os.unlink(db_copy)
    fname = f"cnc-backup-{datetime.now().strftime('%Y%m%d-%H%M')}.zip"
    return Response(status=200, content_type="application/zip", file_path=zip_path,
                    headers={"Content-Disposition": f'attachment; filename="{fname}"', "X-Delete-After": "1"})
