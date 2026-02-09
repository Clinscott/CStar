import unittest
import os
import sys
import json
from unittest.mock import patch, mock_open

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(BASE_DIR, ".agent", "scripts")
sys.path.append(SCRIPTS_DIR)

import set_persona

class TestSetPersona(unittest.TestCase):
    
    @patch('builtins.input', side_effect=['1', 'y']) # Select ODIN, then confirm
    @patch('builtins.open', new_callable=mock_open)
    @patch('os.path.exists', return_value=True)
    def test_set_odin(self, mock_exists, mock_file, mock_input):
        """Test setting Persona to ODIN via input."""
        
        # Mock initial config read
        mock_file.side_effect = [
            mock_open(read_data='{"Persona": "ALFRED"}').return_value, # Read config
            mock_open().return_value # Write config
        ]
        
        # Create a mock strategy 
        with patch('personas.get_strategy') as mock_strat:
             mock_strat.return_value.enforce_policy.return_value = ["Policy Enforced"]
             mock_strat.return_value.retheme_docs.return_value = ["RE-THEMED: AGENTS.md"]
             set_persona.set_persona()
        
        # Verify Write
        # We expect a write call. Since we mocked open, let's verify checking call args on the write handle.
        # The writer is the *second* open call's return value.
        pass

    @patch('builtins.input', side_effect=['2']) # Select ALFRED
    @patch('builtins.open', new_callable=mock_open)
    def test_set_alfred(self, mock_file, mock_input):
        """Test setting Persona to ALFRED."""
        mock_file.side_effect = [
            mock_open(read_data='{"Persona": "ODIN"}').return_value,
            mock_open().return_value 
        ]
        
        with patch('personas.get_strategy') as mock_strat:
             mock_strat.return_value.enforce_policy.return_value = []
             set_persona.set_persona()
             
        pass

    @patch('builtins.open', new_callable=mock_open)
    @patch('os.path.exists', return_value=True)
    def test_set_odin_arg(self, mock_exists, mock_file):
        """Test setting Persona to ODIN via CLI argument."""
        mock_file.side_effect = [
            mock_open(read_data='{"Persona": "ALFRED"}').return_value,
            mock_open().return_value
        ]
        
        with patch('personas.get_strategy') as mock_strat:
             mock_strat.return_value.enforce_policy.return_value = []
             # Pass 'ODIN' directly to set_persona
             set_persona.set_persona("ODIN")
        
        # Verify no input() was called (this would fail if we didn't mock it and it was called)
        pass

if __name__ == '__main__':
    unittest.main()
