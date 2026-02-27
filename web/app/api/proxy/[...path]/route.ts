import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { refreshAccessTokenOnServer } from "@/lib/backend";
import { ACCESS_COOKIE } from "@/lib/constants";

function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:3000";
  return base.replace(/\/+$/, "");
}

async function forward(request: Request, params: { path: string[] }) {
  const method = request.method;
  const store = await cookies();
  let accessToken: string | null = store.get(ACCESS_COOKIE)?.value ?? null;

  if (!accessToken) {
    accessToken = await refreshAccessTokenOnServer();
    if (!accessToken) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Session expired" } }, { status: 401 });
    }
  }

  const targetPath = params.path.join("/");
  const url = new URL(request.url);
  const targetUrl = `${apiBase()}/${targetPath}${url.search}`;

  const rawBody = method === "GET" || method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());

  const execute = async (token: string) => {
    const headers = new Headers();
    request.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "cookie" || lower === "content-length" || lower === "authorization") {
        return;
      }
      headers.set(key, value);
    });
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(targetUrl, {
      method,
      headers,
      body: rawBody,
      cache: "no-store"
    });
  };

  let backendResponse: Response;
  try {
    backendResponse = await execute(accessToken);
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BACKEND_UNREACHABLE",
          message: "Backend API tidak dapat dijangkau dari proxy frontend",
          details: {
            target_url: targetUrl,
            reason: error instanceof Error ? error.message : "unknown"
          }
        }
      },
      { status: 502 }
    );
  }

  if (backendResponse.status === 401) {
    const refreshed = await refreshAccessTokenOnServer();
    if (refreshed) {
      try {
        backendResponse = await execute(refreshed);
      } catch (error) {
        return NextResponse.json(
          {
            error: {
              code: "BACKEND_UNREACHABLE",
              message: "Backend API tidak dapat dijangkau setelah token refresh",
              details: {
                target_url: targetUrl,
                reason: error instanceof Error ? error.message : "unknown"
              }
            }
          },
          { status: 502 }
        );
      }
    }
  }

  const contentType = backendResponse.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    const streamHeaders = new Headers();
    streamHeaders.set("content-type", contentType);
    streamHeaders.set("cache-control", backendResponse.headers.get("cache-control") ?? "no-cache");
    streamHeaders.set("connection", backendResponse.headers.get("connection") ?? "keep-alive");

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: streamHeaders
    });
  }

  const text = await backendResponse.text();
  const responseHeaders = new Headers();
  if (contentType.length > 0) {
    responseHeaders.set("content-type", contentType);
  }

  return new NextResponse(text, {
    status: backendResponse.status,
    headers: responseHeaders
  });
}

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: RouteContext) {
  return forward(request, await context.params);
}

export async function POST(request: Request, context: RouteContext) {
  return forward(request, await context.params);
}

export async function PATCH(request: Request, context: RouteContext) {
  return forward(request, await context.params);
}

export async function PUT(request: Request, context: RouteContext) {
  return forward(request, await context.params);
}

export async function DELETE(request: Request, context: RouteContext) {
  return forward(request, await context.params);
}
