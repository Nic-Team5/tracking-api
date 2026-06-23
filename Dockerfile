# Folosește o imagine oficială Python 3.11 slim
FROM python:3.11-slim

# Setează directorul de lucru
WORKDIR /app

# Instalează dependințele sistem necesare pentru lxml și BeautifulSoup
RUN apt-get update && apt-get install -y \
    gcc \
    libxml2-dev \
    libxslt-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiază fișierul cu dependințe și instalează-le
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiază restul codului
COPY main.py .

# Expune portul folosit de Render (default 10000)
EXPOSE 10000

# Comanda de start
CMD ["gunicorn", "main:app", "--bind", "0.0.0.0:10000"]
