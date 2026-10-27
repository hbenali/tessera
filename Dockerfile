# Static build served by unprivileged nginx. Tessera talks to your homeserver
# directly from the browser, so the container holds no secrets or state.
# Base images are pinned by digest; Dependabot keeps the digests current.
FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
WORKDIR /src
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
# There is no git history inside the image build; pass the commit to show it under Settings > About.
ARG TESSERA_COMMIT=
ENV TESSERA_COMMIT=$TESSERA_COMMIT
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.31-alpine@sha256:b5047b9b76845eac124358373c6852377c52e4b05834a47647e955dd91cb8f1e
# Pick up Alpine security fixes that landed after the base image was built (curl, zlib, brotli).
USER root
RUN apk upgrade --no-cache
USER 101
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
