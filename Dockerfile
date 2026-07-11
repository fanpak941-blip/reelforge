FROM node:20-bullseye

# ffmpeg is required for the visual/stitch/thumbnail pipeline and is not
# included in plain Node images — installing it here keeps the whole app
# deployable as a single free Render service with no extra add-ons.
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY . .

EXPOSE 4000
CMD ["npm", "start"]
