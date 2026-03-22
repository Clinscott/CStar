import unittest
from unittest.mock import MagicMock, patch, mock_open
from pathlib import Path
import json
from src.core.engine.skill_learning import (
    materialize_skill_proposal,
    promote_skill_proposal,
    SkillProposalMaterialization,
    SkillPromotionResult,
)
from src.core.engine.bead_ledger import SovereignBead
from src.core.engine.validation_result import ValidationResult

class TestSkillLearning(unittest.TestCase):
    def setUp(self):
        self.project_root = "/mock/root"
        self.mock_bead = MagicMock(spec=SovereignBead)
        self.mock_bead.id = "bead_123"
        self.mock_bead.contract_refs = ["contract:test_skill"]
        self.mock_bead.target_path = "some/path/contract.json"
        
        self.mock_validation = MagicMock(spec=ValidationResult)
        self.mock_validation.validation_id = "val_456"
        self.mock_validation.verdict = "ACCEPTED"
        self.mock_validation.sprt = MagicMock()
        self.mock_validation.sprt.verdict = "ACCEPTED"
        self.mock_validation.to_dict.return_value = {"val": "data"}
        
        self.mock_validation_run = MagicMock()
        self.mock_validation_run.validation_id = "val_456"
        self.mock_validation_run.verdict = "ACCEPTED"
        self.mock_validation_run.sprt_verdict = "ACCEPTED"
        self.mock_validation_run.notes = "all good"

    @patch("src.core.engine.skill_learning.HallOfRecords")
    @patch("src.core.engine.skill_learning._read_json")
    @patch("src.core.engine.skill_learning._write_json")
    @patch("src.core.engine.skill_learning.uuid")
    @patch("src.core.engine.skill_learning._now_ms")
    def test_materialize_skill_proposal(self, mock_now, mock_uuid, mock_write, mock_read, mock_hall):
        mock_now.return_value = 1000
        mock_uuid.uuid4.return_value.hex = "deadbeef" * 3
        mock_read.return_value = {"version": "1.0", "actions": {}}
        
        mock_hall_instance = mock_hall.return_value
        mock_repo = MagicMock()
        mock_repo.repo_id = "repo_789"
        mock_hall_instance.bootstrap_repository.return_value = mock_repo
        
        result = materialize_skill_proposal(
            self.project_root,
            bead=self.mock_bead,
            validation=self.mock_validation,
            validation_run=self.mock_validation_run,
            focus_axes=["logic"],
            validation_profile="strict",
            dry_run=False,
            simulate=True
        )
        
        self.assertIsInstance(result, SkillProposalMaterialization)
        self.assertEqual(result.skill_id, "test_skill")
        self.assertTrue(result.record.proposal_id.startswith("proposal:"))
        mock_write.assert_called_once()
        mock_hall_instance.save_skill_proposal.assert_called_once()

    @patch("src.core.engine.skill_learning.HallOfRecords")
    @patch("src.core.engine.skill_learning.BeadLedger")
    @patch("src.core.engine.skill_learning._read_json")
    @patch("src.core.engine.skill_learning._write_json")
    @patch("src.core.engine.skill_learning._now_ms")
    def test_promote_skill_proposal_success(self, mock_now, mock_write, mock_read, mock_ledger, mock_hall):
        mock_now.return_value = 2000
        mock_hall_instance = mock_hall.return_value
        
        mock_proposal = MagicMock()
        mock_proposal.proposal_id = "prop_1"
        mock_proposal.status = "PROPOSED"
        mock_proposal.validation_id = "val_456"
        mock_proposal.skill_id = "test_skill"
        mock_proposal.contract_path = "some/contract.json"
        mock_proposal.proposal_path = "some/proposal.json"
        mock_proposal.bead_id = "bead_123"
        mock_proposal.repo_id = "repo_789"
        mock_proposal.summary = "summary"
        mock_proposal.created_at = 1000
        mock_proposal.metadata = {}
        
        mock_hall_instance.get_skill_proposal.return_value = mock_proposal
        mock_hall_instance.get_validation_run.return_value = self.mock_validation_run
        
        mock_read.return_value = {"proposed_contract": {"version": "1.1"}}
        
        mock_ledger_instance = mock_ledger.return_value
        mock_ledger_instance.resolve_bead.return_value = MagicMock()
        
        result = promote_skill_proposal(self.project_root, "prop_1")
        
        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.promotion_outcome, "PROMOTED")
        mock_write.assert_called_once()
        mock_hall_instance.save_skill_proposal.assert_called_once()
        mock_hall_instance.save_skill_observation.assert_called_once()
        mock_ledger_instance.resolve_bead.assert_called_once()

    @patch("src.core.engine.skill_learning.HallOfRecords")
    def test_promote_skill_proposal_missing(self, mock_hall):
        mock_hall.return_value.get_skill_proposal.return_value = None
        result = promote_skill_proposal(self.project_root, "prop_missing")
        self.assertEqual(result.status, "FAILURE")
        self.assertEqual(result.proposal_status, "MISSING")

    @patch("src.core.engine.skill_learning.HallOfRecords")
    def test_promote_skill_proposal_already_promoted(self, mock_hall):
        mock_proposal = MagicMock()
        mock_proposal.status = "PROMOTED"
        mock_hall.return_value.get_skill_proposal.return_value = mock_proposal
        result = promote_skill_proposal(self.project_root, "prop_1")
        self.assertEqual(result.status, "SUCCESS")
        self.assertEqual(result.promotion_outcome, "PROMOTED")

if __name__ == "__main__":
    unittest.main()
