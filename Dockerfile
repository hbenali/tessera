# Static build served by unprivileged nginx. Tessera talks to your homeserver
# directly from the browser, so the container holds no secrets or state.
FROM node:22-alpine AS build
WORKDIR /src
COPY app/package.json app/package-lock.json ./
RUN npm ci
COPY app/ ./
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
