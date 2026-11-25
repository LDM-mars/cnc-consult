"""아주 작은 라우터: @route 데코레이터, 요청/응답 객체."""
import json
import re
from http.cookies import SimpleCookie
from urllib.parse import parse_qs

ROUTES = []


def route(method, pattern, auth=True):
    regex = re.compile("^" + re.sub(r":(\w+)", r"(?P<\1>[^/]+)", pattern) + "$")

    def deco(fn):
        ROUTES.append((method, regex, fn, auth))
        return fn

    return deco


def match(method, path):
    """(handler, params, auth) 또는 경로는 있지만 메서드가 다르면 'method', 없으면 None."""
    path_found = False
    for m, regex, fn, auth in ROUTES:
        mt = regex.match(path)
        if mt:
            path_found = True
            if m == method:
                return fn, mt.groupdict(), auth
    return "method" if path_found else None


class HTTPError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


class Response:
    def __init__(self, body=b"", status=200, content_type="application/json; charset=utf-8", headers=None,
                 file_path=None):
        self.body = body
        self.status = status
        self.content_type = content_type
        self.headers = headers or {}
        self.file_path = file_path  # 큰 파일은 경로로 넘겨 스트리밍


class Request:
    def __init__(self, method, path, query_string, headers, body, client_ip):
        self.method = method
        self.path = path
        self.query = {k: v[0] for k, v in parse_qs(query_string, keep_blank_values=True).items()}
        self.headers = headers
        self.body = body
        self.client_ip = client_ip
        self.params = {}
        self.conn = None
        self.set_cookies = []
        cookie = SimpleCookie()
        try:
            cookie.load(headers.get("Cookie", ""))
        except Exception:
            pass
        self.cookies = {k: v.value for k, v in cookie.items()}

    def json(self):
        if not self.body:
            return {}
        try:
            data = json.loads(self.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise HTTPError(400, "잘못된 요청 형식입니다.")
        if not isinstance(data, dict):
            raise HTTPError(400, "잘못된 요청 형식입니다.")
        return data

    def int_param(self, name):
        try:
            return int(self.params[name])
        except (KeyError, ValueError):
            raise HTTPError(404, "찾을 수 없습니다.")


def require(data, *keys):
    for k in keys:
        v = data.get(k)
        if v is None or (isinstance(v, str) and not v.strip()):
            raise HTTPError(400, f"필수 항목이 비어 있습니다: {k}")
