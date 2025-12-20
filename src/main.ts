import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['http://localhost:3001'], // Фронтенд адрес
    credentials: true
  });

  app.use(cookieParser());
  await app.listen(3000);
  console.log('Server listening on http://localhost:3000');
}
bootstrap();