FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY README.md ./
RUN mkdir -p data
ENV PORT=3000
EXPOSE 3000
CMD ["npm","start"]
