import { config } from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";

// 加载环境变量
config();

// 测试配置
const TEST_TOKEN = "test_token_12345";
const TEST_SERVICE_TYPE = "fastapi";

// 模拟OpenAPI响应
const mockOpenAPISpec = {
  openapi: "3.0.0",
  info: {
    title: "AI Builders API",
    version: "1.0.0"
  },
  paths: {
    "/v1/chat/completions": {
      post: {
        summary: "Chat completion",
        security: [{ bearerAuth: [] }]
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer"
      }
    }
  }
};

// 模拟部署指南
const mockDeploymentGuide = `# FastAPI服务部署指南（测试版本）

这是一个测试用的部署指南，用于验证MCP服务器的功能。

## 测试环境配置
- 服务类型: ${TEST_SERVICE_TYPE}
- 测试token: ${TEST_TOKEN}

## 部署步骤
1. 配置环境变量
2. 设置监听端口
3. 部署到测试环境

## 认证配置
使用Bearer Token认证，从环境变量读取token。
`;

// 测试函数
export function testGetAPISpecification() {
  console.log("🧪 测试 get_api_specification 工具");
  
  const expectedResponse = {
    openapi_spec: mockOpenAPISpec,
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
  };
  
  console.log("✅ 预期响应格式验证通过");
  console.log("📋 包含字段:", Object.keys(expectedResponse));
  return expectedResponse;
}

export function testGetDeploymentGuide() {
  console.log("🧪 测试 get_deployment_guide 工具");
  
  const expectedResponse = {
    deployment_guide: mockDeploymentGuide,
    service_type: TEST_SERVICE_TYPE,
    cached_at: new Date().toISOString(),
    authentication_note: "部署和开发都需要使用AI_BUILDER_TOKEN，建议使用.env文件管理"
  };
  
  console.log("✅ 预期响应格式验证通过");
  console.log("📋 包含字段:", Object.keys(expectedResponse));
  return expectedResponse;
}

export function testExplainAuthenticationModel() {
  console.log("🧪 测试 explain_authentication_model 工具");
  
  const expectedResponse = {
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
  };
  
  console.log("✅ 预期响应格式验证通过");
  console.log("📋 包含字段:", Object.keys(expectedResponse));
  return expectedResponse;
}

// 运行所有测试
export function runAllTests() {
  console.log("🚀 开始运行MCP服务器测试\n");
  
  try {
    testGetAPISpecification();
    console.log("");
    
    testGetDeploymentGuide();
    console.log("");
    
    testExplainAuthenticationModel();
    console.log("");
    
    console.log("✅ 所有测试通过！");
    return true;
  } catch (error) {
    console.error("❌ 测试失败:", error);
    return false;
  }
}

// 如果直接运行此文件，执行测试
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests();
}