import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import os
import tempfile
import unittest
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
from app.services import auth


class AuthenticationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"AUTH_DB_PATH": self.temp.name + "/auth.sqlite3",
                             "DATABASE_BACKEND": "local", "CLOUD_ACCESS_PASSWORD": "",
                             "PUBLIC_BASE_URL": ""})
        self.env.start()
        app = FastAPI()
        app.include_router(auth.router)
        @app.get("/")
        def home():
            return {"workspace": "shared"}
        @app.get("/api/private")
        def private():
            return {"ok": True}
        @app.websocket("/ws")
        async def ws(websocket):
            await websocket.accept()
            await websocket.close()
        app.add_middleware(auth.AuthenticationMiddleware)
        self.client = TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50000))
        self.credentials = {"username": "artist", "password": "a-long-test-password"}

    def tearDown(self):
        self.client.close()
        self.env.stop()
        self.temp.cleanup()

    def setup_account(self):
        response = self.client.post("/api/auth/setup", json=self.credentials)
        self.assertEqual(response.status_code, 200, response.text)
        return response

    def test_setup_login_logout_and_revocation(self):
        self.assertTrue(self.client.get("/api/auth/status").json()["can_setup"])
        self.assertEqual(self.client.get("/", follow_redirects=False).status_code, 303)
        self.assertEqual(self.client.get("/api/private").status_code, 401)
        response = self.setup_account()
        self.assertIn("HttpOnly", response.headers["set-cookie"])
        self.assertIn("SameSite=strict", response.headers["set-cookie"])
        self.assertNotIn("Max-Age", response.headers["set-cookie"])
        self.assertEqual(self.client.get("/api/private").status_code, 200)
        old = self.client.cookies.get(auth.COOKIE)
        self.assertEqual(self.client.post("/api/auth/logout").status_code, 200)
        self.client.cookies.set(auth.COOKIE, old)
        self.assertEqual(self.client.get("/api/private").status_code, 401)
        self.client.cookies.clear()
        self.assertEqual(self.client.post("/api/auth/login", json={**self.credentials, "password": "wrong"}).status_code, 401)
        response = self.client.post("/api/auth/login", json={**self.credentials, "remember": True})
        self.assertEqual(response.status_code, 200)
        self.assertIn("Max-Age=2592000", response.headers["set-cookie"])
        self.assertTrue(self.client.get("/api/auth/status").json()["authenticated"])

    def test_initialization_is_local_single_use_and_hashes_password(self):
        with TestClient(self.client.app, base_url="http://canvas.example", client=("10.1.1.2", 9)) as remote:
            self.assertEqual(remote.post("/api/auth/setup", json=self.credentials).status_code, 403)
        self.assertEqual(self.client.post("/api/auth/setup", json={**self.credentials, "password": "short"}).status_code, 400)
        self.setup_account()
        self.assertEqual(self.client.post("/api/auth/setup", json=self.credentials).status_code, 403)
        self.assertNotEqual(auth.account()[2], self.credentials["password"])

    def test_csrf_expiry_and_tampering(self):
        self.setup_account()
        self.assertEqual(self.client.post("/api/auth/logout", headers={"Origin": "https://evil.test"}).status_code, 403)
        self.assertEqual(self.client.post("/api/auth/logout", headers={"Sec-Fetch-Site": "cross-site"}).status_code, 403)
        with auth.database() as db:
            db.execute("UPDATE sessions SET expires=0")
        self.assertEqual(self.client.get("/api/private").status_code, 401)
        self.client.cookies.clear()
        self.client.cookies.set(auth.COOKIE, "forged")
        self.assertEqual(self.client.get("/api/private").status_code, 401)

    def test_throttle_and_cloud_compatibility(self):
        self.setup_account()
        self.client.cookies.clear()
        for _ in range(10):
            self.assertEqual(self.client.post("/api/auth/login", json={**self.credentials, "password": "wrong"}).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/login", json=self.credentials).status_code, 429)
        with patch.dict(os.environ, {"DATABASE_BACKEND": "postgres", "CLOUD_ACCESS_USER": "cloud", "CLOUD_ACCESS_PASSWORD": "cloud-password"}):
            self.assertEqual(self.client.get("/api/private", auth=("cloud", "cloud-password")).status_code, 200)
            with auth.database() as db:
                db.execute("DELETE FROM attempts")
            response = self.client.post("/api/auth/login", json={"username": "cloud", "password": "cloud-password"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(self.client.get("/api/private").status_code, 200)
            with patch.dict(os.environ, {"CLOUD_ACCESS_PASSWORD": "rotated-password"}):
                self.assertEqual(self.client.get("/api/private").status_code, 401)

    def test_public_login_and_no_browser_password_popup(self):
        response = self.client.get("/login")
        self.assertEqual(response.status_code, 200)
        self.assertIn('id="login-form"', response.text)
        self.assertNotIn("auth-session.js", response.text)
        self.assertEqual(self.client.get("/api/private").headers.get("www-authenticate"), None)
        with self.assertRaises(WebSocketDisconnect):
            with self.client.websocket_connect("/ws"):
                pass


if __name__ == "__main__":
    unittest.main()
