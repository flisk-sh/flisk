# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# 📊 TILT SDK - OUTPUT UTILITIES
# =============================================================================


def print_resource_summary(infra_services, app_resources, should_enable_fn):
    """Print summary of enabled services and estimated memory usage."""
    enabled_services = []
    estimated_memory = 0

    for s in infra_services:
        if should_enable_fn(s['name']):
            enabled_services.append(s['name'])
            svc_memory = s.get('memory')
            if svc_memory != None:
                estimated_memory += svc_memory
            else:
                estimated_memory += 512  # Default 512MB

    for s in app_resources:
        if should_enable_fn(s['name']):
            enabled_services.append(s['name'])
            svc_memory = s.get('memory')
            if svc_memory != None:
                estimated_memory += svc_memory
            else:
                estimated_memory += 512  # Default 512MB

    print("\n📊 Resource Summary:")
    print("  🔧 Enabled services: " + str(len(enabled_services)))
    print("  💾 Estimated memory: ~" + str(estimated_memory) + "MB")

    if estimated_memory > 4096:
        print("  ⚠️  WARNING: High memory usage (consider `tilt down && tilt up --focus <domain>`)")
    elif estimated_memory > 2048:
        print("  ⚡ MODERATE: Memory usage moderate (use `--focus` to reduce)")
    else:
        print("  ✅ OPTIMAL: Memory usage optimized")

    return enabled_services


def get_template_header(file_type, generator_name, resource_name='', extra_info=''):
    """
    Generate a standardized "DO NOT EDIT" header for auto-generated files.
    """
    is_ts_or_js = (
        file_type.endswith('.ts') or
        file_type.endswith('.tsx') or
        file_type.endswith('.js') or
        file_type.endswith('.jsx') or
        file_type.endswith('.mjs') or
        file_type.endswith('.mts')
    )
    is_css = file_type.endswith('.css') or file_type.endswith('.scss')
    is_nginx = file_type.endswith('.conf') or file_type == 'nginx'

    if is_ts_or_js or file_type in ['vite', 'tsconfig', 'typescript', 'javascript']:
        border = '/' * 79
        comment_start = '//'
    elif is_css:
        border = '/' + '*' * 77 + '/'
        comment_start = ' *'
    elif is_nginx or file_type in ['dockerfile', 'compose', 'env', 'shell', 'npmrc', 'bunfig']:
        border = '#' * 79
        comment_start = '#'
    else:
        border = '#' * 79
        comment_start = '#'

    resource_line = ''
    if resource_name:
        resource_line = '\n{c} Service: {s}'.format(c=comment_start, s=resource_name)

    extra_line = ''
    if extra_info:
        extra_line = '\n{c} Type: {e}'.format(c=comment_start, e=extra_info)

    header = """{border}
{c} 🛑 CRITICAL: SYSTEM-GENERATED FILE - DO NOT MODIFY DIRECTLY
{c}
{c} ANY MANUAL CHANGES MADE TO THIS FILE WILL BE WIPED ON THE NEXT 'tilt up'.
{c} TO MODIFY THIS CONFIGURATION:
{c} 1. Edit the source generator in: .tilt/topologies/
{c} 2. Or update service.json
{c}
{c} Generation Source: {generator}{resource_line}{extra_line}
{border}
""".format(
        border=border,
        c=comment_start,
        generator=generator_name,
        resource_line=resource_line,
        extra_line=extra_line,
    )

    return header
