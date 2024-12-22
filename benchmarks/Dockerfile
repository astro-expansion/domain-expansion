FROM node:lts

COPY . /app

WORKDIR /app

RUN apt-get update && apt-get install -y \
  hyperfine \
  git

RUN corepack enable

ENTRYPOINT []