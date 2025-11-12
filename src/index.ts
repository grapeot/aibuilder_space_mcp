import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from "dotenv";
import { readFile, writeFile, access } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

// 加载环境变量
dotenv.config();

// 缓存文件路径
const CACHE_DIR = join(homedir(), ".ai-builders-mcp-cache");
const DEPLOYMENT_GUIDE_CACHE = join(CACHE_DIR, "deployment_guide_cache.json");

// 确保缓存目录存在
async function ensureCacheDir() {
  try {
    await access(CACHE_DIR);
  } catch {
    await import("fs").then(fs => fs.promises.mkdir(CACHE_DIR, { recursive: true }));
  }
}

// 默认部署指南
function getDefaultDeploymentGuide(serviceType: string = "fastapi"): string {
  return `# ${serviceType.toUpperCase()} 服务部署指南

## 前提条件
- 公开的GitHub仓库
- 监听PORT环境变量
- 包含依赖配置文件（requirements.txt/package.json等）

## 部署步骤
1. 准备Dockerfile
2. 配置环境变量
3. 设置AI_BUILDER_TOKEN
4. 部署到目标平台

## 认证配置
- 使用Bearer Token认证
- 从环境变量读取AI_BUILDER_TOKEN
- 在Authorization头中包含token

## 环境变量示例
\`\`\`bash
AI_BUILDER_TOKEN=your_token_here
DEPLOYMENT_TARGET=production
PORT=8000
\`\`\`

## 代码示例
\`\`\`python
import os
import requests

# 从环境变量读取token
token = os.getenv("AI_BUILDER_TOKEN")
headers = {"Authorization": f"Bearer {token}"}
\`\`\``;
}

// 获取缓存的部署指南
async function getCachedDeploymentGuide(): Promise<{
  content: string;
  cached_at?: string;
  source: string;
}> {
  await ensureCacheDir();
  
  try {
    // 检查缓存是否存在且未过期（24小时）
    const cacheContent = await readFile(DEPLOYMENT_GUIDE_CACHE, 'utf-8');
    const cacheData = JSON.parse(cacheContent);
    const cachedTime = new Date(cacheData.cached_at);
    const now = new Date();
    
    if (now.getTime() - cachedTime.getTime() < 24 * 60 * 60 * 1000) {
      return cacheData;
    }
  } catch {
    // 缓存不存在或无效，继续获取新内容
  }
  
  // 获取最新内容
  try {
    const response = await fetch("https://www.ai-builders.com/resources/students/deployment-prompt.md");
    if (response.ok) {
      const content = await response.text();
      const cacheData = {
        content,
        cached_at: new Date().toISOString(),
        source: "remote"
      };
      
      // 保存缓存
      try {
        await writeFile(DEPLOYMENT_GUIDE_CACHE, JSON.stringify(cacheData, null, 2));
      } catch (error) {
        console.error("缓存写入失败:", error);
      }
      
      return cacheData;
    }
  } catch (error) {
    console.error("获取远程部署指南失败:", error);
  }
  
  // 网络失败时使用默认内容
  return {
    content: getDefaultDeploymentGuide(),
    cached_at: new Date().toISOString(),
    source: "default"
  };
}

// 创建MCP服务器
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

// 工具处理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  try {
    switch (name) {
      case "get_api_specification": {
        // 直接获取OpenAPI规范（不缓存）
        const response = await fetch("https://www.ai-builders.com/resources/students-backend/openapi.json");
        if (!response.ok) {
          throw new Error(`无法获取OpenAPI规范: HTTP ${response.status}`);
        }
        
        const openapiSpec = await response.json();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                openapi_spec: openapiSpec,
                endpoint_info: {
                  base_url: "https://api.ai-builders.com",
                  description: "AI Builders平台API基础地址",
                  note: "所有API调用都需要基于此URL"
                },
                authentication: {
                  type: "bearer_token",
                  header: "Authorization: Bearer {AI_BUILDER_TOKEN}",
                  token_source: "环境变量 AI_BUILDER_TOKEN"
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
                authentication_note: "部署和开发都需要使用AI_BUILDER_TOKEN，建议使用.env文件管理"
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
                  shared_principle: "同一个token在部署和开发阶段都使用",
                  best_practices: [
                    "使用.env文件管理token",
                    "不要将token硬编码在代码中",
                    "在.gitignore中添加.env避免提交",
                    "为不同环境设置不同的token"
                  ]
                },
                environment_setup: {
                  example_env_content: "AI_BUILDER_TOKEN=your_token_here\nDEPLOYMENT_TARGET=development",
                  loading_method: "python-dotenv或类似工具加载环境变量",
                  usage_example: `import os
from dotenv import load_dotenv

load_dotenv()  # 加载.env文件

token = os.getenv("AI_BUILDER_TOKEN")
headers = {"Authorization": f"Bearer {token}"}`
                },
                deployment_note: "部署时平台会自动注入AI_BUILDER_TOKEN，但开发时仍需手动设置"
              }, null, 2)
            }
          ]
        };
      }
      
      default:
        throw new Error(`未知的工具: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: errorMessage,
            suggestion: "请检查网络连接或稍后重试"
          })
        }
      ],
      isError: true
    };
  }
});

// 工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "get_api_specification",
        description: "获取AI Builders平台的OpenAPI规范，包含完整的endpoint信息",
        inputSchema: {
          type: "object",
          properties: {}
        }
      },
      {
        name: "get_deployment_guide",
        description: "获取部署指导，包含缓存机制",
        inputSchema: {
          type: "object",
          properties: {
            service_type: {
              type: "string",
              description: "服务类型（如fastapi、express等）",
              default: "fastapi"
            }
          }
        }
      },
      {
        name: "explain_authentication_model",
        description: "详细解释认证机制，强调部署和开发的共享使用",
        inputSchema: {
          type: "object",
          properties: {}
        }
      }
    ]
  };
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("AI Builders MCP Coach Server 已启动");
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});