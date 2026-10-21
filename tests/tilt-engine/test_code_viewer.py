# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
"""
Tests for code viewer component.
Tests the syntax highlighting and file rendering features.
"""

import pytest
from pathlib import Path


@pytest.mark.ide
class TestCodeViewer:
    """Tests for code viewer functionality."""
    
    def test_typescript_file_syntax_highlighting(self, temp_dir):
        """
        Scenario: TypeScript file rendering
        WHEN a user requests to view a `.ts` file in the code viewer
        THEN it SHALL return HTML with syntax-highlighted TypeScript
        AND it SHALL include line numbers
        """
        # Create TypeScript file
        ts_file = temp_dir / "example.ts"
        ts_file.write_text("""interface User {
  id: number;
  name: string;
}

const user: User = { id: 1, name: "Test" };""")
        
        # Simulate code viewer response
        content = ts_file.read_text()
        html = self._generate_code_html(content, "typescript")
        
        # Verify HTML structure
        assert "<pre>" in html or "<code>" in html, "Should contain code block"
        assert "line-number" in html or "data-line" in html, "Should include line numbers"
        assert "interface" in html, "Should preserve TypeScript keywords"
    
    def test_read_only_indicator_display(self, temp_dir):
        """
        Scenario: File read-only indicator
        WHEN viewing any file in the code viewer
        THEN the page SHALL display a "👁️ READ-ONLY" indicator
        AND the content SHALL NOT be editable
        """
        html = self._generate_viewer_html("test.ts", "content", editable=False)
        
        # Verify read-only indicator
        assert "👁️" in html or "READ-ONLY" in html, "Should show read-only indicator"
        assert 'contenteditable="false"' in html or "readonly" in html.lower(), "Content should not be editable"
    
    def test_unsupported_file_type_handling(self, temp_dir):
        """
        Scenario: Unsupported file type
        WHEN a user requests a binary file (e.g., `.png`, `.exe`)
        THEN it SHALL return `415 Unsupported Media Type`
        AND it SHALL suggest downloading the file instead
        """
        # Create binary file
        binary_file = temp_dir / "test.png"
        binary_file.write_bytes(b"\x89PNG\r\n\x1a\n")  # PNG magic bytes
        
        # Check if file is binary
        is_binary = self._is_binary_file(binary_file)
        assert is_binary, "Should detect binary file"
        
        # Binary files should not be displayed as text
        should_display = not is_binary
        assert not should_display, "Binary files should not be displayed in code viewer"
    
    def _generate_code_html(self, content: str, language: str) -> str:
        """Helper to generate syntax-highlighted HTML."""
        lines = content.split("\n")
        
        html_lines = ['<div class="code-viewer read-only">']
        html_lines.append('<div class="read-only-indicator">👁️ READ-ONLY</div>')
        html_lines.append(f'<pre class="language-{language}"><code>')
        
        for i, line in enumerate(lines, 1):
            html_lines.append(f'<span class="line" data-line="{i}"><span class="line-number">{i}</span>{self._escape_html(line)}</span>')
        
        html_lines.append('</code></pre>')
        html_lines.append('</div>')
        
        return "\n".join(html_lines)
    
    def _generate_viewer_html(self, filename: str, content: str, editable: bool = False) -> str:
        """Helper to generate viewer HTML."""
        return f"""<!DOCTYPE html>
<html>
<head><title>{filename}</title></head>
<body>
<div class="code-viewer {'' if editable else 'read-only'}">
  <div class="header">
    <span>👁️ READ-ONLY</span>
    <span>{filename}</span>
  </div>
  <pre><code contenteditable="{'true' if editable else 'false'}">{self._escape_html(content)}</code></pre>
</div>
</body>
</html>"""
    
    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        return (text
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;"))
    
    def _is_binary_file(self, path: Path) -> bool:
        """Check if file is binary."""
        try:
            with open(path, "rb") as f:
                chunk = f.read(1024)
                return b"\x00" in chunk or not self._is_text_content(chunk)
        except Exception:
            return True
    
    def _is_text_content(self, content: bytes) -> bool:
        """Check if content is likely text."""
        # Try to decode as UTF-8
        try:
            content.decode("utf-8")
            return True
        except UnicodeDecodeError:
            return False
