FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY di-bake saat build oleh Vite.
# Untuk deploy, lebih disarankan memakai Vercel (env diset di dashboard),
# bukan image ini. Default kosong di sini hanya agar `docker build` lokal tidak gagal.
ARG VITE_SUPABASE_URL=
ARG VITE_SUPABASE_ANON_KEY=
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
