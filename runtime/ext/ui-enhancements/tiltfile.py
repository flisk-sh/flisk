# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Tilt UI Enhancements Extension
# Injects CSS and JavaScript into the Tilt web UI for improved UX.
#
# Usage:
#   load('./ext/ui-enhancements/tiltfile.py', 'load_ui_enhancements')
#   load_ui_enhancements({'enable_tooltips': True, 'enable_icons': True})

def load_ui_enhancements(ctx):
    """
    Load all UI enhancement features.

    Args:
        ctx: Extension context with configuration
    """
    enable_tooltips = ctx.get('enable_tooltips', True)
    enable_icons = ctx.get('enable_icons', True)
    enable_help_panel = ctx.get('enable_help_panel', True)
    enable_cron_jobs_tab = ctx.get('enable_cron_jobs_tab', True)

    # Read CSS and JS files
    css_files = []
    js_files = []

    if enable_tooltips:
        css_files.append(read_file('./ext/ui-enhancements/ui/tooltips.css'))
        js_files.append(read_file('./ext/ui-enhancements/ui/tooltips.js'))

    if enable_icons:
        css_files.append(read_file('./ext/ui-enhancements/ui/icons.css'))
        js_files.append(read_file('./ext/ui-enhancements/ui/icons.js'))

    if enable_help_panel:
        css_files.append(read_file('./ext/ui-enhancements/ui/help-panel.css'))
        js_files.append(read_file('./ext/ui-enhancements/ui/help-panel.js'))

    if enable_cron_jobs_tab:
        css_files.append(read_file('./ext/ui-enhancements/ui/cron-jobs-tab.css'))
        js_files.append(read_file('./ext/ui-enhancements/ui/cron-jobs-tab.js'))

    # Combine all CSS and JS
    # Convert blobs to strings using str()
    css_strings = [str(f) for f in css_files]
    js_strings = [str(f) for f in js_files]
    combined_css = '\n'.join(css_strings)
    combined_js = '\n'.join(js_strings)

    # Encode to base64 to safely pass through shell without variable expansion issues
    import base64
    css_b64 = base64.b64encode(combined_css.encode('utf-8')).decode('ascii')
    js_b64 = base64.b64encode(combined_js.encode('utf-8')).decode('ascii')

    # Create local resource that serves the UI enhancements
    local_resource(
        'ui-enhancements-server',
        serve_cmd='''
            echo "UI Enhancements Server starting on port 10351..."
            python3 -c "
import http.server
import socketserver
import base64

CSS_B64 = ''' + repr(css_b64) + '''
JS_B64 = ''' + repr(js_b64) + '''

CSS = base64.b64decode(CSS_B64).decode('utf-8')
JS = base64.b64decode(JS_B64).decode('utf-8')

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/ui-enhancements.css':
            self.send_response(200)
            self.send_header('Content-Type', 'text/css')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(CSS.encode())
        elif self.path == '/ui-enhancements.js':
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(JS.encode())
        else:
            self.send_response(404)
            self.end_headers()

with socketserver.TCPServer(('', 10351), Handler) as httpd:
    print('UI Enhancements Server running on port 10351')
    httpd.serve_forever()
"
        ''',
        labels=['dev.tools', 'ui-enhancements'],
        auto_init=True,
    )

    print("✨ UI Enhancements Extension loaded")
    print("   - Tooltips: " + ("enabled" if enable_tooltips else "disabled"))
    print("   - Icons: " + ("enabled" if enable_icons else "disabled"))
    print("   - Help Panel: " + ("enabled" if enable_help_panel else "disabled"))
    print("   - Cron Jobs Tab: " + ("enabled" if enable_cron_jobs_tab else "disabled"))
