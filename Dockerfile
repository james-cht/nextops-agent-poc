# Multi-stage build for NextOps (SvelteKit 2 + adapter-node) + Tool Endpoint MCP Adapter sidecar.
# Requires Node 22.19+ (undici@8). Same image runs UI/API (port 3000) or MCP adapter (port 3100).
# Base image from internal Harbor (reachable on deployment network; avoids Docker Hub).
#
# Build env source: `.env.prod` (copied to `.env.production` so Vite/SvelteKit
# production mode loads PUBLIC_* during `npm run build`).
FROM harbor-hep.corp.example.com/base/node:22 AS builder

# Build-time proxy for npm. Corporate TLS MITM requires strict-ssl off.
ARG HTTP_PROXY=http://192.0.2.3:3129
ARG HTTPS_PROXY=http://192.0.2.3:3129
ARG NO_PROXY=localhost,127.0.0.1,harbor-hep.corp.example.com
ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    NO_PROXY=${NO_PROXY} \
    no_proxy=${NO_PROXY} \
    NODE_TLS_REJECT_UNAUTHORIZED=0 \
    npm_config_strict_ssl=false \
    npm_config_fetch_timeout=600000 \
    npm_config_fetch_retries=5 \
    npm_config_fetch_retry_mintimeout=20000 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_maxsockets=5

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --prefer-offline --no-audit --no-fund

COPY mcp-adapter/package.json mcp-adapter/package-lock.json ./mcp-adapter/
RUN npm ci --prefix mcp-adapter --prefer-offline --no-audit --no-fund
COPY langgraph-orchestrator/package.json langgraph-orchestrator/package-lock.json ./langgraph-orchestrator/
RUN npm ci --prefix langgraph-orchestrator --prefer-offline --no-audit --no-fund

COPY . .
# SvelteKit/Vite production mode reads `.env.production` (not `.env.prod`).
# PUBLIC_BASE_PATH is bake-time (ADR-0035). ARG overrides / fills .env.production.
# Do not ENV an empty ARG: `PUBLIC_BASE_PATH=` shadows `.env.production` during
# `npm run build` (svelte.config.js + Vite: already-set env wins, including "").
ARG PUBLIC_BASE_PATH=
RUN test -f .env.prod || (echo "ERROR: .env.prod missing in build context" >&2; exit 1) \
  && cp .env.prod .env.production \
  && if [ -n "${PUBLIC_BASE_PATH:-}" ]; then printf '\nPUBLIC_BASE_PATH=%s\n' "$PUBLIC_BASE_PATH" >> .env.production; \
     else unset PUBLIC_BASE_PATH; fi \
  && npm run build \
  && npm prune --production \
  && npm run build --prefix mcp-adapter \
  && npm prune --prefix mcp-adapter --production \
  && npm run build --prefix langgraph-orchestrator \
  && npm prune --prefix langgraph-orchestrator --production \
  && rm -f .env.prod .env.production .env .env.local

FROM harbor-hep.corp.example.com/base/node:22 AS runner

# Build identity (git/content SHA) stamped into the image for deploy traceability.
ARG BUILD_SHA=unknown
ARG IMAGE_TAG=latest
ARG PUBLIC_BASE_PATH=
LABEL org.opencontainers.image.revision="${BUILD_SHA}" \
      org.opencontainers.image.version="${IMAGE_TAG}"
ENV NEXTOPS_BUILD_SHA=${BUILD_SHA} \
    NEXTOPS_IMAGE_TAG=${IMAGE_TAG} \
    PUBLIC_BASE_PATH=${PUBLIC_BASE_PATH}

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=3100 \
    ORCH_HOST=0.0.0.0 \
    ORCH_PORT=3200 \
    NEXTOPS_TOOL_BASE=http://127.0.0.1:3000${PUBLIC_BASE_PATH}

# Harbor node:22 base typically defines user/group node (uid/gid 1000)
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
COPY --from=builder --chown=node:node /app/mcp-adapter/dist ./mcp-adapter/dist
COPY --from=builder --chown=node:node /app/mcp-adapter/node_modules ./mcp-adapter/node_modules
COPY --from=builder --chown=node:node /app/mcp-adapter/package.json ./mcp-adapter/
COPY --from=builder --chown=node:node /app/langgraph-orchestrator/dist ./langgraph-orchestrator/dist
COPY --from=builder --chown=node:node /app/langgraph-orchestrator/node_modules ./langgraph-orchestrator/node_modules
COPY --from=builder --chown=node:node /app/langgraph-orchestrator/package.json ./langgraph-orchestrator/

# Local Settings Store (SQLite) needs a writable data dir at runtime (ADR-0012).
# /app itself is not writable for USER node; pre-create .data and prefer a volume mount.
RUN mkdir -p /app/.data && chown -R node:node /app/.data

USER node

EXPOSE 3000 3100 3200

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const port=process.env.PORT||3000; const raw=(process.env.PUBLIC_BASE_PATH||'').trim().replace(/\\/+$/,''); const prefix=!raw||raw==='/'?'':(raw.startsWith('/')?raw:'/'+raw); const urls=['http://127.0.0.1:'+port+'/api/health','http://127.0.0.1:'+port+prefix+'/api/health'].filter((u,i,a)=>a.indexOf(u)===i); Promise.any(urls.map(u=>fetch(u).then(r=>{if(!r.ok)throw new Error(String(r.status));return r;}))).then(()=>process.exit(0)).catch(()=>process.exit(1))"

CMD ["node", "build"]
