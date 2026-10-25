#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Shared HTTP handler utilities for Tilt IDE components.
Provides a base handler class with common HTTP functionality.
"""

import json
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from typing import Optional


class BaseIDEHandler(BaseHTTPRequestHandler):
    """
    Base HTTP handler for Tilt IDE components.
    
    Provides common functionality:
    - JSON/HTML response helpers
    - HTML escaping for XSS prevention
    - Page rendering with shared template
    - Suppressed logging
    """
    
    # Shared template fallback (used when base.html is not found)
    DEFAULT_TEMPLATE = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <header class="header">
        <h1>{icon} {title}</h1>
        {controls}
    </header>
    <div class="container">
        {sidebar}
        <main class="content">{content}</main>
    </div>
    {scripts}
</body>
</html>'''
    
    def log_message(self, format, *args):
        """Suppress default request logging."""
        pass
    
    def send_json_response(self, data: dict, status: int = 200) -> None:
        """
        Send a JSON response with CORS headers.
        
        Args:
            data: Response data to serialize as JSON
            status: HTTP status code (default: 200)
        """
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def send_html_response(self, html: str, status: int = 200) -> None:
        """
        Send an HTML response with CORS headers.
        
        Args:
            html: HTML content to send
            status: HTTP status code (default: 200)
        """
        self.send_response(status)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(html.encode())
    
    def send_css_response(self, css: str) -> None:
        """
        Send a CSS response.
        
        Args:
            css: CSS content to send
        """
        self.send_response(200)
        self.send_header('Content-Type', 'text/css')
        self.end_headers()
        self.wfile.write(css.encode())
    
    def send_error_response(self, status: int, message: str) -> None:
        """
        Send an error response.
        
        Args:
            status: HTTP status code
            message: Error message
        """
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain')
        self.end_headers()
        self.wfile.write(message.encode())
    
    @staticmethod
    def escape_html(text: str) -> str:
        """
        Escape HTML special characters to prevent XSS attacks.
        
        Args:
            text: Raw text to escape
            
        Returns:
            Escaped text safe for HTML insertion
        """
        return (text
                .replace('&', '&amp;')
                .replace('<', '&lt;')
                .replace('>', '&gt;')
                .replace('"', '&quot;')
                .replace("'", '&#x27;'))
    
    def render_page(
        self,
        title: str,
        content: str,
        icon: str = '📄',
        sidebar: str = '',
        controls: str = '',
        scripts: str = ''
    ) -> str:
        """
        Render a full HTML page using the base template.
        
        Args:
            title: Page title
            content: Main content HTML
            icon: Emoji icon for the page header
            sidebar: Sidebar HTML (optional)
            controls: Header controls HTML (optional)
            scripts: Scripts to include before </body> (optional)
            
        Returns:
            Complete HTML page as string
        """
        # Try to load template from file
        template = self._load_template()
        
        # Build sidebar wrapper if content provided
        sidebar_html = f'<aside class="sidebar">{sidebar}</aside>' if sidebar else ''
        
        # Use string replacement to avoid conflicts with JS braces
        result = template.replace('{title}', self.escape_html(title))
        result = result.replace('{icon}', icon)
        result = result.replace('{favicon}', icon)
        result = result.replace('{controls}', controls)
        result = result.replace('{sidebar}', sidebar_html)
        result = result.replace('{content}', content)
        result = result.replace('{scripts}', scripts)
        
        return result
    
    def _load_template(self) -> str:
        """Load base template from file or return default."""
        try:
            template_path = self._get_template_path()
            if template_path and template_path.exists():
                with open(template_path, 'r', encoding='utf-8') as f:
                    return f.read()
        except Exception:
            pass
        return self.DEFAULT_TEMPLATE
    
    def _get_template_path(self) -> Optional[Path]:
        """Get path to base template. Override in subclasses if needed."""
        # Default: look in shared/templates/ relative to this file
        shared_dir = Path(__file__).parent
        return shared_dir / 'templates' / 'base.html'
    
    def handle_health_check(self, service_name: str, features: Optional[list] = None) -> None:
        """
        Handle a standard health check request.
        
        Args:
            service_name: Name of the service for the response
            features: Optional list of service features/capabilities
        """
        response = {
            'status': 'ok',
            'service': service_name
        }
        if features:
            response['features'] = features
        self.send_json_response(response)


def run_server(server_class, port: int, service_name: str, service_description: str) -> None:
    """
    Run an HTTP server with standard configuration.
    
    Args:
        server_class: The HTTP handler class to use
        port: Port number to listen on
        service_name: Name of the service for startup message
        service_description: Brief description of the service
    """
    from http.server import HTTPServer
    
    server = HTTPServer(('127.0.0.1', port), server_class)
    print(f"{service_name} running at http://localhost:{port}")
    if service_description:
        print(f"   {service_description}")
    
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down...")
        server.shutdown()


# Backwards compatibility: standalone functions that delegate to class methods
def send_json_response(handler: BaseHTTPRequestHandler, data: dict, status: int = 200) -> None:
    """Standalone function for sending JSON responses (legacy compatibility)."""
    BaseIDEHandler.send_json_response(handler, data, status)


def send_html_response(handler: BaseHTTPRequestHandler, html: str, status: int = 200) -> None:
    """Standalone function for sending HTML responses (legacy compatibility)."""
    BaseIDEHandler.send_html_response(handler, html, status)


def escape_html(text: str) -> str:
    """Standalone function for HTML escaping (legacy compatibility)."""
    return BaseIDEHandler.escape_html(text)
