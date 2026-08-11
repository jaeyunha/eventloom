const unsupportedScriptMessage =
  "Sessions and itinerary embeds use iframe mode; script mode supports only agenda and speakers.";

interface EmbedScriptRouteContext {
  params: Promise<{ eventSlug: string }>;
}

export async function GET(request: Request, context: EmbedScriptRouteContext) {
  const { eventSlug } = await context.params;
  const requestUrl = new URL(request.url);
  const requestedView = requestUrl.searchParams.get("view");
  if (requestedView && requestedView !== "agenda" && requestedView !== "speakers") {
    return Response.json(
      {
        error: {
          code: "UNSUPPORTED_EMBED_SCRIPT_VIEW",
          message: unsupportedScriptMessage,
        },
      },
      {
        status: 400,
        headers: {
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      },
    );
  }

  const origin = requestUrl.origin;
  const source = `(() => {
  "use strict";
  const script = document.currentScript;
  if (!script || !script.parentElement) return;
  const requestedView = script.dataset.view || "agenda";
  if (
    requestedView === "sessions" ||
    requestedView === "itinerary" ||
    (requestedView !== "agenda" && requestedView !== "speakers")
  ) {
    const message = document.createElement("p");
    message.setAttribute("role", "alert");
    message.textContent = ${JSON.stringify(unsupportedScriptMessage)};
    script.replaceWith(message);
    return;
  }
  const view = requestedView === "speakers" ? "speakers" : "agenda";
  const requestedTheme = script.dataset.theme;
  const theme = requestedTheme === "dark" || requestedTheme === "light" ? requestedTheme : "auto";
  const frame = document.createElement("iframe");
  frame.src = ${JSON.stringify(origin)} + "/embed/" + encodeURIComponent(${JSON.stringify(eventSlug)}) + "/" + view + "?theme=" + theme;
  frame.title = view === "speakers" ? "Published event speakers" : "Published event agenda";
  frame.loading = "lazy";
  frame.referrerPolicy = "no-referrer";
  frame.setAttribute("sandbox", "allow-scripts");
  frame.style.width = "100%";
  frame.style.minHeight = view === "speakers" ? "720px" : "640px";
  frame.style.border = "0";
  frame.style.display = "block";
  script.parentElement.insertBefore(frame, script);
  script.remove();
})();`;

  return new Response(source, {
    headers: {
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "content-type": "text/javascript; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}
