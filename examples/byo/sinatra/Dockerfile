# A minimal Sinatra 4 app (Sinatra has no project generator, so the app is the files next to this Dockerfile).
FROM ruby:3.4-slim@sha256:65680693964528b522a38d85ec5065538c7ab9e75268802aab9770f39ee56de0
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends build-essential >/dev/null && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Gemfile ./
RUN bundle install --quiet
COPY app.rb ./
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app && chown -R app:app .
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ruby -rsocket -e "TCPSocket.new('127.0.0.1', ${PORT:-3000}).close"
# Classic-style apps start their own server when run directly (Puma here); app.rb binds 0.0.0.0 and reads PORT.
CMD ["ruby", "app.rb"]
