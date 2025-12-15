import os
import json
from http.server import BaseHTTPRequestHandler
import urllib.request
import urllib.error

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            # Read request body
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length)
            data = json.loads(body)
            
            block_id = data.get('block_id')
            content = data.get('content')
            
            if not block_id or content is None:
                self._send_response(400, {'error': 'Missing block_id or content'})
                return
            
            # Get token from environment
            token = os.environ.get('GITHUB_TOKEN')
            if not token:
                self._send_response(500, {'error': 'Server misconfiguration: No token'})
                return
            
            # Dispatch to GitHub Actions
            owner = os.environ.get('REPO_OWNER', 'EliezerRosa')
            repo = os.environ.get('REPO_NAME', 'RVM-Designacoes-Antigravity')
            
            dispatch_url = f'https://api.github.com/repos/{owner}/{repo}/dispatches'
            
            payload = json.dumps({
                'event_type': 'atomic_write',
                'client_payload': {
                    'block_id': block_id,
                    'content': content
                }
            }).encode('utf-8')
            
            req = urllib.request.Request(
                dispatch_url,
                data=payload,
                headers={
                    'Authorization': f'token {token}',
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'RVM-Gateway'
                },
                method='POST'
            )
            
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    if response.status == 204:
                        self._send_response(200, {
                            'status': 'accepted',
                            'message': 'Transação enfileirada no Atomic Writer',
                            'block_id': block_id
                        })
                    else:
                        self._send_response(response.status, {'error': 'Unexpected response from GitHub'})
            except urllib.error.HTTPError as e:
                self._send_response(e.code, {'error': f'GitHub API error: {e.reason}'})
            except urllib.error.URLError as e:
                self._send_response(502, {'error': f'Failed to reach GitHub: {str(e)}'})
                
        except json.JSONDecodeError:
            self._send_response(400, {'error': 'Invalid JSON'})
        except Exception as e:
            self._send_response(500, {'error': str(e)})
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()
    
    def _send_response(self, status_code, data):
        self.send_response(status_code)
        self._send_cors_headers()
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))
    
    def _send_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
