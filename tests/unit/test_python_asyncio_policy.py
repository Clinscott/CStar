import asyncio
import gc

import pytest


@pytest.mark.asyncio
async def test_pytest_managed_loop_is_explicit():
    assert asyncio.get_running_loop().is_running()


def test_sync_runner_does_not_orphan_a_pytest_loop():
    asyncio.run(asyncio.sleep(0))
    gc.collect()
