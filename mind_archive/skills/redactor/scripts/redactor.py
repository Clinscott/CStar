import argparse
import sys
from pathlib import Path

# Add project root to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.core.redactor import Redactor

def main():
    parser = argparse.ArgumentParser(description="Redactor: Mask sensitive data.")
    parser.add_argument("--text", help="Text content to redact")
    parser.add_argument("--file", help="Path to file content to redact")
    
    args = parser.parse_args()

    redactor = Redactor()

    if args.text:
        print(redactor.redact(args.text))
    elif args.file:
        path = Path(args.file)
        if path.exists():
            print(redactor.redact(path.read_text(encoding='utf-8')))
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
