/**
 * Incremental Server-Sent-Events decoder. Feed it raw text chunks with
 * push(); it returns the `data` payload of every complete event seen so far.
 * Events are blank-line delimited per the SSE spec.
 */
export class SseDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const out: string[] = [];
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 2);
      const data = parseEventData(block);
      if (data !== undefined) out.push(data);
    }
    return out;
  }
}

function parseEventData(block: string): string | undefined {
  const dataLines: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue; // comment
    if (line === "data") {
      dataLines.push("");
    } else if (line.startsWith("data:")) {
      let value = line.slice(5);
      if (value.startsWith(" ")) value = value.slice(1);
      dataLines.push(value);
    }
    // event:, id:, retry: are intentionally ignored — A2UI carries its
    // payload in the data field only.
  }
  return dataLines.length > 0 ? dataLines.join("\n") : undefined;
}
