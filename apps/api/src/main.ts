import 'reflect-metadata';
import './env';
import * as fs from 'node:fs';
import * as path from 'node:path';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { parseTrustProxy } from './common/network';

function resolveWebDist(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
}

(async () => {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET (32+ chars) is required');
  }
  const isProd = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));

  const corsOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const capacitorOrigins =
    process.env.ALLOW_CAPACITOR_ORIGINS === 'false'
      ? []
      : isProd
        ? ['capacitor://localhost', 'https://localhost', 'http://localhost']
        : ['capacitor://localhost', 'https://localhost', 'http://localhost', 'http://localhost:5179', 'http://localhost:5180'];
  const allowedOrigins = [...new Set([...corsOrigins, ...capacitorOrigins])];
  if (allowedOrigins.length > 0) {
    app.enableCors({
      origin: (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin) || corsOrigins.includes('*')) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Client-Platform', 'Cache-Control', 'Pragma', 'If-Modified-Since', 'X-Requested-With'],
    });
  }

  app.use(
    helmet({
      contentSecurityPolicy: isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
              fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'"],
              objectSrc: ["'self'", 'blob:'],
              frameSrc: ["'self'", 'blob:'],
              workerSrc: ["'self'", 'blob:'],
              manifestSrc: ["'self'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
              frameAncestors: ["'self'"],
              upgradeInsecureRequests: process.env.CSP_UPGRADE_INSECURE === 'true' ? [] : null,
            },
          }
        : false,
    })
  );
  app.use(cookieParser());
  app.setGlobalPrefix('api', { exclude: ['docs'] });
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  if (!isProd) {
    SwaggerModule.setup(
      'docs',
      app,
      SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('M2S Field Survey API').setVersion('1').addCookieAuth('m2s_session').build())
    );
  }

  const serveWeb =
    process.env.SERVE_WEB_DIST === 'true' || (process.env.SERVE_WEB_DIST !== 'false' && isProd);
  const webDist = serveWeb ? resolveWebDist() : null;
  const expressApp = app.getHttpAdapter().getInstance();

  if (webDist) {
    expressApp.use(
      express.static(webDist, {
        index: false,
        setHeaders(res, filePath) {
          const norm = filePath.replace(/\\/g, '/');
          if (norm.includes('/assets/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (norm.endsWith('/sw.js') || norm.endsWith('/index.html') || norm.endsWith('/manifest.webmanifest') || norm.endsWith('/app-version.json')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      })
    );
    // Register SPA fallback BEFORE app.init() so it precedes Nest's internal 404 handler while skipping API/docs routes.
    expressApp.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (
        (req.method !== 'GET' && req.method !== 'HEAD') ||
        req.path === '/api' ||
        req.path.startsWith('/api/') ||
        req.path === '/docs' ||
        req.path.startsWith('/docs/') ||
        path.extname(req.path)
      ) {
        return next();
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  await app.init();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}/api/v1${webDist ? ' (serving web SPA)' : ''}`);
})();
