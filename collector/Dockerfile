FROM node:22-bookworm-slim AS node-runtime

FROM python:3.12-slim-bookworm

ARG CODEX_VERSION=0.161.0

COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=node-runtime /usr/local/lib/node_modules /usr/local/lib/node_modules

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates tini tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && npm install --global "@openai/codex@${CODEX_VERSION}" \
    && npm cache clean --force \
    && groupadd --system collector \
    && useradd --system --gid collector --home-dir /var/lib/boothhana-collector --create-home collector

ENV PYTHONUNBUFFERED=1 \
    PYTHONUTF8=1 \
    TZ=Asia/Seoul \
    HOME=/var/lib/boothhana-collector \
    CODEX_HOME=/var/lib/boothhana-collector/codex \
    PATH=/opt/venv/bin:/usr/local/bin:/usr/bin:/bin

WORKDIR /app/collector

COPY requirements.txt /tmp/requirements.txt
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

COPY --chown=collector:collector . /app/collector
RUN mkdir -p /var/lib/boothhana-collector/codex /var/lib/boothhana-collector/state \
    && chown -R collector:collector /var/lib/boothhana-collector

USER collector
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["python", "run_scheduled.py", "--config", "/etc/boothhana/collector.json"]
