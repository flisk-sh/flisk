#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Simple template engine for IDE components
"""

import re
from pathlib import Path


class TemplateEngine:
    """Simple template engine with variable substitution"""
    
    @staticmethod
    def render(template: str, **kwargs) -> str:
        """
        Render a template with variable substitution
        
        Args:
            template: Template string with {variable} placeholders
            **kwargs: Variables to substitute
        
        Returns:
            Rendered string
        """
        result = template
        for key, value in kwargs.items():
            placeholder = '{' + key + '}'
            result = result.replace(placeholder, str(value))
        return result
    
    @staticmethod
    def render_file(template_path: Path, **kwargs) -> str:
        """
        Load template from file and render
        
        Args:
            template_path: Path to template file
            **kwargs: Variables to substitute
        
        Returns:
            Rendered string
        """
        try:
            with open(template_path, 'r', encoding='utf-8') as f:
                template = f.read()
            return TemplateEngine.render(template, **kwargs)
        except Exception as e:
            return f"<!-- Template error: {e} -->"
    
    @staticmethod
    def render_conditional(template: str, conditions: dict) -> str:
        """
        Render template with conditional blocks
        
        Syntax:
            {{if condition}}content{{endif}}
        
        Args:
            template: Template with conditionals
            conditions: Dict of condition names to boolean values
        
        Returns:
            Rendered string with conditionals evaluated
        """
        result = template
        
        # Process each condition
        for condition_name, condition_value in conditions.items():
            pattern = rf'{{{{if {condition_name}}}}(.*?){{{{endif}}}}'
            
            if condition_value:
                # Keep content, remove tags
                result = re.sub(pattern, r'\1', result, flags=re.DOTALL)
            else:
                # Remove entire block
                result = re.sub(pattern, '', result, flags=re.DOTALL)
        
        return result
    
    @staticmethod
    def render_loop(template: str, items: list, item_template: str) -> str:
        """
        Render template with a loop
        
        Args:
            template: Main template with {items} placeholder
            items: List of dicts with item data
            item_template: Template for each item
        
        Returns:
            Rendered string
        """
        rendered_items = []
        for item in items:
            rendered = TemplateEngine.render(item_template, **item)
            rendered_items.append(rendered)
        
        return template.replace('{items}', ''.join(rendered_items))


if __name__ == '__main__':
    # Test basic rendering
    template = "Hello, {name}! Welcome to {place}."
    result = TemplateEngine.render(template, name="World", place="Tilt IDE")
    print(f"Basic: {result}")
    
    # Test conditionals
    conditional_template = "{{if show_greeting}}Hello!{{endif}} {{if show_name}}{name}{{endif}}"
    result = TemplateEngine.render_conditional(
        conditional_template,
        {'show_greeting': True, 'show_name': False}
    )
    print(f"Conditional: {result}")
    
    # Test loop
    loop_template = "<ul>{items}</ul>"
    item_template = "<li>{name}: {value}</li>"
    items = [
        {'name': 'File Browser', 'value': 'Port 9765'},
        {'name': 'Code Viewer', 'value': 'Port 9766'},
    ]
    result = TemplateEngine.render_loop(loop_template, items, item_template)
    print(f"Loop: {result}")
