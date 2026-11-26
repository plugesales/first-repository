FROM node:22-alpine AS builder
WORKDIR /app

ARG VITE_API_URL=/api/v1
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}

COPY package*.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
COPY apps ./apps

RUN npm install
RUN npm run prisma:generate --workspace=@nfse-hub/api
RUN npm run build:base && npm run build --workspaces --if-present

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache nginx openssl

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services ./services
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

RUN mkdir -p /etc/nginx/http.d && cat <<'EOF' > /etc/nginx/http.d/default.conf
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

EXPOSE 80 3001
CMD ["sh", "-c", "npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma || true; node apps/api/dist/main.js & node services/worker/dist/index.js & nginx -g 'daemon off;'"]
