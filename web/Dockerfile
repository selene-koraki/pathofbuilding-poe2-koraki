# PoB2 Web — single image running the Node gateway + LuaJIT engine kernel.
# Build context is the repo root:  docker build -f web/Dockerfile -t pob2-web .

# ---- toolchain: Node + LuaJIT + the rocks the engine needs --------------------
FROM node:20-bookworm-slim AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends \
      luajit lua5.1 luarocks gcc make git zlib1g-dev libreadline-dev ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Real Deflate/Inflate (build codes) + the engine's UTF-8 support.
RUN luarocks install lua-zlib && luarocks install luautf8
# LuaJIT (prefix /usr) must see luarocks' /usr/local trees.
ENV LUA_CPATH="/usr/local/lib/lua/5.1/?.so;;" \
    LUA_PATH="/usr/local/share/lua/5.1/?.lua;/usr/local/share/lua/5.1/?/init.lua;;"

# ---- deps: install + build the SPA -------------------------------------------
FROM toolchain AS build
WORKDIR /app
COPY web/app/package.json web/app/package-lock.json* web/app/
RUN cd web/app && npm install
COPY web/server/package.json web/server/package-lock.json* web/server/
RUN cd web/server && npm install
COPY . .
RUN cd web/app && npm run build

# ---- runtime -----------------------------------------------------------------
FROM toolchain AS runtime
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production \
    PORT=7632 \
    HOST=0.0.0.0 \
    POB_BUILD_DIR=/app/web/builds
EXPOSE 7632
WORKDIR /app/web/server
CMD ["npm", "run", "start"]
