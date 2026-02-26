export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string;
    timestamp: string;
  };
};

export function errorResponse(code: string, message: string, status = 400, details?: unknown, requestId?: string): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        details,
        request_id: requestId,
        timestamp: new Date().toISOString()
      }
    } satisfies ApiErrorEnvelope,
    { status }
  );
}

export function ok<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function isResponse(value: unknown): value is Response {
  return value instanceof Response;
}

