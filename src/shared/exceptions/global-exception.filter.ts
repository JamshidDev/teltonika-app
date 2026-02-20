// src/shared/filters/http-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

interface ExceptionResponse {
  message?: string | string[];
  errors?: unknown;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse() as string | ExceptionResponse;

      if (typeof res === 'string') {
        message = res;
      } else {
        if (Array.isArray(res.message)) {
          message = 'Validation error';
          errors = res.message;
        } else {
          message = res.message || message;
          errors = res.errors || null;
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(exception.message, exception.stack);
    }

    response.status(status).json({
      success: false,
      errors,
      error: {
        code: status,
        message: message,
      },
    });
  }
}
