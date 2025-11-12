# AI Builders MCP Coach Server

MCP服务器作为AI部署教练，通过标准化接口向AI传授部署知识、API调用方法和最佳实践。

## 核心功能

- **get_api_specification()**: 获取AI Builders平台的OpenAPI规范和endpoint信息
- **get_deployment_guide()**: 获取部署指导（带缓存机制）
- **explain_authentication_model()**: 详细解释认证机制和使用最佳实践

## 安装和使用

```bash
# 安装
npm install -g @ai-builders/mcp-coach-server

# 配置环境变量
echo "AI_BUILDER_TOKEN=your_token_here" > .env

# 运行
npx @ai-builders/mcp-coach-server
```

## 配置

在Claude Desktop配置文件中添加：

```json
{
  "mcpServers": {
    "ai-builders-coach": {
      "command": "npx",
      "args": ["-y", "@ai-builders/mcp-coach-server"],
      "env": {
        "AI_BUILDER_TOKEN": "${AI_BUILDER_TOKEN}"
      }
    }
  }
}
```

## 开发

```bash
# 克隆项目
git clone <repository-url>
cd ai-builders-mcp-coach

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建
npm run build
```