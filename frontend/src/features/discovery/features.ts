import {isLocalPreview} from './site'
/** Popup exploration is public by default; an explicit false remains a rollout kill switch. */
export const discoveryFeatures={
 comparison:isLocalPreview()||import.meta.env.VITE_EVENT_COMPARE_ENABLED==='true',
 popupExplore:import.meta.env.VITE_POPUP_EXPLORE_ENABLED!=='false',
 visitPreparation:isLocalPreview()||import.meta.env.VITE_VISIT_PREPARATION_ENABLED==='true',
}
