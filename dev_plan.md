# MCP作为AI部署教练的实施方案

## 项目概述

将MCP (Model Context Protocol) 服务器作为"部署教练"而非传统"执行器"，通过标准化接口向AI传授部署知识、API调用方法和最佳实践。

## 核心创新点

### 反常规MCP应用模式
- **传统MCP**: AI调用工具执行具体操作
- **本方案**: MCP返回教学内容和指导，AI学习后自主执行
- **核心价值**: 标准化知识传递，降低AI学习复杂部署流程的成本

## 技术架构设计

### 传输方式：stdio
- **选择理由**: 简单直接，通过`npx`快速启动，完美适配本地开发环境
- **部署方式**: `npx -y @ai-builders/mcp-coach-server`

### 认证机制：API Key
- **选择理由**: 简单直接，适合机器间通信，无需复杂OAuth流程
- **实现方式**: 通过环境变量`AI_BUILDER_TOKEN`传递

## MCP服务器核心功能

### 1. `get_api_specification()` - 获取OpenAPI规范
```python
@mcp.tool("get_api_specification")
async def get_api_specification() -> dict:
    """获取AI Builders平台的OpenAPI规范，包含完整的endpoint信息"""
    
    # 直接获取OpenAPI规范
    async with aiohttp.ClientSession() as session:
        async with session.get("https://space.ai-builders.com/students-backend/openapi.json") as response:
            openapi_spec = await response.json()
    
    # 添加endpoint信息（OpenAPI规范中缺少的）
    return {
        "openapi_spec": openapi_spec,
        "endpoint_info": {
            "base_url": "https://api.ai-builders.com",
            "description": "AI Builders平台API基础地址",
            "note": "所有API调用都需要基于此URL"
        },
        "authentication": {
            "type": "bearer_token",
            "header": "Authorization: Bearer {AI_BUILDER_TOKEN}",
            "token_source": "环境变量 AI_BUILDER_TOKEN"
        }
    }
```

### 2. `get_deployment_guide()` - 获取部署指导
```python
@mcp.tool("get_deployment_guide")
async def get_deployment_guide(service_type: str = "fastapi") -> dict:
    """获取部署指导，包含缓存机制"""
    
    # 获取部署指南（带缓存）
    cached_guide = await get_cached_deployment_guide()
    
    return {
        "deployment_guide": cached_guide["content"],
        "service_type": service_type,
        "cached_at": cached_guide.get("cached_at"),
        "authentication_note": "部署和开发都需要使用AI_BUILDER_TOKEN，建议使用.env文件管理"
    }

async def get_cached_deployment_guide():
    """带缓存的部署指南获取"""
    # 简单缓存实现：每天更新一次
    cache_file = ".deployment_guide_cache.json"
    
    try:
        # 检查缓存是否存在且未过期（24小时）
        if os.path.exists(cache_file):
            with open(cache_file, 'r') as f:
                cache_data = json.load(f)
                cached_time = datetime.fromisoformat(cache_data["cached_at"])
                if datetime.now() - cached_time < timedelta(hours=24):
                    return cache_data
    except Exception:
        pass
    
    # 获取最新内容
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("https://space.ai-builders.com/deployment-prompt.md") as response:
                content = await response.text()
                cache_data = {
                    "content": content,
                    "cached_at": datetime.now().isoformat(),
                    "source": "remote"
                }
    except Exception:
        # 网络失败时使用默认内容
        cache_data = {
            "content": get_default_deployment_guide(),
            "cached_at": datetime.now().isoformat(),
            "source": "default"
        }
    
    # 保存缓存
    try:
        with open(cache_file, 'w') as f:
            json.dump(cache_data, f)
    except Exception:
        pass  # 缓存失败不影响功能
    
    return cache_data

def get_default_deployment_guide():
    """默认部署指南"""
    return """
    # FastAPI服务部署指南
    
    ## 前提条件
    - 公开的GitHub仓库
    - 监听PORT环境变量
    - 包含requirements.txt
    
    ## 部署步骤
    1. 准备Dockerfile
    2. 配置环境变量
    3. 设置AI_BUILDER_TOKEN
    4. 部署到目标平台
    
    ## 认证配置
    - 使用Bearer Token认证
    - 从环境变量读取AI_BUILDER_TOKEN
    - 在Authorization头中包含token
    """
```

### 3. `explain_authentication_model()` - 认证机制详解
```python
@mcp.tool("explain_authentication_model")
async def explain_authentication_model() -> dict:
    """详细解释认证机制，强调部署和开发的共享使用"""
    
    return {
        "authentication_model": {
            "token_type": "AI_BUILDER_TOKEN",
            "usage_scenarios": ["deployment", "development", "api_calls"],
            "shared_principle": "同一个token在部署和开发阶段都使用",
            "best_practices": [
                "使用.env文件管理token",
                "不要将token硬编码在代码中",
                "在.gitignore中添加.env避免提交",
                "为不同环境设置不同的token"
            ]
        },
        "environment_setup": {
            "example_env_content": "AI_BUILDER_TOKEN=your_token_here\nDEPLOYMENT_TARGET=development",
            "loading_method": "python-dotenv或类似工具加载环境变量",
            "usage_example": """
import os
from dotenv import load_dotenv

load_dotenv()  # 加载.env文件

token = os.getenv("AI_BUILDER_TOKEN")
headers = {"Authorization": f"Bearer {token}"}
            """
        },
        "deployment_note": "部署时平台会自动注入AI_BUILDER_TOKEN，但开发时仍需手动设置"
    }
```

## 环境配置

### MCP配置（claude_desktop_config.json）
```json
{
  "mcpServers": {
    "ai-builder-mcp": {
      "command": "npx",
      "args": ["-y", "@ai-builders/mcp-coach-server"],
      "env": {
        "AI_BUILDER_TOKEN": "${AI_BUILDER_TOKEN}"
      }
    }
  }
}
```

### 开发环境配置（.env文件）
```bash
# 开发环境变量
AI_BUILDER_TOKEN=your_development_token_here
DEPLOYMENT_TARGET=development
```

### .gitignore配置
```
# 环境变量文件
.env
.env.local
.env.*.local

# 缓存文件
.deployment_guide_cache.json
```

## 使用流程

### 1. AI获取API信息
```
用户: 我想了解AI Builders平台的API
AI: 我来获取平台的API规范信息
→ 调用 get_api_specification()
← 返回OpenAPI规范和endpoint信息
AI: 基于API规范，我可以帮你生成调用代码...
```

### 2. AI获取部署指导
```
用户: 如何部署FastAPI服务？
AI: 我来获取部署指导信息
→ 调用 get_deployment_guide("fastapi")
← 返回部署指南和认证说明
AI: 根据部署指南，你需要以下步骤...
```

### 3. AI理解认证机制
```
用户: 如何使用AI Builder Token？
AI: 我来解释认证机制
→ 调用 explain_authentication_model()
← 返回详细的认证使用说明
AI: AI Builder Token在部署和开发阶段都需要使用...
```

## 关键设计决策

### 1. 不缓存API规范
- **原因**: OpenAPI规范相对稳定，且需要实时获取最新版本
- **优势**: 确保AI始终获取最新的API信息
- **网络依赖**: 本是在线服务，无网络时无法开发

### 2. 简化功能集合
- **移除generate_client_code**: AI看到OpenAPI规范后可自主生成代码
- **整合认证说明**: 将认证机制融入部署指导中
- **专注核心**: 只做信息获取和传递，不做代码生成

### 3. 缓存部署指南
- **原因**: 部署指南可能较大，且更新频率相对较低
- **策略**: 24小时缓存，支持网络失败降级
- **优化**: 减少重复网络请求，提升响应速度

## 安全考虑

### 1. Token管理
- **环境变量**: 始终通过环境变量传递，不硬编码
- **文件隔离**: .env文件加入.gitignore，避免提交到版本控制
- **环境分离**: 支持不同环境使用不同token

### 2. 缓存安全
- **本地缓存**: 缓存文件存储在本地，不暴露敏感信息
- **容错设计**: 网络失败时使用默认内容，不影响功能
- **清理机制**: 支持手动清理缓存文件

### 3. 信息脱敏
- **通用化内容**: 返回的教学内容不包含具体敏感信息
- **配置分离**: 敏感配置通过环境变量管理
- **使用指导**: 强调最佳实践，引导安全使用

## 实施计划

### Phase 1: 核心功能（1周）
- [ ] 实现`get_api_specification()`工具
- [ ] 实现`get_deployment_guide()`工具（带缓存）
- [ ] 实现`explain_authentication_model()`工具
- [ ] 基础错误处理和降级机制

### Phase 2: 优化完善（1周）
- [ ] 缓存机制优化（过期策略、清理工具）
- [ ] 配置管理完善（多环境支持）
- [ ] 使用文档和示例代码
- [ ] 基础测试和验证

### Phase 3: 集成测试（1周）
- [ ] 与AI编辑器集成测试
- [ ] 真实场景使用验证
- [ ] 性能优化和错误处理
- [ ] 用户反馈收集和改进

## 预期效果

### 1. 开发效率提升
- **知识获取**: AI能够快速获取准确的部署和API信息
- **标准化**: 统一的教学内容确保一致性
- **实时性**: 直接获取最新规范，避免信息过时

### 2. 使用体验优化
- **简单配置**: npx一键启动，无需复杂设置
- **环境友好**: 支持本地开发环境配置
- **容错处理**: 网络问题时有降级方案

### 3. 安全实践推广
- **最佳实践**: 通过教学内容推广安全最佳实践
- **配置规范**: 引导使用.env等标准配置方式
- **环境隔离**: 强调不同环境的token分离使用

这个方案专注于核心功能，去除不必要的复杂性，让AI能够快速、准确地获取所需的部署和API知识。