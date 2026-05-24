import { exec } from "node:child_process";
import OpenAI from "openai";

export interface Message {
  role: "user" | "assistant" | "tool";
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AgentOptions {
  onToken: (token: string) => void;
  onToolCall: (command: string) => void;
  onToolResult: (output: string) => void;
  onComplete: () => void;
  autoApprove: boolean;
  requestApproval: (command: string) => Promise<boolean>;
}

const client = new OpenAI({
  apiKey: process.env["DEEPSEEK_API_KEY"],
  baseURL: "https://api.deepseek.com",
});

const BASH_TOOL = {
  type: "function" as const,
  function: {
    name: "bash",
    description: "Execute a bash command in the current working directory",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The bash command to execute" },
      },
      required: ["command"],
    },
  },
};

const SYSTEM_PROMPT = `You are a coding assistant running in a terminal. You have a bash tool to execute commands.
Use it to read files (cat, find, grep), write files (echo, tee), and run programs.
Explain what you're about to do before executing commands.
Keep responses concise.
Working directory: ${process.cwd()}`;

const MAX_OUTPUT = 10000;

export function executeBash(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(
      command,
      {
        shell: "/bin/bash",
        cwd: process.cwd(),
        timeout: 30_000,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        let output = "";
        if (stdout) output += stdout;
        if (stderr) output += (output ? "\n" : "") + stderr;
        if (error && !output) output = error.message;
        if (output.length > MAX_OUTPUT) {
          output = output.slice(0, MAX_OUTPUT) + "\n... (truncated)";
        }
        resolve(output || "(no output)");
      },
    );
  });
}

export async function runAgentLoop(
  userMessage: string,
  messages: Message[],
  options: AgentOptions,
): Promise<Message[]> {
  messages = [...messages, { role: "user", content: userMessage }];

  while (true) {
    const stream = await client.chat.completions.create({
      model: "deepseek-v4-pro",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...(messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[]),
      ],
      tools: [BASH_TOOL],
      stream: true,
    });

    let contentBuffer = "";
    let toolCalls: ToolCall[] = [];
    const toolCallArgs: Map<number, string> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        contentBuffer += delta.content;
        options.onToken(delta.content);
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          if (tc.id) {
            toolCalls.push({
              id: tc.id,
              type: "function",
              function: { name: tc.function?.name ?? "", arguments: "" },
            });
          }
          if (tc.function?.arguments) {
            const existing = toolCallArgs.get(tc.index) ?? "";
            toolCallArgs.set(tc.index, existing + tc.function.arguments);
          }
        }
      }
    }

    // Finalize accumulated tool call arguments
    for (const [index, args] of toolCallArgs) {
      if (toolCalls[index]) {
        toolCalls[index].function.arguments = args;
      }
    }

    // Append the full assistant message to history
    const assistantMsg: Message = {
      role: "assistant",
      content: contentBuffer || undefined,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    };
    messages = [...messages, assistantMsg];

    // If no tool calls, we're done
    if (!assistantMsg.tool_calls) {
      options.onComplete();
      return messages;
    }

    // Execute each tool call
    for (const tc of assistantMsg.tool_calls) {
      const parsed = JSON.parse(tc.function.arguments);
      const command: string = parsed.command;

      options.onToolCall(command);

      if (!options.autoApprove) {
        const approved = await options.requestApproval(command);
        if (!approved) {
          messages = [
            ...messages,
            { role: "tool", tool_call_id: tc.id, content: "(skipped by user)" },
          ];
          continue;
        }
      }

      const output = await executeBash(command);
      options.onToolResult(output);
      messages = [...messages, { role: "tool", tool_call_id: tc.id, content: output }];
    }
    // Loop back to call the API again with updated messages
  }
}
