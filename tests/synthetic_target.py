# File: tests/synthetic_target.py

def square(n: int | float) -> int | float:
    """
    Calculates the square of a given number.

    Args:
        n (int or float): The number to be squared.

    Returns:
        int or float: The square of n (n * n).
                      The type of the return value will match the type of n,
                      or promote to float if n is an int and the result
                      might naturally be considered float (though for square,
                      int * int is int, float * float is float).
    """
    return n * n

if __name__ == "__main__":
    # --- Basic Tests ---
    print("--- Testing square(n) function ---")

    # Test with integers
    num1 = 5
    result1 = square(num1)
    print(f"The square of {num1} is: {result1}")  # Expected: 25

    num2 = 0
    result2 = square(num2)
    print(f"The square of {num2} is: {result2}")  # Expected: 0

    num3 = -3
    result3 = square(num3)
    print(f"The square of {num3} is: {result3}")  # Expected: 9

    # Test with floats
    num4 = 2.5
    result4 = square(num4)
    print(f"The square of {num4} is: {result4}")  # Expected: 6.25

    num5 = -1.0
    result5 = square(num5)
    print(f"The square of {num5} is: {result5}")  # Expected: 1.0

    # Test with larger number
    num6 = 100
    result6 = square(num6)
    print(f"The square of {num6} is: {result6}")  # Expected: 10000

    # Test with zero float
    num7 = 0.0
    result7 = square(num7)
    print(f"The square of {num7} is: {result7}") # Expected: 0.0

    print("\n--- End of tests ---")
