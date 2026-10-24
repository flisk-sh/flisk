#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Tilt IDE Code Viewer
Serves syntax-highlighted code viewing at http://localhost:9766
"""

import re
import sys
import urllib.parse
from pathlib import Path

# Add shared modules
sys.path.insert(0, str(Path(__file__).parent.parent / 'shared'))
from file_utils import FileUtils, PROJECT_ROOT
from http_utils import BaseIDEHandler, run_server

PORT = 9766


class CodeViewerHandler(BaseIDEHandler):
    """HTTP request handler for code viewer"""
    
    def simple_highlight(self, code: str, language: str) -> str:
        """Simple syntax highlighting using regex"""
        # Escape HTML first
        code = self.escape_html(code)
        
        # Keywords (common across languages)
        keywords = [
            'import', 'from', 'export', 'default', 'const', 'let', 'var', 'function',
            'class', 'interface', 'type', 'return', 'if', 'else', 'for', 'while',
            'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'async',
            'await', 'new', 'this', 'super', 'extends', 'implements', 'static',
            'public', 'private', 'protected', 'package', 'def', 'load', 'struct',
            'struct', 'load', 'if', 'else', 'for', 'in', 'return', 'def', 'True', 'False',
        ]
        
        # Highlight keywords
        for kw in keywords:
            pattern = rf'\b({kw})\b'
            code = re.sub(pattern, r'<span class="syntax-keyword">\1</span>', code)
        
        # Strings
        code = re.sub(r'(".*?")', r'<span class="syntax-string">\1</span>', code)
        code = re.sub(r"('.*?')", r'<span class="syntax-string">\1</span>', code)
        code = re.sub(r'(`[\s\S]*?`)', r'<span class="syntax-string">\1</span>', code)
        
        # Comments
        code = re.sub(r'(//.*$)', r'<span class="syntax-comment">\1</span>', code, flags=re.MULTILINE)
        code = re.sub(r'(#.*$)', r'<span class="syntax-comment">\1</span>', code, flags=re.MULTILINE)
        
        # Numbers
        code = re.sub(r'\b(\d+)\b', r'<span class="syntax-number">\1</span>', code)
        
        return code
    
    def render_code_with_line_numbers(self, code: str, language: str) -> str:
        """Render code with line numbers"""
        lines = code.split('\n')
        highlighted = self.simple_highlight(code, language)
        highlighted_lines = highlighted.split('\n')
        
        html = ['<table style="width:100%; border-collapse: collapse;">']
        html.append('<tr>')
        
        # Line numbers column
        html.append('<td class="line-numbers" style="vertical-align: top; padding-right: 1rem; width: 50px;">')
        for i in range(1, len(lines) + 1):
            html.append(f'<div>{i}</div>')
        html.append('</td>')
        
        # Code column
        html.append('<td style="vertical-align: top;">')
        html.append('<pre style="margin: 0;"><code>')
        for line in highlighted_lines:
            html.append(f'<div>{line or "&nbsp;"}</div>')
        html.append('</code></pre>')
        html.append('</td>')
        
        html.append('</tr>')
        html.append('</table>')
        
        return ''.join(html)
    
    def _get_template_path(self) -> Path:
        """Override to use shared template"""
        return Path(__file__).parent.parent / 'shared' / 'templates' / 'base.html'
    
    def do_GET(self):
        """Handle GET requests"""
        import json
        
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)
        
        # Health check
        if path == '/health':
            self.handle_health_check('code-viewer')
            return
        
        # Static files
        if path.startswith('/static/'):
            static_path = Path(__file__).parent.parent / 'shared' / path[1:]
            if static_path.exists():
                with open(static_path, 'r') as f:
                    content = f.read()
                self.send_css_response(content)
            else:
                self.send_error_response(404, 'Not found')
            return
        
        # View file
        if path == '/view' or path == '/':
            file_path = query.get('file', [''])[0]
            
            if not file_path:
                # Show welcome/empty state
                content = '''
                    <div class="empty-state">
                        <div class="empty-state-icon">👁️</div>
                        <h2>Code Viewer</h2>
                        <p>Open a file from the <a href="http://localhost:9765">File Browser</a> to view its contents.</p>
                        <p class="text-muted">Supports TypeScript, JavaScript, Starlark, JSON, YAML, and more.</p>
                    </div>
                '''
                self.send_html_response(self.render_page('Code Viewer', content, icon='👁️'))
                return
            
            # Read file
            content, error = FileUtils.read_file_safe(file_path)
            
            if error:
                error_content = f'''
                    <div class="code-container">
                        <div class="code-header">
                            <div class="code-header-left">
                                <span class="file-path">{self.escape_html(file_path)}</span>
                            </div>
                        </div>
                        <div class="code-content">
                            <div class="empty-state">
                                <div class="empty-state-icon">⚠️</div>
                                <p>{self.escape_html(error)}</p>
                                <p class="text-muted"><a href="http://localhost:9765">← Back to File Browser</a></p>
                            </div>
                        </div>
                    </div>
                '''
                self.send_html_response(self.render_page('Error', error_content, icon='⚠️'), 404)
                return
            
            # Get file info
            resolved = FileUtils.validate_path(file_path)
            file_info = FileUtils.get_file_info(resolved) if resolved else {'name': file_path, 'size_str': 'Unknown'}
            
            # Determine language
            ext = Path(file_path).suffix.lower()
            language = FileUtils.get_language_from_ext(ext)
            
            # Render code
            code_html = self.render_code_with_line_numbers(content, language)
            
            page_content = f'''
                <div class="code-container">
                    <div class="code-header">
                        <div class="code-header-left">
                            <span class="file-path">{self.escape_html(file_path)}</span>
                            <span class="read-only-badge">👁️ READ-ONLY</span>
                        </div>
                        <div>
                            <span class="text-muted">{file_info['size_str']} • {file_info['modified']}</span>
                        </div>
                    </div>
                    <div class="code-content">
                        {code_html}
                    </div>
                </div>
                <div style="margin-top: 1rem; text-align: center;">
                    <a href="http://localhost:9765/browse?path={urllib.parse.quote(str(Path(file_path).parent))}" class="text-muted">← Back to directory</a>
                </div>
            '''
            
            self.send_html_response(self.render_page(f"{file_info['name']}", page_content, icon='👁️'))
            return
        
        # 404
        self.send_html_response(self.render_page(
            'Not Found',
            '<div class="empty-state"><div class="empty-state-icon">❓</div>Page not found</div>',
            icon='❓'
        ), 404)


def main():
    """Run the code viewer server"""
    run_server(
        CodeViewerHandler,
        PORT,
        '👁️  Tilt IDE Code Viewer',
        '📄 Open files from the file browser to view with syntax highlighting'
    )


if __name__ == '__main__':
    main()
