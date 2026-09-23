# OPC-Fellows 可选自托管参考后端（server/）
#
# 目标：镜像尽量小、以非 root 运行、自带 HEALTHCHECK、测试与开发文件不进镜像。
# 这是一个「可读、可改的起步模板」，不是生产级平台 —— 请按自己的需求改。

FROM node:22-alpine

# 生产运行时；容器内监听 0.0.0.0（宿主机侧的暴露面由 compose 的 127.0.0.1 绑定限制）。
ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0

WORKDIR /app

# 先只拷 manifest：依赖层可以被缓存复用，改业务代码不必重装依赖。
COPY package.json ./

# 这个起步模板刻意不提交 lockfile，所以用 install 而不是 ci。
# --omit=dev 保证测试/开发依赖根本不进镜像；装完清缓存，避免层里留下 npm 缓存与 tarball。
RUN npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force

# 只拷 src。test/、README、docker-compose.yml 等由 .dockerignore 排除。
COPY src ./src

# node:22-alpine 内置 uid 1000 的 node 用户 —— 全程非 root 运行。
USER node

EXPOSE 8787

# /health 免鉴权，因此健康检查不需要 SERVER_TOKEN。
# 注意：这是容器对「自己」的环回探测（127.0.0.1），不是对外请求。
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
