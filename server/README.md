# server/ —— 可选、自托管的参考后端

**这不是「OPC-Fellows 的服务器」。** 桌面端依旧是本地优先的：业务数据只写你本机的 `userData`，
项目本身**没有任何第一方后端**（见仓库根目录的 [SECURITY.md](../SECURITY.md)）。

这个目录是随桌面端一起交付的**可选起步模板**：如果你想把自己的全栈应用快速部署起来，
可以直接拿它当参考后端 —— 一个可读、可改、可扩展的最小实现，约 800 行源码（另配 660 行测试）、
零框架、只依赖一个数据库客户端（`pg`）。

- 你想怎么改就怎么改，它不承诺是生产级平台。
- 你不用它，桌面端完全不受影响：`server/` 有自己的 `package.json`，**不在 pnpm workspace 里**，
  不会被桌面端的 `pnpm install` / `pnpm build` / `pnpm test` 加载或影响。
- 一旦你部署它，**你就是数据控制者**：库、备份、TLS、访问控制都归你。

---

## 30 秒跑起来（Docker Compose）

```bash
cd server
cp .env.example .env

# 1) 生成强随机 token（README 下面还有更多安全注意事项）
openssl rand -hex 32           # 填进 .env 的 SERVER_TOKEN
openssl rand -hex 24           # 填进 .env 的 POSTGRES_PASSWORD

# 2) 起 server + postgres
docker compose up -d --build

# 3) 探活（免鉴权）
curl -s http://127.0.0.1:8787/health
# {"ok":true,"service":"opc-fellows-server","uptimeMs":41,"time":"..."}

# 4) 带 token 访问业务接口
curl -s http://127.0.0.1:8787/v1/notes \
  -H "Authorization: Bearer $SERVER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"部署笔记","body":"第一步：换掉 token。","device_id":"macbook"}'
```

`docker compose` 会做这些事：起一个 Postgres（**不映射任何宿主机端口**）、
在命名 volume `db-data` 上持久化、等 `pg_isready` 通过后再启动 server、
把 server 只发布到 **`127.0.0.1:8787`**（不是 `0.0.0.0`）。

## 不用 Docker，直接在本机跑

```bash
cd server
npm install                    # 只有生产依赖 pg
SERVER_TOKEN=$(openssl rand -hex 32) STORE=memory npm run dev
```

`STORE=memory` 是给本地试跑用的内存实现：**进程退出数据就没了**，只适合看接口长什么样。
要用 Postgres 就跑 `STORE=postgres DATABASE_URL=postgres://... npm start`。

---

## 环境变量

| 变量 | 必需 | 默认 | 说明 |
| --- | --- | --- | --- |
| `SERVER_TOKEN` | ✅ | — | `/health` 之外所有接口的 Bearer 凭证。空或短于 16 字符 -> **拒绝启动**。 |
| `DATABASE_URL` | ✅(postgres) | — | `STORE=postgres` 时必需。`STORE=memory` 时忽略。 |
| `STORE` | | `postgres` | `postgres` \| `memory`。 |
| `HOST` | | `127.0.0.1` | 监听地址。**默认只监听本机**；容器里由 compose 显式设成 `0.0.0.0`。 |
| `PORT` | | `8787` | 监听端口。 |
| `MAX_BODY_BYTES` | | `1048576`（1 MiB） | 请求体上限，超出 -> `413 body_too_large`。 |
| `REQUEST_TIMEOUT_MS` | | `15000` | 单请求超时（Node `server.requestTimeout`）。 |
| `HEADERS_TIMEOUT_MS` | | `20000` | 请求头超时。 |
| `KEEP_ALIVE_TIMEOUT_MS` | | `5000` | keep-alive 空闲超时。 |
| `CORS_ORIGIN` | | 空 = **关闭** | 逗号分隔白名单。填 `*` -> **拒绝启动**。 |
| `LOG_LEVEL` | | `info` | `error` \| `warn` \| `info` \| `debug`。 |

变量由部署环境注入（compose 的 `env_file` / 你的进程管理器），代码不会自己去读 `.env`。

---

## 接口

除 `GET /health` 外，**所有**请求都必须带 `Authorization: Bearer <SERVER_TOKEN>`，
否则 `401 {"ok":false,"code":"unauthorized"}`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 免鉴权。`{ ok:true, service, uptimeMs, time }` |
| `GET` | `/v1/todos` | `{ ok:true, items:[...] }`，支持 `?limit=`(1-200，默认 50)、`?device_id=` |
| `POST` | `/v1/todos` | body `{ text, device_id? }` -> `{ ok:true, item }` |
| `GET` | `/v1/notes` | `{ ok:true, items:[...] }`，支持 `?limit=`、`?device_id=` |
| `POST` | `/v1/notes` | body `{ title?, body, device_id? }` -> `{ ok:true, item }` |

命名和桌面端的本机 API（`/todos`、`ok`/`item`/`items`/`code` 信封、错误码）保持一致，
方便你以后把两边对接起来。字段用 `snake_case`（`device_id`、`created_at`）。

### 响应形状

```jsonc
// 待办
{ "id": "uuid", "text": "…", "done": false, "status": "open",
  "device_id": "macbook", "created_at": "2026-09-21T05:41:00.000Z" }

// 笔记
{ "id": "uuid", "title": "… | null", "body": "…",
  "device_id": "unspecified", "created_at": "2026-09-21T05:41:00.000Z" }
```

请求里没带 `device_id` 时落库为 `"unspecified"` —— 保证每行都有来源标记，
你要区分设备就自己传一个稳定值（主机名、安装 id 之类）。

### 错误码

错误体统一是 `{ ok:false, error:<给人看的一句话>, code:<给程序认的常量> }`。
**不会回显堆栈、SQL 或文件路径**；内部细节只进服务端日志。

| 状态 | `code` | 场景 |
| --- | --- | --- |
| 400 | `invalid_body` | body 不是合法 JSON / 不是对象 / 缺字段 / 类型错 / 空串 |
| 400 | `invalid_query` | `limit` 非法，或 `device_id` 为空 |
| 401 | `unauthorized` | 缺 token、格式不对、token 错 |
| 404 | `not_found` | 路由不存在 |
| 405 | `method_not_allowed` | 路径对、方法不对 |
| 413 | `body_too_large` | 超过 `MAX_BODY_BYTES` |
| 500 | `internal` | 服务端异常（细节只在日志里） |

---

## 安全默认值

这些都是刻意的默认值，不是"还没来得及做"。

1. **不采集任何遥测 / 埋点，不向任何外部服务发请求。** 代码里没有 `fetch`、没有 HTTP 客户端、
   没有 analytics SDK；唯一的出站连接是 `pg` 连到**你自己**的 `DATABASE_URL`。
   这条承诺有回归测试盯着：`test/no-telemetry.test.js` 会扫 `src/`，发现出站/遥测代码就失败。
   （唯一的例外是容器健康检查对**自身** `127.0.0.1/health` 的环回探测，写在 `Dockerfile` 里，
   不在 `src/` 里，也不出容器。）
2. **CORS 默认完全关闭。** 默认一个 CORS 头都不发。要开就显式列白名单来源；
   填 `*` 会被拒绝启动 —— 通配 CORS 配 Bearer token 等于把接口交给任意网页。
3. **默认只监听 `127.0.0.1`。** 进程默认不对外。compose 里 server 也只发布到宿主机回环；
   容器内监听 `0.0.0.0` 只是为了被 docker 网络转发，暴露面仍由宿主的 `127.0.0.1:` 绑定限制。
4. **数据库不暴露公网。** compose 里 `db` 服务**没有** `ports:`，只在 compose 内部网络可达；
   数据落在命名 volume `db-data` 上，重建容器不丢数据。
5. **请求体上限 + 超时。** 默认 1 MiB / 15s，慢连接不会无限占住 worker（`413` 而不是被打爆内存）。
6. **日志里绝不出现 token。** 访问日志只记方法、路径（**去掉查询串**）、状态码、耗时、
   响应字节数；`Authorization` / `Cookie` / 请求体一律不碰。
   token 也**只认 `Authorization` 头**：放在查询串里的 token 不认，就是为了不让它漏进日志。
7. **常量时间比较 token。** 用 `crypto.timingSafeEqual`，长度不同直接判否，避免逐字节短路的时序侧信道。
8. **配置错误 fail fast。** token 缺失/过短、`CORS_ORIGIN=*`、`STORE=postgres` 没有 `DATABASE_URL`、
   端口不是合法整数 —— 一律拒绝启动并说明怎么修。报错信息不回显 token 值。
9. **镜像非 root、无测试文件。** `Dockerfile` 以 `node` 用户运行，
   `.dockerignore` 排除 `test/`、`.env`、compose 文件，镜像里没有测试和密钥。
10. **5xx 不回显内部细节。** 数据库报错、SQL、堆栈都不出网，只写服务端日志。

### 部署者必须自己负责的部分（我们没做，也不该替你做）

- **TLS 由你负责。** 这个进程只说 HTTP，**不要**把 `127.0.0.1:8787` 直接怼到公网。
  请在前面放一个反向代理（Caddy / nginx / Traefik）终止 TLS，再转发到本服务。
- **token 必须是强随机值。** `openssl rand -hex 32`，别用手打的短语。
  轮换就是改 `.env` 里的 `SERVER_TOKEN` 再 `docker compose up -d`。
- **不要把 token 内置进客户端代码。** 任何塞进前端 bundle / 桌面 app / 手机 app 的 token
  都等于公开 —— 那类客户端应该走你自己的用户鉴权，由服务端按用户签发短期凭证。
- **数据库别暴露公网。** 保持 compose 现状（无 `ports:`）。要远程连库就走 SSH 隧道或私网。
- **备份和容量自己管。** `docker compose exec db pg_dump -U opc opc_fellows > backup.sql`
  是最低配方案；`db-data` volume 的迁移/快照也归你。
- **这是一个 token 而不是多用户系统。** 拿到 token 的人就能读写全部数据。
  要多用户，就把 `app.js` 里的 `isAuthorized()` 换成你自己的身份层。

---

## 数据库

表结构在启动时用 `CREATE TABLE IF NOT EXISTS` **幂等**创建（`src/pg-store.js`），
故意不引迁移工具 —— 这是起步模板，不是迁移系统。改字段时请接你自己的迁移流程。

```sql
todos (id uuid pk, text text not null, done boolean not null default false,
       device_id text not null, created_at timestamptz not null default now())
notes (id uuid pk, title text, body text not null,
       device_id text not null, created_at timestamptz not null default now())
```

两个容易踩到的点：

- `POSTGRES_PASSWORD` 忘了填，`db` 会**拒绝初始化**并明确报错让你去设
  （不会退化成 `trust` 认证的裸库）。这是刻意的：宁可起不来，也不要起一个没密码的库。
- 忘了 `cp .env.example .env`，`docker compose up` 会因为 `env_file: .env` 找不到文件而报错。
  先复制再起。

---

## 测试

```bash
cd server
npm test          # 等价于 node --test
```

46 个用例，**不依赖任何真实数据库、不需要网络、不需要 `pg`**：
存储层就是那个可替换的接缝 —— 测试统一通过 `createApp({ store: createMemoryStore() })`
注入内存实现（见 `test/helpers.js`）。覆盖：无 token / 错 token / 正确 token、
POST 后 GET 读回（含中文）、空 body -> `400 invalid_body`、`/health` 免鉴权、
CORS 默认关闭、请求体超限、错误体不泄露内部信息、以及上面第 1 条「不出站」的回归测试。

> `node --test` 会把 `test/helpers.js` 也当文件加载一次（0 个用例，通过），
> 那是共享的测试夹具，不是用例文件。

---

## 目录

```
server/
├── .dockerignore
├── .env.example          # 变量模板（真值请写进 .env，已被仓库 .gitignore 忽略）
├── Dockerfile            # node:22-alpine，非 root，带 HEALTHCHECK
├── docker-compose.yml    # server + postgres，命名 volume，db 不暴露端口
├── package.json          # 独立包，不在 pnpm workspace
├── README.md
├── src/
│   ├── app.js            # 零框架 HTTP 层：路由 / 鉴权 / 校验 / CORS
│   ├── config.js         # 环境变量读取与校验（fail fast）
│   ├── log.js            # 本地日志，token 永不入日志
│   ├── pg-store.js       # Postgres 实现 + 幂等 DDL
│   ├── server.js         # 进程入口：装配、监听、优雅退出
│   └── store.js          # 存储接缝：内存实现 + createStore 工厂
└── test/                 # node --test
```
