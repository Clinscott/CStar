import pytest
import asyncio
from unittest.mock import MagicMock, patch, AsyncMock
from src.core.mimir_client import MimirClient


@pytest.fixture
def mock_session():
    session = AsyncMock()
    session.initialize = AsyncMock()
    session.close = AsyncMock()
    
    # Mock return values for call_tool
    mock_result = MagicMock()
    mock_result.isError = False
    mock_result.content = [MagicMock(text="Mocked Result")]
    session.call_tool = AsyncMock(return_value=mock_result)
    
    return session


@pytest.mark.asyncio
async def test_mimir_client_get_file_intent(mock_session):
    client = MimirClient()
    
    with patch.object(client, '_get_session', return_value=mock_session):
        intent = await client.get_file_intent("some/file.py")
        
        assert intent == "Mocked Result"
        mock_session.call_tool.assert_called_once_with("get_file_intent", {"filepath": "some/file.py"})


@pytest.mark.asyncio
async def test_mimir_client_search_well(mock_session):
    client = MimirClient()
    
    with patch.object(client, '_get_session', return_value=mock_session):
        result = await client.search_well("some query")
        
        assert result == "Mocked Result"
        mock_session.call_tool.assert_called_once_with("search_by_intent", {"query": "some query"})


@pytest.mark.asyncio
async def test_mimir_client_index_sector(mock_session):
    client = MimirClient()
    
    with patch.object(client, '_get_session', return_value=mock_session):
        success = await client.index_sector("some/file.py")
        
        assert success is True
        mock_session.call_tool.assert_called_once_with("index_sector", {"filepath": "some/file.py"})


@pytest.mark.asyncio
async def test_mimir_client_error_handling(mock_session):
    client = MimirClient()
    
    # Simulate an error response from MCP
    error_result = MagicMock()
    error_result.isError = True
    error_result.content = [MagicMock(text="Error occurred")]
    mock_session.call_tool = AsyncMock(return_value=error_result)
    
    with patch.object(client, '_get_session', return_value=mock_session):
        intent = await client.get_file_intent("some/file.py")
        assert intent is None
        
        success = await client.index_sector("some/file.py")
        assert success is False
