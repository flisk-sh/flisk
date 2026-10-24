import { describe, expect, it } from "vitest";
import { PYTHON_DEV_COMMAND, pythonBackendProvider } from "./python.js";

function generatedFile(name: string, filename: string): string {
  const file = (pythonBackendProvider.createFiles?.(name) ?? []).find(
    (entry) => entry.filename === filename,
  );
  if (!file) throw new Error(`missing generated file ${filename}`);
  return file.content;
}

describe("Python backend language module", () => {
  it("exposes the provider id, label and dev command", () => {
    expect(pythonBackendProvider.id).toBe("python");
    expect(pythonBackendProvider.label).toBe("Python 3.12 + FastAPI");
    expect(pythonBackendProvider.devCommand).toBe(PYTHON_DEV_COMMAND);
  });

  it("pins the dev command contract: uvicorn, app dir, host, port and reload", () => {
    expect(PYTHON_DEV_COMMAND).toBe(
      "uvicorn main:app --app-dir src --host 0.0.0.0 --port $" +
        "{PORT:-4000} --reload --reload-dir src",
    );
  });

  it("generates the expected configuration files", () => {
    const files = pythonBackendProvider.createFiles?.("test-app") ?? [];
    expect(files.map((file) => file.filename)).toEqual([
      "pyproject.toml",
      "src/main.py",
      "tests/test_health.py",
    ]);
  });

  it("includes the Python version and FastAPI dependencies in pyproject.toml", () => {
    const projectConfig = generatedFile("test-app", "pyproject.toml");
    expect(projectConfig).toContain('requires-python = ">=3.12"');
    expect(projectConfig).toContain("fastapi");
    expect(projectConfig).toContain("uvicorn");
  });

  it("uses the supplied project name in every generated file", () => {
    expect(generatedFile("test-app", "pyproject.toml")).toContain('name = "test-app"');
    expect(generatedFile("test-app", "src/main.py")).toContain('FastAPI(title="test-app")');
    expect(generatedFile("test-app", "src/main.py")).toContain('"service": "test-app"');
    expect(generatedFile("test-app", "tests/test_health.py")).toContain('"service": "test-app"');
  });

  it("generates the health and root endpoints with their response contract", () => {
    const mainFile = generatedFile("test-app", "src/main.py");
    expect(mainFile).toContain('@app.get("/health")');
    expect(mainFile).toContain('@app.get("/")');
    expect(mainFile).toContain('"status": "ok"');
  });

  it("generates health and root tests that assert the endpoint responses", () => {
    const testFile = generatedFile("test-app", "tests/test_health.py");
    expect(testFile).toContain("def test_health()");
    expect(testFile).toContain('client.get("/health")');
    expect(testFile).toContain("def test_root()");
  });
});
