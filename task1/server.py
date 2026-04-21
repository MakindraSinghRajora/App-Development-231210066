from http.server import HTTPServer, SimpleHTTPRequestHandler
import os
import socket
import socketserver

class CORSRequestHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-type')
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        return super().end_headers()

    def do_GET(self):
        if self.path == '/' or self.path == '':
            self.path = '/chatroom.html'
        return super().do_GET()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def get_local_ip():
    ip = '127.0.0.1'
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(('8.8.8.8', 80))
            ip = s.getsockname()[0]
    except Exception:
        pass

    if ip.startswith('127.'):
        try:
            for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
                candidate = info[4][0]
                if not candidate.startswith('127.'):
                    ip = candidate
                    break
        except Exception:
            pass

    return ip

if __name__ == '__main__':
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    PORT = 8000
    HOST = '0.0.0.0'
    
    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, CORSRequestHandler)
    
    local_ip = get_local_ip()
    
    print('=' * 60)
    print('Chat Room Server Started!')
    print('=' * 60)
    print(f"\nOn this computer (Laptop):")
    print(f"  → http://localhost:{PORT}")
    print(f"  → http://127.0.0.1:{PORT}")
    print(f"\nOn other devices (Phone/Tablet on same network):")
    print(f"  → http://{local_ip}:{PORT}")
    print('\nIMPORTANT: On your phone, use the laptop IP address above, not localhost.')
    print('\nPress Ctrl+C to stop the server')
    print('=' * 60 + '\n')
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped!')
        httpd.server_close()
