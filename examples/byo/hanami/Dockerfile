# A real `hanami new` app (Ruby 3.4, no database): the generator runs at build time.
FROM ruby:3.4-slim@sha256:65680693964528b522a38d85ec5065538c7ab9e75268802aab9770f39ee56de0
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends build-essential git libyaml-dev curl >/dev/null \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
RUN gem install hanami --no-document >/dev/null \
 && hanami new bookshelf --skip-db --skip-assets
WORKDIR /work/bookshelf
RUN bundle install --quiet
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --no-create-home app
RUN chown -R app:app /work
USER app
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ruby -rsocket -e "TCPSocket.new('127.0.0.1', ${PORT:-2300}).close"
# The server must listen beyond loopback (--host) and on Flisk's port.
CMD ["sh", "-c", "exec bundle exec hanami server --host 0.0.0.0 --port ${PORT:-2300}"]
