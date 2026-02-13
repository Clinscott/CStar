import json
import os
import time
from pathlib import Path
from google import genai
from google.genai import types

class RavenProxy:
    """
    RavenProxy mimics the google.genai.Client to intercept, log, and augment
    API calls from the Muninn agent.
    """
    def __init__(self, target_model="gemini-2.0-flash", api_key=None):
        self.target_model = target_model
        # Use provided key or fall back to environment (Main Agent's Key)
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY not found in environment.")
        
        self.real_client = genai.Client(api_key=self.api_key)
        self.logs_dir = Path("tests/harness/logs")
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.corrections_path = Path(".agent/corrections.json")

    @property
    def models(self):
        return self

    def generate_content(self, model=None, contents=None, config=None, **kwargs):
        """
        Intercepts the generate_content call.
        """
        requested_model = model or self.target_model
        
        # Mapping for environment stability
        model_map = {
            "gemini-2.0-pro-exp-02-05": "gemini-1.5-flash",
            "gemini-1.5-pro": "gemini-1.5-flash"
        }
        effective_model = model_map.get(requested_model, requested_model)
        
        # 1. Injection logic: Append Lessons from corrections.json
        augmented_contents = self._inject_lessons(contents)
        
        # 2. Log the prompt
        timestamp = int(time.time())
        trace_file = self.logs_dir / f"trace_{timestamp}.json"
        
        trace_data = {
            "timestamp": timestamp,
            "model": effective_model,
            "original_contents": str(contents),
            "augmented_contents": str(augmented_contents),
            "config": str(config) if config else None
        }
        
        # 3. Call the real API
        try:
            response = self.real_client.models.generate_content(
                model=effective_model,
                contents=augmented_contents,
                config=config,
                **kwargs
            )
            
            # Log the response
            trace_data["response"] = {
                "text": response.text if hasattr(response, 'text') else str(response),
                "candidates": [str(c) for c in response.candidates] if hasattr(response, 'candidates') else []
            }
            return response
        except Exception as e:
            trace_data["error"] = str(e)
            raise e
        finally:
            with open(trace_file, "w", encoding="utf-8") as f:
                json.dump(trace_data, f, indent=2)

    def _inject_lessons(self, contents):
        """
        Checks .agent/corrections.json for "Lessons" and appends them to the system prompt if possible.
        """
        if not self.corrections_path.exists():
            return contents

        try:
            with open(self.corrections_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            lessons = data.get("lessons", [])
            if not lessons:
                return contents
            
            lesson_block = "\n\n### RELEVANT LESSONS (DO NOT REPEAT PREVIOUS MISTAKES):\n"
            for lesson in lessons:
                lesson_block += f"- {lesson}\n"

            # If contents is a string, append to it.
            # If it's a list (as expected by genai SDK), we need to check if it's Parts or Content objects.
            # For simplicity, if Muninn sends a string, we treat it as such.
            if isinstance(contents, str):
                return contents + lesson_block
            elif isinstance(contents, list):
                # Try to append to the last message or add a new system instruction if we were more complex.
                # Since we want to help Flash succeed, we'll append to the last content item if it's text.
                new_contents = list(contents)
                if new_contents:
                    # GenAI Client often expects types.Content or simple strings
                    last_item = new_contents[-1]
                    if isinstance(last_item, str):
                        new_contents[-1] = last_item + lesson_block
                    elif hasattr(last_item, 'parts') and last_item.parts:
                        # Assuming the first part is text
                        for part in last_item.parts:
                            if hasattr(part, 'text'):
                                part.text += lesson_block
                                break
                return new_contents
            
            return contents
        except Exception as e:
            print(f"Warning: Failed to inject lessons: {e}")
            return contents
