import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { ApiError, sendApiError } from "../utils/api-error";

export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      sendApiError(reply, request, error);
      return;
    }

    if (error instanceof ZodError) {
      sendApiError(
        reply,
        request,
        new ApiError(422, "VALIDATION_ERROR", "Validasi request gagal", {
          issues: error.issues
        })
      );
      return;
    }

    if ((error as { statusCode?: number }).statusCode === 401) {
      sendApiError(reply, request, new ApiError(401, "UNAUTHORIZED", "Token tidak valid atau kadaluarsa"));
      return;
    }

    app.log.error({ err: error, requestId: request.id }, "Unhandled error");
    sendApiError(reply, request, new ApiError(500, "INTERNAL_ERROR", "Terjadi kesalahan internal"));
  });
}