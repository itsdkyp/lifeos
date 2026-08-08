#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "lifeos-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const API = process.env.LIFEOS_API_URL || "http://127.0.0.1:8787";
// Generate this in the LifeOS UI: Settings -> Security -> API Tokens -> Generate new
// token. Replaces the old shared LIFEOS_TOKEN env var, which no longer exists as a
// concept — auth is now username/password (browser) or a user-generated API token
// (this, for MCP/scripts).
const TOKEN = process.env.LIFEOS_API_TOKEN;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return TOKEN ? { Authorization: `Bearer ${TOKEN}`, ...extra } : extra;
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "lifeos_command",
        description: "Pass a natural language command to LifeOS (e.g. 'spent 20 on coffee', 'mood 8 focused', 'task: pay bills', 'done with paying bills', 'create habit of meditation', 'weight 72', 'sleep 23:30 07:00'). LifeOS will automatically parse and log it.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The natural language string to send to LifeOS",
            },
          },
          required: ["command"],
        },
      },
      {
        name: "lifeos_get_summary",
        description: "Get today's summary from LifeOS, including mood, tasks, sleep, spending, and habits.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "lifeos_get_tasks",
        description: "Get all open tasks from LifeOS.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "lifeos_ask",
        description: "Ask the LifeOS LLM a question about the user's life data (configurable window, default 30 days).",
        inputSchema: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The question to ask LifeOS",
            },
          },
          required: ["question"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "lifeos_command": {
        const { command } = request.params.arguments as { command: string };
        const res = await fetch(`${API}/chat`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ q: command }),
        });
        const j = await res.json() as any;
        if (!res.ok) throw new Error(j.error || "Failed to process command");
        return { content: [{ type: "text", text: j.answer || JSON.stringify(j) }] };
      }
      
      case "lifeos_ask": {
        const { question } = request.params.arguments as { question: string };
        const res = await fetch(`${API}/chat`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ q: question }),
        });
        const j = await res.json() as any;
        if (!res.ok) throw new Error(j.error || "Failed to ask question");
        return { content: [{ type: "text", text: j.answer || JSON.stringify(j) }] };
      }

      case "lifeos_get_summary": {
        const res = await fetch(`${API}/summary?days=7`, { headers: authHeaders() });
        const j = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
      }

      case "lifeos_get_tasks": {
        const res = await fetch(`${API}/tasks?filter=open`, { headers: authHeaders() });
        const j = await res.json();
        return { content: [{ type: "text", text: JSON.stringify(j, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${request.params.name}`);
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
