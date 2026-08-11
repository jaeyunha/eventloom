import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

interface ApiProxyContext {
  params: Promise<{ path: string[] }>;
}

function upstreamOrigin(): string {
  const value = process.env.API_UPSTREAM_ORIGIN?.trim();
  if (!value) {
    throw new Error("API_UPSTREAM_ORIGIN is required for the web API transport.");
  }
  const parsed = new URL(value);
  const localHttp =
    parsed.protocol === "http:" &&
    process.env.APP_ENV === "local" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if ((parsed.protocol !== "https:" && !localHttp) || parsed.origin !== value) {
    throw new Error(
      "API_UPSTREAM_ORIGIN must be an HTTPS origin (plain HTTP is allowed only for loopback hosts when APP_ENV=local).",
    );
  }
  return parsed.origin;
}

async function proxy(request: NextRequest, context: ApiProxyContext): Promise<Response> {
  const { path } = await context.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}`, upstreamOrigin());
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  headers.set("x-forwarded-host", request.nextUrl.host);
  headers.set("x-forwarded-proto", request.nextUrl.protocol.slice(0, -1));

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
    ...(hasBody ? { body: request.body, duplex: "half" } : {}),
  });

  const responseHeaders = new Headers(upstream.headers);
  // The runtime already decompressed upstream.body; forwarding the original
  // framing headers would make the browser decode a plain body again.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "no-store");
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
