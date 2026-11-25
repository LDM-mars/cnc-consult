"""표준 라이브러리만 쓰는 HTTP 서버."""
import json
import mimetypes
import os
import sqlite3
import sys
import traceback
from email.utils import formatdate, parsedate_to_datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from . import api_core, api_money, api_people  # noqa: F401  (라우트 등록)
from . import auth, db
from .router import HTTPError, Request, Response, match

MAX_BODY = 30 * 1024 * 1024
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("image/webp", ".webp")


def _safe_join(base, rel):
    """base 폴더 밖으로 나가는 경로를 막는다."""
    base = Path(base).resolve()
    target = (base / rel.lstrip("/")).resolve()
    try:
        target.relative_to(base)
    except ValueError:
        return None
    return target


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "CNC/1.0"

    def log_message(self, fmt, *args):
        if os.environ.get("CNC_QUIET"):
            return
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        self._dispatch("GET")

    def do_HEAD(self):
        self._dispatch("GET", head=True)

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    # ---------- 공통 ----------

    def _dispatch(self, method, head=False):
        self._head = head
        try:
            parts = urlsplit(self.path)
            path = unquote(parts.path)
            if path.startswith("/api/"):
                self._handle_api(method, path, parts.query)
            elif method != "GET":
                self._send_json({"error": "허용되지 않는 요청입니다."}, 405)
            elif path in ("/", "/index.html"):
                self._send_file(db.STATIC_DIR / "index.html", cache="no-cache")
            elif path.startswith("/static/"):
                self._send_static(db.STATIC_DIR, path[len("/static/"):])
            elif path.startswith("/design/"):
                self._send_static(db.DESIGN_DIR, path[len("/design/"):])
            elif path.startswith("/uploads/"):
                if not self._logged_in():
                    self._send_json({"error": "로그인이 필요합니다."}, 401)
                    return
                self._send_static(db.UPLOAD_DIR, path[len("/uploads/"):])
            elif path == "/favicon.ico":
                self.send_response(204)
                self.send_header("Content-Length", "0")
                self.end_headers()
            else:
                self._send_json({"error": "찾을 수 없습니다."}, 404)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _logged_in(self):
        from http.cookies import SimpleCookie
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            return False
        token = cookie.get(auth.COOKIE_NAME)
        conn = db.connect()
        try:
            return auth.session_valid(conn, token.value if token else None)
        finally:
            conn.close()

    def _handle_api(self, method, path, query):
        found = match(method, path)
        if found is None:
            self._send_json({"error": "찾을 수 없습니다."}, 404)
            return
        if found == "method":
            self._send_json({"error": "허용되지 않는 요청입니다."}, 405)
            return
        handler, params, needs_auth = found

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self._send_json({"error": "요청이 너무 큽니다."}, 413)
            self.close_connection = True
            return
        body = self.rfile.read(length) if length else b""

        req = Request(method, path, query, self.headers, body, self.client_address[0])
        req.params = params
        conn = db.connect()
        req.conn = conn
        try:
            if needs_auth and not auth.session_valid(conn, req.cookies.get(auth.COOKIE_NAME)):
                raise HTTPError(401, "로그인이 필요합니다.")
            result = handler(req)
            conn.commit()
            if isinstance(result, Response):
                self._send_response(result, req.set_cookies)
            else:
                self._send_json(result, 200, req.set_cookies)
        except HTTPError as e:
            conn.rollback()
            self._send_json({"error": e.message}, e.status, req.set_cookies)
        except sqlite3.IntegrityError as e:
            conn.rollback()
            self._send_json({"error": f"저장할 수 없습니다: {e}"}, 400)
        except Exception:
            conn.rollback()
            traceback.print_exc()
            self._send_json({"error": "서버 오류가 발생했습니다."}, 500)
        finally:
            conn.close()

    # ---------- 응답 ----------

    def _send_json(self, data, status=200, cookies=()):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        for c in cookies:
            self.send_header("Set-Cookie", c)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if not self._head:
            self.wfile.write(body)

    def _send_response(self, resp, cookies=()):
        self.send_response(resp.status)
        self.send_header("Content-Type", resp.content_type)
        delete_after = resp.headers.pop("X-Delete-After", None)
        for k, v in resp.headers.items():
            self.send_header(k, v)
        for c in cookies:
            self.send_header("Set-Cookie", c)
        try:
            if resp.file_path:
                size = os.path.getsize(resp.file_path)
                self.send_header("Content-Length", str(size))
                self.end_headers()
                if not self._head:
                    with open(resp.file_path, "rb") as f:
                        while True:
                            chunk = f.read(256 * 1024)
                            if not chunk:
                                break
                            self.wfile.write(chunk)
            else:
                body = resp.body if isinstance(resp.body, bytes) else str(resp.body).encode("utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                if not self._head:
                    self.wfile.write(body)
        finally:
            if resp.file_path and delete_after:
                try:
                    os.unlink(resp.file_path)
                except OSError:
                    pass

    def _send_static(self, base, rel):
        target = _safe_join(base, rel)
        if target is None or not target.is_file():
            self._send_json({"error": "찾을 수 없습니다."}, 404)
            return
        self._send_file(target)

    def _send_file(self, path, cache="no-cache"):
        stat = path.stat()
        last_modified = formatdate(stat.st_mtime, usegmt=True)
        ims = self.headers.get("If-Modified-Since")
        if ims:
            try:
                if int(parsedate_to_datetime(ims).timestamp()) >= int(stat.st_mtime):
                    self.send_response(304)
                    self.send_header("Last-Modified", last_modified)
                    self.send_header("Cache-Control", cache)
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
            except (TypeError, ValueError):
                pass
        ctype = mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/json",):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(stat.st_size))
        self.send_header("Last-Modified", last_modified)
        self.send_header("Cache-Control", cache)
        self.end_headers()
        if self._head:
            return
        with open(path, "rb") as f:
            while True:
                chunk = f.read(256 * 1024)
                if not chunk:
                    break
                self.wfile.write(chunk)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def make_server(host="0.0.0.0", port=8000):
    db.init_db()
    return Server((host, port), Handler)
