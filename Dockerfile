FROM node:lts

WORKDIR /app

COPY package.json /app/package.json
COPY pnpm-lock.yaml /app/pnpm-lock.yaml
COPY pnpm-workspace.yaml /app/pnpm-workspace.yaml

COPY ./package /app/package
COPY ./docs /app/docs

WORKDIR /app/docs

RUN apt-get update && apt-get install -y --no-install-recommends \
  python3 make gcc g++ \
  && rm -rf /var/lib/apt/lists/*
    
RUN corepack enable
RUN pnpm install
RUN pnpm build

CMD ["pnpm", "start"]