// Copyright (c) 2026 Flisk Landscape contributors
// SPDX-License-Identifier: MIT
import type { BackendFrameworkProvider } from "./types.js";

export function getNestIndexTemplate(name: string) {
  return `import 'reflect-metadata';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Controller()
class AppController {
  // Health check endpoint (required by TILT_RESOURCE_DEFAULTS.star)
  @Get('health')
  health() {
    return { status: 'ok', service: '${name}' };
  }

  @Get('health/live')
  live() {
    return { status: 'alive', timestamp: Date.now() };
  }

  @Get()
  root() {
    return { service: '${name}', version: '1.0.0', endpoints: ['/health', '/health/live'] };
  }
}

@Module({ controllers: [AppController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const port = Number(process.env.PORT || 3000);

  // Bind beyond loopback: Traefik reaches the container over the Docker network.
  await app.listen(port, '0.0.0.0');
  console.log('\\n🚀 ${name} running on http://localhost:' + port);
  console.log('📊 Health check: http://localhost:' + port + '/health\\n');
}

bootstrap();
`;
}

export const nestBackendProvider: BackendFrameworkProvider = {
  id: "nestjs",
  label: "Bun + NestJS",
  dependencies: {
    "@nestjs/common": "^11.0.0",
    "@nestjs/core": "^11.0.0",
    "@nestjs/platform-express": "^11.0.0",
    "reflect-metadata": "^0.2.2",
    rxjs: "^7.8.1",
  },
  devDependencies: {},
  // Nest's decorators need these; the engine's generated Docker tsconfig already sets them.
  compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true },
  createIndex: getNestIndexTemplate,
};
