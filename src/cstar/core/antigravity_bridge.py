import os
import sys
import json
import asyncio
import logging
from pathlib import Path
from typing import Optional

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.sentinel.code_sanitizer import sanitize_code

# Constants
HOST = 'localhost'
PORT = 50052
MODEL_NAME = "gemini-2.0-flash"

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="[BRIDGE] %(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)

# Global Client
CLIENT = None

def init_client():
    """Initializes the google.genai client exclusively using the Daemon key."""
    global CLIENT
    try:
        from google import genai
        from dotenv import load_dotenv
        
        # Explicitly load .env.local
        env_path = project_root / ".env.local"
        loaded = load_dotenv(env_path)
        
        api_key = os.getenv("GOOGLE_API_DAEMON_KEY")
        
        if api_key:
            logging.info("Initializing with GOOGLE_API_DAEMON_KEY...")
            CLIENT = genai.Client(api_key=api_key)
        else:
            logging.warning(f"GOOGLE_API_DAEMON_KEY not found in .env.local (Loaded: {loaded}). Forcing Simulation Mode to protect credits.")
            CLIENT = None

    except ImportError as e:
        logging.error(f"Missing dependency: {e}. Please ensure 'google-genai' and 'python-dotenv' are installed.")
        CLIENT = None

async def handle_client(reader, writer):
    """Handles incoming JSON payloads from uplink.py."""
    addr = writer.get_extra_info('peername')
    logging.info(f"Connection from {addr}")

    try:
        data = await reader.read() # Read entire buffer (EOF)
        if not data:
            return

        payload = json.loads(data.decode('utf-8'))
        query = payload.get("query", "")
        context = payload.get("context", {})
        
        logging.info(f"Received Query: {query[:50]}...")
        
        # PROCESS REQUEST
        response_data = await process_request(query, context)
        
        # SEND RESPONSE
        writer.write(json.dumps(response_data).encode('utf-8'))
        await writer.drain()

    except Exception as e:
        logging.error(f"Handler Error: {e}")
        err_response = {"status": "error", "message": str(e)}
        writer.write(json.dumps(err_response).encode('utf-8'))
        await writer.drain()
    finally:
        writer.close()

async def process_request(query: str, context: dict) -> dict:
    """
    Assembles the prompt and calls the LLM.
    """
    global CLIENT
    
    # 1. Assemble Context (The Handshake)
    full_prompt = query
    
    persona = context.get("persona", "ODIN")
    previous_attempt = context.get("previous_attempt")
    error_trace = context.get("error")
    target_interface = context.get("target_interface")
    
    # Inject Previous Context if available (Crucial for Retry Loop)
    if error_trace:
        full_prompt += f"\n\n[SYSTEM: PREVIOUS ATTEMPT FAILED]\nERROR TRACE:\n{error_trace}\n"
    
    if previous_attempt:
        full_prompt += f"\n[SYSTEM: PREVIOUS CODE]\n{previous_attempt}\n\n[INSTRUCTION]\nFix the code above based on the error trace."

    if target_interface:
        full_prompt += f"\n\n[TARGET INTERFACE TO TEST]\n{target_interface}\n"

    # 2. Simulation Mode (Fallback)
    if not CLIENT:
        logging.warning("No LLM Client. Returning Simulation Response.")
        await asyncio.sleep(1) # Simulate think time
        return generate_simulation(query, context)

    # 3. Live Inference
    try:
        logging.info(f"Sending to {MODEL_NAME}...")
        
        # Detect if we need structured JSON (ALFRED)
        if "JSON" in query or persona == "ALFRED":
            # Just ask for text and sanitize manually, or use JSON mode if supported
            # For simplicity with new SDK, we'll prompt-engineer JSON
            pass
            
        response = CLIENT.models.generate_content(
            model=MODEL_NAME, 
            contents=full_prompt
        )
        
        raw_text = response.text
        
        # 4. Payload Normalization
        if persona == "ODIN":
            # Clean Markdown
            cleaned_code = sanitize_code(raw_text)
            return {
                "status": "success",
                "data": {"code": cleaned_code},
                "message": "Forging complete."
            }
        
        elif persona == "ALFRED":
            # ALFRED returns JSON directly
            # We try to extract JSON block if wrapped in markdown
            import re
            json_match = re.search(r"```json\n(.*?)\n```", raw_text, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                json_str = raw_text

            try:
                data_obj = json.loads(json_str)
                return {
                    "status": "success",
                    "data": data_obj,
                    "message": "Constraints generated."
                }
            except json.JSONDecodeError:
                 return {
                    "status": "error",
                    "message": f"ALFRED output malformed JSON: {raw_text[:100]}..."
                }

        return {"status": "success", "data": {"raw": raw_text}}

    except Exception as e:
        logging.error(f"Inference Failed: {e}")
        return {"status": "error", "message": f"Bridge Inference Error: {e}"}

def generate_simulation(query, context):
    """Deterministic responses for testing without credentials."""
    persona = context.get("persona", "ODIN")
    
    if persona == "ODIN":
        return {
            "status": "success", 
            "data": {
                "code": "def simulated_function():\n    return 'This is a simulation because no credentials were found.'"
            }
        }
    elif persona == "ALFRED":
        return {
            "status": "success",
            "data": {
                "test_filename": "tests/simulated_test.py",
                "test_code": "def test_sim(): assert True",
                "lint_command": "echo Simulation Lint Pass",
                "test_command": "echo Simulation Test Pass"
            }
        }
    return {"status": "success", "data": {"insight": "Simulation Mode Active"}}

async def main():
    init_client()
    
    server = await asyncio.start_server(handle_client, HOST, PORT)
    addr = server.sockets[0].getsockname()
    logging.info(f"Antigravity Bridge serving on {addr}")
    logging.info("Press Ctrl+C to stop")

    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Bridge stopping...")
