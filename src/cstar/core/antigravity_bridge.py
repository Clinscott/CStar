import asyncio
import json
import logging
import os
import sys
from pathlib import Path

# Add project root to path
script_dir = Path(__file__).parent.absolute()
project_root = script_dir.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.append(str(project_root))

from src.sentinel.code_sanitizer import sanitize_code

# Constants
HOST = '127.0.0.1'
PORT = 50052
MODEL_NAME = "gemini-2.5-flash"

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="[BRIDGE] %(asctime)s - %(levelname)s - %(message)s",
    datefmt="%H:%M:%S"
)

# Global Client Pool
CLIENT = None
_CLIENT_CACHE = {}
_MODEL_CACHE = {} # Stores available models per API key

def _get_optimal_model(client, api_key: str, persona: str) -> str:
    """Discovers available models and routes based on workload."""
    global _MODEL_CACHE

    # Fallback default if routing fails
    safe_default = "gemini-2.5-pro"

    # 1. Fetch and cache available models for this key
    if api_key not in _MODEL_CACHE:
        try:
            models = [m.name for m in client.models.list()]
            _MODEL_CACHE[api_key] = [m for m in models if "gemini" in m]
            logging.info(f"Discovered {len(_MODEL_CACHE[api_key])} Gemini models for current key.")
        except Exception as e:
            logging.warning(f"Model discovery failed: {e}. Falling back to default.")
            return safe_default

    available = _MODEL_CACHE[api_key]

    # 2. Workload Routing Logic
    # ALFRED (Adversarial Tests) and ODIN (Code Generation) require deep reasoning
    if persona in ["ALFRED", "ODIN"]:
        preferred = ["gemini-2.5-pro", "gemini-pro"]
    # Quick tasks (hunting, summarization) use fast, low-latency models
    else:
        preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash"]

    # 3. Select the best available match
    for p in preferred:
        # Match against strings like 'models/gemini-2.5-pro'
        if any(p in m for m in available):
            return p

    # If preferred are missing, return the first valid Gemini model
    return available[0] if available else safe_default

def init_client():
    """Initializes the google.genai client exclusively using the Daemon key."""
    global CLIENT
    try:
        from dotenv import load_dotenv
        from google import genai

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
        api_key = payload.get("api_key")
        response_data = await process_request(query, context, api_key=api_key)

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

async def process_request(query: str, context: dict, api_key: str = None) -> dict:
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

    # 2. Simulation Mode & Caching
    active_client = CLIENT

    if api_key:
        if api_key not in _CLIENT_CACHE:
            try:
                from google import genai
                logging.info(f"Initializing cached client for requested API key (persona: {persona})...")
                _CLIENT_CACHE[api_key] = genai.Client(api_key=api_key)
            except Exception as e:
                logging.error(f"Failed to initialize temporary client: {e}")

        # Retrieve from cache, fallback to Daemon client if key initialization failed
        active_client = _CLIENT_CACHE.get(api_key, CLIENT)

    # Detect if we need structured JSON (ALFRED)
    if "JSON" in query or persona == "ALFRED":
        # Just ask for text and sanitize manually, or use JSON mode if supported
        # For simplicity with new SDK, we'll prompt-engineer JSON
        pass

    # 3. Live Inference with Exponential Backoff
    max_retries = 3
    raw_text = None
    attempted_models = set()

    for attempt in range(max_retries):
        try:
            # Dynamically determine the best model for this run, excluding models that failed
            available = _MODEL_CACHE.get(api_key, [])
            if not available:
                 # Force a refresh if cache is empty
                 _get_optimal_model(active_client, api_key or "default", persona)
                 available = _MODEL_CACHE.get(api_key, [])

            # Find the best model we haven't tried yet
            target_model = None

            # Simple heuristic routing to align with original _get_optimal_model logic
            if persona in ["ALFRED", "ODIN"]:
                preferred = ["gemini-2.5-pro", "gemini-pro", "gemini-1.5-pro"]
            else:
                preferred = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-flash"]

            for p in preferred:
                 for m in available:
                     if p in m and m not in attempted_models:
                         target_model = m
                         break
                 if target_model: break

            # Fallback to any unused model
            if not target_model:
                for m in available:
                    if m not in attempted_models:
                        target_model = m
                        break

            # Absolute fallback if all known fail
            if not target_model:
                target_model = "gemini-2.5-pro"

            logging.info(f"Attempt {attempt + 1}: Routing {persona} workload to {target_model}...")
            attempted_models.add(target_model)

            response = active_client.models.generate_content(
                model=target_model,
                contents=full_prompt
            )
            raw_text = response.text
            break # Success, exit retry loop

        except Exception as e:
            error_msg = str(e).lower()
            # Catch transient errors (Too Many Requests, Service Unavailable)
            if "429" in error_msg or "503" in error_msg or "quota" in error_msg:
                if attempt < max_retries - 1:
                    wait_time = 3 ** attempt # Exponential: 1s, 3s, 9s
                    logging.warning(f"API throttled or unavailable for {target_model} ({e}). Rotating model and waiting {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    logging.error("Max retries exhausted across model pool. Inference failed.")
                    return {"status": "error", "message": f"API Exhausted: {e}"}
            else:
                # Non-transient error (e.g., bad syntax), fail immediately
                logging.error(f"Fatal Inference Error on {target_model}: {e}")
                return {"status": "error", "message": str(e)}

    # If raw_text is still None after retries, it means all attempts failed
    if raw_text is None:
        return {"status": "error", "message": "Inference failed after multiple retries."}

    # 4. Payload Normalization
    try:
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
            # We try to extract JSON block regardless of tags or carriage returns
            import re
            json_match = re.search(r"```(?:json)?\s+(.*?)\s+```", raw_text, re.DOTALL | re.IGNORECASE)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Fallback: Extract everything between the first '{' and last '}'
                brace_match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
                json_str = brace_match.group(1) if brace_match else raw_text

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
        logging.error(f"Normalization Failed: {e}")
        return {"status": "error", "message": f"Bridge Normalization Error: {e}"}


def generate_simulation(query, context):
    """Deterministic responses for testing without credentials."""
    persona = context.get("persona", "ODIN")

    if persona == "ODIN":
        return {
            "status": "success",
            "data": {
                "code": "def simulated_function():\n    return 'BRIDGE_ACTIVE: This is a simulation because no credentials were found.'"
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
