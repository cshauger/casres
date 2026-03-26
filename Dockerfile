FROM caddy:2-alpine
COPY index.html /srv/
COPY privacy.html /srv/
COPY terms.html /srv/
COPY api /srv/api
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
