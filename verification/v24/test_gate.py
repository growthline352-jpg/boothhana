"""Gate reporting tests only: no external process, SQL, build, or browser is executed."""
from pathlib import Path
import importlib.util
import json
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent

def load_gate():
    spec = importlib.util.spec_from_file_location('v24_gate_under_test', HERE / 'release_gate.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class GateReportingTests(unittest.TestCase):
    def run_gate(self, inherited, new_checks, mutate_reports=None):
        gate = load_gate()
        with tempfile.TemporaryDirectory() as temp:
            gate.OUT = Path(temp) / 'result.json'
            gate.ROOT = Path(temp)
            reports=gate.ROOT/'backend/build/test-results/test';reports.mkdir(parents=True)
            suites={
                'TEST-com.boothhana.release.PersistentSessionIntegrationTests.xml':['storedKakaoSessionSurvivesRepositoryRecreationAndRenewsOnUse', 'expiredSessionCannotBeRestoredOrRenewed', 'logoutRequiresCsrfAndPermanentlyRevokesStoredSession', 'sessionTablesArePrivateAndAnonymousLoginIsShortLived'],
                'TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml':['groupedEventLimitSurvivesDifferentBaseAndPreventsConflictingMerge', 'concurrentDifferentBaseRegistrationsCommitExactlyOne', 'directRegistrationPublishesOnlyOwnBoothWithoutGrantAndEnforcesAccountLimit', 'claimApprovalRemainsRequiredAndCannotConflictWithDirectRegistration', 'approvedCollectedBoothBlocksNewBaseBoothInSameEvent', 'directProductsKeepIdentityEditsAndPublicStateThroughRepublication', 'registrationHttpRequiresLoginCsrfAndOwnedBase', 'platformRegistrationIsImmediateAndCannotUseAnotherBaseToRegisterTwice', 'endedUnpublishedAndOutOfPeriodRegistrationsAreRejected'],
                'TEST-com.boothhana.release.LibraryIntegrationTests.xml':[
                    'seoulAreaFiltersApplyToCountsListsCalendarAndMultiVenueEvents',
                    'popupDiscoverySharesIdentityAndSavesOnlyForConfirmedSubcultureTopics',
                    'detachedProfileSaveCannotRevertCompletedOnboarding',
                    'memberInterestsArePrivateVersionedAndCategoryScoped',
                    'interestFeaturedFiltersBeforeLimitAndSaveRemovalChangesFallback',
                    'popularEditionDeduplicatesMembersBeforeLimitAndKeepsRemainingDay'],
                'TEST-com.boothhana.floorplan.FloorplanHttpContractTests.xml':['withdrawalHasNoContentSuccess'],
                'TEST-com.boothhana.release.ReleaseIntegrationTests.xml':[
                    'anonymousFeedbackIsPrivateIdempotentAndRequiresCsrf',
                    'memberFeatureRequestUsesExistingReplyHistory',
                    'v24TypedColumnContractMatchesRealPostgres',
                    'verifiedOrganizerLifecyclePreservesOverridesAndRevokesAccess',
                    'seriesLinkIsVersionedPublicOnlyAndDoesNotTransferOwnership',
                    'verifiedBoothProductEditPreservesPendingCollectionAndIdentityThroughRepublication'],
                'TEST-com.boothhana.release.OperationsIntegrationTests.xml':[
                    'operatingGroupPreservesSourceIdsSavesCommentsAndOwnership',
                    'operatingGroupRejectsStaleChangesDuplicateMembershipAndCrossCategory',
                    'operatingGroupPaginationCountsEditionsAndScopesMatchingDays',
                    'operatingGroupWithdrawnMembersAreAbsentAndFixedLegacyLinksCannotChange',
                    'groupedEventCannotRepublishIntoAnotherCategory',
                    'editorialSalesProvenanceRemainsInPublishedSnapshotDuringPendingEdits',
                    'legacySalesProvenanceMigrationFreezesOnlySupportedEditorialValues',
                    'adminFiltersUseEffectiveTitlesLiteralSearchAndPendingPublicChanges',
                    'operatingGroupAdminRoutesRequireAdminCsrfAndTablesStayPrivate'],
            }
            for filename,names in suites.items():
                (reports/filename).write_text('<testsuite>'+''.join(f'<testcase name="{name}()"/>' for name in names)+'</testsuite>')
            if mutate_reports:
                mutate_reports(reports)
            gate.OUT.write_text('{"state":"AUTOMATED_CHECKS_PASSED"}')
            parent = SimpleNamespace()
            parent.main = lambda: inherited(parent, gate.OUT)
            with patch.object(gate.importlib.util, 'spec_from_file_location') as spec, \
                 patch.object(gate.importlib.util, 'module_from_spec', return_value=parent), \
                 patch.object(gate.subprocess, 'run', side_effect=lambda *a, **k: new_checks(gate.OUT)):
                spec.return_value.loader.exec_module.return_value = None
                result = gate.main()
            return result, json.loads(gate.OUT.read_text())

    def test_prior_success_is_reset_before_inherited_failure(self):
        def inherited(parent, out):
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
            raise ValueError('isolated test DB required')
        code, report = self.run_gate(inherited, lambda _: self.fail('new checks must not start'))
        self.assertEqual(code, 2)
        self.assertEqual(report['state'], 'NOT_READY')
        self.assertFalse(report['productionApproval'])

    def test_inherited_success_is_never_final_before_new_checks(self):
        def inherited(parent, out):
            parent.state('AUTOMATED_CHECKS_PASSED', remaining=['real device'])
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
        def new_checks(out):
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
            raise subprocess.CalledProcessError(1, 'v24-test')
        code, report = self.run_gate(inherited, new_checks)
        self.assertEqual(code, 2)
        self.assertEqual(report['state'], 'NOT_READY')

    def test_only_all_checks_may_mark_automated_pass_not_production(self):
        def inherited(parent, out):
            parent.state('AUTOMATED_CHECKS_PASSED')
        def new_checks(out):
            self.assertEqual(json.loads(out.read_text())['state'], 'NOT_READY')
        code, report = self.run_gate(inherited, new_checks)
        self.assertEqual(code, 0)
        self.assertEqual(report['state'], 'AUTOMATED_CHECKS_PASSED')
        self.assertFalse(report['productionApproval'])
        self.assertTrue(report['remaining'])

    def test_missing_interest_sql_report_blocks_success(self):
        code, report = self.run_gate(lambda parent, out: None, lambda out: None,
            lambda reports: (reports/'TEST-com.boothhana.release.LibraryIntegrationTests.xml').unlink())
        self.assertEqual(code, 2)
        self.assertEqual(report['state'], 'NOT_READY')
        self.assertFalse(report['productionApproval'])
        self.assertIn('Fresh v24 HTTP/SQL report required', report['reason'])

    def test_skipped_interest_sql_test_blocks_success(self):
        def skip_case(reports):
            file=reports/'TEST-com.boothhana.release.LibraryIntegrationTests.xml'
            file.write_text(file.read_text().replace(
                '<testcase name="memberInterestsArePrivateVersionedAndCategoryScoped()"/>',
                '<testcase name="memberInterestsArePrivateVersionedAndCategoryScoped()"><skipped/></testcase>'))
        code, report = self.run_gate(lambda parent, out: None, lambda out: None, skip_case)
        self.assertEqual(code, 2)
        self.assertEqual(report['state'], 'NOT_READY')
        self.assertFalse(report['productionApproval'])
        self.assertIn('Required v24 test missing/failed/skipped', report['reason'])

if __name__ == '__main__':
    unittest.main()
