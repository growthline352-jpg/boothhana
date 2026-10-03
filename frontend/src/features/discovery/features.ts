import {isLocalPreview} from './site'
/** Local previews expose the implementation. Public rollout starts disabled. */
export const discoveryFeatures={
 comparison:isLocalPreview()||import.meta.env.VITE_EVENT_COMPARE_ENABLED==='true',
 popupExplore:isLocalPreview()||import.meta.env.VITE_POPUP_EXPLORE_ENABLED==='true',
 visitPreparation:isLocalPreview()||import.meta.env.VITE_VISIT_PREPARATION_ENABLED==='true',
}
