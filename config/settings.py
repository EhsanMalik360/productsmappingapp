# File upload settings for large imports
DATA_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024 * 100  # 100 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 1024 * 1024 * 100  # 100 MB
MAX_UPLOAD_SIZE = 1024 * 1024 * 500  # 500 MB
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads')

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Increase timeout for long-running requests
# Note: Some servers might have their own timeouts that override this
TIMEOUT = 600  # 10 minutes

# Bulk import settings
DEFAULT_BATCH_SIZE = 500
MAX_BATCH_SIZE = 1000 