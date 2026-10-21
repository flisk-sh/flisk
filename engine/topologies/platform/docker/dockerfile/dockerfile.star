# Copyright (c) 2026 Flisk Landscape contributors
# SPDX-License-Identifier: MIT
# Dockerfile generation exports
# === INLINED CONSTANTS for pure extension loading ===
BASE_PORT_FRONTEND = 3000
BASE_PORT_BACKEND = 4000
# === END INLINED CONSTANTS ===


load('../generators/golden_docker_generator_v2.star', 'L4_generate_orchestrator')


def generate_frontend_dockerfile(res_path, resource_name, port=BASE_PORT_FRONTEND, target_path='/app/dist', build_cmd='bun run build', cmd='bun run start', use_nginx=False, use_infisical=False, use_shared_libs=True, use_prisma=False, use_golden=True, manifest=None):
    """Generate Dockerfile for frontend services."""
    return L4_generate_orchestrator(
        res_path=res_path,
        res_type='frontend',
        resource_name=resource_name,
        use_nginx=use_nginx,
        port=port,
        target_path=target_path,
        build_cmd=build_cmd,
        cmd=cmd,
        use_infisical=use_infisical,
        use_shared_libs=use_shared_libs,
        use_prisma=use_prisma,
        use_golden=use_golden,
        manifest=manifest,
    )

def generate_app_dockerfile(res_path, resource_name, port=BASE_PORT_BACKEND, build_cmd='bun run build', cmd='bun run start', use_infisical=False, use_shared_libs=True, use_prisma=True, use_golden=True, manifest=None):
    """Generate Dockerfile for backend/app services."""
    return L4_generate_orchestrator(
        res_path=res_path,
        res_type='backend',
        resource_name=resource_name,
        port=port,
        build_cmd=build_cmd,
        cmd=cmd,
        use_infisical=use_infisical,
        use_shared_libs=use_shared_libs,
        use_prisma=use_prisma,
        use_golden=use_golden,
        manifest=manifest,
    )

def generate_migrator_dockerfile(res_path, resource_name, use_infisical=False, use_golden=True, manifest=None):
    """Generate Dockerfile for database migrator services."""
    return L4_generate_orchestrator(
        res_path=res_path,
        res_type='migrator',
        resource_name=resource_name,
        use_infisical=use_infisical,
        use_golden=use_golden,
        manifest=manifest,
    )
