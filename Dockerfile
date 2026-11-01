FROM python:3.12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY scripts/requirements-fetch.txt /app/requirements-fetch.txt
RUN pip install --no-cache-dir -r /app/requirements-fetch.txt

COPY scripts/fetch_video.py scripts/fetch_server.py /app/scripts/
ENV PYTHONPATH=/app/scripts
ENV PYTHONUNBUFFERED=1
ENV PORT=8080
EXPOSE 8080

CMD ["python", "/app/scripts/fetch_server.py"]
