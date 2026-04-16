FROM python:3.12-slim

WORKDIR /app

# pyads bundles its ADS implementation; no apt packages needed
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY bridge.py index.html ./

EXPOSE 8070 8071

CMD ["python3", "-u", "bridge.py"]
