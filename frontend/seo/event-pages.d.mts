export const EVENT_SECTIONS: Record<'home'|'booths'|'map'|'reviews', string>
export function parseEventPage(path:string): {eventId:string; section:'home'|'booths'|'map'|'reviews'|'booth'; participantId:string|null}|null
export function eventSectionHref(id:string|number,section?:'home'|'booths'|'map'|'reviews',search?:string|URLSearchParams):string
export function legacyEventRedirect(path:string,search?:string):string|null
