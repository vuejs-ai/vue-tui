import { exec } from "node:child_process";

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
