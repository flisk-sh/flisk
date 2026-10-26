#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Syntax highlighting utilities using Pygments
"""

import sys
from pathlib import Path

# Try to import pygments
try:
    from pygments import highlight
    from pygments.lexers import get_lexer_by_name, guess_lexer_for_filename, TextLexer
    from pygments.formatters import HtmlFormatter
    PYGMENTS_AVAILABLE = True
except ImportError:
    PYGMENTS_AVAILABLE = False


class SyntaxHighlighter:
    """Syntax highlighting using Pygments (if available) or fallback"""
    
    @staticmethod
    def highlight_code(code: str, language: str = None, filename: str = None) -> str:
        """
        Highlight code and return HTML
        
        Args:
            code: Source code to highlight
            language: Language name (optional)
            filename: Filename for guessing language (optional)
        
        Returns:
            HTML string with highlighted code
        """
        if not PYGMENTS_AVAILABLE:
            return SyntaxHighlighter._fallback_highlight(code)
        
        try:
            # Try to get lexer by language name
            if language:
                try:
                    lexer = get_lexer_by_name(language)
                except (ValueError, TypeError):
                    lexer = None
            else:
                lexer = None

            # Try to guess from filename
            if not lexer and filename:
                try:
                    lexer = guess_lexer_for_filename(filename, code)
                except (ValueError, TypeError):
                    lexer = None
            
            # Default to text lexer
            if not lexer:
                lexer = TextLexer()
            
            # Create formatter with custom CSS class
            formatter = HtmlFormatter(
                cssclass='syntax-highlighted',
                style='monokai',
                linenos=False,
                wrapcode=True
            )
            
            return highlight(code, lexer, formatter)
            
        except Exception as e:
            return SyntaxHighlighter._fallback_highlight(code)
    
    @staticmethod
    def _fallback_highlight(code: str) -> str:
        """Simple fallback when Pygments is not available"""
        import html
        
        # Escape HTML
        escaped = html.escape(code)
        
        # Wrap in pre/code
        return f'<pre class="syntax-highlighted"><code>{escaped}</code></pre>'
    
    @staticmethod
    def get_styles() -> str:
        """Get CSS styles for syntax highlighting"""
        if not PYGMENTS_AVAILABLE:
            return ''
        
        try:
            from pygments.formatters import HtmlFormatter
            formatter = HtmlFormatter(style='monokai')
            return formatter.get_style_defs('.syntax-highlighted')
        except (ImportError, AttributeError):
            return ''
    
    @staticmethod
    def get_language_from_ext(ext: str) -> str:
        """Map file extension to Pygments language name"""
        mapping = {
            '.py': 'python',
            '.js': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.jsx': 'javascript',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.sh': 'bash',
            '.bash': 'bash',
            '.star': 'python',  # Starlark is Python-like
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
            '.sql': 'sql',
            '.css': 'css',
            '.scss': 'scss',
            '.html': 'html',
            '.xml': 'xml',
            '.dockerfile': 'docker',
            '.prisma': 'sql',  # Close enough
        }
        
        return mapping.get(ext.lower(), 'text')


if __name__ == '__main__':
    print(f"Pygments available: {PYGMENTS_AVAILABLE}")
    
    # Test
    test_code = '''
def hello_world():
    """Say hello"""
    print("Hello, World!")
    return True
'''
    
    result = SyntaxHighlighter.highlight_code(test_code, language='python')
    print("\nHighlighted code:")
    print(result[:500])
