# Copyright (c) 2026 Flisk contributors
# SPDX-License-Identifier: MIT
# =============================================================================
# ⚡ TILT SDK - VITE PROVIDER TEMPLATES
# =============================================================================
# Path: .tilt/providers/vite/templates.star
# Purpose: Vite config templates used by generators
# =============================================================================

# Load npm scope from project.json (or use project name as default)
# Use TDK_PROJECT_ROOT env var set by Tilt, fallback to current directory
def _load_npm_scope():
    project_root = os.environ.get('TDK_PROJECT_ROOT', '')
    project_json_path = '.tdk/project.json'
    if project_root:
        project_json_path = project_root + '/' + project_json_path
    
    if os.path.exists(project_json_path):
        _project_json = read_json(project_json_path)
        return _project_json.get('project', {}).get('name', 'tdk-project')
    return 'tdk-project'

_NPM_SCOPE = _load_npm_scope()

def _with_npm_scope(template):
    # Fill in the scope here so callers' .format() calls need no extra argument; '{npm_scope}' is not a .format() field afterwards.
    return template.replace('{npm_scope}', _NPM_SCOPE)

TEMPLATE_VITE_BACKEND_WITH_NODE = """{header}
import path from 'node:path';
import {{ VitePluginNode }} from 'vite-plugin-node';
import {{ defineConfig }} from 'vitest/config';

export default defineConfig({{
  plugins: [
    ...VitePluginNode({{
      adapter: 'express',
      appPath: '{entry_point}',
      exportName: 'app',
      tsCompiler: 'swc',
    }}),
  ],
  resolve: {{
    alias: {{
{path_aliases}
    }},
  }},
  server: {{
    port: {port},
  }},
  build: {{
    ssr: true,
    target: 'node20',
    rollupOptions: {{
      external: {externals_config},
    }},
  }},
  test: {{
    coverage: {{
      all: true,
      exclude: [
        'node_modules/**',
        'dist/**',
        'docs/**',
        'src/tests/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/test-*.ts',
        'prisma/**',
        '**/*.config.{{ts,js}}',
        '**/coverage/**',
      ],
      include: ['src/**/*.{{ts,js}}'],
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {{
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      }},
    }},
    deps: {{
      inline: [{vitest_inline_deps}],
    }},
    environment: 'node',
    exclude: ['node_modules', 'dist', 'docs/node_modules', '**/tests/e2e/**'],
    globals: true,
    include: ['src/**/*.{{spec,test}}.{{ts,js}}'],
  }},
}});
"""

TEMPLATE_VITE_BACKEND_VITEST_ONLY = """{header}
import path from 'node:path';
import {{ defineConfig }} from 'vitest/config';

export default defineConfig({{
  resolve: {{
    alias: {{
{path_aliases}
    }},
  }},
  test: {{
    coverage: {{
      all: true,
      exclude: [
        'node_modules/**',
        'dist/**',
        'docs/**',
        'src/tests/**',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.d.ts',
        'src/test-*.ts',
        'prisma/**',
        '**/*.config.{{ts,js}}',
        '**/coverage/**',
      ],
      include: ['src/**/*.{{ts,js}}'],
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {{
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      }},
    }},
    deps: {{
      inline: [{vitest_inline_deps}],
    }},
    environment: 'node',
    exclude: ['node_modules', 'dist', 'docs/node_modules', '**/tests/e2e/**'],
    globals: true,
    include: ['src/**/*.{{spec,test}}.{{ts,js}}'],
  }},
}});
"""

TEMPLATE_VITE_LIBRARY = _with_npm_scope("""{header}
import {{ resolve }} from 'node:path';
{plugin_imports}
import {{ defineConfig }} from 'vitest/config';

export default defineConfig({{
  mode: 'production',
  define: {{
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
  }},
  esbuild: {{
    jsx: 'automatic',
    jsxDev: false,
    jsxImportSource: 'react',
  }},
  plugins: [{plugins_str}],
  build: {{
    lib: {{
      entry: resolve(__dirname, '../src/index.ts'),
      name: '{lib_name}',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${{format === 'es' ? 'mjs' : 'cjs'}}`,
    }},
    // Disable code splitting to prevent lazy chunks with CJS require() calls
    codeSplitting: false,
    rollupOptions: {{
      external: [
        /^node:.*/,
        /^@{npm_scope}\\/.*$/,
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
        'react-is',
        'zod',
        'hono',
        'nats',
        /^@mantine\\//,
        /^@tabler\\//,
        'framer-motion',
        'lucide-react',
        'date-fns',
        'date-fns-tz',
        'dayjs',
        'clsx',
        'class-variance-authority',
        'tailwind-merge',
        '@tanstack/react-table',
        '@tanstack/react-query',
        '@hookform/resolvers',
        'react-hook-form',
        'react-day-picker',
        'react-resizable-panels',
        'react-remove-scroll',
        'react-textarea-autosize',
        'react-number-format',
        'embla-carousel-react',
        'recharts',
        'sonner',
        'next-themes',
        '@glideapps/glide-data-grid',
      ],
      output: {{
        globals: {{
          react: 'React',
          'react-dom': 'ReactDOM',
        }},
      }},
    }},
    sourcemap: true,
    target: 'esnext',
  }},
  resolve: {{
    alias: {{
      '@': resolve(__dirname, '../src'),
      // Force production JSX runtime - alias dev runtime to production runtime
      'react/jsx-dev-runtime': 'react/jsx-runtime',
    }},
  }},
  test: {{
    environment: 'node',
    exclude: ['node_modules', 'dist'],
    globals: true,
    include: ['src/**/*.{{test,spec}}.{{ts,tsx}}'],
  }},
}});
""")

TEMPLATE_VITE_SDK = """{header}
import {{ federation }} from '@module-federation/vite';
import react from '@vitejs/plugin-react';
import {{ defineConfig }} from 'vite';

export default defineConfig({{
  build: {{
    cssCodeSplit: false,
    minify: false,
    modulePreload: false,
    target: 'esnext',
  }},
  plugins: [
    react(),
    federation({{
      name: '{federation_name}',
      filename: 'remoteEntry.js',
      exposes: {{
{exposes_str}
      }},
      shared: {{
{shared_str}
      }},
    }}),
  ],
  server: {{
    host: true,
    port: {port},
  }},
}});
"""

# =============================================================================
# Environment-Specific Library Templates
# =============================================================================

TEMPLATE_VITE_LIBRARY_DEV = _with_npm_scope("""{header}
import {{ resolve }} from 'node:path';
{plugin_imports}
import {{ defineConfig }} from 'vitest/config';

export default defineConfig({{
  mode: 'development',
  define: {{
    __DEV__: 'true',
    'process.env.NODE_ENV': '"development"',
  }},
  plugins: [{plugins_str}],
  build: {{
    lib: {{
      entry: resolve(__dirname, '../src/index.ts'),
      name: '{lib_name}',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${{format === 'es' ? 'mjs' : 'cjs'}}`,
    }},
    codeSplitting: false,
    rollupOptions: {{
      external: [
        /^node:.*/,
        /^@{npm_scope}\\/.*$/,
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
        'react-is',
        'zod',
        'hono',
        'nats',
        /^@mantine\\//,
        /^@tabler\\//,
        'framer-motion',
        'lucide-react',
        'date-fns',
        'date-fns-tz',
        'dayjs',
        'clsx',
        'class-variance-authority',
        'tailwind-merge',
        '@tanstack/react-table',
        '@tanstack/react-query',
        '@hookform/resolvers',
        'react-hook-form',
        'react-day-picker',
        'react-resizable-panels',
        'react-remove-scroll',
        'react-textarea-autosize',
        'react-number-format',
        'embla-carousel-react',
        'recharts',
        'sonner',
        'next-themes',
        '@glideapps/glide-data-grid',
      ],
      output: {{
        globals: {{
          react: 'React',
          'react-dom': 'ReactDOM',
        }},
      }},
    }},
    sourcemap: true,
    target: 'esnext',
  }},
  resolve: {{
    alias: {{
      '@': resolve(__dirname, '../src'),
    }},
  }},
  test: {{
    environment: 'node',
    exclude: ['node_modules', 'dist'],
    globals: true,
    include: ['src/**/*.{{test,spec}}.{{ts,tsx}}'],
  }},
}});
""")

TEMPLATE_VITE_LIBRARY_PROD = _with_npm_scope("""{header}
import {{ resolve }} from 'node:path';
{plugin_imports}
import {{ defineConfig }} from 'vitest/config';

export default defineConfig({{
  mode: 'production',
  define: {{
    __DEV__: 'false',
    'process.env.NODE_ENV': '"production"',
  }},
  esbuild: {{
    jsx: 'automatic',
    jsxDev: false,
    jsxImportSource: 'react',
  }},
  plugins: [{plugins_str}],
  build: {{
    lib: {{
      entry: resolve(__dirname, '../src/index.ts'),
      name: '{lib_name}',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${{format === 'es' ? 'mjs' : 'cjs'}}`,
    }},
    codeSplitting: false,
    minify: true,
    rollupOptions: {{
      external: [
        /^node:.*/,
        /^@{npm_scope}\\/.*$/,
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom/client',
        'react-is',
        'zod',
        'hono',
        'nats',
        /^@mantine\\//,
        /^@tabler\\//,
        'framer-motion',
        'lucide-react',
        'date-fns',
        'date-fns-tz',
        'dayjs',
        'clsx',
        'class-variance-authority',
        'tailwind-merge',
        '@tanstack/react-table',
        '@tanstack/react-query',
        '@hookform/resolvers',
        'react-hook-form',
        'react-day-picker',
        'react-resizable-panels',
        'react-remove-scroll',
        'react-textarea-autosize',
        'react-number-format',
        'embla-carousel-react',
        'recharts',
        'sonner',
        'next-themes',
        '@glideapps/glide-data-grid',
      ],
      output: {{
        globals: {{
          react: 'React',
          'react-dom': 'ReactDOM',
        }},
      }},
    }},
    sourcemap: true,
    target: 'esnext',
  }},
  resolve: {{
    alias: {{
      '@': resolve(__dirname, '../src'),
      'react/jsx-dev-runtime': 'react/jsx-runtime',
    }},
  }},
  test: {{
    environment: 'node',
    exclude: ['node_modules', 'dist'],
    globals: true,
    include: ['src/**/*.{{test,spec}}.{{ts,tsx}}'],
  }},
}});
""")

# =============================================================================
# Template Generation Functions
# =============================================================================

def get_library_template(environment = 'production'):
    """
    Get the appropriate library template based on environment.
    
    Args:
        environment: 'development', 'production', or 'dev'/'prod' shortcuts
    
    Returns:
        Template string for the specified environment
    """
    env = environment.lower()
    if env in ['development', 'dev']:
        return TEMPLATE_VITE_LIBRARY_DEV
    elif env in ['production', 'prod']:
        return TEMPLATE_VITE_LIBRARY_PROD
    else:
        # Default to production for safety
        return TEMPLATE_VITE_LIBRARY_PROD
