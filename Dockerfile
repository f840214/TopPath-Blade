# TopPath Blade：純靜態網站，用 nginx 提供檔案（容器內 port 80，對外 8899 見 compose.yaml）
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY lib/ /usr/share/nginx/html/lib/
COPY assets/ /usr/share/nginx/html/assets/
