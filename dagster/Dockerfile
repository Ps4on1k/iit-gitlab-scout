FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY dagster_project/ dagster_project/

EXPOSE 3000

CMD ["dagster", "webserver", "-h", "0.0.0.0", "-p", "3000"]
