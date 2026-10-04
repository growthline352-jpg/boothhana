package com.boothhana.collection;

/** Event posters only. Booth/product assets cannot satisfy banner readiness.
 * The explicit representative selection is respected, including revoked rights.
 */
final class CatalogBannerHealth {
    private CatalogBannerHealth() {}
    static final String JOIN="""
        left join subculture_catalog_presentation bp on bp.event_id=e.id
        left join lateral (
          select count(*) filter(where a.rights_state='PENDING') pending,
            count(*) filter(where a.rights_state='APPROVED' and a.storage_state<>'STORED'
              and (bp.banner_asset_id is null or bp.banner_asset_id=a.id)) waiting,
            count(*) filter(where a.rights_state='APPROVED' and a.storage_state='FAILED'
              and (bp.banner_asset_id is null or bp.banner_asset_id=a.id)) failed,
            count(*) filter(where a.rights_state='APPROVED' and a.storage_state='STORED' and a.object_key is not null
              and (bp.banner_asset_id is null or bp.banner_asset_id=a.id)) ready,
            count(*) filter(where a.id=bp.banner_asset_id and a.rights_state='APPROVED') selected_approved
          from subculture_catalog_asset a where a.event_id=e.id and a.type='BANNER'
            and a.participant_id is null and a.product_id is null
        ) bh on true
        """;
    static final String STATE="""
        case when bp.banner_asset_id is not null and bh.selected_approved=0 then 'SELECTION_BLOCKED'
          when bh.ready>0 then 'READY' when bh.failed>0 then 'STORAGE_FAILED'
          when bh.waiting>0 then 'WAITING_STORAGE' when bh.pending>0 then 'WAITING_REVIEW'
          else 'MISSING' end
        """;
}
