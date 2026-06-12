import * as dotenv from 'dotenv';
import * as path from 'path';

// En entornos empaquetados, buscamos el .env relativo al ejecutable o al directorio de la app
const envPath = process.env.ELECTRON_RUN_AS_NODE === '1'
  ? path.join(__dirname, '..', '.env')
  : path.join(process.cwd(), '.env');

dotenv.config({ path: envPath });

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalLoggerService } from './logs/services/global-logger.service';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const logger = app.get(GlobalLoggerService);
  app.useLogger(logger);
  app.useGlobalFilters(new AllExceptionsFilter(logger));

  app.enableCors();

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Toketeo API')
    .setDescription('Database management platform API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
