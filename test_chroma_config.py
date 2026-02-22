from chromadb.config import Settings
try:
    s = Settings()
    print("Settings initialized successfully")
except Exception as e:
    print(f"Failed to initialize Settings: {e}")
    import traceback
    traceback.print_exc()
