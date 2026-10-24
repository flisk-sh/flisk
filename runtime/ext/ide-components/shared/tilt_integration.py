#!/usr/bin/env python3
# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
"""
Tilt integration utilities for IDE components
"""

import subprocess
import json

from file_utils import PROJECT_ROOT


class TiltIntegration:
    """Utilities for calling Tilt commands from Python"""
    
    @staticmethod
    def trigger_resource(resource_name: str) -> dict:
        """
        Trigger a Tilt resource (e.g., config-gen for a service)
        
        Returns: {'success': bool, 'output': str, 'error': str}
        """
        try:
            result = subprocess.run(
                ['tilt', 'trigger', resource_name],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            return {
                'success': result.returncode == 0,
                'output': result.stdout,
                'error': result.stderr if result.returncode != 0 else None
            }
        except subprocess.TimeoutExpired:
            return {'success': False, 'output': '', 'error': 'Command timed out'}
        except FileNotFoundError:
            return {'success': False, 'output': '', 'error': 'tilt command not found. Is Tilt installed?'}
        except Exception as e:
            return {'success': False, 'output': '', 'error': str(e)}
    
    @staticmethod
    def get_resources() -> list:
        """
        Get list of all Tilt resources
        
        Returns: List of resource names
        """
        try:
            result = subprocess.run(
                ['tilt', 'get', 'uiresources', '-o', 'json'],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return []
            
            data = json.loads(result.stdout)
            resources = []
            
            for item in data.get('items', []):
                name = item.get('metadata', {}).get('name', '')
                if name:
                    resources.append(name)
            
            return resources
        except Exception:
            return []
    
    @staticmethod
    def get_resource_status(resource_name: str) -> dict:
        """
        Get status of a specific Tilt resource
        
        Returns: {'exists': bool, 'status': str, 'error': str}
        """
        try:
            result = subprocess.run(
                ['tilt', 'get', 'uiresources', resource_name, '-o', 'json'],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return {'exists': False, 'status': 'unknown', 'error': result.stderr}
            
            data = json.loads(result.stdout)
            status = data.get('status', {}).get('runtimeStatus', 'unknown')
            
            return {'exists': True, 'status': status, 'error': None}
        except Exception as e:
            return {'exists': False, 'status': 'unknown', 'error': str(e)}
    
    @staticmethod
    def regenerate_resource_configs(resource_name: str) -> dict:
        """
        Trigger config regeneration for a service
        
        Tries common config-gen resource naming patterns:
        - <service>-config-gen
        - <service>-yaml
        
        Returns: {'success': bool, 'message': str}
        """
        # Try different resource name patterns
        patterns = [
            f'{resource_name}-config-gen',
            f'{resource_name}-yaml',
            f'{resource_name}-config',
        ]
        
        for pattern in patterns:
            result = TiltIntegration.trigger_resource(pattern)
            if result['success']:
                return {
                    'success': True,
                    'message': f'Regenerated configs for {resource_name} via {pattern}'
                }
        
        return {
            'success': False,
            'message': f'Could not find config-gen resource for {resource_name}. Tried: {", ".join(patterns)}'
        }
    
    @staticmethod
    def is_tilt_running() -> bool:
        """Check if Tilt is currently running"""
        try:
            result = subprocess.run(
                ['tilt', 'status'],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=5
            )
            return result.returncode == 0
        except Exception:
            return False


if __name__ == '__main__':
    # Test
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Tilt running: {TiltIntegration.is_tilt_running()}")
    
    resources = TiltIntegration.get_resources()
    print(f"Found {len(resources)} resources")
    
    # Show first 5
    for name in resources[:5]:
        status = TiltIntegration.get_resource_status(name)
        print(f"  - {name}: {status['status']}")
