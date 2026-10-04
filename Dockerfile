FROM caddy:2-alpine
COPY index.html app.css app.js sw.js manifest.webmanifest /srv/
COPY icons /srv/icons
COPY Caddyfile /etc/caddy/Caddyfile
