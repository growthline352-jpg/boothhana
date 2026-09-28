FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY . .
RUN chmod +x gradlew && ./gradlew test bootJar --no-daemon

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system boothhana \
    && useradd --system --gid boothhana --home-dir /app boothhana
COPY --from=build --chown=boothhana:boothhana /app/build/libs/*.jar app.jar
USER boothhana
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=8s --start-period=60s --retries=4 \
  CMD curl --fail --silent --show-error http://127.0.0.1:8080/api/public/health/live >/dev/null || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
