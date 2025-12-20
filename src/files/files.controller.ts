import { Controller, Post, UseInterceptors, UploadedFile, Req, BadRequestException, Get, Param, Res, NotFoundException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { FilesService } from './files.service';
import { Response, Request } from 'express';
import * as Express from 'express';
import { createReadStream } from 'fs';

@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `${Date.now()}-${uuidv4()}${ext}`);
      }
    }),
    limits: { fileSize: 10 * 1024 * 1024 } 
  }))
  async upload(@UploadedFile() file: Express.Multer.File, @Req() req: Request) {
    if (!file) throw new BadRequestException('File is required');
    // опционально — chatId в body
    const chatId = (req.body && req.body.chatId) || null;
    const user = (req as any).user;
    if (!user) throw new BadRequestException('Unauthorized'); // middleware должен вернуть user
    const saved = await this.filesService.createFileRecord(user.id, {
      filename: file.originalname,
      path: file.path,
      mimeType: file.mimetype,
      size: file.size,
      chatId
    });
    return { id: saved.id, filename: saved.filename, size: saved.size, mimeType: saved.mimeType, createdAt: saved.createdAt };
  }

  @Get(':id')
  async download(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const user = (req as any).user;
    if (!user) throw new BadRequestException('Unauthorized');
    const f = await this.filesService.checkAccessToFile(user.id, id);
    if (!f) throw new NotFoundException('File not found');
    const stream = createReadStream(f.path);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
    stream.pipe(res);
  }
}
