import pytest

def test_src_is_importable_as_a_package():
    """
    Tests that the 'src' directory can be imported as a package,
    which implicitly verifies the existence of src/__init__.py.
    """
    try:
        import src
    except (ImportError, ModuleNotFoundError) as e:
        pytest.fail(
            f"Failed to import 'src' as a package. "
            f"This likely means 'src/__init__.py' is missing or there's a path issue.\n"
            f"Original error: {e}"
        )
