import json
import os
import stat
import subprocess
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[2]
CLI = ROOT / "slackp"


class Handler(BaseHTTPRequestHandler):
    requests = []

    def log_message(self, _format, *_args):
        pass

    def respond(self, status, payload):
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def route(self):
        parsed = urlparse(self.path)
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length)) if length else None
        self.__class__.requests.append({
            "method": self.command,
            "path": parsed.path,
            "query": parse_qs(parsed.query),
            "key": self.headers.get("X-API-Key"),
            "body": body,
        })
        if parsed.path == "/health":
            return self.respond(200, {"status": "healthy"})
        if self.headers.get("X-API-Key") != "spk_test_key":
            return self.respond(401, {"success": False, "error": {"code": "INVALID_API_KEY", "message": "Invalid key"}})
        if parsed.path == "/api/auth/test":
            return self.respond(200, {"success": True, "data": {"team_name": "Test", "api_key": {"label": "cli-test"}}})
        if parsed.path == "/api/search/messages":
            return self.respond(200, {"success": True, "data": {"results": [{"text": "found"}]}})
        if parsed.path.endswith("/send"):
            return self.respond(200, {"success": True, "data": {"sent": True, "message": body}})
        return self.respond(200, {"success": True, "data": {"path": parsed.path}})

    do_GET = route
    do_POST = route
    do_DELETE = route


class SlackpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:%s" % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()

    def setUp(self):
        Handler.requests.clear()
        self.temp = tempfile.TemporaryDirectory()
        self.config = Path(self.temp.name) / "config.json"
        self.env = dict(os.environ, SLACKP_CONFIG=str(self.config))

    def tearDown(self):
        self.temp.cleanup()

    def run_cli(self, *args, stdin=""):
        return subprocess.run(
            [str(CLI), *args], input=stdin, text=True, capture_output=True,
            env=self.env, timeout=10,
        )

    def connect(self):
        result = self.run_cli("connect", self.url, "--key-stdin", stdin="spk_test_key\n")
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_help_lists_agent_commands(self):
        result = self.run_cli("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("connect", result.stdout)
        self.assertIn("unread", result.stdout)
        self.assertIn("send", result.stdout)

    def test_connect_verifies_and_saves_mode_600(self):
        payload = self.connect()
        self.assertTrue(payload["data"]["connected"])
        saved = json.loads(self.config.read_text())
        self.assertEqual(saved["profiles"]["default"]["key"], "spk_test_key")
        self.assertEqual(stat.S_IMODE(self.config.stat().st_mode), 0o600)
        self.assertEqual(Handler.requests[-1]["path"], "/api/auth/test")

    def test_search_encodes_query_and_emits_json(self):
        self.connect()
        result = self.run_cli("search", "from:alice launch plan", "--count", "7")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["data"]["results"][0]["text"], "found")
        req = Handler.requests[-1]
        self.assertEqual(req["query"]["query"], ["from:alice launch plan"])
        self.assertEqual(req["query"]["count"], ["7"])

    def test_write_requires_confirmation_non_interactively(self):
        self.connect()
        result = self.run_cli("send", "C12345", "hello")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stderr)["error"]["code"], "CONFIRMATION_REQUIRED")

    def test_send_yes_posts_expected_body(self):
        self.connect()
        result = self.run_cli("send", "C12345", "hello world", "--thread", "123.456", "--yes")
        self.assertEqual(result.returncode, 0, result.stderr)
        req = Handler.requests[-1]
        self.assertEqual(req["path"], "/api/messages/C12345/send")
        self.assertEqual(req["body"], {"text": "hello world", "thread_ts": "123.456"})

    def test_send_without_thread_omits_thread_ts(self):
        self.connect()
        result = self.run_cli("send", "D12345", "direct hello", "--yes")
        self.assertEqual(result.returncode, 0, result.stderr)
        req = Handler.requests[-1]
        self.assertEqual(req["body"], {"text": "direct hello"})

    def test_send_to_username_uses_dm_endpoint(self):
        self.connect()
        result = self.run_cli("send", "@ahsan.amin", "hello by name", "--yes")
        self.assertEqual(result.returncode, 0, result.stderr)
        req = Handler.requests[-1]
        self.assertEqual(req["path"], "/api/messages/dm/send")
        self.assertEqual(req["body"], {"target": "@ahsan.amin", "text": "hello by name"})

    def test_send_can_request_owner_approval(self):
        self.connect()
        result = self.run_cli("send", "@new.person", "please review", "--request-approval", "--yes")
        self.assertEqual(result.returncode, 0, result.stderr)
        req = Handler.requests[-1]
        self.assertEqual(req["path"], "/api/messages/dm/request")
        self.assertEqual(req["body"], {"target": "@new.person", "text": "please review"})

    def test_approval_status_is_scoped_endpoint(self):
        self.connect()
        result = self.run_cli("approval", "request-123")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(Handler.requests[-1]["path"], "/api/messages/dm/requests/request-123")

    def test_bad_key_is_not_saved(self):
        result = self.run_cli("connect", self.url, "--key-stdin", stdin="wrong\n")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stderr)["error"]["code"], "INVALID_API_KEY")
        self.assertFalse(self.config.exists())


if __name__ == "__main__":
    unittest.main()
