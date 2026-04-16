FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir websockets

COPY drivers.py server.py index.html ./

EXPOSE 8090 8091

CMD ["python3", "-u", "server.py"]
