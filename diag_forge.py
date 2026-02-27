import asyncio
import json
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.payload import IntentPayload
from src.cstar.core.forge import Forge


async def diag() -> None:
    tmp_path = Path("tmp_diag")
    tmp_path.mkdir(exist_ok=True)
    target_file = tmp_path / "target.py"
    target_file.write_text("def old(): pass")

    with patch("src.cstar.core.forge.AntigravityUplink"), \
         patch("src.cstar.core.forge.AnomalyWarden") as mock_warden_class, \
         patch("src.cstar.core.forge.evaluate_candidate", return_value={"Decision": "Reject", "FinalLLR": -2.0}), \
         patch("src.cstar.core.forge.shutil.copy"), \
         patch("src.cstar.core.forge.ast.parse"), \
         patch("asyncio.create_subprocess_shell") as mock_subproc:

        mock_proc = MagicMock()
        mock_proc.communicate = AsyncMock(return_value=(b"", b""))
        mock_proc.returncode = 0
        mock_subproc.return_value = mock_proc

        forge = Forge()
        forge.project_root = tmp_path

        mock_warden_instance = mock_warden_class.return_value
        mock_warden_instance.burn_in_cycles = 0
        mock_warden_instance.forward.return_value = 0.95
        forge.warden = mock_warden_instance

        real_uuid = uuid.uuid4()
        session_id_str = str(real_uuid)

        with patch("src.cstar.core.forge.uuid.uuid4", return_value=real_uuid):
            gungnir_path = tmp_path / f"gungnir_{session_id_str}.json"
            gungnir_path.write_text(json.dumps([0,0,0]))

            # Use patch.object for cleaner instance mocking
            with patch.object(Forge, '_generate_with_calculus', new_callable=AsyncMock) as mock_gen:
                mock_gen.return_value = {"status": "success", "data": {"code": "def new(): pass"}}

                # Also mock uplink instances just in case
                forge.uplink.send_payload = AsyncMock(return_value={"status": "success", "data": {
                    "test_filename": "t.py", "test_code": "pass", "lint_command": "echo", "test_command": "echo"
                }})

                payload = IntentPayload(
                    system_meta={},
                    intent_raw="Update code",
                    intent_normalized="update",
                    target_workflow="forge"
                )

                print("Starting Forge Loop...")
                results = []
                async for res in forge.execute(payload, str(target_file)):
                    print(f"Yield: {res}")
                    results.append(res)

                print(f"Loop finished. Total results: {len(results)}")

if __name__ == "__main__":
    asyncio.run(diag())
