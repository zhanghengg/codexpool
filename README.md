# CodexPool

OpenAI 兼容的 API 中转代理平台。通过上游 Codex 账号池转发用户请求，支持负载均衡、用户管理、密钥管理、额度控制、套餐管理和兑换码系统。

## 功能特性

- **OpenAI 兼容 API** — 支持 `/v1/chat/completions`、`/v1/responses`、`/v1/models` 等标准端点，可直接替换 OpenAI base URL 使用
- **上游账号池** — 管理多个 Codex 上游账号，加权轮询负载均衡，自动熔断与恢复
- **Token 自动刷新** — 上游 access token 提前 2 小时自动刷新，保证服务不中断
- **用户与密钥管理** — 用户注册登录，自助创建和管理 API Key
- **套餐与额度控制** — 可配置套餐的每日请求数、Token 上限、费用上限、RPM 限流及允许模型列表
- **兑换码系统** — 批量生成兑换码，用户自助兑换激活订阅
- **用量统计** — 按日统计请求数、Token 用量和费用，支持用户端与管理端查看
- **模型降级映射** — 自动将不可用模型映射到可用替代模型
- **管理后台** — 完整的管理界面，涵盖用户、套餐、上游账号、兑换码和系统设置

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 数据库 | PostgreSQL + Prisma 6 |
| 认证 | NextAuth.js 4 (Credentials + JWT) |
| UI | Tailwind CSS 4 + shadcn/ui + Radix UI |
| 定时任务 | Vercel Cron |
| 部署 | Vercel + Neon PostgreSQL |

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 填写实际配置：

| 变量 | 必需 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | PostgreSQL 连接地址（建议使用 connection pooler） |
| `NEXTAUTH_URL` | 是 | 网站地址（如 `http://localhost:3000`） |
| `NEXTAUTH_SECRET` | 是 | NextAuth 加密密钥（可用 `openssl rand -base64 32` 生成） |
| `ADMIN_EMAIL` | 是 | 管理员邮箱（首次注册此邮箱自动成为管理员） |
| `CRON_SECRET` | 生产环境 | Vercel Cron 认证密钥 |
| `KV_REST_API_URL` | 否 | Upstash Redis URL（用于分布式限流，可选） |
| `KV_REST_API_TOKEN` | 否 | Upstash Redis Token |

### 3. 初始化数据库

```bash
npx prisma migrate dev --name init
```

### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

### 5. 初始设置

1. 使用 `ADMIN_EMAIL` 配置的邮箱注册账号（自动获得管理员权限）
2. 进入管理后台 `/admin`
3. 添加上游 Codex 账号（Upstream 管理）
4. 创建套餐（Plans 管理）
5. 生成兑换码分发给用户

## API 使用

用户获得 API Key 后，可以像使用 OpenAI API 一样调用：

```bash
curl https://your-domain.com/api/v1/chat/completions \
  -H "Authorization: Bearer sk-your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### 支持的端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/chat/completions` | POST | 对话补全（支持流式） |
| `/api/v1/responses` | POST | Responses API（Codex 原生格式透传） |
| `/api/v1/models` | GET | 可用模型列表 |

## 项目结构

```
codexpool/
├── prisma/
│   └── schema.prisma            # 数据库模型定义
├── src/
│   ├── app/
│   │   ├── (auth)/              # 登录/注册页面
│   │   ├── (dashboard)/         # 用户仪表盘
│   │   │   └── dashboard/
│   │   │       ├── page.tsx     # 概览
│   │   │       ├── keys/       # API 密钥管理
│   │   │       ├── usage/      # 用量统计
│   │   │       └── redeem/     # 兑换码兑换
│   │   ├── (admin)/             # 管理后台
│   │   │   └── admin/
│   │   │       ├── users/      # 用户管理
│   │   │       ├── plans/      # 套餐管理
│   │   │       ├── upstream/   # 上游账号管理
│   │   │       ├── codes/      # 兑换码管理
│   │   │       └── settings/   # 系统设置
│   │   ├── api/
│   │   │   ├── v1/             # OpenAI 兼容代理接口
│   │   │   ├── auth/           # 认证接口
│   │   │   ├── user/           # 用户接口
│   │   │   ├── admin/          # 管理接口
│   │   │   └── cron/           # 定时任务
│   │   └── page.tsx             # 落地页
│   ├── lib/
│   │   ├── proxy.ts             # 请求代理与格式转换
│   │   ├── load-balancer.ts     # 加权轮询负载均衡
│   │   ├── quota.ts             # 额度检查与扣减
│   │   ├── rate-limiter.ts      # RPM 限流
│   │   ├── codex-adapter.ts     # OpenAI ↔ Codex 格式适配
│   │   ├── token-refresh.ts     # 上游 Token 自动刷新
│   │   └── pricing.ts           # Token 费用估算
│   └── components/              # UI 组件
├── .env.example                  # 环境变量模板
└── vercel.json                   # Vercel Cron 配置
```

## 架构概览

```
用户请求 (OpenAI 格式)
    │
    ▼
API Key 认证 → 额度检查 → RPM 限流
    │
    ▼
负载均衡 (加权轮询)
    │
    ▼
上游 Codex 账号池 ──→ 自动熔断 / Token 刷新
    │
    ▼
响应转换 → 用量记录 → 返回用户
```

## 部署到 Vercel

1. 将项目推送到 GitHub
2. 在 [Vercel](https://vercel.com) 中导入项目
3. 添加 Vercel Postgres（或连接 [Neon](https://neon.tech) 数据库）
4. 配置环境变量
5. 部署

```bash
npx vercel --prod
```

Vercel Cron 会每日自动重置用户额度、清理过期订阅并刷新上游 Token。

## License

MIT
