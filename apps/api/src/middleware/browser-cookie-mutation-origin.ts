import type { MiddlewareHandler } from "hono";

const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const sessionCookieNames = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);

type BrowserCookieMutationOriginEnvironment = {
  Bindings: { APP_ENV: string; WEB_ORIGIN: string };
  Variables: { traceId: string };
};

function hasSessionCookie(cookieHeader: string | undefined): boolean {
  if (cookieHeader === undefined) return false;
  return cookieHeader.split(";").some((part) => {
    const separator = part.indexOf("=");
    return separator > 0 && sessionCookieNames.has(part.slice(0, separator).trim());
  });
}

export function browserCookieMutationOriginProtection(): MiddlewareHandler<BrowserCookieMutationOriginEnvironment> {
  return async (context, next) => {
    if (
      context.env.APP_ENV === "local" ||
      safeMethods.has(context.req.method) ||
      !hasSessionCookie(context.req.header("cookie"))
    ) {
      await next();
      return;
    }

    if (context.req.header("origin") !== context.env.WEB_ORIGIN) {
      return context.json(
        {
          error: {
            code: "ACCESS_DENIED",
            message: "Browser session mutations require the configured web origin.",
            traceId: context.get("traceId"),
          },
        },
        403,
      );
    }

    await next();
  };
}
