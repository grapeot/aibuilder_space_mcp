import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

dotenv.config();

const CACHE_DIR = join(homedir(), ".ai-builders-mcp-cache");
const DEPLOYMENT_GUIDE_CACHE = join(CACHE_DIR, "deployment_guide_cache.json");

async function ensureCacheDir() {
  try {
    await access(CACHE_DIR);
  } catch {
    await mkdir(CACHE_DIR, { recursive: true });
  }
}

function getDefaultDeploymentGuide(serviceType: string = "fastapi"): string {
  return `# ${serviceType.toUpperCase()} Service Deployment Guide

## Prerequisites
- Public GitHub repository
- Listen on PORT environment variable
- Include dependency files (requirements.txt/package.json)

## Deployment Steps
1. Prepare a Dockerfile
2. Configure environment variables
3. Set AI_BUILDER_TOKEN
4. Deploy to target platform

## Authentication
- Use Bearer Token authentication
- Read AI_BUILDER_TOKEN from environment variables
- Include token in Authorization header

## Environment Example
\`\`\`bash
AI_BUILDER_TOKEN=your_token_here
DEPLOYMENT_TARGET=production
PORT=8000
\`\`\`

## Code Example
\`\`\`python
import os

token = os.getenv("AI_BUILDER_TOKEN")
headers = {"Authorization": f"Bearer {token}"}
\`\`\``;
}

async function getCachedDeploymentGuide(): Promise<{
  content: string;
  cached_at?: string;
  source: string;
}> {
  await ensureCacheDir();
  
  try {
    const cacheContent = await readFile(DEPLOYMENT_GUIDE_CACHE, 'utf-8');
    const cacheData = JSON.parse(cacheContent);
    const cachedTime = new Date(cacheData.cached_at);
    const now = new Date();
    
    if (now.getTime() - cachedTime.getTime() < 24 * 60 * 60 * 1000) {
      return cacheData;
    }
  } catch {
  }
  
  try {
    const response = await fetch("https://www.ai-builders.com/resources/students/deployment-prompt.md");
    if (response.ok) {
      const content = await response.text();
      const cacheData = {
        content,
        cached_at: new Date().toISOString(),
        source: "remote"
      };
      
      try {
        await writeFile(DEPLOYMENT_GUIDE_CACHE, JSON.stringify(cacheData, null, 2));
      } catch (error) {
        console.error("Cache write failed:", error);
      }
      
      return cacheData;
    }
  } catch (error) {
    console.error("Failed to fetch remote deployment guide:", error);
  }
  
  return {
    content: getDefaultDeploymentGuide(),
    cached_at: new Date().toISOString(),
    source: "default"
  };
}

const server = new Server(
  {
    name: "ai-builders-coach",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "get_api_specification": {
        const response = await fetch("https://www.ai-builders.com/resources/students-backend/openapi.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch OpenAPI specification: HTTP ${response.status}`);
        }
        
        const openapiSpec = await response.json();
        let baseUrl = "https://www.ai-builders.com/resources/students-backend";
        try {
          if (openapiSpec?.servers?.length) {
            const url = openapiSpec.servers[0].url as string;
            if (url.startsWith("http")) {
              baseUrl = url;
            } else {
              baseUrl = `https://www.ai-builders.com${url}`;
            }
          }
        } catch {}
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                openapi_spec: openapiSpec,
                endpoint_info: {
                  base_url: baseUrl,
                  description: "Base URL for the AI Builders API",
                  note: "All API calls should use this base URL"
                },
                authentication: {
                  type: "bearer_token",
                  header: "Authorization: Bearer {AI_BUILDER_TOKEN}",
                  token_source: "Environment variable AI_BUILDER_TOKEN"
                },
                sdk_compatibility: {
                  openai_sdk_compatible: true,
                  recommendation: "We strongly recommend using the OpenAI SDK to interact with this API. It provides a clean, well-documented interface and handles authentication automatically.",
                  usage_note: "You can use OpenAI-compatible SDKs against this API. The OpenAI SDK is the recommended approach.",
                  example_node: {
                    baseURL: baseUrl,
                    endpoint: "/v1/chat/completions",
                    code_example: `import OpenAI from 'openai';\n\nconst openai = new OpenAI({\n  baseURL: '${baseUrl}',\n  apiKey: process.env.AI_BUILDER_TOKEN,\n});\n\nconst completion = await openai.chat.completions.create({\n  model: 'gpt-4',\n  messages: [{ role: 'user', content: 'Hello!' }],\n});`
                  },
                  example_python: {
                    code_example: `from openai import OpenAI\nimport os\n\nclient = OpenAI(\n    base_url='${baseUrl}',\n    api_key=os.getenv('AI_BUILDER_TOKEN')\n)\n\ncompletion = client.chat.completions.create(\n    model='gpt-4',\n    messages=[{'role': 'user', 'content': 'Hello!'}]\n)`
                  }
                },
                mcp_recommendation: {
                  note: "If running via an MCP server, call get_auth_token and then create_env_file to configure .env",
                  tools: ["get_auth_token", "create_env_file"],
                  env_key: "AI_BUILDER_TOKEN"
                }
              }, null, 2)
            }
          ]
        };
      }
      
      case "get_deployment_guide": {
        const serviceType = args?.service_type || "fastapi";
        const cachedGuide = await getCachedDeploymentGuide();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                deployment_guide: cachedGuide.content,
                service_type: serviceType,
                cached_at: cachedGuide.cached_at,
                source: cachedGuide.source,
                authentication_note: "Both deployment and development require AI_BUILDER_TOKEN; manage it via a .env file"
              }, null, 2)
            }
          ]
        };
      }
      
      case "explain_authentication_model": {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                authentication_model: {
                  token_type: "AI_BUILDER_TOKEN",
                  usage_scenarios: ["deployment", "development", "api_calls"],
                  shared_principle: "Use the same token for both deployment and development",
                  best_practices: [
                    ".env file management",
                    "Do not hardcode tokens",
                    "Add .env to .gitignore",
                    "Use different tokens per environment"
                  ]
                },
                environment_setup: {
                  example_env_content: "AI_BUILDER_TOKEN=your_token_here\nDEPLOYMENT_TARGET=development",
                  loading_method: "Load environment variables using dotenv or similar",
                  usage_example: `import os\nfrom dotenv import load_dotenv\n\nload_dotenv()\n\ntoken = os.getenv("AI_BUILDER_TOKEN")\nheaders = {"Authorization": f"Bearer {token}"}`
                },
                deployment_note: "Platforms may inject AI_BUILDER_TOKEN at deploy time; set it manually during development"
              }, null, 2)
            }
          ]
        };
      }

      case "get_auth_token": {
        const masked = args?.masked !== false;
        const token = process.env.AI_BUILDER_TOKEN || "";
        const available = !!token;
        let value = token;
        if (masked && token) {
          const start = token.slice(0, 4);
          const end = token.slice(-4);
          value = `${start}${"*".repeat(Math.max(0, token.length - 8))}${end}`;
        }
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                available,
                token: value,
                masked,
                note: available
                  ? "Use this token to configure your .env as AI_BUILDER_TOKEN"
                  : "AI_BUILDER_TOKEN is not set in server environment"
              }, null, 2)
            }
          ]
        };
      }

      case "create_env_file": {
        const target_dir = args?.target_dir;
        const overwrite = args?.overwrite === true;
        if (!target_dir || typeof target_dir !== "string") {
          throw new Error("target_dir is required");
        }
        const token = process.env.AI_BUILDER_TOKEN || "";
        if (!token) {
          throw new Error("AI_BUILDER_TOKEN is not set in server environment");
        }
        const filePath = join(target_dir, ".env");
        try {
          await mkdir(target_dir, { recursive: true });
          if (!overwrite) {
            try {
              await access(filePath);
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify({
                      written: false,
                      path: filePath,
                      reason: "File already exists; set overwrite=true to replace"
                    }, null, 2)
                  }
                ]
              };
            } catch {}
          }
          const envContent = `AI_BUILDER_TOKEN=${token}\n`;
          await writeFile(filePath, envContent);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  written: true,
                  path: filePath
                }, null, 2)
              }
            ]
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(`Failed to write .env: ${msg}`);
        }
      }
      
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: errorMessage,
            suggestion: "Check network connection or retry later"
          })
        }
      ],
      isError: true
    };
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_api_specification",
        description: "Retrieve the OpenAPI specification with endpoint details",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_deployment_guide",
        description: "Get deployment guidance with caching",
        inputSchema: {
          type: "object",
          properties: {
            service_type: {
              type: "string",
              description: "Service type (e.g., fastapi, express)",
              default: "fastapi"
            }
          }
        }
      },
      {
        name: "explain_authentication_model",
        description: "Explain authentication model for shared deployment and development use",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_auth_token",
        description: "Return AI_BUILDER_TOKEN from environment (masked by default)",
        inputSchema: {
          type: "object",
          properties: {
            masked: {
              type: "boolean",
              description: "Return masked token if true",
              default: true
            }
          }
        }
      },
      {
        name: "create_env_file",
        description: "Create a .env file with AI_BUILDER_TOKEN at the target directory",
        inputSchema: {
          type: "object",
          properties: {
            target_dir: {
              type: "string",
              description: "Directory to write the .env file"
            },
            overwrite: {
              type: "boolean",
              description: "Overwrite existing .env file",
              default: false
            }
          },
          required: ["target_dir"]
        }
      }
    ]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Builders MCP Coach Server started");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
