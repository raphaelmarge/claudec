FROM python:3.11-slim

WORKDIR /app

# Dependências
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código
COPY server.py .

# Railway injeta a porta via $PORT; o server.py já lê essa variável.
EXPOSE 8000

CMD ["python", "server.py"]
