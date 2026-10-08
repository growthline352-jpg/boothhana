#!/usr/bin/env python3
"""v24 fail-closed gate; inherits full build/SQL/browser and fresh-report checks from v21."""
from pathlib import Path
import importlib.util, json, subprocess, sys, time, xml.etree.ElementTree as ET
ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'verification/v24/results/release-gate.json'
def state(value, **extra):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({'state': value, 'productionApproval': False,
        'attemptedAt': time.time(), **extra}, ensure_ascii=False, indent=2))
def main():
    started=time.time()
    state('NOT_READY', reason='Current attempt not complete')
    # Point inherited output to this attempt. Its fresh isolated DB report and
    # current v21 SQL regression remain mandatory; old passing logs are insufficient.
    spec = importlib.util.spec_from_file_location('gate_v24_parent', ROOT / 'verification/v21/release_gate.py')
    parent = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(parent)
    parent.OUT = OUT
    def inherited_state(value, **extra):
        # A killed process must not leave an inherited success marker before the
        # new release's checks have passed. Only THIS wrapper writes final success.
        if value == 'AUTOMATED_CHECKS_PASSED':
            state('NOT_READY', reason='Inherited checks completed; v24 checks pending',
                  inheritedRemaining=extra.get('remaining', []))
        else:
            state(value, **extra)
    parent.state = inherited_state
    try:
        parent.main()
        # Do not label the overall gate passed until NEW v24 checks finish too.
        state('NOT_READY', reason='Inherited full checks passed; v24 checks pending')
        subprocess.run([sys.executable, 'verification/run_checks.py'], cwd=ROOT, check=True)
        required=[
            ('TEST-com.boothhana.release.CollectionGraphIntegrationTests.xml','expandedProductionTaxonomyIsCollectedPublishedAndDiscoverable'),
            ('TEST-com.boothhana.release.CollectionGraphIntegrationTests.xml','withdrawnEventIsNotBootstrappedOrRepublishedByQueuedWork'),
            ('TEST-com.boothhana.release.CollectionGraphIntegrationTests.xml','eventApprovalPublishesAndReplayDoesNotPublishTwice'),
            ('TEST-com.boothhana.release.LibraryIntegrationTests.xml','seoulAreaFiltersApplyToCountsListsCalendarAndMultiVenueEvents'),
            ('TEST-com.boothhana.release.PersistentSessionIntegrationTests.xml','storedKakaoSessionSurvivesRepositoryRecreationAndRenewsOnUse'),
            ('TEST-com.boothhana.release.PersistentSessionIntegrationTests.xml','expiredSessionCannotBeRestoredOrRenewed'),
            ('TEST-com.boothhana.release.PersistentSessionIntegrationTests.xml','logoutRequiresCsrfAndPermanentlyRevokesStoredSession'),
            ('TEST-com.boothhana.release.PersistentSessionIntegrationTests.xml','sessionTablesArePrivateAndAnonymousLoginIsShortLived'),

            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','groupedEventLimitSurvivesDifferentBaseAndPreventsConflictingMerge'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','concurrentDifferentBaseRegistrationsCommitExactlyOne'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','directRegistrationPublishesOnlyOwnBoothWithoutGrantAndEnforcesAccountLimit'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','claimApprovalRemainsRequiredAndCannotConflictWithDirectRegistration'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','approvedCollectedBoothBlocksNewBaseBoothInSameEvent'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','directProductsKeepIdentityEditsAndPublicStateThroughRepublication'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','registrationHttpRequiresLoginCsrfAndOwnedBase'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','platformRegistrationIsImmediateAndCannotUseAnotherBaseToRegisterTwice'),
            ('TEST-com.boothhana.release.CreatorRegistrationIntegrationTests.xml','endedUnpublishedAndOutOfPeriodRegistrationsAreRejected'),

            ('TEST-com.boothhana.release.ReleaseIntegrationTests.xml','anonymousFeedbackIsPrivateIdempotentAndRequiresCsrf'),
            ('TEST-com.boothhana.release.ReleaseIntegrationTests.xml','memberFeatureRequestUsesExistingReplyHistory'),
            ('TEST-com.boothhana.release.LibraryIntegrationTests.xml','popupDiscoveryStaysSeparateRegardlessOfTopicsAndPreservesSaves'),
            ('TEST-com.boothhana.release.LibraryIntegrationTests.xml','detachedProfileSaveCannotRevertCompletedOnboarding'),
            ('TEST-com.boothhana.release.LibraryIntegrationTests.xml','memberInterestsArePrivateVersionedAndCategoryScoped'),
            ('TEST-com.boothhana.release.LibraryIntegrationTests.xml','interestFeaturedFiltersBeforeLimitAndSaveRemovalChangesFallback'),
            ('TEST-com.boothhana.floorplan.FloorplanHttpContractTests.xml','withdrawalHasNoContentSuccess'),
            ('TEST-com.boothhana.release.ReleaseIntegrationTests.xml','v24TypedColumnContractMatchesRealPostgres'),
            ('TEST-com.boothhana.release.ReleaseIntegrationTests.xml','verifiedOrganizerLifecyclePreservesOverridesAndRevokesAccess'),
            ('TEST-com.boothhana.release.ReleaseIntegrationTests.xml','seriesLinkIsVersionedPublicOnlyAndDoesNotTransferOwnership'),
            ('TEST-com.boothhana.release.ReleaseIntegrationTests.xml','verifiedBoothProductEditPreservesPendingCollectionAndIdentityThroughRepublication'),
            ('TEST-com.boothhana.release.LibraryIntegrationTests.xml','popularEditionDeduplicatesMembersBeforeLimitAndKeepsRemainingDay'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','rechecksPreservePublicFactsDeduplicateAndRequireFreshAdminReview'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','recheckFailuresBackOffAndCannotClearFactsOrUseUnregisteredSources'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','comparisonDeduplicatesEditionsAndPreservesPublishedPlaceAdmissionByDay'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','popupPlaceAndComparisonUseOnlyCurrentPublishedFactsAndDisappearAfterAddressChanges'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','observationRoutesProtectPrivateSourcesAndRequireAdminCsrf'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','operatingGroupPreservesSourceIdsSavesCommentsAndOwnership'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','operatingGroupRejectsStaleChangesDuplicateMembershipAndCrossCategory'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','operatingGroupPaginationCountsEditionsAndScopesMatchingDays'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','operatingGroupWithdrawnMembersAreAbsentAndFixedLegacyLinksCannotChange'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','groupedEventCannotRepublishIntoAnotherCategory'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','editorialSalesProvenanceRemainsInPublishedSnapshotDuringPendingEdits'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','legacySalesProvenanceMigrationFreezesOnlySupportedEditorialValues'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','adminFiltersUseEffectiveTitlesLiteralSearchAndPendingPublicChanges'),
            ('TEST-com.boothhana.release.OperationsIntegrationTests.xml','operatingGroupAdminRoutesRequireAdminCsrfAndTablesStayPrivate'),
        ]
        for filename,name in required:
            report=ROOT/'backend/build/test-results/test'/filename
            if not report.exists() or report.stat().st_mtime<started-2:
                raise ValueError('Fresh v24 HTTP/SQL report required: '+filename)
            cases=[c for c in ET.parse(report).getroot().findall('testcase') if c.get('name','').split('(')[0]==name]
            if len(cases)!=1 or any(cases[0].find(tag) is not None for tag in ('skipped','failure','error')):
                raise ValueError('Required v24 test missing/failed/skipped: '+name)
        state('AUTOMATED_CHECKS_PASSED', remaining=[
            'actual React modal nesting, search filters, library and offline save UX',
            'actual mobile/hosting/OAuth/image CORS/rights acceptance',
            'actual event collection and load/backup tests'])
        return 0
    except Exception as error:
        state('NOT_READY', reason=str(error) if isinstance(error, ValueError) else type(error).__name__)
        print('NOT READY:', str(error) if isinstance(error, ValueError) else type(error).__name__)
        return 2
if __name__ == '__main__':
    sys.exit(main())
