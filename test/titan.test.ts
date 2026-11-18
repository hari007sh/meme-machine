import { InvokeModelCommand, type BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { describe, expect, it, vi } from "vitest";
import { EmbedError, titanEmbedder } from "../src/ai/titan.js";

function fakeClient(embedding: number[] | Error) {
  const send = vi.fn(async (_cmd: InvokeModelCommand) => {
    if (embedding instanceof Error) throw embedding;
    return { body: new TextEncoder().encode(JSON.stringify({ embedding })) };
  });
  return { client: { send } as unknown as BedrockRuntimeClient, send };
}

const vec = Array.from({ length: 1024 }, (_, i) => i / 1024);

function sentBody(send: ReturnType<typeof vi.fn>) {
  const cmd = send.mock.calls[0][0] as InvokeModelCommand;
  expect(cmd.input.modelId).toBe("amazon.titan-embed-image-v1");
  return JSON.parse(new TextDecoder().decode(cmd.input.body as Uint8Array));
}

describe("titanEmbedder", () => {
  it("embeds text with a 1024-d output config", async () => {
    const { client, send } = fakeClient(vec);
    expect(await titanEmbedder(client).text("hi")).toEqual(vec);
    expect(sentBody(send)).toEqual({ inputText: "hi", embeddingConfig: { outputEmbeddingLength: 1024 } });
  });

  it("embeds images as base64", async () => {
    const { client, send } = fakeClient(vec);
    const buf = Buffer.from([1, 2, 3]);
    await titanEmbedder(client).image(buf);
    expect(sentBody(send)).toEqual({ inputImage: buf.toString("base64"), embeddingConfig: { outputEmbeddingLength: 1024 } });
  });

  it("rejects embeddings of the wrong size", async () => {
    const { client } = fakeClient([1, 2, 3]);
    await expect(titanEmbedder(client).text("hi")).rejects.toBeInstanceOf(EmbedError);
  });

  it("marks throttling as retryable", async () => {
    const err = Object.assign(new Error("slow down"), { name: "ThrottlingException" });
    const { client } = fakeClient(err);
    await expect(titanEmbedder(client).text("hi")).rejects.toMatchObject({ name: "EmbedError", retryable: true });
  });
});
