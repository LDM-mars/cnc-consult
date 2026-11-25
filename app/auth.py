"""공유 비밀번호 + 세션 쿠키."""
import hashlib
import hmac
import os
import secrets
import threading
import time

from . import db

COOKIE_NAME = "cnc_session"
SESSION_DAYS = 180
_ITER = 200_000

_fail_lock = threading.Lock()
_failures = {}  # ip -> (count, locked_until)


def hash_password(password):
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITER)
    return f"pbkdf2${_ITER}${salt.hex()}${dk.hex()}"


def verify_password(password, stored):
    try:
        _, it, salt_hex, hash_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(it))
        return hmac.compare_digest(dk.hex(), hash_hex)
    except (ValueError, AttributeError):
        return False


def password_is_set(conn):
    return bool(db.get_setting(conn, "password_hash"))


def create_session(conn):
    token = secrets.token_urlsafe(32)
    conn.execute("INSERT INTO sessions (token, created_at, last_seen) VALUES (?, ?, ?)", (token, db.now(), db.now()))
    return token


def session_valid(conn, token):
    if not token:
        return False
    row = conn.execute("SELECT created_at FROM sessions WHERE token = ?", (token,)).fetchone()
    if not row:
        return False
    created = time.mktime(time.strptime(row[0], "%Y-%m-%d %H:%M:%S"))
    if time.time() - created > SESSION_DAYS * 86400:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
        return False
    return True


def delete_session(conn, token):
    conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def session_cookie(token, clear=False):
    if clear:
        return f"{COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax"
    return f"{COOKIE_NAME}={token}; Path=/; Max-Age={SESSION_DAYS * 86400}; HttpOnly; SameSite=Lax"


def check_rate_limit(ip):
    """로그인 5번 실패하면 30초 동안 막는다. 막혀 있으면 남은 초를 돌려준다."""
    with _fail_lock:
        count, until = _failures.get(ip, (0, 0))
        if until > time.time():
            return int(until - time.time()) + 1
    return 0


def record_failure(ip):
    with _fail_lock:
        count, until = _failures.get(ip, (0, 0))
        count += 1
        if count >= 5:
            _failures[ip] = (0, time.time() + 30)
        else:
            _failures[ip] = (count, until)


def clear_failures(ip):
    with _fail_lock:
        _failures.pop(ip, None)
