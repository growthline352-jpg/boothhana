FROM boothhana-collector:064faba6
COPY --chown=collector:collector run.py graph_worker.py usage_cooldown.py /app/collector/
COPY --chown=collector:collector test_usage_cooldown.py /app/collector/tests/test_usage_cooldown.py
COPY --chown=collector:collector test_terminal_cli.py /app/collector/tests/test_terminal_cli.py
RUN python -m unittest discover -s tests -p test_usage_cooldown.py -v \
    && python -m unittest discover -s tests -p test_terminal_cli.py -v \
    && python -X pycache_prefix=/tmp/boothhana-compile -m py_compile run.py graph_worker.py usage_cooldown.py
LABEL boothhana.patch="usage-cooldown-20261023"
