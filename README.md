# AI Builders MCP Coach Server

MCP服务器作为AI部署教练，通过标准化接口向AI传授部署知识、API调用方法和最佳实践。

## 核心功能

- **get_api_specification()**: 获取AI Builders平台的OpenAPI规范和endpoint信息
- **get_deployment_guide()**: 获取部署指导（带缓存机制）
- **explain_authentication_model()**: 详细解释认证机制和使用最佳实践
- **get_auth_token()**: 返回环境中的 AI_BUILDER_TOKEN（默认打码）
- **create_env_file()**: 在指定目录创建包含 AI_BUILDER_TOKEN 的 .env 文件

## 本地开发和使用

### 快速开始（开发模式）

```bash
# 1. 克隆项目
git clone <repository-url>
cd student_portal_mcp

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，添加你的 AI_BUILDER_TOKEN

# 4. 运行开发服务器
npm run dev
```

### 使用MCP Inspector测试

```bash
# 安装Inspector
npm install -g @modelcontextprotocol/inspector

# 运行Inspector（在另一个终端）
mcp-inspector

# 在Inspector界面中，选择以下任一方式：
# 方式1（推荐）: npx tsx /Users/grapeot/co/student_portal_mcp/src/index.ts
# 方式2: node /Users/grapeot/co/student_portal_mcp/dist/index.js
# 然后点击 Connect
```

### 正式发布后使用

等发布到npm后，可以这样使用：

```bash
# 安装
npm install -g @ai-builders/mcp-coach-server

# 运行
npx @ai-builders/mcp-coach-server
```

### 配置到AI编辑器

在Claude Desktop配置文件中添加：

```json
{
  "mcpServers": {
    "ai-builders-coach": {
      "command": "npx",
      "args": ["tsx", "/Users/grapeot/co/student_portal_mcp/src/index.ts"],
      "env": {
        "AI_BUILDER_TOKEN": "your_token_here"
      }
    }
  }
}
```

## 工具使用示例

```json
{
  "tool": "get_api_specification",
  "arguments": {}
}
```

返回内容为英文，并包含：
- `endpoint_info.base_url`（自动从 OpenAPI servers 推断）
- `sdk_compatibility.openai_sdk_compatible`（标注兼容 OpenAI SDK）
- 示例：`/v1/chat/completions`

```json
{
  "tool": "get_auth_token",
  "arguments": { "masked": true }
}
```

返回打码后的 token；若需要写入 .env：

```json
{
  "tool": "create_env_file",
  "arguments": { "target_dir": "/path/to/project", "overwrite": false }
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
