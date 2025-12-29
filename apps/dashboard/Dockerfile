FROM node:20-alpine

WORKDIR /app/apps/dashboard

COPY apps/dashboard/package.json apps/dashboard/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY apps/dashboard ./

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

