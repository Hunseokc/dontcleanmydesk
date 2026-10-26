# 로컬에서 `./gradlew installDist` 로 만든 결과물을 담는다 (사내 TLS 프록시 때문에 컨테이너 안에서 빌드하지 않음)
FROM eclipse-temurin:21-jre
WORKDIR /srv
COPY build/install/messy-room-server/ ./
ENV PORT=8787 HOST=0.0.0.0 FILES_DIR=/data/files
ENV DB_URL="jdbc:h2:file:/data/messy-room;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE"
VOLUME /data
EXPOSE 8787
CMD ["bin/messy-room-server"]
