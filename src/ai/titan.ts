import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";

export const TITAN_MODEL = "amazon.titan-embed-image-v1";
export const EMBED_DIM = 1024;

export type Embedder = { text(input: string): Promise<number[]>; image(bytes: Buffer): Promise<number[]> };

export class EmbedError extends Error {
  override name = "EmbedError";
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

const RETRYABLE = new Set(["ThrottlingException", "ServiceUnavailableException", "ModelNotReadyException", "InternalServerException"]);

/** Amazon Titan Multimodal Embeddings G1: text and images land in the same 1024-d space. */
export function titanEmbedder(client = new BedrockRuntimeClient({ region: process.env.AWS_REGION ?? "ca-central-1" })): Embedder {
  async function embed(payload: { inputText?: string; inputImage?: string }): Promise<number[]> {
    const body = JSON.stringify({ ...payload, embeddingConfig: { outputEmbeddingLength: EMBED_DIM } });
    let res;
    try {
      res = await client.send(
        new InvokeModelCommand({ modelId: TITAN_MODEL, contentType: "application/json", accept: "application/json", body: new TextEncoder().encode(body) }),
      );
    } catch (err) {
      const name = err instanceof Error ? err.name : "UnknownError";
      throw new EmbedError(`Titan embedding failed (${name})`, RETRYABLE.has(name));
    }
    const embedding = JSON.parse(new TextDecoder().decode(res.body)).embedding;
    if (!Array.isArray(embedding) || embedding.length !== EMBED_DIM) {
      throw new EmbedError(`Titan returned ${Array.isArray(embedding) ? embedding.length : "no"} dimensions, expected ${EMBED_DIM}`);
    }
    return embedding;
  }

  return {
    text: (input) => embed({ inputText: input }),
    image: (bytes) => embed({ inputImage: bytes.toString("base64") }),
  };
}
