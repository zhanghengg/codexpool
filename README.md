# CodexPool

OpenAI 兼容 API 中转代理平台。通过上游 Codex 账号池转发用户请求，支持用户管理、密钥管理、额度控制、套餐管理和兑换码系统。

## 技术栈

- **Next.js 16** (App Router)
- **Prisma 6** + PostgreSQL (Vercel Postgres / Neon)
- **NextAuth.js** (Credentials 认证)
- **Tailwind CSS** + **shadcn/ui**
- **Vercel Cron** (每日额度重置)

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env` 文件并填写配置：

```bash
cp .env .env.local
```

必要的环境变量：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接地址 |
| `NEXTAUTH_URL` | 网站地址 (如 `http://localhost:3000`) |
| `NEXTAUTH_SECRET` | NextAuth 加密密钥 (随机字符串) |
| `ADMIN_EMAIL` | 管理员邮箱 (首次注册此邮箱自动成为管理员) |
| `CRON_SECRET` | Vercel Cron 认证密钥 |

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

支持的端点：
- `POST /api/v1/chat/completions` — 对话补全 (支持流式)
- `POST /api/v1/embeddings` — 向量嵌入
- `GET /api/v1/models` — 可用模型列表

## 部署到 Vercel

1. 将项目推送到 GitHub
2. 在 Vercel 中导入项目
3. 关联 Vercel Postgres 数据库
4. 配置环境变量
5. 部署

```bash
npx vercel --prod
```

## 项目结构

```
src/
├── app/
│   ├── (auth)/          # 登录/注册页面
│   ├── (dashboard)/     # 用户仪表盘
│   ├── (admin)/         # 管理后台
│   └── api/
│       ├── v1/          # OpenAI 兼容代理接口
│       ├── auth/        # 认证接口
│       ├── user/        # 用户接口
│       ├── admin/       # 管理接口
│       └── cron/        # 定时任务
├── lib/                 # 核心逻辑
│   ├── proxy.ts         # 代理转发
│   ├── load-balancer.ts # 负载均衡
│   ├── quota.ts         # 额度管理
│   └── rate-limiter.ts  # 限流器
└── components/          # UI 组件
```

## License

MIT
