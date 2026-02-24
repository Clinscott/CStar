"""
[ODIN] Core Initialization & Environment Patching.
Formalizes the Python 3.14 / Pydantic v1 compatibility hook.
"""
import sys
import logging

def apply_pydantic_v1_patch():
    """
    [ALFRED] Surgical Monkeypatch for Pydantic v1 / Python 3.14 compatibility.
    Bypasses 'unable to infer type for attribute "X"' errors in ChromaDB configuration.
    """
    if sys.version_info >= (3, 14):
        try:
            # Check if pydantic.v1 is available
            try:
                import warnings
                warnings.filterwarnings("ignore", category=UserWarning, message=".*Pydantic V1 functionality.*")
                import pydantic.v1.fields as fields
            except ImportError:
                import pydantic.fields as fields
                
            from typing import Any
            
            # Locate the problematic class
            ModelField = fields.ModelField
            
            # [ALFRED] The Patch: Default Undefined types to Any instead of raising ConfigError
            original_set_default = ModelField._set_default_and_type
            
            def patched_set_default(self):
                # Import errors here to avoid early dependency on pydantic
                from pydantic import v1 as pydantic_v1
                try:
                    original_set_default(self)
                except Exception as e:
                    # If it's a ConfigError about type inference, bypass it
                    if "unable to infer type" in str(e):
                        # logging.debug(f"[ALFRED] Patching Pydantic Type Inference for: {self.name}")
                        self.type_ = Any
                        self.outer_type_ = Any
                        self.annotation = Any
                    else:
                        raise e
            
            # Apply the patch only if not already patched
            if not hasattr(ModelField, "_is_cstar_patched"):
                ModelField._set_default_and_type = patched_set_default
                ModelField._is_cstar_patched = True
                # print("[ALFRED] Pydantic v1 Compatibility Patch Applied for Python 3.14")
                
        except (ImportError, AttributeError):
            pass # Pydantic not installed or structure differs

# Apply the patch immediately upon core import
apply_pydantic_v1_patch()
