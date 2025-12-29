FROM node:20-alpine

WORKDIR /app/apps/unifiedtoolbox.webapp

COPY apps/unifiedtoolbox.webapp/package.json apps/unifiedtoolbox.webapp/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY apps/unifiedtoolbox.webapp ./

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

