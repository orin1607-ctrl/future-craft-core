import type { LeadColor } from '@/features/telemarketing/lib/leadTraffic';

/** Agent lead-work board. Yellow is the default traffic-light view. Follow-up is a separate source. */
export type LeadBoardView = 'yellow' | 'red' | 'green' | 'all' | 'followup' | 'today';

export const DEFAULT_LEAD_BOARD_VIEW: LeadBoardView = 'yellow';

export function isFollowUpBoardView(view: LeadBoardView): boolean {
  return view === 'followup' || view === 'today';
}

export function colorFilterForView(view: LeadBoardView): '' | LeadColor {
  if (view === 'all' || isFollowUpBoardView(view)) return '';
  return view;
}

export function followUpBucketForView(view: LeadBoardView): '' | 'today' {
  return view === 'today' ? 'today' : '';
}

export function colorsToRender(view: LeadBoardView): LeadColor[] {
  if (view === 'all') return ['yellow', 'red', 'green'];
  if (view === 'red' || view === 'green' || view === 'yellow') return [view];
  return [];
}
