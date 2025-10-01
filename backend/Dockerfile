# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set the working directory to /app
WORKDIR /app

# Install dependencies
COPY requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy the rest of the application code
COPY . .

# Start the FastAPI app with Gunicorn and Uvicorn worker
# Use backend.main:app as the entrypoint module
CMD exec gunicorn backend.main:app --bind 0.0.0.0:$PORT --worker-class uvicorn.workers.UvicornWorker
