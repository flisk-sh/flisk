from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api-backend"}


def test_health_reports_an_unreachable_database(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:secret@127.0.0.1:1/app?schema=public")
    response = client.get("/health")
    assert response.status_code == 503
    assert response.json()["status"] == "error"
    assert "database is not reachable" in response.json()["database"]


def test_root() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"service": "api-backend", "version": "1.0.0", "endpoints": ["/health"]}
