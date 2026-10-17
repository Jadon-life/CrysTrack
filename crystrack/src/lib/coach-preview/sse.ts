/** Handles UTF-8/line boundaries, comments and CRLF without assuming fetch chunk boundaries. */
export async function* sseData(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const reader = body.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    lines: string[] = [];
  try {
    while (true) {
      if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let index: number;
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line === "") {
          if (lines.length) yield lines.join("\n");
          lines = [];
        } else if (line.startsWith("data:"))
          lines.push(line.slice(5).trimStart());
      }
      if (chunk.done) {
        if (buffer.startsWith("data:")) lines.push(buffer.slice(5).trimStart());
        if (lines.length) yield lines.join("\n");
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
