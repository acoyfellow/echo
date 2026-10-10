export async function readBoundedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) return text + decoder.decode();
    total += value.byteLength;

    if (total > maxBytes) {
      await reader.cancel();

      return null;
    }

    text += decoder.decode(value, { stream: true });
  }
}
