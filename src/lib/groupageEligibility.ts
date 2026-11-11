export interface GroupageRequestState { moving_date: string; status: string; deleted_at?: string | null; is_draft?: boolean | null }
export function isGroupageRequestActive(request: GroupageRequestState, today: string): boolean {
  return !request.deleted_at && !request.is_draft && ['new', 'assigned', 'quoted'].includes(request.status) && request.moving_date >= today;
}
