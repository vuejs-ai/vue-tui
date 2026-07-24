import { createRequire, syncBuiltinESMExports } from "node:module";

const encoder = new TextEncoder();
const require = createRequire(import.meta.url);

// The journey is fully local. Blocking the socket-level HTTP entry points makes a broken fetch
// injection fail closed instead of sending the verifier's scripted conversation to DeepSeek.
const blockedNetworkRequest = () => {
  throw new Error("The coding-agent verifier blocked an unexpected socket-level HTTP request.");
};
for (const protocol of [require("node:http"), require("node:https")]) {
  protocol.request = blockedNetworkRequest;
  protocol.get = blockedNetworkRequest;
}
syncBuiltinESMExports();

const expectedLastMessages = [
  { role: "user", content: "alp你🙂" },
  { role: "tool", content: "ACCEPTED_TOOL" },
  { role: "user", content: "beta" },
  { role: "tool", content: "(skipped by user)" },
];

const responsePlans = [
  [
    { delayMs: 0, delta: { role: "assistant", content: "STREAM_ACCEPT_1 " } },
    { delayMs: 150, delta: { content: "STREAM_ACCEPT_2" } },
    {
      delayMs: 200,
      delta: {
        tool_calls: [
          {
            index: 0,
            id: "call_accept",
            type: "function",
            function: { name: "bash", arguments: '{"command":"printf ACC' },
          },
        ],
      },
    },
    {
      delayMs: 20,
      delta: {
        tool_calls: [
          {
            index: 0,
            function: { arguments: 'EPTED_TOOL"}' },
          },
        ],
      },
      finishReason: "tool_calls",
    },
  ],
  [
    { delayMs: 0, delta: { role: "assistant", content: "ACCEPTED_" } },
    { delayMs: 80, delta: { content: "COMPLETE" }, finishReason: "stop" },
  ],
  [
    { delayMs: 0, delta: { role: "assistant", content: "STREAM_REJECT" } },
    {
      delayMs: 150,
      delta: {
        tool_calls: [
          {
            index: 0,
            id: "call_reject",
            type: "function",
            function: { name: "bash", arguments: '{"command":"printf SHOULD_NOT_RUN"}' },
          },
        ],
      },
      finishReason: "tool_calls",
    },
  ],
  [
    { delayMs: 0, delta: { role: "assistant", content: "REJECTED_" } },
    { delayMs: 80, delta: { content: "COMPLETE" }, finishReason: "stop" },
  ],
];

let requestIndex = 0;

process.on("exit", () => {
  if (requestIndex === responsePlans.length) return;
  process.stderr.write(
    `The coding-agent verifier observed ${requestIndex} completion requests; expected ${responsePlans.length}.\n`,
  );
  process.exitCode = 1;
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function completionChunk(id, delta, finishReason = null) {
  return {
    id,
    object: "chat.completion.chunk",
    created: 1_720_000_000,
    model: "deepseek-v4-pro",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

async function readRequestBody(input, init) {
  if (typeof init?.body === "string") return init.body;
  if (init?.body instanceof Uint8Array) return new TextDecoder().decode(init.body);
  if (input instanceof Request) return input.clone().text();
  throw new Error("The coding-agent verifier expected a JSON request body.");
}

globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.endsWith("/chat/completions")) {
    throw new Error(`The coding-agent verifier blocked an unexpected network request: ${url}`);
  }

  const call = requestIndex++;
  const plan = responsePlans[call];
  if (!plan) {
    throw new Error(
      `The coding-agent verifier received unexpected completion request ${call + 1}.`,
    );
  }

  const body = JSON.parse(await readRequestBody(input, init));
  if (body.model !== "deepseek-v4-pro" || body.stream !== true || !Array.isArray(body.messages)) {
    throw new Error("The coding-agent verifier received an unexpected completion request shape.");
  }
  const expected = expectedLastMessages[call];
  const actual = body.messages.at(-1);
  if (actual?.role !== expected.role || actual?.content !== expected.content) {
    throw new Error(
      `Completion request ${call + 1} ended with ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}.`,
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for (const [eventIndex, event] of plan.entries()) {
          await delay(event.delayMs);
          const payload = completionChunk(
            `chatcmpl-runtime-foundation-${call + 1}-${eventIndex + 1}`,
            event.delta,
            event.finishReason,
          );
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "x-request-id": `runtime-foundation-${call + 1}`,
    },
  });
};
