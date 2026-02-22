import sys

def rot13(text):
    result = ""
    for char in text:
        if 'a' <= char <= 'z':
            result += chr((ord(char) - ord('a') + 13) % 26 + ord('a'))
        elif 'A' <= char <= 'Z':
            result += chr((ord(char) - ord('A') + 13) % 26 + ord('A'))
        else:
            result += char
    return result

if __name__ == "__main__":
    if len(sys.argv) > 1:
        print(rot13(" ".join(sys.argv[1:])))
