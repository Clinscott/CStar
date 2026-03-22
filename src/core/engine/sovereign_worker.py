#!/usr/bin/env python3
from __future__ import annotations

import json
import logging
import re
import time
import requests
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Sequence, Dict, List

# CStar Native Bridge
class CStarBridge:
    def __init__(self, project_root: Path):
        self.project_root = project_root

    def execute_tool(self, name: str, args: Dict[str, Any]) -> str:
        """Executes a CStar skill tool and returns the result as a string."""
        logging.info(f"Executing tool: {name} with args: {args}")
        
        # Mapping to existing CStar shell/filesystem logic
        if name == "run_shell_command":
            return self._run_shell(args.get("command") or args.get("cmd", ""))
        elif name == "read_file":
            path = args.get("path") or args.get("filepath") or args.get("file_path", "")
            return self._read_file(path)
        elif name == "write_file":
            path = args.get("path") or args.get("filepath") or args.get("file_path", "")
            content = args.get("content") or args.get("text", "")
            return self._write_file(path, content)
        elif name == "list_directory":
            path = args.get("path") or args.get("dir") or args.get("directory", ".")
            return self._list_dir(path)
        else:
            return f"Error: Tool '{name}' not found in Sovereign registry."

    def _run_shell(self, command: str) -> str:
        if not command:
            return "Error: No command provided."
        try:
            import subprocess
            result = subprocess.run(
                command, shell=True, capture_output=True, text=True, cwd=self.project_root
            )
            return f"Exit Code: {result.returncode}\nOutput:\n{result.stdout}\n{result.stderr}"
        except Exception as e:
            return f"Error executing command: {str(e)}"

    def _resolve_path(self, path_str: str) -> Path:
        logging.info(f"Resolving path: '{path_str}'")
        if not path_str:
            # RETURN NONE or RAISE if empty to avoid root directory errors
            raise ValueError("Empty path provided to _resolve_path")
        
        p = Path(path_str)
        if p.is_absolute():
            try:
                p.relative_to(self.project_root)
                return p
            except ValueError:
                return self.project_root / path_str.lstrip("/")
        
        return self.project_root / path_str

    def _read_file(self, path: str) -> str:
        if not path:
            return "Error: No path provided for read_file."
        try:
            full_path = self._resolve_path(path)
            if full_path.is_dir():
                return f"Error: {path} is a directory."
            return full_path.read_text()
        except Exception as e:
            return f"Error reading file: {str(e)}"

    def _write_file(self, path: str, content: str) -> str:
        if not path:
            return "Error: No path provided for write_file."
        try:
            full_path = self._resolve_path(path)
            if full_path.is_dir():
                return f"Error: Cannot write to {path}, it is a directory."
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_text(content)
            logging.info(f"Successfully wrote {len(content)} chars to {full_path}")
            return f"Successfully wrote to {path}"
        except Exception as e:
            logging.error(f"Write failed: {str(e)}")
            return f"Error writing file: {str(e)}"

    def _list_dir(self, path: str) -> str:
        try:
            full_path = self._resolve_path(path)
            if not full_path.exists():
                return f"Error: Directory {path} does not exist."
            items = [str(p.relative_to(self.project_root)) for p in full_path.iterdir()]
            return "\n".join(items)
        except Exception as e:
            return f"Error listing directory: {str(e)}"

@dataclass
class SovereignWorker:
    project_root: Path
    model: str = "deepseek"
    base_url: str = "http://localhost:11434/v1"
    max_turns: int = 10

    def __post_init__(self):
        self.bridge = CStarBridge(self.project_root)
        self.messages: List[Dict[str, str]] = []

    def run(self, system_prompt: str, user_prompt: str) -> str:
        self.messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
        
        transcript = []
        
        for turn in range(self.max_turns):
            logging.info(f"--- Sovereign Turn {turn+1} ---")
            
            if len(self.messages) > 10:
                logging.info("Pruning worker context...")
                self.messages = [self.messages[0]] + self.messages[-8:]

            response = self._call_llm()
            if response.startswith("Error"):
                logging.error(response)
                transcript.append(f"SYSTEM: {response}")
                break

            self.messages.append({"role": "assistant", "content": response})
            transcript.append(f"ASSISTANT: {response}")
            
            tool_calls = self._parse_tool_calls(response)
            
            if not tool_calls:
                if any(s in response for s in ["DONE", "COMPLETED", "AUTOBOT_BEAD_COMPLETE"]):
                    logging.info("Worker signaling completion.")
                    break
                logging.info("Worker produced text without tool calls or completion token.")
                continue

            results = []
            for name, args in tool_calls:
                logging.info(f"Executing {name} with args {list(args.keys())}...")
                try:
                    result = self.bridge.execute_tool(name, args)
                    results.append(f"Result of {name}: {result}")
                except Exception as e:
                    results.append(f"Error executing {name}: {str(e)}")
            
            result_str = "\n".join(results)
            self.messages.append({"role": "user", "content": result_str})
            transcript.append(f"USER (TOOL RESULT): {result_str}")

        return "\n\n".join(transcript)

    def _call_llm(self) -> str:
        try:
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                json={
                    "model": self.model,
                    "messages": self.messages,
                    "temperature": 0,
                },
                timeout=600
            )
            if resp.status_code != 200:
                return f"Error calling local LLM: {resp.status_code} {resp.text}"
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            return f"Error calling local LLM: {str(e)}"

    def _parse_tool_calls(self, text: str) -> List[tuple[str, Dict[str, Any]]]:
        pattern = r'<invoke\s+name=["\']([^"\']+)["\']\s*>(.*?)</invoke>'
        calls = []
        for match in re.finditer(pattern, text, re.DOTALL):
            name = match.group(1)
            args_xml = match.group(2)
            args = {}
            
            arg_name_matches = re.findall(r'<arg_name>(.*?)</arg_name>', args_xml, re.DOTALL)
            arg_value_matches = re.findall(r'<arg_value>(.*?)</arg_value>', args_xml, re.DOTALL)
            if arg_name_matches and arg_value_matches:
                for k, v in zip(arg_name_matches, arg_value_matches):
                    args[k.strip()] = v.strip()
            
            arg_pattern = r'<([^>]+)>(.*?)</\1>'
            for arg_match in re.finditer(arg_pattern, args_xml, re.DOTALL):
                k = arg_match.group(1).strip()
                v = arg_match.group(2).strip()
                if k not in ["arg_name", "arg_value"] and k not in args:
                    args[k] = v
            
            if not args and "<arg>" in args_xml:
                arg_val = re.search(r'<arg>(.*?)</arg>', args_xml, re.DOTALL)
                if arg_val:
                    if name in ["read_file", "list_directory"]:
                        args["path"] = arg_val.group(1).strip()
                    elif name == "run_shell_command":
                        args["command"] = arg_val.group(1).strip()

            calls.append((name, args))
        return calls

if __name__ == "__main__":
    import sys
    logging.basicConfig(level=logging.INFO)
    target_dir = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path.cwd()
    query = sys.argv[2] if len(sys.argv) > 2 else "List the root directory."
    
    worker = SovereignWorker(target_dir)
    sys_prompt = (
        "You are a CStar Sovereign Worker. Use tools via XML: <invoke name='tool'><arg_name>name</arg_name><arg_value>val</arg_value></invoke>.\n"
        "Available tools: read_file, write_file, run_shell_command, list_directory.\n"
        "Think in <thought> tags. End with DONE."
    )
    print(worker.run(sys_prompt, query))
