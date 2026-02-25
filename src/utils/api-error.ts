import type { FastifyReply, FastifyRequest } from "fastify";
import type { ApiErrorCode } from "../types";

export class ApiError extends Error {
  statusCode: number;
  code: ApiErrorCode;
  details?: Record<string, unknown>;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function sendApiError(reply: FastifyReply, request: FastifyRequest, error: ApiError): FastifyReply {
  return reply.status(error.statusCode).send({
    error: {
      code: error.code,
      message: error.message,
      details: error.details ?? {},
      request_id: request.id,
      timestamp: new Date().toISOString()
    }
  });
}

export function badRequest(code: ApiErrorCode, message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(400, code, message, details);
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError(403, "FORBIDDEN", message);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, "NOT_FOUND", message);
}

export function conflict(code: ApiErrorCode, message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(409, code, message, details);
}

export function unprocessable(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(422, "VALIDATION_ERROR", message, details);
}