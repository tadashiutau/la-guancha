"""Dev server with caching disabled (so edits show up on reload), reachable from the phone on the LAN.

    python3 tools/serve.py [port]
"""
import functools
import http.server
import socket
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    handler = functools.partial(NoCache, directory=str(ROOT))
    url = f"http://{lan_ip()}:{port}"
    with http.server.ThreadingHTTPServer(("0.0.0.0", port), handler) as srv:
        print(f"\n  En esta computadora:   http://localhost:{port}")
        print(f"  iPhone / tablet (misma red Wi-Fi):  {url}\n")
        try:
            import qrcode
            q = qrcode.QRCode(border=1)
            q.add_data(url)
            q.print_ascii(invert=True)
            print("  Escanea con la cámara del teléfono · Scan with the phone camera\n")
        except ImportError:
            pass
        print("  Ctrl+C para parar.", flush=True)
        try:
            srv.serve_forever()
        except KeyboardInterrupt:
            pass
