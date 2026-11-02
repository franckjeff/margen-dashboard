"""Local development server for the MARGEN Dashboard.

Like `python -m http.server`, but tells the browser not to cache anything, so a reload
always picks up the latest app.js and styles.css instead of a stale copy.
"""

import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    print(f"Serving the MARGEN Dashboard at http://localhost:{port}")
    server.serve_forever()
