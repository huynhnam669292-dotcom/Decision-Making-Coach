#!/usr/bin/env python3
"""
Simple HTTP Server for AI Coach THPT Web Application
Runs locally on port 8000
"""

import http.server
import socketserver
import os
import webbrowser

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

def main():
    os.chdir(DIRECTORY)
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        url = f"http://localhost:{PORT}"
        print("=" * 60)
        print("🧭 AI COACH THPT - TRỢ LÝ RA QUYẾT ĐỊNH TRONG MÔI TRƯỜNG SỐ")
        print("=" * 60)
        print(f"✓ Máy chủ Web đang chạy tại: {url}")
        print(f"✓ Thư mục tệp gốc: {DIRECTORY}")
        print("✓ Nhấn Ctrl+C để dừng máy chủ")
        print("=" * 60)
        
        try:
            webbrowser.open(url)
        except Exception:
            pass
            
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nĐã tắt máy chủ.")
            httpd.server_close()

if __name__ == '__main__':
    main()
