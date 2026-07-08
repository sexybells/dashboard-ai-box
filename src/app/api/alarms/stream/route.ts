import { formatSseComment, formatSseEvent } from "@/lib/sse";
import { subscribeToAlarmEvents } from "@/services/alarm-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function encode(value: string): Uint8Array {
  return encoder.encode(value);
}

export async function GET(request: Request) {
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      function send(value: string) {
        if (!closed) {
          controller.enqueue(encode(value));
        }
      }

      const unsubscribe = subscribeToAlarmEvents((event) => {
        send(formatSseEvent(event.type, event));
      });

      const heartbeat = setInterval(() => {
        send(formatSseComment(`keepalive ${new Date().toISOString()}`));
      }, 25000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", cleanup);
        try {
          controller.close();
        } catch {
          // The stream may already be closed by the client disconnect path.
        }
      };

      request.signal.addEventListener("abort", cleanup, { once: true });
      send(formatSseEvent("ready", { ok: true }));
    },
    cancel() {
      cleanup();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
