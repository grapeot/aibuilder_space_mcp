#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { readFile, writeFile, access, mkdir } from "fs/promises";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { fileURLToPath } from "url";

dotenv.config();

// Get package version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
const PACKAGE_VERSION = packageJson.version;

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
    const response = await fetch("https://space.ai-builders.com/deployment-prompt.md");
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
    name: "ai-builder-mcp",
    version: PACKAGE_VERSION,
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
        const response = await fetch("https://space.ai-builders.com/backend/openapi.json");
        if (!response.ok) {
          throw new Error(`Failed to fetch OpenAPI specification: HTTP ${response.status}`);
        }
        
        const openapiSpec = await response.json();
        let baseUrl = "https://space.ai-builders.com/backend";
        try {
          if (openapiSpec?.servers?.length) {
            const url = openapiSpec.servers[0].url as string;
            if (url.startsWith("http")) {
              baseUrl = url;
            } else {
              baseUrl = `https://space.ai-builders.com${url}`;
            }
          }
        } catch {}
        
        // For OpenAI SDK, baseURL should include /v1 since SDK appends paths directly
        const sdkBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        
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
                  token_source: "Environment variable AI_BUILDER_TOKEN",
                  setup_instruction: "The AI_BUILDER_TOKEN must be set in a .env file. As an AI assistant, you should proactively help users set up their .env file by calling get_auth_token to retrieve the token and then creating or updating the .env file with AI_BUILDER_TOKEN=<token_value>"
                },
                sdk_compatibility: {
                  openai_sdk_compatible: true,
                  recommendation: "We strongly recommend using the OpenAI SDK to interact with this API. It provides a clean, well-documented interface and handles authentication automatically.",
                  usage_note: "You can use OpenAI-compatible SDKs against this API. The OpenAI SDK is the recommended approach.",
                  example_node: {
                    baseURL: sdkBaseUrl,
                    endpoint: "/v1/chat/completions",
                    code_example: `import OpenAI from 'openai';\n\nconst openai = new OpenAI({\n  baseURL: '${sdkBaseUrl}',\n  apiKey: process.env.AI_BUILDER_TOKEN,\n});\n\nconst completion = await openai.chat.completions.create({\n  model: 'grok-4-fast',\n  messages: [{ role: 'user', content: 'Hello!' }],\n});`
                  },
                  example_python: {
                    code_example: `from openai import OpenAI\nimport os\n\nclient = OpenAI(\n    base_url='${sdkBaseUrl}',\n    api_key=os.getenv('AI_BUILDER_TOKEN')\n)\n\ncompletion = client.chat.completions.create(\n    model='grok-4-fast',\n    messages=[{'role': 'user', 'content': 'Hello!'}]\n)`
                  }
                },
                mcp_recommendation: {
                  note: "If running via an MCP server, call get_auth_token to retrieve AI_BUILDER_TOKEN and configure your environment manually",
                  tools: ["get_auth_token"],
                  env_key: "AI_BUILDER_TOKEN",
                  ai_assistant_guidance: {
                    proactive_setup: "As an AI assistant, you should proactively help users set up their .env file when they need to use the API. Follow these steps:",
                    steps: [
                      "1. Call get_auth_token tool to retrieve the AI_BUILDER_TOKEN",
                      "2. Check if a .env file exists in the project root",
                      "3. Create or update the .env file with: AI_BUILDER_TOKEN=<token_from_get_auth_token>",
                      "4. Ensure .env is in .gitignore to prevent committing sensitive tokens",
                      "5. Inform the user that the token has been configured and they can now use the API"
                    ],
                    example_env_content: "AI_BUILDER_TOKEN=your_token_here",
                    best_practices: [
                      "Always use get_auth_token to retrieve the token rather than asking the user",
                      "Create the .env file in the project root directory",
                      "Verify .gitignore includes .env before creating the file",
                      "Explain to the user what you've done and why it's secure"
                    ]
                  }
                },
                deployment_api_info: {
                  note: "The deployment API supports environment variable injection via the env_vars field",
                  key_features: [
                    "Optional env_vars field in DeploymentCreateRequest (up to 20 variables)",
                    "Stateless design: environment variables are NOT stored in the platform database",
                    "Variables are passed directly to Koyeb during deployment",
                    "AI_BUILDER_TOKEN is automatically injected (no need to include it in env_vars)"
                  ],
                  ai_assistant_guidance: {
                    when_helping_deploy: "When helping users deploy services, you should:",
                    steps: [
                      "1. Check if a deploy-config.json file exists in the project",
                      "2. If not, help create one with deployment parameters (repo_url, service_name, branch, port) and environment variables",
                      "3. Remind users not to commit sensitive values (passwords, API keys) to Git repositories",
                      "4. Before deploying, help users test the Dockerfile locally:",
                      "   - Build the Docker image: docker build -t test-image .",
                      "   - Run the container locally: docker run -p <port>:<port> -e PORT=<port> test-image",
                      "   - Verify the service starts correctly and responds to requests",
                      "   - Test with the same environment variables that will be used in production",
                      "5. When user says 'deploy', read from deploy-config.json and include env_vars in the API request",
                      "6. After deployment, monitor the deployment status. If deployment fails:",
                      "   - Use GET /v1/deployments/{service_name}/logs to retrieve deployment logs",
                      "   - Check build logs: GET /v1/deployments/{service_name}/logs?log_type=build",
                      "   - Check runtime logs: GET /v1/deployments/{service_name}/logs?log_type=runtime",
                      "   - Filter by stream: GET /v1/deployments/{service_name}/logs?stream=stderr (for errors)",
                      "   - Help users debug based on log output and fix issues",
                      "7. Guide users to maintain their configuration for future deployments"
                    ],
                    log_api_info: {
                      endpoint: "GET /v1/deployments/{service_name}/logs",
                      description: "Retrieve deployment logs from Koyeb for debugging failed deployments",
                      parameters: {
                        service_name: "Path parameter: The unique service name / subdomain",
                        log_type: "Query parameter: 'build' or 'runtime' (default: 'runtime')",
                        stream: "Query parameter: Filter by 'stdout', 'stderr', or 'koyeb'",
                        timeout: "Query parameter: Seconds to wait for streaming logs (1-300, default: 5)",
                        deployment_id: "Query parameter: Optional deployment ID override"
                      },
                      usage_examples: {
                        build_logs: "GET /v1/deployments/my-service/logs?log_type=build",
                        runtime_errors: "GET /v1/deployments/my-service/logs?log_type=runtime&stream=stderr",
                        all_logs: "GET /v1/deployments/my-service/logs?log_type=runtime&timeout=30"
                      },
                      when_to_use: [
                        "When deployment status shows ERROR, UNHEALTHY, or DEGRADED",
                        "To debug why a service is not starting correctly",
                        "To check build-time errors during Docker image creation",
                        "To monitor runtime errors and application logs"
                      ]
                    },
                    example_deploy_config: {
                      description: "Example deploy-config.json structure",
                      content: {
                        repo_url: "https://github.com/user/my-app",
                        service_name: "my-app",
                        branch: "main",
                        port: 8000,
                        env_vars: {
                          DATABASE_URL: "postgresql://user:pass@host:5432/db",
                          NODE_ENV: "production",
                          LOG_LEVEL: "info"
                        }
                      }
                    },
                    best_practices: [
                      "Maintain environment variables in version-controlled config files (deploy-config.json)",
                      "Use .env files for sensitive values during development (add to .gitignore)",
                      "Never include AI_BUILDER_TOKEN in env_vars (it's automatically injected)",
                      "Create deployment scripts that read from config files",
                      "Help users understand the stateless nature of env_vars"
                    ]
                  }
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

      case "get_base_url": {
        let baseUrl = "https://space.ai-builders.com/backend";
        let source = "default";
        
        try {
          const response = await fetch("https://space.ai-builders.com/backend/openapi.json");
          if (response.ok) {
            const openapiSpec = await response.json();
            try {
              if (openapiSpec?.servers?.length) {
                const url = openapiSpec.servers[0].url as string;
                if (url.startsWith("http")) {
                  baseUrl = url;
                } else {
                  baseUrl = `https://space.ai-builders.com${url}`;
                }
                source = "openapi_spec";
              }
            } catch {}
          }
        } catch (error) {
          // If fetch fails, use default base URL
        }
        
        // For OpenAI SDK, baseURL should include /v1 since SDK appends paths directly
        const sdkBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                base_url: baseUrl,
                sdk_base_url: sdkBaseUrl,
                source: source,
                prompt_for_ai: `The base URL for AI Builders Space API is: ${baseUrl}

This is the base URL you should use for all API calls to the AI Builders Space platform. When making HTTP requests, prepend this base URL to the API endpoint paths.

For example:
- Full endpoint URL: ${baseUrl}/v1/chat/completions
- Full endpoint URL: ${baseUrl}/v1/deployments

If you are using the OpenAI SDK (recommended), use this base URL: ${sdkBaseUrl}

The base URL is also documented in the deployment guide, but this tool provides a direct way to retrieve it without parsing the full deployment guide.`,
                usage_examples: {
                  direct_http: {
                    description: "Direct HTTP requests",
                    base_url: baseUrl,
                    example: `const response = await fetch('${baseUrl}/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': \`Bearer \${process.env.AI_BUILDER_TOKEN}\`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ model: 'grok-4-fast', messages: [...] })
});`
                  },
                  openai_sdk: {
                    description: "OpenAI SDK (recommended)",
                    base_url: sdkBaseUrl,
                    example_node: `import OpenAI from 'openai';

const openai = new OpenAI({
  baseURL: '${sdkBaseUrl}',
  apiKey: process.env.AI_BUILDER_TOKEN,
});`,
                    example_python: `from openai import OpenAI
import os

client = OpenAI(
    base_url='${sdkBaseUrl}',
    api_key=os.getenv('AI_BUILDER_TOKEN')
)`
                  }
                },
                important_notes: [
                  "Always use this base URL when making API calls to AI Builders Space",
                  "The base URL includes the /backend path",
                  "For OpenAI SDK compatibility, use the sdk_base_url which includes /v1",
                  "All API calls require authentication via AI_BUILDER_TOKEN in the Authorization header"
                ]
              }, null, 2)
            }
          ]
        };
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
        name: "get_base_url",
        description: "Get the base URL for AI Builders Space API. This tool provides a direct way to retrieve the base URL without parsing the deployment guide.",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Builder MCP Server started");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
