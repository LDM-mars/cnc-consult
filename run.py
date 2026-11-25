"""CNC 상담 프로그램 실행: python3 run.py [--port 8000] [--host 0.0.0.0]"""
import argparse
import socket
import sys
import webbrowser

from app.server import make_server


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # 실제로 보내지 않음, 내 IP 확인용
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description="CNC 미술학원 상담 프로그램")
    parser.add_argument("--host", default="0.0.0.0", help="0.0.0.0 = 같은 Wi-Fi의 태블릿에서도 접속 가능")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true", help="실행할 때 브라우저를 열지 않음")
    args = parser.parse_args()

    try:
        server = make_server(args.host, args.port)
    except OSError as e:
        print(f"\n[오류] {args.port}번 포트를 쓸 수 없습니다: {e}")
        print("  이미 프로그램이 켜져 있지 않은지 확인하거나, 다른 포트로 실행하세요. 예) run.bat --port 8001")
        sys.exit(1)
    print("=" * 56)
    print(" CNC 상담 프로그램이 실행되었습니다.")
    print(f"  이 컴퓨터에서:   http://localhost:{args.port}")
    if args.host == "0.0.0.0":
        print(f"  태블릿/폰에서:   http://{lan_ip()}:{args.port}  (같은 Wi-Fi)")
    print("  끄려면 이 창에서 Ctrl+C")
    print("=" * 56)
    sys.stdout.flush()
    if not args.no_browser:
        try:
            webbrowser.open(f"http://localhost:{args.port}")
        except Exception:
            pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n종료합니다.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
